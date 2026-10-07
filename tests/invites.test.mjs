import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvite, shortInvite } from '../public/invites.js';

const key = '7bzC9QVjD04Ly_WpmvRg8A';
const address = 'https://quiet-river-blue-frog.trycloudflare.com';

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
