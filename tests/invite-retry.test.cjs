const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mkdtemp, mkdir, writeFile, readFile } = require('node:fs/promises');
const { createInviteRetry, tunnelFailure } = require('../desktop/invite-retry.cjs');

test('Falhas de provisionamento são classificadas sem expor saída bruta', () => {
  assert.equal(tunnelFailure('quick tunnel provisioning failed with status 429').code, 'RATE_LIMIT');
  assert.equal(tunnelFailure('quick tunnel provisioning failed with status 503').code, 'PROVIDER');
  assert.equal(tunnelFailure('quick tunnel provisioning failed with status 403').code, 'PROVIDER');
  assert.equal(tunnelFailure('lookup api.trycloudflare.com: no such host').code, 'NETWORK');
  assert.equal(tunnelFailure('unknown log with 429 in a hostname').code, 'CONNECTION');
  assert.ok(!tunnelFailure('SECRET=foo').message.includes('SECRET'));
});
test('429 espera 1/2/4/5 minutos, persiste ao reabrir e limpa após sucesso', async () => {
  await mkdir('test-results', { recursive: true });
  const directory = await mkdtemp(path.resolve('test-results/invite-retry-')), file = path.join(directory, 'retry.json');
  let now = Date.now(); const clock = () => now;
  let retry = createInviteRetry(file, clock); assert.equal(await retry.blocked(), null);
  for (const wait of [60000, 120000, 240000, 300000, 300000]) {
    const limited = await retry.limited(); assert.equal(limited.retryAt, now + wait);
    retry = createInviteRetry(file, clock); assert.deepEqual(await retry.blocked(), limited);
    const saved = JSON.parse(await readFile(file, 'utf8')); assert.deepEqual(Object.keys(saved).sort(), ['code', 'failures', 'retryAt']);
    now += wait; assert.equal(await retry.blocked(), null, 'prazo decorrido permite novo pedido');
  }
  await retry.clear(); retry = createInviteRetry(file, clock); assert.equal(await retry.blocked(), null);
  assert.equal((await retry.limited()).retryAt, now + 60000, 'sucesso reinicia escalada');
  now += 1900000; assert.equal((await retry.limited()).retryAt, now + 60000, 'período longo sem erro reinicia escalada');
});
test('Cache ausente, inválido ou com prazo absurdo não impede convite', async () => {
  const directory = await mkdtemp(path.resolve('test-results/invite-cache-')), file = path.join(directory, 'retry.json');
  for (const value of ['{', JSON.stringify({ code: 'RATE_LIMIT', failures: 1, retryAt: Date.now() + 99999999 })]) {
    await writeFile(file, value); assert.equal(await createInviteRetry(file).blocked(), null);
  }
});
