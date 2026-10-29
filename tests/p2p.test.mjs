import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createConcord } from '../server.mjs';
import { frames, Reassembler, roomChannel, seal, unseal, Signal } from '../public/p2p.js';
import { connectPacket, publishPacket, subscribePacket, readPackets, readPublish } from '../public/mqtt.js';
import { parseInvite, webInvite, desktopInvite, P2P_PAGE } from '../public/invites.js';

const key = 'Kq3_x-9ZpLmN0aBcDeFgHi';

test('quadros do DataChannel fragmentam e remontam texto, binário e fechamento', () => {
  for (const size of [0, 10, 64 * 1024, 200 * 1024 + 7]) {
    const bytes = Uint8Array.from({ length: size }, (_, index) => index % 251), reader = new Reassembler();
    const parts = frames(1, bytes); let result = null;
    for (const part of parts) { assert.equal(result, null); result = reader.push(part); }
    assert.equal(parts.length, Math.max(1, Math.ceil(size / (64 * 1024))));
    assert.equal(result.kind, 1); assert.deepEqual(result.bytes, bytes);
  }
  const text = new Reassembler().push(frames(0, new TextEncoder().encode('{"type":"auth"}'))[0]);
  assert.equal(new TextDecoder().decode(text.bytes), '{"type":"auth"}');
  const reader = new Reassembler(), big = new Uint8Array(70 * 1024);
  assert.throws(() => { for (let i = 0; i < 200; i++) reader.push(frames(1, big)[0]); }, /grande/);
});

test('sinalização é cifrada por sala e rejeita adulteração ou outra chave', async () => {
  const room = await roomChannel(key), other = await roomChannel('Zq3_x-9ZpLmN0aBcDeFgHi');
  assert.match(room.topic, /^concord\/v1\/[0-9a-f]{40}$/); assert.notEqual(room.topic, other.topic);
  assert.ok(!room.topic.includes(key));
  const sealed = await seal(room.aes, { type: 'offer', sdp: 'v=0' });
  assert.ok(!new TextDecoder().decode(sealed).includes('offer'));
  assert.deepEqual(await unseal(room.aes, sealed), { type: 'offer', sdp: 'v=0' });
  await assert.rejects(unseal(other.aes, sealed));
  const tampered = sealed.slice(); tampered[20] ^= 1; await assert.rejects(unseal(room.aes, tampered));
});

test('cliente MQTT codifica e lê pacotes, inclusive divididos', () => {
  const connect = connectPacket('concord-test');
  assert.equal(connect[0], 0x10); assert.equal(new TextDecoder().decode(connect.subarray(4, 8)), 'MQTT');
  assert.equal(subscribePacket(7, 'a/b')[0], 0x82);
  const payload = Uint8Array.from({ length: 300 }, (_, index) => index % 256), packet = publishPacket('concord/v1/x', payload);
  const [none, rest] = readPackets(packet.subarray(0, 50)); assert.equal(none.length, 0); assert.equal(rest.length, 50);
  const joined = new Uint8Array(packet.length * 2); joined.set(packet); joined.set(packet, packet.length);
  const [items, remaining] = readPackets(joined); assert.equal(items.length, 2); assert.equal(remaining.length, 0);
  const message = readPublish(items[0]); assert.equal(message.topic, 'concord/v1/x'); assert.deepEqual(message.payload, payload);
});

test('Signal entrega uma vez, ignora mensagens antigas e salas diferentes', async () => {
  const bus = new Set();
  const relay = (url, handlers) => {
    const item = { topics: new Set(), subscribe: topic => item.topics.add(topic), close: () => bus.delete(item),
      publish: (topic, payload) => { for (const peer of bus) if (peer.topics.has(topic)) queueMicrotask(() => peer.handlers.onMessage(topic, payload)); return true; } };
    item.handlers = handlers; bus.add(item); queueMicrotask(() => handlers.onState(true)); return item;
  };
  const brokers = ['a', 'b'], received = [], strangers = [];
  const host = await Signal.create(key, msg => received.push(msg), { brokers, relay });
  const guest = await Signal.create(key, () => {}, { brokers, relay });
  const stranger = await Signal.create('Zq3_x-9ZpLmN0aBcDeFgHi', msg => strangers.push(msg), { brokers, relay });
  assert.equal(await guest.ready(100), true);
  await guest.send({ type: 'offer', to: 'host' }); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(received.length, 1, 'duas cópias dos brokers viram uma mensagem'); assert.equal(received[0].type, 'offer');
  assert.equal(strangers.length, 0);
  const stale = await seal(guest.aes, { id: 'old', ts: Date.now() - 60 * 60 * 1000, type: 'offer' });
  await host.receive(stale); assert.equal(received.length, 1);
  host.close(); guest.close(); stranger.close();
});

test('convite P2P aceita código e página estática, sem confundir com túnel', () => {
  assert.deepEqual(parseInvite('concord:p2p:' + key), { p2p: true, token: key });
  assert.equal(webInvite('concord:p2p:' + key), P2P_PAGE + '?join=' + key);
  assert.deepEqual(parseInvite(P2P_PAGE + '?join=' + key), { p2p: true, token: key });
  assert.deepEqual(parseInvite('https://miharaxd.github.io/concord/invite?join=' + key), { p2p: true, token: key });
  assert.equal(desktopInvite(P2P_PAGE + '?join=' + key), 'concord:p2p:' + key);
  for (const bad of ['concord:p2p:curto', 'concord:p2p:' + 'A'.repeat(43), P2P_PAGE + '?join=x', 'https://miharaxd.github.io/outro/invite/?join=' + key, 'https://user:pw@miharaxd.github.io/concord/invite/?join=' + key]) {
    assert.throws(() => parseInvite(bad), /inválido|convite/, bad);
  }
});

test('ponte P2P entra como convidado e nunca como dono, mesmo em loopback', async t => {
  const app = await createConcord({ port: 0 }).listen(); t.after(() => app.close());
  const session = await (await fetch(app.address + '/api/session', { headers: { 'x-concord-host': app.hostToken } })).json();
  assert.equal(session.p2pInvite, 'concord:p2p:' + session.inviteKey);
  async function bridged(role, token, query = '?via=p2p') {
    const ws = new WebSocket(app.address.replace('http:', 'ws:') + '/socket' + query, { origin: app.address }); ws.on('error', () => {});
    const closed = new Promise(resolve => ws.on('close', resolve)), first = once(ws, 'message').then(([data]) => JSON.parse(data)).catch(() => null);
    await Promise.race([once(ws, 'open').catch(() => {}), closed]);
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'auth', role, token, profile: { name: 'Ponte' } }));
    return { ws, closed, first };
  }
  const fake = await bridged('host', app.hostToken); assert.equal(await fake.closed, 4001);
  const guest = await bridged('viewer', session.inviteKey); assert.equal((await guest.first).type, 'welcome'); guest.ws.close();
  const odd = await bridged('viewer', session.inviteKey, '?via=outro'); assert.notEqual(await odd.closed, 1000);
  for (const file of ['/p2p.js', '/mqtt.js']) assert.equal((await fetch(app.address + file)).status, 200);
});

test('câmera: recurso anunciado, estado separado e relay com id próprio', async t => {
  const app = await createConcord({ port: 0 }).listen(); t.after(() => app.close());
  const session = await (await fetch(app.address + '/api/session', { headers: { 'x-concord-host': app.hostToken } })).json();
  async function join(role, token, features) {
    const ws = new WebSocket(app.address.replace('http:', 'ws:') + '/socket', { origin: app.address }), inbox = [];
    ws.on('message', (data, binary) => inbox.push(binary ? data : JSON.parse(data))); await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'auth', role, token, profile: { name: role }, ...(features ? { features } : {}) }));
    const next = async (predicate, timeout = 2000) => { const end = Date.now() + timeout; while (Date.now() < end) { const index = inbox.findIndex(predicate); if (index >= 0) return inbox.splice(index, 1)[0]; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('Mensagem não chegou'); };
    return { ws, next, send: msg => ws.send(JSON.stringify(msg)) };
  }
  const host = await join('host', app.hostToken, ['camera']);
  const welcome = await host.next(msg => msg.type === 'welcome'); assert.deepEqual(welcome.features, ['camera']);
  const guest = await join('viewer', session.inviteKey, ['camera']), old = await join('viewer', session.inviteKey);
  const guestId = (await guest.next(msg => msg.type === 'welcome')).self, oldId = (await old.next(msg => msg.type === 'welcome')).self;
  const room = await host.next(msg => msg.type === 'room' && msg.members.length === 3);
  assert.deepEqual(room.members.find(member => member.id === guestId).features, ['camera']);
  assert.deepEqual(room.members.find(member => member.id === oldId).features, []);
  host.send({ type: 'stream-state', active: true, screen: false, camera: true, label: 'Câmera' });
  const state = (await guest.next(msg => msg.type === 'room' && msg.members.some(member => member.id === 'host' && member.stream.camera))).members.find(member => member.id === 'host').stream;
  assert.equal(state.screen, false); assert.equal(state.active, true);
  host.send({ type: 'stream-state', active: true });
  const legacy = (await guest.next(msg => msg.type === 'room' && msg.members.some(member => member.id === 'host' && member.stream.screen))).members.find(member => member.id === 'host').stream;
  assert.equal(legacy.camera, false, 'cliente antigo (só active) continua sendo tela');
  host.send({ type: 'stream-state', active: true, screen: true, camera: true });
  host.send({ type: 'relay-start', to: [guestId, oldId], mime: 'video/webm;codecs=vp8' });
  host.send({ type: 'relay-start', to: [guestId], mime: 'video/webm;codecs=vp8', stream: 'camera' });
  assert.equal((await guest.next(msg => msg.type === 'relay-start' && msg.stream === 'camera')).from, 'host');
  host.send({ type: 'relay-stream', stream: 'camera' }); host.ws.send(Buffer.from([1, 2, 3]));
  host.send({ type: 'relay-stream', stream: 'screen' }); host.ws.send(Buffer.from([4, 5]));
  const id = packet => packet.subarray(1, 1 + packet[0]).toString();
  assert.equal(id(await guest.next(item => Buffer.isBuffer(item) && id(item) === 'host:camera')), 'host:camera');
  assert.equal(id(await guest.next(item => Buffer.isBuffer(item) && id(item) === 'host')), 'host');
  const oldPacket = await old.next(item => Buffer.isBuffer(item)); assert.equal(id(oldPacket), 'host', 'cliente antigo só recebe a tela');
  for (const client of [host, guest, old]) client.ws.close();
});
