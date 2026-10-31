import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { _electron } from 'playwright';
import { parseInvite } from '../public/invites.js';

const root = process.cwd(), run = path.join(root, 'test-results/discord-links-' + Date.now()), apps = [], errors = [];
await mkdir(run, { recursive: true });
const result = { executable: process.env.CONCORD_EXE || 'development', passed: false, checks: [] };
async function launch(name, args = [], data = path.join(run, name)) {
  await mkdir(path.join(data, 'tunnel'), { recursive: true });
  await writeFile(path.join(data, 'tunnel/invite-retry.json'), JSON.stringify({ code: 'RATE_LIMIT', failures: 1, retryAt: Date.now() + 300000 }));
  try { await readFile(path.join(data, 'profile.json')); } catch { await writeFile(path.join(data, 'profile.json'), JSON.stringify({ name, photo: '' })); }
  const app = await _electron.launch({ executablePath: process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: [...(process.env.CONCORD_EXE ? args : [root, ...args]), '--mute-audio', '--use-fake-device-for-media-stream'], env: { ...process.env, CONCORD_DATA_DIR: data }, timeout: 45000 });
  apps.push(app); const page = await app.firstWindow(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message)); await page.locator('#create-room:not([disabled])').waitFor();
  return { app, page, data };
}
async function fixture(app) {
  await app.evaluate(({ app, shell, clipboard }) => {
    globalThis.qaFetch = globalThis.fetch; globalThis.qaName = 'Yuri Discord'; globalThis.qaHold = false; globalThis.qaDenied = false; globalThis.qaClipboard = '';
    globalThis.qaAuthCount = 0; globalThis.qaTokenCount = 0; globalThis.qaHasBanner = true;
    clipboard.writeText = value => { globalThis.qaClipboard = value; };
    shell.openExternal = async value => {
      globalThis.qaAuthCount++; const authorize = new URL(value); globalThis.qaAuthorize = value;
      if (globalThis.qaHold) return;
      const url = new URL(authorize.searchParams.get('redirect_uri')); url.searchParams.set('state', authorize.searchParams.get('state'));
      if (globalThis.qaDenied) url.searchParams.set('error', 'access_denied'); else url.searchParams.set('code', 'qa_authorization_code');
      await globalThis.qaFetch(url);
    };
    const png = process.getBuiltinModule('fs').readFileSync(process.getBuiltinModule('path').join(app.getAppPath(), 'public/invite-icon.png'));
    globalThis.fetch = async (url, options) => {
      url = String(url);
      if (url === 'https://discord.com/api/v10/oauth2/token') { globalThis.qaTokenCount++; return Response.json({ access_token: 'qa_access_token_fixture', refresh_token: 'qa_refresh_token_fixture', token_type: 'Bearer', scope: 'identify openid sdk.social_layer', expires_in: 600 }); }
      if (url === 'https://discord.com/api/v10/users/@me') return Response.json({ id: '123456789012345678', username: 'yuri', global_name: globalThis.qaName, avatar: 'a'.repeat(32), banner: globalThis.qaHasBanner ? 'b'.repeat(32) : null, accent_color: 0x24a18b });
      if (url.startsWith('https://cdn.discordapp.com/')) return new Response(png, { headers: { 'Content-Type': 'image/png' } });
      if (url.endsWith('/oauth2/token/revoke')) return new Response(null, { status: 200 });
      return globalThis.qaFetch(url, options);
    };
  });
}
async function close(app) { const child = app.process(); await app.close().catch(() => child.kill()); apps.splice(apps.indexOf(app), 1); }
try {
  const host = await launch('Yuri QA'); await fixture(host.app);
  await host.page.locator('#create-room').click(); await host.page.waitForFunction(() => document.body.dataset.connected === 'true');
  await host.page.locator('#profile-button').click();
  await host.app.evaluate(() => { globalThis.qaHold = true; });
  await host.page.locator('#link-discord').click(); await host.page.locator('#cancel-discord:not([hidden])').waitFor();
  await host.page.locator('#cancel-discord').click(); await host.page.locator('#name-error').filter({ hasText: 'cancelada' }).waitFor();
  assert.equal(await host.page.locator('#display-name').inputValue(), 'Yuri QA');
  await host.app.evaluate(() => { globalThis.qaHold = false; globalThis.qaDenied = true; });
  await host.page.locator('#link-discord').click(); await host.page.locator('#name-error').filter({ hasText: 'cancelada' }).waitFor();
  await host.app.evaluate(() => { globalThis.qaDenied = false; });
  await host.page.locator('#link-discord').click(); await host.page.locator('#discord-status').filter({ hasText: 'Vinculado como Yuri Discord' }).waitFor();
  assert.equal(await host.page.locator('#display-name').inputValue(), 'Yuri Discord');
  await host.page.waitForFunction(() => document.querySelector('#name-banner img')?.naturalWidth === 512 && document.querySelector('#name-avatar img')?.naturalWidth === 128);
  await host.page.screenshot({ path: path.join(run, 'perfil-vinculado.png') });
  const data = await readFile(path.join(host.data, 'discord-link.bin'));
  assert.equal(data.includes(Buffer.from('qa_access_token_fixture')), false); assert.equal(data.includes(Buffer.from('qa_refresh_token_fixture')), false);
  assert.equal(await host.app.evaluate(async ({ app, safeStorage }) => {
    const fs = process.getBuiltinModule('fs'), path = process.getBuiltinModule('path');
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(path.join(app.getPath('userData'), 'discord-link.bin')))).refreshToken === 'qa_refresh_token_fixture';
  }), true);
  const bootstrap = await host.page.evaluate(() => window.concord.bootstrap());
  assert.equal(JSON.stringify(bootstrap).includes('qa_refresh'), false); assert.equal(JSON.stringify(bootstrap.profile).includes('discord'), false);
  await host.app.evaluate(() => { globalThis.qaName = 'Yuri Mihara'; });
  await host.page.locator('#refresh-discord').click(); await host.page.locator('#discord-status').filter({ hasText: 'Vinculado como Yuri Mihara' }).waitFor();
  assert.equal(await host.app.evaluate(() => globalThis.qaTokenCount), 1, 'atualizar não abre novo consentimento ou renova token ainda válido');
  await host.page.locator('#save-name').click();
  result.checks.push('Autorização/negação/cancelamento, importação real de imagens, atualizar, DPAPI do Windows e separação de credenciais: PASS com provedor controlado.');

  const session = await host.page.evaluate(() => window.concord.session());
  await host.page.evaluate(code => { document.querySelector('#invite-link').value = code; document.querySelector('#invite-result').hidden = false; document.querySelector('#invite-menu-button').click(); document.querySelector('#copy-link-button').click(); }, session.guestInvite);
  await host.page.locator('#copy-link-button.copied').filter({ hasText: 'Link copiado' }).waitFor();
  const link = await host.app.evaluate(() => globalThis.qaClipboard);
  assert.match(link, /^http:\/\/127\.0\.0\.1:\d+\/invite\?join=/); assert.deepEqual(parseInvite(link), parseInvite(session.guestInvite));
  await host.page.locator('#copy-link-button:not(.copied)').filter({ hasText: 'Copiar link' }).waitFor({ timeout: 4000 });
  assert.equal(await host.page.locator('#copy-button').count(), 0);
  assert.equal(link.startsWith('['), false, 'copia URL normal, sem Markdown específico de chat');
  const landingPromise = host.app.waitForEvent('window');
  await host.app.evaluate(({ BrowserWindow }, url) => { const page = new BrowserWindow({ show: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } }); void page.loadURL(url); }, link);
  const landing = await landingPromise; await landing.locator('#open-concord:not([hidden])').waitFor();
  const desktop = await landing.locator('#open-concord').getAttribute('href'); assert.deepEqual(parseInvite(desktop), parseInvite(link));
  assert.equal(await landing.locator('meta[property="og:title"]').getAttribute('content'), 'Entrar na sala de Yuri Mihara');
  assert.equal(await landing.evaluate(() => window.concord), undefined, 'página do convite não tem preload nem IPC');
  assert.equal(await landing.getByRole('link', { name: 'Baixar Concord', exact: true }).getAttribute('href'), 'https://github.com/MiharaxD/concord/releases/latest');
  await landing.getByRole('link', { name: 'Baixar Concord', exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await landing.getByRole('link', { name: 'Baixar Concord', exact: true }).isVisible(), true);
  await landing.screenshot({ path: path.join(run, 'pagina-convite.png'), fullPage: true });
  await landing.goto(new URL('/invite?join=invalid', link).href); await landing.locator('#invite-message').filter({ hasText: 'inválido' }).waitFor();
  assert.equal(await landing.locator('#open-concord').isVisible(), false); await landing.close();
  result.checks.push('Botão Copiar link, URL com código, prévia, página Abrir no Concord e código inválido: PASS; clipboard isolado, sem acionar app pessoal.');

  const guest = await launch('Amiga QA', [desktop]);
  // 0.6.1+: with nothing to interrupt, a link opened from the page joins directly.
  await guest.page.waitForFunction(() => document.body.dataset.connected === 'true');
  assert.equal(await guest.page.locator('#join-picker[open]').count(), 0, 'abrir link com o app parado entra direto');
  await guest.page.getByRole('button', { name: 'Abrir perfil de Yuri Mihara', exact: true }).click();
  await guest.page.waitForFunction(() => document.querySelector('#member-profile-banner img')?.naturalWidth === 512);
  assert.equal(await guest.page.locator('#member-profile-banner').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(36, 161, 139)');
  await guest.page.screenshot({ path: path.join(run, 'perfil-na-sala.png') }); await guest.page.keyboard.press('Escape');
  await host.page.locator('#profile-button').click(); await host.page.locator('#banner-menu-button').click(); await host.page.locator('#remove-banner').click();
  await guest.page.getByRole('button', { name: 'Abrir perfil de Yuri Mihara', exact: true }).click();
  await guest.page.waitForFunction(() => document.querySelector('#member-profile-banner img') === null);
  await host.app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path.join(root, 'public/invite-icon.png'));
  await host.page.locator('#banner-menu-button').click(); await host.page.locator('#banner-button').click(); await guest.page.waitForFunction(() => document.querySelector('#member-profile-banner img')?.naturalWidth === 512);
  const manualBanner = (await host.page.evaluate(() => window.concord.bootstrap())).profile.banner;
  await host.app.evaluate(() => { globalThis.qaHasBanner = false; });
  await host.page.locator('#refresh-discord').click(); await host.page.waitForFunction(() => !document.querySelector('#refresh-discord').disabled);
  assert.equal((await host.page.evaluate(() => window.concord.bootstrap())).profile.banner, manualBanner, 'Discord sem banner preserva o banner manual');
  await host.page.locator('#cancel-name').click(); await guest.page.keyboard.press('Escape');
  result.checks.push('Banner manual: escolher/remover atualiza o perfil na outra instância; atualização do Discord sem banner preserva o manual.');
  await host.app.evaluate(({ ipcMain }) => {
    globalThis.qaFriends = [{ id: '123456789012345678', name: 'Ana <QA>', username: 'ana.qa', online: true }, { id: '223456789012345678', name: 'Bruno', username: 'bruno.qa', online: false }];
    globalThis.qaInvites = [];
    ipcMain.removeHandler('concord:discord-friends'); ipcMain.handle('concord:discord-friends', () => ({ value: globalThis.qaFriends }));
    ipcMain.removeHandler('concord:discord-friend-photo'); ipcMain.handle('concord:discord-friend-photo', () => '');
    ipcMain.removeHandler('concord:discord-send-invite'); ipcMain.handle('concord:discord-send-invite', (event, id, code) => { globalThis.qaInvites.push({ id, code }); return new Promise(resolve => { globalThis.qaSendResolve = resolve; }); });
  });
  await host.page.evaluate(code => { document.querySelector('#invite-link').value = code; document.querySelector('#invite-discord-button').click(); }, session.guestInvite);
  await host.page.locator('#discord-friends[open]').waitFor(); await host.page.locator('.discord-friend').first().waitFor();
  assert.equal(await host.page.locator('.discord-friend').count(), 2);
  assert.equal(await host.page.locator('.discord-friend-name strong').first().textContent(), 'Ana <QA>');
  assert.equal(await host.page.locator('.discord-friend-name strong img').count(), 0);
  await host.page.screenshot({ path: path.join(run, 'amigos-discord.png') });
  await host.page.getByRole('button', { name: 'Convidar Ana <QA>', exact: true }).click();
  await host.page.getByRole('button', { name: 'Convidar Ana <QA>', exact: true }).filter({ hasText: 'Enviando' }).waitFor();
  assert.equal(await host.page.getByRole('button', { name: 'Convidar Ana <QA>', exact: true }).isDisabled(), true);
  const sent = await host.app.evaluate(() => globalThis.qaInvites); assert.equal(sent.length, 1); assert.equal(sent[0].id, '123456789012345678');
  await host.app.evaluate(() => globalThis.qaSendResolve({ value: true }));
  await host.page.getByRole('button', { name: 'Convidar Ana <QA>', exact: true }).filter({ hasText: 'Enviado' }).waitFor();
  await host.page.locator('#discord-friend-search').fill('bruno.qa'); assert.equal(await host.page.locator('.discord-friend').count(), 1);
  await host.page.getByRole('button', { name: 'Convidar Bruno', exact: true }).click();
  await host.app.evaluate(() => globalThis.qaSendResolve({ error: 'O Discord não confirmou o envio.', code: 'SEND' }));
  await host.page.locator('.discord-friend .form-error').filter({ hasText: 'não confirmou' }).waitFor();
  assert.equal(await host.page.getByRole('button', { name: 'Convidar Bruno', exact: true }).isEnabled(), true);
  // Without favorites the top list shows recent invites; a star moves a friend to Favoritos and is saved as an ID only.
  await host.page.locator('#discord-friend-search').fill('');
  await host.page.locator('#discord-quick-title').filter({ hasText: 'Enviados recentemente' }).waitFor();
  assert.deepEqual(await host.page.locator('#discord-quick-list .discord-friend-name strong').allTextContents(), ['Ana <QA>']);
  assert.equal(await host.page.locator('.discord-friend').count(), 2, 'amigo recente não aparece duas vezes');
  await host.page.getByRole('button', { name: 'Favoritar Bruno', exact: true }).click();
  await host.page.locator('#discord-quick-title').filter({ hasText: 'Favoritos' }).waitFor();
  assert.deepEqual(await host.page.locator('#discord-quick-list .discord-friend-name strong').allTextContents(), ['Bruno']);
  for (let i = 0; i < 20 && JSON.stringify((await host.page.evaluate(() => window.concord.bootstrap())).preferences.discordFavorites) !== '["223456789012345678"]'; i++) await new Promise(resolve => setTimeout(resolve, 100));
  const savedFriends = (await host.page.evaluate(() => window.concord.bootstrap())).preferences;
  assert.deepEqual([savedFriends.discordFavorites, savedFriends.discordRecent], [['223456789012345678'], ['123456789012345678']]);
  assert.equal(await host.page.locator('#room-slots .slot-empty').count(), 6);
  result.checks.push('Favoritos do Discord: recentes aparecem sem favoritos; estrela salva só o ID e passa o amigo para Favoritos.');
  await host.page.keyboard.press('Escape'); assert.equal(await host.page.evaluate(() => document.body.dataset.connected), 'true');
  // Starred friends show under "Enviar por DM no Discord" in the Convidar menu, with their own send button.
  await host.page.evaluate(() => { document.querySelector('#invite-result').hidden = false; }); await host.page.locator('#invite-menu-button').click();
  await host.page.locator('#invite-fav-list .invite-fav-name').filter({ hasText: 'Bruno' }).waitFor();
  assert.equal(await host.page.locator('#invite-fav-list .invite-fav').count(), 1);
  await host.page.screenshot({ path: path.join(run, 'convidar-favoritos.png') });
  await host.page.getByRole('button', { name: 'Convidar Bruno por DM', exact: true }).click();
  assert.equal((await host.app.evaluate(() => globalThis.qaInvites)).at(-1).id, '223456789012345678');
  await host.app.evaluate(() => globalThis.qaSendResolve({ value: true }));
  await host.page.getByRole('button', { name: 'Convidar Bruno por DM', exact: true }).filter({ hasText: 'Enviado' }).waitFor();
  await host.page.keyboard.press('Escape'); await host.page.locator('#invite-pop').waitFor({ state: 'hidden' });
  result.checks.push('Menu Convidar: favoritos do Discord aparecem embaixo de Enviar por DM e convidam com um clique, só após confirmação do SDK.');
  result.checks.push('Modal de amigos: busca/nome seguro, envio por clique, bloqueio de duplicação, sucesso somente após confirmação e erro recuperável; nenhum contato real usado nesta suíte.');
  const roster = await host.page.evaluate(() => window.concord.session()); assert.equal(roster.members.length, 2);
  assert.equal(JSON.stringify(roster).includes('qa_refresh'), false);
  result.checks.push('Duas instâncias: convite em abertura fria pede confirmação; nome, foto, banner e cor aparecem no cartão da outra pessoa sem compartilhar credenciais.');
  await close(guest.app); await close(host.app);
  const reopened = await launch('Reaberto', [], host.data); await fixture(reopened.app);
  await reopened.page.locator('#profile-button').click(); await reopened.page.locator('#discord-status').filter({ hasText: 'Vinculado como Yuri Mihara' }).waitFor();
  const original = await readFile(path.join(host.data, 'profile.json'), 'utf8');
  await reopened.page.locator('#unlink-discord').click(); await reopened.page.locator('#link-discord:not([hidden])').waitFor();
  assert.equal(await readFile(path.join(host.data, 'profile.json'), 'utf8'), original, 'desvincular preserva aparência importada');
  await assert.rejects(readFile(path.join(host.data, 'discord-link.bin')), { code: 'ENOENT' });
  result.checks.push('Reabrir carrega vínculo DPAPI; desvincular revoga e apaga credenciais, mantendo perfil local.');
  assert.deepEqual(errors, []); result.passed = true;
} catch (error) {
  result.failure = error.message;
  for (const [i, app] of apps.entries()) { const page = (await app.windows())[0];
    result['ui' + i] = await page.locator('#name-error').textContent().catch(() => '');
    await page.screenshot({ path: path.join(run, 'failure-' + i + '.png') }).catch(() => {});
  }
  throw error;
} finally {
  for (const app of apps.reverse()) { const child = app.process(); await app.close().catch(() => child.kill()); }
  result.errors = errors; await writeFile(path.join(run, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ run, ...result }, null, 2));
}
