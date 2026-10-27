const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const { mkdir, mkdtemp, readFile } = require('node:fs/promises');
const { createDiscordLink } = require('../desktop/discord.cjs');
const clientId = '1564636773710037073';
const storage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(Buffer.from(text).toString('base64')), decryptString: bytes => Buffer.from(bytes.toString(), 'base64').toString() };
const photo = 'data:image/jpeg;base64,YWJj';
async function setup(t, options = {}) {
  await mkdir('test-results', { recursive: true });
  const directory = await mkdtemp(path.resolve('test-results/discord-unit-')), file = path.join(directory, 'discord.bin');
  const probe = http.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const redirectUri = `http://127.0.0.1:${port}/discord/callback`, requests = []; let authorize, name = 'Yuri';
  const params = { file, storage, clientId, redirectUri, scopes: 'identify', normalizeImage: () => photo, timeout: 5000,
    openExternal: async url => {
      authorize = new URL(url);
      assert.equal(authorize.origin, 'https://discord.com'); assert.equal(authorize.searchParams.get('scope'), 'identify');
      assert.equal(authorize.searchParams.get('redirect_uri'), redirectUri); assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
      if (options.hold) return;
      const callback = new URL(redirectUri); callback.searchParams.set('state', authorize.searchParams.get('state')); callback.searchParams.set('code', 'code_from_discord');
      const response = await fetch(callback); assert.equal(response.status, 200); await response.text();
    },
    fetcher: async (url, init = {}) => {
      requests.push({ url, init });
      if (options.fetcher) { const result = await options.fetcher(url, init); if (result) return result; }
      if (url.endsWith('/oauth2/token')) {
        const body = new URLSearchParams(init.body); assert.equal(body.has('client_secret'), false); assert.equal(body.get('client_id'), clientId);
        if (body.get('grant_type') === 'authorization_code') assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), authorize.searchParams.get('code_challenge'));
        return Response.json({ access_token: 'access_token_fixture', refresh_token: 'refresh_token_fixture', token_type: 'Bearer', scope: 'identify', expires_in: options.expired ? 1 : 600 });
      }
      if (url.endsWith('/users/@me')) return Response.json({ id: '123456789012345678', username: 'yuri', global_name: name, avatar: 'a'.repeat(32), banner: 'b'.repeat(32), accent_color: 0x9b86ff, email: 'must-not-be-returned@example.test' });
      if (url.startsWith('https://cdn.discordapp.com/')) return new Response(Buffer.from('image fixture'), { headers: { 'Content-Type': 'image/png' } });
      if (url.endsWith('/oauth2/token/revoke')) return new Response(null, { status: 200 });
      throw new Error('Unexpected request');
    }
  };
  const link = await createDiscordLink(params); t.after(() => link.close());
  return { link, params, requests, file, redirectUri, authorize: () => authorize, name: value => { name = value; } };
}
test('OAuth usa estado e PKCE sem segredo; importa só aparência e persiste autorização protegida', async t => {
  const s = await setup(t), profile = await s.link.link();
  assert.deepEqual(profile, { name: 'Yuri', photo, banner: photo, accentColor: '#9b86ff' });
  assert.equal(JSON.stringify(profile).includes('token'), false); assert.equal(s.link.state().linked, true);
  const encrypted = await readFile(s.file, 'utf8'); assert.equal(encrypted.includes('access_token_fixture'), false);
  await s.link.close(); const reopened = await createDiscordLink(s.params); t.after(() => reopened.close());
  assert.equal(reopened.state().linked, true); s.name('Mihara'); assert.equal((await reopened.refresh()).name, 'Mihara');
  assert.equal(s.requests.filter(r => r.url.endsWith('/oauth2/token')).length, 1, 'acesso ainda válido evita refresh desnecessário');
  assert.equal(await reopened.unlink(), ''); assert.equal(reopened.state().linked, false);
  await assert.rejects(readFile(s.file), { code: 'ENOENT' });
});
test('Retorno com estado errado, Unicode ou origem errada não aceita código nem fecha o listener', async t => {
  const s = await setup(t, { hold: true }); const pending = s.link.link();
  while (!s.authorize()) await new Promise(resolve => setTimeout(resolve, 5));
  const callback = new URL(s.redirectUri); callback.searchParams.set('code', 'code_from_discord');
  callback.searchParams.set('state', 'é'.repeat(s.authorize().searchParams.get('state').length));
  assert.equal((await fetch(callback)).status, 400); callback.searchParams.set('state', s.authorize().searchParams.get('state')); callback.searchParams.set('iss', 'https://evil.test');
  assert.equal((await fetch(callback)).status, 400); assert.equal(s.requests.length, 0);
  const failed = assert.rejects(pending, /cancelada/); s.link.cancel(); await failed; assert.equal(s.link.state().linked, false);
  await assert.rejects(readFile(s.file), { code: 'ENOENT' });
});
test('Cancelamento imediato e fechamento não deixam autorização tardia ou listener ativo', async t => {
  const s = await setup(t, { hold: true }); const failed = assert.rejects(s.link.link(), /cancelada/); s.link.cancel(); await failed;
  const again = s.link.link(), rejected = assert.rejects(again, /cancelada/);
  while (!s.authorize()) await new Promise(resolve => setTimeout(resolve, 5));
  await s.link.close(); await rejected; await assert.rejects(fetch(s.redirectUri)); assert.equal(s.requests.length, 0);
});
test('Token expirado é renovado; revogação indisponível apaga vínculo local e explica a pendência', async t => {
  const s = await setup(t, { expired: true, fetcher: async url => url.endsWith('/revoke') ? new Response(null, { status: 503 }) : null });
  await s.link.link(); await s.link.refresh(); assert.equal(s.requests.filter(r => r.url.endsWith('/oauth2/token')).length, 2);
  assert.match(await s.link.unlink(), /removido deste PC/); assert.equal(s.link.state().linked, false);
});
test('Resposta inválida ou imagem injetada não é salva nem buscada em origem externa', async t => {
  const s = await setup(t, { fetcher: async url => url.endsWith('/users/@me') ? Response.json({ id: '123456789012345678', username: 'yuri', avatar: 'https://evil.test/image' }) : null });
  await assert.rejects(s.link.link(), /imagem.*inválida/); assert.equal(s.link.state().linked, false);
  assert.equal(s.requests.some(r => r.url.includes('evil.test')), false); await assert.rejects(readFile(s.file), { code: 'ENOENT' });
});
