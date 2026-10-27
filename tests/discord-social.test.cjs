const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { createDiscordSocial } = require('../desktop/discord-social.cjs');
test('Ponte do SDK filtra dados, protege token no pipe, carrega foto e só convida amigo após confirmação de envio', async t => {
  const id = '123456789012345678', requests = []; let process, send;
  const social = createDiscordSocial({ binary: 'component.exe', cwd: '.', authorization: async () => ({ token: 'private-test-token', clientId: '1564636773710037073' }), normalizeImage: () => 'data:image/jpeg;base64,YWJj',
    fetcher: async (url, options) => { assert.match(url, /^https:\/\/cdn\.discordapp\.com\/avatars\//); assert.equal(options.headers, undefined); return new Response(Buffer.from('image'), { headers: { 'Content-Type': 'image/png' } }); },
    spawnProcess: (binary, args, options) => {
      assert.equal(binary, 'component.exe'); assert.deepEqual(args, []); assert.equal(JSON.stringify(options).includes('private-test-token'), false);
      process = new EventEmitter(); process.stdout = new PassThrough();
      process.stdin = new Writable({ write(chunk, encoding, callback) {
        const request = JSON.parse(String(chunk)); requests.push(request);
        const reply = value => setImmediate(() => process.stdout.write(JSON.stringify({ id: request.id, ok: true, value }) + '\n'));
        if (request.type === 'connect') { assert.equal(request.token, 'private-test-token'); reply({ connected: true }); }
        else if (request.type === 'friends') reply([{ id, name: '<QA>', username: 'qa', online: true, avatar: 'a'.repeat(32), token: 'never-return' }, { id: 'invalid', name: 'bad' }]);
        else if (request.type === 'invite') send = () => reply({ sent: true });
        callback();
      }, final(callback) { setImmediate(() => process.emit('close')); callback(); } });
      process.kill = () => process.emit('close'); return process;
    }
  }); t.after(() => social.close());
  const friends = await social.friends(); assert.deepEqual(friends, [{ id, name: '<QA>', username: 'qa', online: true }]);
  assert.equal(await social.photo(id), 'data:image/jpeg;base64,YWJj'); assert.equal(await social.photo('bad'), '');
  await assert.rejects(social.invite('000000000000000000', 'https://example.test/invite?join=AAAA'), /lista de amigos/);
  let confirmed = false; const pending = social.invite(id, 'https://example.test/invite?join=AAAAAAAAAAAAAAAAAAAAAA').then(value => { confirmed = value; });
  while (!send) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(confirmed, false); await assert.rejects(social.invite(id, 'https://example.test'), /Aguarde/);
  send(); await pending; assert.equal(confirmed, true); assert.equal(requests.filter(r => r.type === 'invite').length, 1);
  await social.disconnect(); await assert.rejects(social.invite(id, 'https://example.test'), /lista de amigos/);
});
