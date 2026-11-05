import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { _electron } from 'playwright';

// Windows without per-app loopback keeps sharing working, with the whole PC's sound and the reason shown up front.
const root = process.cwd(), run = path.join(root, 'test-results', 'app-audio-support-' + Date.now()), apps = [], errors = [];
await mkdir(run, { recursive: true });
const executablePath = path.join(root, 'node_modules/electron/dist/electron.exe'), result = { checks: [], passed: false };
async function open(name, env = {}) {
  const app = await _electron.launch({ executablePath, args: [root, '--mute-audio', '--use-fake-device-for-media-stream'],
    env: { ...process.env, CONCORD_DATA_DIR: path.join(run, name), CONCORD_APP_AUDIO_UNSUPPORTED: '', ...env }, timeout: 45000 }); apps.push(app);
  const page = await app.firstWindow(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
  await page.locator('#display-name').fill(name); await page.locator('#save-name').click();
  await page.waitForFunction(() => document.body.dataset.connected === 'false');
  await page.locator('#create-room').click(); await page.waitForFunction(() => document.body.dataset.connected === 'true');
  await page.evaluate(name => { document.title = 'Jogo QA ' + name; }, name);
  return page;
}
async function chooseWindow(page, name) {
  await page.evaluate(() => { const dialog = document.getElementById('share-dialog'); if (!dialog.open) dialog.showModal(); });
  await page.locator('#choose-source').click(); await page.locator('#tab-windows').click();
  await page.locator('.share-source').filter({ hasText: 'Jogo QA ' + name }).click();
  await page.evaluate(() => { const dialog = document.getElementById('share-dialog'); if (!dialog.open) dialog.showModal(); });
}
const appOption = page => page.locator('#audio-mode option[value="application"]');
try {
  const real = await open('Suportado');
  assert.deepEqual(await real.evaluate(() => window.concord.appAudioSupport()), { supported: true });
  await chooseWindow(real, 'Suportado');
  await real.locator('#audio-summary').filter({ hasText: 'Som de Jogo QA Suportado' }).waitFor();
  assert.equal(await real.locator('#audio-auto').textContent(), 'Só do app'); assert.equal(await appOption(real).isDisabled(), false);
  result.checks.push('Teste real do helper neste Windows: som só do app continua disponível');

  const data = path.join(run, 'Antigo'); await mkdir(data, { recursive: true });
  await writeFile(path.join(data, 'preferences.json'), JSON.stringify({ audioMode: 'application', audioEnabled: true, audioVersion: 2 }));
  const old = await open('Antigo', { CONCORD_APP_AUDIO_UNSUPPORTED: '1' });
  await old.waitForFunction(() => document.querySelector('#audio-mode option[value="application"]').disabled);
  assert.equal(await old.locator('#audio-mode').inputValue(), 'auto');
  await chooseWindow(old, 'Antigo');
  await old.locator('#audio-summary').filter({ hasText: 'Som de todo o computador. Para ouvir só um app, atualize o Windows' }).waitFor();
  assert.equal(await old.locator('#audio-auto').textContent(), 'Automático'); assert.equal(await old.locator('#test-audio').isHidden(), true);
  await assert.rejects(old.evaluate(() => window.concord.startAppAudio('window:1:0')), /atualize o Windows/);
  result.checks.push('Windows sem suporte: opção desativada, preferência salva volta para Automático, aviso antes de transmitir, helper recusado');
  assert.deepEqual(errors, []); result.passed = true;
} finally {
  await Promise.allSettled(apps.map(app => app.close()));
  await writeFile(path.join(run, 'result.json'), JSON.stringify({ ...result, errors }, null, 2));
  console.log(JSON.stringify({ ...result, errors }, null, 2));
}
