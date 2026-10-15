import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { _electron } from 'playwright';

const root = process.cwd(), run = path.join(root, 'test-results', 'invite-ui-' + Date.now()), errors = [];
const data = path.join(run, 'profile'); await mkdir(path.join(data, 'tunnel'), { recursive: true });
// Simulate a persisted provider deadline. This test never provisions a public tunnel.
const retryAt = Date.now() + 8000;
await writeFile(path.join(data, 'tunnel/invite-retry.json'), JSON.stringify({ code: 'RATE_LIMIT', failures: 1, retryAt }));
const result = { executable: process.env.CONCORD_EXE || 'development', passed: false, checks: [] };
let app;
try {
  app = await _electron.launch({ executablePath: process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: process.env.CONCORD_EXE ? [] : [root], env: { ...process.env, CONCORD_DATA_DIR: data }, timeout: 45000 });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.locator('#display-name').fill('Convite QA'); await page.locator('#save-name').click(); await page.locator('#create-room').click();
  await page.locator('#invite-status').filter({ hasText: 'A Cloudflare limitou temporariamente' }).waitFor();
  assert.equal(await page.locator('#invite-button').isDisabled(), true);
  assert.match(await page.locator('#invite-button').textContent(), /Tentar novamente em 0:\d\d/);
  assert.equal((await page.evaluate(() => window.concord.session())).inviteError.retryAt, retryAt);
  result.version = (await page.evaluate(() => window.concord.bootstrap())).version;
  const files = ['server.mjs', 'public/app.js', 'desktop/invite-retry.cjs'];
  const packaged = await app.evaluate(({ app }, files) => {
    const fs = process.getBuiltinModule('fs'), path = process.getBuiltinModule('path');
    return Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(app.getAppPath(), file), 'utf8')]));
  }, files);
  for (const file of files) assert.equal(packaged[file].replaceAll('\r\n', '\n'), (await readFile(file, 'utf8')).replaceAll('\r\n', '\n'));
  assert.equal(await page.locator('#choose-source').isEnabled(), true);
  await page.locator('#quality').selectOption('1080'); await page.locator('#fps').selectOption('60');
  await page.locator('#choose-source').click(); await page.locator('.source-choice').first().waitFor(); await page.locator('#close-picker').click();
  assert.equal((await page.evaluate(() => window.concord.session())).active, false);
  await page.screenshot({ path: path.join(run, 'limite-com-contagem.png') });
  const session = await page.evaluate(() => window.concord.session());
  await app.evaluate(({ ipcMain }, session) => {
    global.inviteUiSession = { ...session, inviteError: null }; global.inviteUiCalls = 0;
    ipcMain.removeHandler('concord:session'); ipcMain.handle('concord:session', () => global.inviteUiSession);
    ipcMain.removeHandler('concord:tunnel'); ipcMain.handle('concord:tunnel', () => {
      global.inviteUiCalls++; return new Promise((resolve, reject) => { global.resolveInviteUi = resolve; global.rejectInviteUi = reject; });
    });
  }, session);
  await page.waitForFunction(() => !document.querySelector('#invite-button').disabled);
  assert.equal(await page.locator('#invite-button').textContent(), 'Tentar novamente');
  assert.equal(await app.evaluate(() => global.inviteUiCalls), 0, 'expirar prazo não envia pedido automaticamente');
  result.checks.push('429 real do backend/cache aparece com contagem; bloqueia botão, preserva configurações/fontes e libera após prazo');
  await page.locator('#invite-button').click(); await page.locator('#invite-status').filter({ hasText: 'Código sendo carregado' }).waitFor();
  await app.evaluate(() => {
    global.inviteUiSession.inviteError = { code: 'PROVIDER', message: 'O serviço de convites da Cloudflare está indisponível agora. Tente novamente mais tarde.' };
    global.rejectInviteUi(new Error('provider failure'));
  });
  await page.locator('#invite-status').filter({ hasText: 'está indisponível' }).waitFor();
  assert.equal(await page.locator('#invite-button').isEnabled(), true);
  result.checks.push('Erro do serviço é mostrado sem culpar a internet nem expor exceção técnica');

  await page.locator('#invite-button').click(); await page.locator('#cancel-invite').waitFor(); await page.locator('#cancel-invite').click();
  await page.locator('#invite-status').filter({ hasText: 'Acesso fechado' }).waitFor();
  await app.evaluate(() => { global.rejectInviteUi(new Error('late result')); });
  await page.waitForTimeout(300); assert.match(await page.locator('#invite-status').textContent(), /Acesso fechado/);
  result.checks.push('Cancelar preserva mensagem e não é sobrescrito por falha tardia');

  const code = 'concord:convite-qa:abcdefghijklmnopqrstuv';
  await app.evaluate(({ clipboard }) => { clipboard.writeText = value => { global.inviteUiCopied = value; }; });
  await page.locator('#invite-button').click(); await page.locator('#cancel-invite').waitFor();
  await app.evaluate((_, code) => { global.resolveInviteUi({ public: true, guestInvite: code }); }, code);
  await page.locator('#copy-button').click(); assert.equal(await app.evaluate(() => global.inviteUiCopied), code);
  assert.equal(await page.locator('#invite-link').inputValue(), code);
  assert.equal(await page.locator('#invite-status').isVisible(), false);
  assert.equal(await page.locator('#invite-button').isVisible(), false);
  assert.equal(await app.evaluate(() => global.inviteUiCalls), 3);
  assert.equal(await page.evaluate(() => document.body.dataset.connected), 'true');
  result.checks.push('Nova tentativa, convite pronto e cópia continuam funcionando sem desconectar sala');
  assert.deepEqual(errors, []); result.passed = true; console.log('INVITE_UI_PASS', JSON.stringify(result));
} catch (error) { result.error = error.stack; throw error; }
finally {
  if (app) { const child = app.process(); await app.close().catch(() => child.kill()); }
  await writeFile(path.join(run, 'result.json'), JSON.stringify({ ...result, errors }, null, 2) + '\n'); console.log('Evidência:', run);
}
