import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { createConcord } from '../server.mjs';

async function room(t) {
  const app = await createConcord({ port: 0 }).listen(); t.after(() => app.close());
  const session = await (await fetch(app.address + '/api/session', { headers: { 'x-concord-host': app.hostToken } })).json();
  async function join(role, token, name) {
    const ws = new WebSocket(app.address.replace('http:', 'ws:') + '/socket', { origin: app.address }), inbox = [];
    const closed = new Promise(resolve => ws.on('close', resolve));
    ws.on('message', data => inbox.push(JSON.parse(data))); ws.on('error', () => {}); await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'auth', role, token, profile: { name }, features: ['camera', 'chat'] }));
    const next = async (predicate, timeout = 2000) => { const end = Date.now() + timeout; while (Date.now() < end) { const index = inbox.findIndex(predicate); if (index >= 0) return inbox.splice(index, 1)[0]; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('Mensagem não chegou'); };
    const none = async (predicate, wait = 250) => { await new Promise(resolve => setTimeout(resolve, wait)); assert.equal(inbox.findIndex(predicate), -1); };
    return { ws, next, none, closed, send: msg => ws.send(JSON.stringify(msg)) };
  }
  const host = await join('host', app.hostToken, 'Dona'), guest = await join('viewer', session.inviteKey, 'Amiga');
  const welcome = await host.next(msg => msg.type === 'welcome'); await guest.next(msg => msg.type === 'welcome');
  return { app, host, guest, welcome };
}
const id = n => 'msg-' + String(n).padStart(6, '0');
const isChat = msg => msg.type === 'chat';
const isChunk = msg => msg.type === 'chat-chunk';

test('boas-vindas anunciam chat e mensagem de texto chega só aos outros', async t => {
  const { host, guest, welcome } = await room(t);
  assert.deepEqual(welcome.features, ['camera', 'chat']);
  const before = Date.now();
  host.send({ type: 'chat', id: id(1), text: 'Olá\u0007 sala\nlinha 2', from: 'forjado', name: 'Falso', ts: 1 });
  const msg = await guest.next(isChat);
  assert.equal(msg.id, id(1)); assert.equal(msg.text, 'Olá sala\nlinha 2'); assert.equal(msg.from, 'host'); assert.equal(msg.name, 'Dona');
  assert.ok(msg.ts >= before); assert.equal(msg.file, undefined);
  await host.none(isChat);
});

test('chat inválido é descartado em silêncio', async t => {
  const { host, guest } = await room(t);
  const file = over => ({ id: 'file-0001', name: 'a.txt', size: 10, mime: 'text/plain', ...over });
  const bad = [
    { id: id(2), text: 'x'.repeat(2001) }, { id: 'curto', text: 'oi' }, { id: 'tem espaço!', text: 'oi' }, { id: id(3), text: 5 },
    { id: id(4), text: '' }, { id: id(5), text: '  ' },
    { id: id(6), text: '', file: file({ size: 0 }) }, { id: id(7), text: '', file: file({ size: -5 }) }, { id: id(8), text: '', file: file({ size: 1.5 }) },
    { id: id(9), text: '', file: file({ size: '10' }) }, { id: id(10), text: '', file: file({ id: 'x' }) }, { id: id(11), text: '', file: file({ name: 'n'.repeat(201) }) }
  ];
  for (const item of bad) host.send({ type: 'chat', ...item });
  host.send({ type: 'chat', id: id(12), text: 'ok' });
  assert.equal((await guest.next(isChat)).id, id(12));
  await guest.none(isChat);
});

test('arquivos de qualquer tamanho são anunciados; nome e tipo são saneados', async t => {
  const { host, guest } = await room(t);
  host.send({ type: 'chat', id: id(1), text: '', file: { id: 'file-huge1', name: '..\\a/b\u0001.bin', size: 10 * 1024 ** 3, mime: 'não/valido!' } });
  const msg = await guest.next(isChat);
  assert.deepEqual(msg.file, { id: 'file-huge1', name: '..ab.bin', size: 10 * 1024 ** 3, mime: 'application/octet-stream' });
});

test('chunk de arquivo não anunciado é descartado', async t => {
  const { host, guest } = await room(t);
  host.send({ type: 'chat-chunk', file: 'file-nope1', seq: 0, data: 'AAAA', last: true });
  await guest.none(isChunk); await host.none(msg => msg.type === 'chat-ack');
  guest.send({ type: 'chat', id: id(1), text: '', file: { id: 'file-mine1', name: 'a', size: 3, mime: 'text/plain' } });
  await host.next(isChat);
  host.send({ type: 'chat-chunk', file: 'file-mine1', seq: 0, data: 'AAAA', last: true });
  await guest.none(isChunk);
});

test('arquivo de 1,2 MB em partes de 512 KiB chega em ordem, com ack e bytes idênticos', async t => {
  const { host, guest } = await room(t);
  const bytes = randomBytes(1_200_000), parts = [];
  for (let offset = 0; offset < bytes.length; offset += 512 * 1024) parts.push(bytes.subarray(offset, offset + 512 * 1024));
  host.send({ type: 'chat', id: id(1), text: 'arquivo', file: { id: 'file-big01', name: 'dados.bin', size: bytes.length, mime: 'application/zip' } });
  assert.equal((await guest.next(isChat)).file.size, bytes.length);
  const received = [];
  for (const [seq, part] of parts.entries()) {
    host.ws.send(JSON.stringify({ type: 'chat-chunk', file: 'file-big01', seq, data: part.toString('base64'), last: seq === parts.length - 1 }));
    const chunk = await guest.next(isChunk);
    assert.equal(chunk.seq, seq); assert.equal(chunk.from, 'host'); assert.equal(chunk.last, seq === parts.length - 1);
    received.push(Buffer.from(chunk.data, 'base64'));
    assert.deepEqual(await host.next(msg => msg.type === 'chat-ack'), { type: 'chat-ack', file: 'file-big01', seq });
  }
  assert.ok(Buffer.concat(received).equals(bytes));
  host.ws.send(JSON.stringify({ type: 'chat-chunk', file: 'file-big01', seq: parts.length, data: 'AAAA', last: true }));
  await guest.none(isChunk);
});

test('chunk acima do tamanho anunciado, fora de ordem ou inválido é descartado', async t => {
  const { host, guest } = await room(t);
  host.send({ type: 'chat', id: id(1), text: '', file: { id: 'file-small', name: 'a', size: 3, mime: 'text/plain' } });
  await guest.next(isChat);
  host.send({ type: 'chat-chunk', file: 'file-small', seq: 1, data: 'AAAA', last: false });
  host.send({ type: 'chat-chunk', file: 'file-small', seq: 0, data: 'AAAAAAAA', last: false });
  host.send({ type: 'chat-chunk', file: 'file-small', seq: 0, data: 'AA*A', last: false });
  await guest.none(isChunk);
  host.send({ type: 'chat-chunk', file: 'file-small', seq: 0, data: 'AAAA', last: true });
  assert.equal((await guest.next(isChunk)).seq, 0);
});

test('mensagem grande que não é chat-chunk ainda fecha o socket', async t => {
  const { host, guest } = await room(t);
  host.ws.send(JSON.stringify({ type: 'profile', name: 'x', pad: 'y'.repeat(70000) }));
  assert.equal(await host.closed, 4001);
  guest.ws.send(JSON.stringify({ type: 'stream-state', pad: '{"type":"chat-chunk"' + 'y'.repeat(70000) }));
  assert.equal(await guest.closed, 4001);
});

test('limite de 20 mensagens de chat em 10 s por conexão', async t => {
  const { host, guest } = await room(t);
  for (let n = 0; n < 21; n++) host.send({ type: 'chat', id: id(n), text: 'm' + n });
  for (let n = 0; n < 20; n++) assert.equal((await guest.next(isChat)).id, id(n));
  await guest.none(isChat);
});
