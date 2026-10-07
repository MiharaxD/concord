import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createConcord } from '../server.mjs';
import { parseInvite } from '../public/invites.js';

function inbox(ws) {
  const items = [], waiters = [];
  ws.on('message', (bytes, binary) => {
    const item = binary ? bytes : JSON.parse(bytes);
    const index = waiters.findIndex(entry => entry.predicate(item));
    if (index >= 0) { const [entry] = waiters.splice(index, 1); clearTimeout(entry.timer); entry.resolve(item); }
    else items.push(item);
  });
  return (predicate = () => true) => {
    const index = items.findIndex(predicate);
    if (index >= 0) return Promise.resolve(items.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const entry = { predicate, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(entry), 1); reject(new Error('Mensagem não chegou')); }, 2500) };
      waiters.push(entry);
    });
  };
}
async function setup(t, options = {}) {
  const app = await createConcord({ port: 0, ...options }).listen();
  t.after(() => app.close());
  async function socket(role, token = role === 'host' ? app.hostToken : app.guestToken, profile = { name: 'Amigo' }) {
    const ws = new WebSocket(app.address.replace('http:', 'ws:') + '/socket', { origin: app.address });
    const read = inbox(ws); await once(ws, 'open');
    const closed = once(ws, 'close');
    ws.send(JSON.stringify({ type: 'auth', role, token, profile }));
    return { ws, read, closed, send: msg => ws.send(JSON.stringify(msg)) };
  }
  const api = (route, method = 'GET', extra = {}) => fetch(app.address + route, { method, headers: { 'x-concord-host': app.hostToken, ...extra } });
  return { app, socket, api };
}


test('Interface pública funciona; administração continua exclusiva do PC dono', async t => {
  const { app, api } = await setup(t);
  for (const file of ['/', '/app.js', '/room-media.js', '/invites.js', '/style.css']) assert.equal((await fetch(app.address + file)).status, 200);
  for (const headers of [{}, { 'x-concord-host': app.hostToken, 'cf-connecting-ip': '1.2.3.4' }, { 'x-concord-host': 'é'.repeat(43) }])
    assert.equal((await fetch(app.address + '/api/session', { headers })).status, 403);
  const data = await (await api('/api/session')).json(); assert.match(data.guestInvite, /#join=[\w-]{22}$/);
  assert.equal(data.public, false); assert.equal((await fetch(app.address + '/server.mjs')).status, 404);
});
test('Chave curta não vira administrador; renovação remove todos e invalida ambas as chaves', async t => {
  const { app, socket, api } = await setup(t);
  const key = parseInvite((await (await api('/api/session')).json()).guestInvite).token, oldFull = app.guestToken;
  const impostor = await socket('host', key); assert.equal((await impostor.closed)[0], 4001);
  const a = await socket('viewer', key), b = await socket('viewer', key); await a.read(msg => msg.type === 'welcome'); await b.read(msg => msg.type === 'welcome');
  const fresh = await (await api('/api/invite', 'POST')).json(); assert.equal((await a.closed)[0], 4003); assert.equal((await b.closed)[0], 4003);
  for (const staleKey of [key, oldFull]) { const stale = await socket('viewer', staleKey); assert.equal((await stale.closed)[0], 4001); }
  const good = await socket('viewer', parseInvite(fresh.guestInvite).token); await good.read(msg => msg.type === 'welcome');
});
test('Sala mantém nomes/fotos, 8 pessoas e atualiza a lista na saída', async t => {
  const { socket } = await setup(t); const host = await socket('host', undefined, { name: 'Yuri' }); await host.read(msg => msg.type === 'welcome');
  const entries = [];
  for (let i = 0; i < 7; i++) { const member = await socket('viewer', undefined, { name: 'Pessoa ' + i, photo: i === 0 ? 'data:image/jpeg;base64,YWJj' : '' }); await member.read(msg => msg.type === 'welcome'); entries.push(member); }
  const roster = await host.read(msg => msg.type === 'room' && msg.members.length === 8); assert.equal(roster.members[1].name, 'Pessoa 0'); assert.equal(roster.members[1].photo, 'data:image/jpeg;base64,YWJj');
  const extra = await socket('viewer'); assert.equal((await extra.closed)[0], 4002);
  host.ws.close(); await host.closed;
  const reserved = await socket('viewer'); assert.equal((await reserved.closed)[0], 4002);
  const returning = await socket('host'); const returningRoster = await returning.read(msg => msg.type === 'welcome'); assert.equal(returningRoster.members.length, 8);
  entries[0].ws.close(); await entries[0].closed; const fewer = await returning.read(msg => msg.type === 'room' && msg.members.length === 7 && !msg.members.some(member => member.name === 'Pessoa 0')); assert.ok(!fewer.members.some(member => member.name === 'Pessoa 0'));
});
test('Sinalização é direcionada e servidor substitui identidade enviada pelo cliente', async t => {
  const { socket } = await setup(t); const host = await socket('host'); const hw = await host.read(msg => msg.type === 'welcome');
  const a = await socket('viewer'), aw = await a.read(msg => msg.type === 'welcome');
  const b = await socket('viewer'), bw = await b.read(msg => msg.type === 'welcome');
  a.send({ type: 'offer', to: bw.self, from: hw.self, sdp: 'offer-a' }); const msg = await b.read(msg => msg.type === 'offer');
  assert.equal(msg.from, aw.self); assert.equal(msg.sdp, 'offer-a');
  b.send({ type: 'answer', to: aw.self, sdp: 'answer-b' }); assert.equal((await a.read(msg => msg.type === 'answer')).from, bw.self);
});
test('Participantes publicam streams distintas; relay preserva origem/chunks e destinos', async t => {
  const { socket } = await setup(t); const host = await socket('host'); await host.read(msg => msg.type === 'welcome');
  const a = await socket('viewer'), aw = await a.read(msg => msg.type === 'welcome');
  const b = await socket('viewer'), bw = await b.read(msg => msg.type === 'welcome');
  for (const [publisher, id, chunk] of [[a, aw.self, Buffer.from([0,1,2,255])], [b, bw.self, Buffer.from([9,8,7])]]) {
    publisher.send({ type: 'stream-state', active: true, label: 'Janela' });
    await host.read(msg => msg.type === 'room' && msg.members.some(member => member.id === id && member.stream.active));
    publisher.send({ type: 'relay-start', from: 'host', to: ['host'], mime: 'video/webm;codecs=vp8' });
    assert.equal((await host.read(msg => msg.type === 'relay-start')).from, id);
    publisher.ws.send(chunk); const packet = await host.read(Buffer.isBuffer), length = packet[0];
    assert.equal(packet.subarray(1, length + 1).toString(), id); assert.deepEqual(packet.subarray(length + 1), chunk);
  }
  a.send({ type: 'stream-state', active: false }); const stopped = await host.read(msg => msg.type === 'room' && msg.members.find(member => member.id === aw.self)?.stream.active === false && msg.members.find(member => member.id === bw.self)?.stream.active);
  assert.equal(stopped.members.find(member => member.id === bw.self).stream.active, true);
});
test('Mídia sem stream ativa, convite inválido e segundo dono são rejeitados', async t => {
  const { socket } = await setup(t);
  const bad = await socket('viewer', 'é'.repeat(43)); assert.equal((await bad.closed)[0], 4001);
  const host = await socket('host'); await host.read(msg => msg.type === 'welcome');
  const second = await socket('host'); assert.equal((await second.closed)[0], 4002);
  const watcher = await socket('viewer'); await watcher.read(msg => msg.type === 'welcome'); watcher.ws.send(Buffer.from('sem captura')); assert.equal((await watcher.closed)[0], 4001);
});
test('Nome/foto maliciosos ficam como texto ou são descartados', async t => {
  const { socket } = await setup(t); const host = await socket('host'); await host.read(msg => msg.type === 'welcome');
  const member = await socket('viewer', undefined, { name: '<img onerror=alert(1)>', photo: 'data:image/svg+xml,<svg onload=alert(1)>' }); await member.read(msg => msg.type === 'welcome');
  const roster = await host.read(msg => msg.type === 'room' && msg.members.length === 2);
  assert.equal(roster.members[1].name, '<img onerror=alert(1)>'); assert.equal(roster.members[1].photo, '');
});
test('Origem externa não abre socket', async t => {
  const { app } = await setup(t); const ws = new WebSocket(app.address.replace('http:', 'ws:') + '/socket', { origin: 'https://outro.example' });
  await once(ws, 'error'); assert.notEqual(ws.readyState, WebSocket.OPEN);
});
test('Encerrar fecha preconexões sem HTTP', async () => {
  const app = await createConcord({ port: 0 }).listen(); const socket = net.connect(new URL(app.address).port, '127.0.0.1'); await once(socket, 'connect');
  const start = Date.now(); await app.close(); assert.ok(Date.now()-start < 2000); socket.destroy();
});
test('Preparação concorrente usa um processo; cancelar permite nova tentativa', async t => {
  await mkdir('test-results', { recursive: true }); const directory = await mkdtemp(path.resolve('test-results/tunnel-'));
  const file = path.join(directory, 'pids.txt'), previous = process.env.CONCORD_TEST_PID_FILE; process.env.CONCORD_TEST_PID_FILE = file;
  t.after(() => { if (previous === undefined) delete process.env.CONCORD_TEST_PID_FILE; else process.env.CONCORD_TEST_PID_FILE = previous; });
  const { api } = await setup(t, { cloudflared: process.execPath, tunnelCwd: path.resolve('tests/fixtures') });
  async function pids(count) {
    for (let i = 0; i < 100; i++) { const entries = await readFile(file, 'utf8').then(text => text.trim().split('\n').map(Number)).catch(() => []); if (entries.length >= count) return entries; await new Promise(resolve => setTimeout(resolve, 20)); }
    throw new Error('Processo de teste não iniciou');
  }
  const first = api('/api/tunnel', 'POST'), concurrent = api('/api/tunnel', 'POST'); const original = await pids(1);
  await new Promise(resolve => setTimeout(resolve, 100)); assert.equal((await pids(1)).length, 1);
  assert.equal((await api('/api/tunnel', 'DELETE')).status, 200); assert.equal((await first).status, 503); assert.equal((await concurrent).status, 503);
  assert.equal((await (await api('/api/session')).json()).public, false);
  const retry = api('/api/tunnel', 'POST'); const fresh = await pids(2); assert.notEqual(fresh[1], original[0]);
  await api('/api/tunnel', 'DELETE'); assert.equal((await retry).status, 503);
});
