import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { _electron } from 'playwright';
import { webInvite } from '../public/invites.js';

const root = process.cwd(), run = path.join(root, 'test-results/invite-start-' + Date.now());
const apps = [], errors = [], result = { passed: false, checks: [], executable: process.env.CONCORD_EXE || 'development' };
await mkdir(run, { recursive: true });
async function count(app) { return app.evaluate(() => globalThis.inviteStartCalls); }
async function launch(name, onboarding = false) {
  console.log('Abrindo QA:', name);
  const data = path.join(run, name);
  // Even an old/regressed startup must not provision a real tunnel before the spy is installed.
  await mkdir(path.join(data, 'tunnel'), { recursive: true });
  await writeFile(path.join(data, 'tunnel/invite-retry.json'), JSON.stringify({ code: 'RATE_LIMIT', failures: 1, retryAt: Date.now() + 300000 }));
  await writeFile(path.join(data, 'profile.json'), JSON.stringify({ name: onboarding ? '' : name, photo: '' }));
  const app = await _electron.launch({ executablePath: process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: process.env.CONCORD_EXE ? [] : [root], env: { ...process.env, CONCORD_DATA_DIR: data }, timeout: 45000 });
  apps.push(app); const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  if (onboarding) {
    await page.locator('#name-picker[open]').waitFor();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#invite-status').textContent(), '', 'primeira escolha de nome não iniciou preparo');
    await page.locator('#display-name').fill(name); await page.locator('#save-name').click();
  }
  await page.locator('#create-room:not([disabled])').waitFor();
  // Finish the initial load before reloading, otherwise Electron's loadURL is aborted.
  await page.waitForLoadState('load');
  await app.evaluate(({ ipcMain, clipboard }) => {
    globalThis.inviteStartCalls = 0;
    ipcMain.removeHandler('concord:tunnel');
    ipcMain.handle('concord:tunnel', () => {
      globalThis.inviteStartCalls++;
      return new Promise(resolve => { globalThis.resolveInviteStart = resolve; });
    });
    clipboard.writeText = value => { globalThis.inviteStartClipboard = value; };
  });
  console.log('Reabrindo renderer com observador:', name); await page.reload();
  await page.locator('#create-room:not([disabled])').waitFor();
  console.log('Painel disponível:', name);
  await page.waitForTimeout(250); assert.equal(await count(app), 0, 'abrir o Painel não solicita túnel');
  const packaged = await app.evaluate(({ app }) => process.getBuiltinModule('fs').readFileSync(process.getBuiltinModule('path').join(app.getAppPath(), 'public/app.js'), 'utf8'));
  assert.equal(packaged.replaceAll('\r\n', '\n'), (await readFile('public/app.js', 'utf8')).replaceAll('\r\n', '\n'));
  assert.equal((await page.evaluate(() => window.concord.session())).public, false);
  return { app, page };
}
try {
  const host = await launch('Dona QA', true), guest = await launch('Convidada QA');
  console.log('Validando criar/entrar');
  result.version = (await host.page.evaluate(() => window.concord.bootstrap())).version;
  result.checks.push('Primeiro nome e Painel abrem com zero solicitações de túnel.');
  await guest.page.locator('#join-room').click(); await guest.page.locator('#join-input').fill('invalido');
  await guest.page.locator('#join-button').click(); await guest.page.locator('#join-error').filter({ hasText: 'convite' }).waitFor();
  await guest.page.locator('#cancel-join').click(); assert.equal(await count(guest.app), 0);
  await host.page.locator('#create-room').click();
  await host.page.waitForFunction(() => document.body.dataset.connected === 'true');
  await host.page.locator('#invite-status').filter({ hasText: 'Código sendo carregado' }).waitFor();
  assert.equal(await count(host.app), 1);
  assert.equal(await host.page.locator('#choose-source').isEnabled(), true);
  assert.equal(await host.page.locator('#quality').isEnabled(), true);
  const session = await host.page.evaluate(() => window.concord.session()); assert.equal(session.active, false);
  await host.page.locator('#home-tab').click(); await host.page.locator('#create-room').click();
  await host.page.locator('#host-tab').click(); assert.equal(await count(host.app), 1, 'voltar/criar sala já hospedada não repete preparo');
  result.checks.push('Criar sala inicia um pedido; captura continua desligada e controles disponíveis. Navegação/cliques repetidos não duplicam.');
  await host.app.evaluate((_, session) => globalThis.resolveInviteStart({ ...session, public: true }), session);
  await host.page.locator('#copy-link-button').click();
  assert.equal(await host.app.evaluate(() => globalThis.inviteStartClipboard), webInvite(session.guestInvite));
  await guest.page.locator('#join-room').click(); await guest.page.locator('#join-input').fill(session.guestInvite);
  await guest.page.locator('#join-button').click();
  await guest.page.waitForFunction(() => document.body.dataset.connected === 'true');
  await host.page.locator('#audience-list').filter({ hasText: 'Convidada QA' }).waitFor();
  await guest.page.locator('#copy-link-button').click();
  assert.equal(await guest.app.evaluate(() => globalThis.inviteStartClipboard), webInvite(session.guestInvite));
  assert.equal(await count(guest.app), 0, 'entrar/copiar convite de outra sala não cria túnel próprio');
  assert.equal((await guest.page.evaluate(() => window.concord.session())).public, false);
  result.checks.push('Duas instâncias entram na mesma sala e copiam o link; convidada permanece com zero pedidos próprios.');
  await guest.page.locator('#home-tab').click(); await guest.page.locator('#create-room').click();
  await guest.page.locator('#invite-status').filter({ hasText: 'Código sendo carregado' }).waitFor();
  assert.equal(await count(guest.app), 1, 'convidada só prepara seu convite quando cria sala própria');
  await guest.page.locator('#cancel-invite').click();
  await guest.page.locator('#invite-status').filter({ hasText: 'Acesso fechado' }).waitFor();
  await guest.page.locator('#home-tab').click(); await guest.page.locator('#create-room').click();
  assert.equal(await count(guest.app), 1, 'navegação após cancelar não reinicia preparo');
  await guest.page.locator('#invite-button').click();
  await guest.page.locator('#invite-status').filter({ hasText: 'Código sendo carregado' }).waitFor();
  assert.equal(await count(guest.app), 2, 'tentar novamente continua sendo explícito');
  const ownSession = await guest.page.evaluate(() => window.concord.session());
  await guest.app.evaluate((_, session) => globalThis.resolveInviteStart({ ...session, public: true }), ownSession);
  await guest.page.locator('#copy-link-button').waitFor();
  result.checks.push('Mudar para sala própria inicia preparo; cancelar e tentar novamente permanecem explícitos. Nenhum túnel público real usado.');
  await host.page.screenshot({ path: path.join(run, 'sala.png') });
  assert.deepEqual(errors, []); result.passed = true;
} catch (error) { result.failure = error.message; console.error(error.message); throw error; }
finally {
  for (const app of apps.reverse()) { const child = app.process(); await Promise.race([app.close(), new Promise((_, reject) => setTimeout(() => reject(new Error('Fechamento QA expirou')), 5000).unref())]).catch(() => child.kill()); }
  result.errors = errors; await writeFile(path.join(run, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ run, ...result }, null, 2));
}
