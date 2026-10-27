// Interactive opt-in verification: isolated profile, real Discord consent, no personal capture.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { _electron } from 'playwright';
const root = process.cwd(), run = path.join(root, 'test-results/discord-live-' + Date.now()), data = path.join(run, 'profile');
await mkdir(data, { recursive: true }); await writeFile(path.join(data, 'profile.json'), JSON.stringify({ name: 'Yuri QA', photo: '' }));
const result = { passed: false, publicInvite: false, errors: [] };
const app = await _electron.launch({ executablePath: process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'),
  args: process.env.CONCORD_EXE ? [] : [root], env: { ...process.env, CONCORD_DATA_DIR: data }, timeout: 45000 });
const child = app.process(), page = await app.firstWindow(); page.on('pageerror', error => result.errors.push(error.message));
try {
  await app.evaluate(({ shell }, run) => {
    shell.openExternal = async url => { if (!url.startsWith('https://discord.com/oauth2/authorize?')) throw new Error('Destino inesperado');
      await process.getBuiltinModule('fs/promises').writeFile(process.getBuiltinModule('path').join(run, 'authorize-url.txt'), url); };
  }, run);
  await page.locator('#create-room:not([disabled])').waitFor(); await page.locator('#create-room').click();
  await page.locator('#profile-button').click(); await page.locator('#link-discord').click();
  console.log(JSON.stringify({ run, awaitingDiscordConsent: true }));
  await page.waitForFunction(() => document.querySelector('#discord-status').textContent.startsWith('Vinculado como') || document.querySelector('#name-error').textContent, null, { timeout: 600000 });
  const failure = await page.locator('#name-error').textContent(); if (failure) throw new Error(failure);
  const current = await page.evaluate(() => window.concord.bootstrap());
  result.profile = { nameImported: Boolean(current.profile.name), photoBytes: current.profile.photo.length, bannerBytes: current.profile.banner?.length || 0, accentColor: Boolean(current.profile.accentColor), linked: current.discord.linked };
  result.passed = current.discord.linked && Boolean(current.profile.name);
  await page.screenshot({ path: path.join(run, 'perfil-real.png') }); await page.locator('#save-name').click();
  if (current.discord.social) {
    const response = await page.evaluate(() => window.concord.discordFriends());
    result.social = { ready: !response.error, count: response.value?.length || 0, error: response.error || null };
  }
  for (let i = 0; i < 155; i++) {
    const session = await page.evaluate(() => window.concord.session());
    if (session.public || session.inviteError) {
      result.publicInvite = session.public; result.inviteError = session.inviteError?.code || null;
      if (session.public) { const { parseInvite } = await import('../public/invites.js'); await writeFile(path.join(run, 'preview-url.txt'), parseInvite(session.guestInvite).address + '/invite'); }
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await writeFile(path.join(run, 'ready.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ run, readyForPreview: true, ...result }));
  if (result.publicInvite && result.social?.ready) await page.locator('#invite-discord-button').click();
  for (let i = 0; i < 360; i++) {
    result.confirmedInvites = await page.locator('.discord-friend button').filter({ hasText: /^Enviado$/ }).count();
    try { await readFile(path.join(run, 'finish')); break; } catch {} await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.deepEqual(result.errors, []);
} catch (error) {
  result.failure = error.message; result.uiError = await page.locator('#name-error').textContent().catch(() => ''); result.passed = false;
  throw error;
} finally {
  await page.evaluate(() => window.concord.cancelDiscord()).catch(() => {});
  if (result.profile?.linked) result.cleanup = await page.evaluate(() => window.concord.unlinkDiscord()).then(value => value.warning || 'Autorização de teste revogada e removida.').catch(() => 'Não foi possível confirmar revogação.');
  await app.close().catch(() => child.kill()); await writeFile(path.join(run, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ run, ...result }));
}
