import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
// Painel com convite da área de transferência, avisos da sala, ferramentas do tile, conexão e configurações.
const root = process.cwd(), apps = [];
const run = path.join(root, 'test-results', 'room-ux-' + Date.now()); await mkdir(run, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = text => console.log('OK', text);
async function launch(name) {
  const app = await _electron.launch({ executablePath: process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: [...(process.env.CONCORD_EXE ? [] : [root]), '--mute-audio', '--use-fake-device-for-media-stream'], env: { ...process.env, CONCORD_DATA_DIR: path.join(run, name) }, timeout: 45000 });
  apps.push(app);
  const page = await app.firstWindow(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
  await page.locator('#name-picker[open]').waitFor(); await page.locator('#display-name').fill(name); await page.locator('#save-name').click();
  return { app, page };
}
// The real clipboard is never touched: the main handler is replaced by a fixed value.
const clipboard = (app, value) => app.evaluate(({ ipcMain }, value) => { ipcMain.removeHandler('concord:clipboard-invite'); ipcMain.handle('concord:clipboard-invite', () => value); }, value);
try {
  const host = await launch('Yuri');
  await host.page.locator('#create-room').click(); await host.page.waitForFunction(() => document.querySelector('#invite-link').value.startsWith('concord:p2p:'));
  const invite = await host.page.locator('#invite-link').inputValue();
  await clipboard(host.app, invite); await host.page.locator('#home-tab').click(); await sleep(400);
  assert.equal(await host.page.locator('#clip-invite').isHidden(), true, 'convite da própria sala não é oferecido');
  await host.page.locator('#host-tab').click();

  const guest = await launch('Ana');
  await clipboard(guest.app, ''); // main returns empty for anything that is not an invite await guest.page.evaluate(() => window.dispatchEvent(new Event('focus'))); await sleep(300);
  assert.equal(await guest.page.locator('#clip-invite').isHidden(), true);
  await clipboard(guest.app, invite); await guest.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await guest.page.locator('#clip-invite:not([hidden])').waitFor();
  await guest.page.locator('#clip-ignore').click(); await guest.page.evaluate(() => window.dispatchEvent(new Event('focus'))); await sleep(300);
  assert.equal(await guest.page.locator('#clip-invite').isHidden(), true, 'convite ignorado não volta');
  check('Painel oferece só convites válidos de outra sala, e Ignorar vale até trocar de convite.');

  await guest.page.locator('#join-room').click(); await guest.page.locator('#join-picker[open]').waitFor(); await guest.page.keyboard.press('Escape');
  await guest.page.locator('#home-join-input').fill(invite); await guest.page.locator('#join-room').click();
  await guest.page.waitForFunction(() => document.body.dataset.connected === 'true');
  await host.page.locator('.room-toast', { hasText: 'Ana entrou na sala' }).waitFor();
  check('Campo do Painel entra na sala e o dono vê o aviso de entrada.');

  await host.page.locator('#bar-screen').click(); await host.page.locator('#choose-source').click(); await host.page.locator('#tab-screens').click(); await host.page.locator('.share-source').first().click(); await host.page.locator('#start-button').click();
  const live = guest.page.locator('.room-toast', { hasText: 'Yuri começou a transmitir' }); await live.waitFor();
  await guest.page.locator('.stream-tile.playing').waitFor();
  await live.getByRole('button', { name: 'Assistir' }).click();
  await guest.page.locator('.stream-tile[aria-pressed="true"]').waitFor();
  assert.equal(await guest.page.locator('.tile-pin').getAttribute('aria-pressed'), 'true');
  await guest.page.locator('.tile-pin').click({ force: true }); await guest.page.locator('.stream-tile[aria-pressed="false"]').waitFor();
  await guest.page.locator('.stream-tile').hover();
  await guest.page.locator('.tile-quality:not([hidden])').filter({ hasText: /^\d+p · \d+ fps/ }).waitFor();
  check('Aviso de transmissão foca a tela; o tile mostra qualidade real e fixa/solta pelo botão.');

  await guest.page.locator('#connection-panel').hover();
  await guest.page.locator('#connection-pop .pop-row', { hasText: 'Você → Yuri' }).waitFor();
  await guest.page.locator('#connection-pop .pop-row', { hasText: /Yuri.*(Direta|Compatibilidade)/ }).last().waitFor();
  await guest.page.mouse.move(700, 300); await guest.page.locator('#connection-pop').waitFor({ state: 'hidden' });
  await host.page.locator('#connection-panel').hover(); await host.page.locator('#connection-pop .pop-row', { hasText: 'Seu envio' }).waitFor();
  check('Passar o mouse no sinal mostra rota e envio de cada pessoa.');

  await guest.page.locator('#settings-button').click(); await guest.page.locator('#settings-dialog[open]').waitFor();
  assert.ok(await guest.page.locator('#settings-mic option').count() >= 1);
  await guest.page.locator('#mic-test').click(); await guest.page.locator('#mic-test[aria-pressed="true"]').waitFor();
  await guest.page.locator('#settings-tab-video').click(); await guest.page.locator('#mic-test[aria-pressed="false"]').waitFor({ state: 'attached' });
  await guest.page.locator('#settings-quality').selectOption('720');
  assert.equal(await guest.page.locator('#quality').inputValue(), '720');
  assert.equal(await host.page.evaluate(() => { document.querySelector('#settings-button').click(); return true; }), true);
  await host.page.locator('#settings-dialog[open]').waitFor(); await host.page.locator('#settings-tab-video').click();
  assert.equal(await host.page.locator('#settings-quality').isDisabled(), true, 'qualidade travada durante a transmissão');
  await host.page.keyboard.press('Escape');
  await guest.page.keyboard.press('Escape'); await guest.page.locator('#settings-dialog').waitFor({ state: 'hidden' });
  for (let i = 0; i < 20 && (await guest.page.evaluate(() => window.concord.bootstrap())).preferences.resolution !== '720'; i++) await sleep(100);
  assert.equal((await guest.page.evaluate(() => window.concord.bootstrap())).preferences.resolution, '720');
  check('Configurações: teste de microfone para ao trocar de aba, qualidade padrão salva e travada ao transmitir.');

  await guest.page.locator('#profile-settings').click(); await guest.page.locator('#settings-dialog[open]').waitFor();
  assert.equal(await guest.page.locator('#name-picker[open]').count(), 0, 'engrenagem não abre o perfil');
  await guest.page.keyboard.press('Escape'); await guest.page.locator('#settings-dialog').waitFor({ state: 'hidden' });
  await guest.page.locator('#profile-button').click(); await guest.page.locator('#name-picker[open]').waitFor();
  assert.equal(await guest.page.locator('#settings-dialog[open]').count(), 0);
  await guest.page.keyboard.press('Escape'); await guest.page.locator('#name-picker').waitFor({ state: 'hidden' });
  check('Engrenagem ao lado do perfil abre as Configurações; foto e nome abrem o perfil.');

  await guest.page.locator('#leave-button').click();
  await host.page.locator('.room-toast', { hasText: 'Ana saiu da sala' }).waitFor();
  check('Dono vê o aviso de saída.');
} finally { for (const app of apps) await app.close().catch(() => {}); }
