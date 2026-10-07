import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
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
async function setup(t) {
  const app = await createConcord({ port: 0 }).listen();
  t.after(() => app.close());
  async function socket(role, token = role === 'host' ? app.hostToken : app.guestToken) {
    const ws = new WebSocket(app.address.replace('http:', 'ws:') + '/socket', { origin: app.address });
    const read = inbox(ws); await once(ws, 'open');
    const closed = once(ws, 'close');
    ws.send(JSON.stringify({ type: 'auth', role, token }));
    return { ws, read, closed, send: msg => ws.send(JSON.stringify(msg)) };
  }
  const api = (route, method = 'GET', extra = {}) => fetch(app.address + route, { method, headers: { 'x-concord-host': app.hostToken, ...extra } });
  return { app, socket, api };
}

test('Arquivos públicos funcionam e administração exige chave local', async t => {
  const { app, api } = await setup(t);
  for (const resource of ['/', '/app.js', '/invites.js', '/style.css', '/icon.svg']) assert.equal((await fetch(app.address + resource)).status, 200);
  assert.equal((await fetch(app.address + '/api/session')).status, 403);
  assert.equal((await api('/api/session', 'GET', { 'x-forwarded-for': '1.2.3.4' })).status, 403);
  assert.equal((await api('/api/session', 'GET', { 'cf-connecting-ip': '1.2.3.4' })).status, 403);
  assert.equal((await api('/api/session', 'GET', { 'x-concord-host': 'é'.repeat(43) })).status, 403);
  const data = await (await api('/api/session')).json();
  assert.match(data.guestLink, /#join=[\w-]{43}$/);
  assert.equal(data.public, false);
  assert.equal((await fetch(app.address + '/server.mjs')).status, 404);
  assert.match((await fetch(app.address)).headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
test('Convite curto autentica só como visitante e é revogado junto com o antigo', async t => {
  const { app, socket, api } = await setup(t);
  const session = await (await api('/api/session')).json();
  const invite = parseInvite(session.guestInvite);
  assert.equal(invite.address, app.address);
  assert.equal(invite.token.length, 22);
  assert.notEqual(invite.token, app.guestToken.slice(0, 22));
  const impostor = await socket('host', invite.token);
  assert.equal((await impostor.closed)[0], 4001);
  const viewer = await socket('viewer', invite.token);
  await viewer.read(msg => msg.type === 'welcome');
  const oldFullKey = app.guestToken;
  const freshSession = await (await api('/api/invite', 'POST')).json();
  assert.equal((await viewer.closed)[0], 4003);
  const stale = await socket('viewer', invite.token);
  assert.equal((await stale.closed)[0], 4001);
  const staleFull = await socket('viewer', oldFullKey);
  assert.equal((await staleFull.closed)[0], 4001);
  const freshInvite = parseInvite(freshSession.guestInvite);
  assert.notEqual(freshInvite.token, invite.token);
  const fresh = await socket('viewer', freshInvite.token);
  await fresh.read(msg => msg.type === 'welcome');
});
test('Convites inválidos, unicode e segundo transmissor são rejeitados', async t => {
  const { socket } = await setup(t);
  const bad = await socket('viewer', 'é'.repeat(43));
  assert.equal((await bad.closed)[0], 4001);
  const host = await socket('host'); await host.read(msg => msg.type === 'welcome');
  const second = await socket('host'); assert.equal((await second.closed)[0], 4002);
});
test('Sala sinaliza WebRTC, limita um espectador e encaminha mídia intacta', async t => {
  const { socket } = await setup(t);
  const host = await socket('host'); await host.read(msg => msg.type === 'welcome');
  host.send({ type: 'stream-state', active: true, label: 'Teste', quality: '720p' });
  const viewer = await socket('viewer'); await viewer.read(msg => msg.type === 'welcome');
  assert.equal((await viewer.read(msg => msg.type === 'stream-state')).active, true);
  await host.read(msg => msg.type === 'viewer-joined');
  const second = await socket('viewer'); assert.equal((await second.closed)[0], 4002);
  host.send({ type: 'offer', id: 'one', sdp: 'sdp-teste' });
  assert.equal((await viewer.read(msg => msg.type === 'offer')).sdp, 'sdp-teste');
  viewer.send({ type: 'answer', id: 'one', sdp: 'resposta' });
  assert.equal((await host.read(msg => msg.type === 'answer')).sdp, 'resposta');
  viewer.send({ type: 'fallback', id: 'one' }); await host.read(msg => msg.type === 'fallback');
  host.send({ type: 'relay-start', id: 'one', mime: 'video/webm;codecs=vp8' }); await viewer.read(msg => msg.type === 'relay-start');
  const chunk = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 255]); host.ws.send(chunk);
  assert.deepEqual(await viewer.read(Buffer.isBuffer), chunk);
  host.send({ type: 'stream-state', active: false });
  assert.equal((await viewer.read(msg => msg.type === 'stream-state')).active, false);
});
test('Trocar convite remove visitante e libera entrada com a nova chave', async t => {
  const { app, socket, api } = await setup(t);
  const host = await socket('host'); await host.read(msg => msg.type === 'welcome');
  const oldKey = app.guestToken;
  const viewer = await socket('viewer'); await viewer.read(msg => msg.type === 'welcome');
  const response = await api('/api/invite', 'POST'); assert.equal(response.status, 200);
  assert.equal((await viewer.closed)[0], 4003); await host.read(msg => msg.type === 'viewer-left');
  assert.notEqual(app.guestToken, oldKey);
  const stale = await socket('viewer', oldKey); assert.equal((await stale.closed)[0], 4001);
  const fresh = await socket('viewer'); await fresh.read(msg => msg.type === 'welcome');
});
test('Desconectar o transmissor limpa estado, mas mantém sala reconectável', async t => {
  const { socket } = await setup(t);
  const host = await socket('host'); await host.read(msg => msg.type === 'welcome');
  const viewer = await socket('viewer'); await viewer.read(msg => msg.type === 'welcome'); await viewer.read(msg => msg.type === 'stream-state');
  host.send({ type: 'stream-state', active: true }); await viewer.read(msg => msg.type === 'stream-state' && msg.active);
  host.ws.close(); await host.closed;
  assert.equal((await viewer.read(msg => msg.type === 'stream-state')).active, false);
  await viewer.read(msg => msg.type === 'host-left');
  const back = await socket('host'); assert.equal((await back.read(msg => msg.type === 'welcome')).viewer, true);
  await back.read(msg => msg.type === 'viewer-joined');
});
test('Espectador não pode enviar vídeo nem se tornar transmissor', async t => {
  const { socket } = await setup(t);
  const viewer = await socket('viewer'); await viewer.read(msg => msg.type === 'welcome');
  viewer.ws.send(Buffer.from('não permitido'));
  assert.equal((await viewer.closed)[0], 4001);
});
test('Origin de site externo não consegue abrir WebSocket', async t => {
  const { app } = await setup(t);
  const ws = new WebSocket(app.address.replace('http:', 'ws:') + '/socket', { origin: 'https://outro.example' });
  await once(ws, 'error'); assert.notEqual(ws.readyState, WebSocket.OPEN);
});
test('Encerrar o app também fecha preconexões sem cabeçalhos HTTP', async () => {
  const app = await createConcord({ port: 0 }).listen();
  const socket = net.connect(new URL(app.address).port, '127.0.0.1');
  await once(socket, 'connect');
  const started = Date.now();
  await app.close();
  assert.ok(Date.now() - started < 2000, 'fechamento não aguarda timeout de uma preconexão');
  socket.destroy();
});
