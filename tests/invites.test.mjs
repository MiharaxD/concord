import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvite, shortInvite, webInvite, desktopInvite } from '../public/invites.js';

const key = '7bzC9QVjD04Ly_WpmvRg8A';
const address = 'https://quiet-river-blue-frog.trycloudflare.com';
test('Link normal preserva código em prévias e abre o mesmo convite no desktop', () => {
  const code = shortInvite(address, key), link = webInvite(code);
  assert.equal(link, `${address}/invite?join=${key}`); assert.deepEqual(parseInvite(link), parseInvite(code));
  assert.equal(desktopInvite(link), code);
  assert.deepEqual(parseInvite(`[Entrar na sala de Yuri](${link})`), parseInvite(code));
  for (const old of [`${address}/#join=${'A'.repeat(43)}`, `http://127.0.0.1:4173/#join=${key}`, `https://custom.example/#join=${key}`]) {
    assert.deepEqual(parseInvite(desktopInvite(old)), parseInvite(old)); assert.deepEqual(parseInvite(webInvite(old)), parseInvite(old));
  }
  for (const bad of ['concord:link:javascript%3Aalert(1)', 'concord:link:concord%3Afoo%3Abar', 'concord:link:%ZZ']) assert.throws(() => parseInvite(bad));
  assert.throws(() => parseInvite(`${address}/invite?join=${key}#join=${'A'.repeat(22)}`));
});

test('Convite curto reconstrói o destino sem serviço externo', () => {
  const value = shortInvite(address, key);
  assert.equal(value, `concord:quiet-river-blue-frog:${key}`);
  assert.deepEqual(parseInvite(` \n${value}\n `), { address, token: key });
  const old = `${address}/#join=${'A'.repeat(43)}`;
  assert.equal(old.length - value.length, 45);
});

test('Convites antigos e endereços locais continuam aceitos', () => {
  assert.deepEqual(parseInvite(`${address}/#join=${'A'.repeat(43)}`), { address, token: 'A'.repeat(43) });
  const local = 'http://127.0.0.1:4173';
  assert.deepEqual(parseInvite(shortInvite(local, key)), { address: local, token: key });
});

test('Endereço personalizado ou porta preservam o destino completo', () => {
  for (const origin of ['https://stream.example', 'https://quiet-river-blue-frog.trycloudflare.com:8443']) {
    assert.deepEqual(parseInvite(shortInvite(origin, key)), { address: origin, token: key });
  }
});

test('Código incompleto, host injetado e convite inseguro são rejeitados', () => {
  for (const value of [
    `concord:quiet-river-blue-frog:${key.slice(0, -1)}`,
    `concord:evil.example/${key}:${key}`, `concord:foo@evil:${key}`,
    `concord:-foo:${key}`, `concord:foo-:${key}`, `concord:${'a'.repeat(64)}:${key}`,
    `concord:foo:${key}:extra`, `http://stream.example/#join=${key}`,
    `https://user:password@stream.example/#join=${key}`, 'concord:foo:123456',
    'javascript:alert(1)', `${address}/`, 'qualquer coisa'
  ]) assert.throws(() => parseInvite(value), Error, value);
});
