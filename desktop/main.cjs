const { app, BrowserWindow, desktopCapturer, ipcMain, session, dialog, clipboard, nativeImage, shell, safeStorage } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { mkdir, readFile, writeFile, rename, stat } = require('node:fs/promises');
const { mkdirSync } = require('node:fs');
const { spawn } = require('node:child_process');

let window, concord, selection, quitting = false, appAudio, updates, discord, discordSocial, shutdownPromise, appAudioGeneration = 0;
let pendingInvite, invitesReady = false, cameraUntil = 0;
const pendingProfiles = new Set(), stoppingAudio = new Set();
app.setName('Concord');
app.setAppUserModelId('local.concord.desktop');
if (process.env.CONCORD_DATA_DIR) {
  const directory = path.resolve(process.env.CONCORD_DATA_DIR); mkdirSync(directory, { recursive: true }); app.setPath('userData', directory);
}
// userData is set first so isolated QA profiles can run side by side.
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
function receiveInvite(args) {
  const value = args.find(arg => typeof arg === 'string' && /^concord:/i.test(arg));
  if (value) {
    pendingInvite = value.slice(0, 4097);
    if (invitesReady && window && !window.isDestroyed()) {
      window.webContents.send('concord:open-invite', pendingInvite); pendingInvite = undefined;
    }
  }
  if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
}
receiveInvite(process.argv);
app.on('second-instance', (event, args) => receiveInvite(args));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Keep capture encoding alive when the window is minimized.
app.commandLine.appendSwitch('disable-renderer-backgrounding');

function stopAppAudio() {
  ++appAudioGeneration;
  const child = appAudio; appAudio = undefined;
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return;
  child.stopping = true;
  const stopped = new Promise(resolve => child.once('close', resolve));
  stoppingAudio.add(stopped); stopped.finally(() => stoppingAudio.delete(stopped));
  child.stdin.end();
  const timeout = setTimeout(() => child.kill(), 1000); timeout.unref();
  child.once('exit', () => clearTimeout(timeout));
}

async function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  quitting = true;
  shutdownPromise = (async () => {
    await discord?.close();
    await discordSocial?.close();
    await Promise.all([...pendingProfiles]);
    stopAppAudio();
    await Promise.all([concord?.close(), ...stoppingAudio]);
  })();
  try { await shutdownPromise; }
  catch (error) { quitting = false; shutdownPromise = undefined; throw error; }
}

if (primaryInstance) app.whenReady().then(async () => {
  const { createConcord } = await import(pathToFileURL(path.join(__dirname, '..', 'server.mjs')).href);
  const tunnelCwd = path.join(app.getPath('userData'), 'tunnel');
  await mkdir(tunnelCwd, { recursive: true });
  const profilePath = path.join(app.getPath('userData'), 'profile.json');
  const preferences = await require('./preferences.cjs').createPreferences(path.join(app.getPath('userData'), 'preferences.json'));
  const { parseInvite, webInvite } = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'invites.js')).href);
  const { visualProfile } = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'profile.js')).href);
  let profile = { name: '', photo: '' };
  try { profile = visualProfile(JSON.parse(await readFile(profilePath, 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Não consegui ler seu nome salvo. Confira o arquivo profile.json do Concord.'); }
  concord = await createConcord({ port: 0, tunnelCwd,
    cloudflared: app.isPackaged ? path.join(process.resourcesPath, 'cloudflared.exe') : path.join(__dirname, '..', '.runtime', 'cloudflared.exe')
  }).listen();
  const allowed = (event) => event.sender === window?.webContents && event.senderFrame?.url === `${concord.address}/`;
  const handle = (name, fn) => ipcMain.handle(name, (event, ...args) => {
    if (!allowed(event)) throw new Error('Acesso negado.');
    if (quitting) throw new Error('O Concord está fechando.');
    const result = Promise.resolve().then(() => fn(...args));
    if (['concord:set-name', 'concord:choose-photo', 'concord:remove-photo', 'concord:choose-banner', 'concord:remove-banner', 'concord:preferences', 'concord:discord-link', 'concord:discord-refresh', 'concord:discord-unlink'].includes(name)) {
      pendingProfiles.add(result);
      result.then(() => pendingProfiles.delete(result), () => pendingProfiles.delete(result));
    }
    return result;
  });
  async function api(route, method = 'GET') {
    const response = await fetch(concord.address + route, { method, headers: { 'x-concord-host': concord.hostToken } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    return body;
  }
  handle('concord:bootstrap', () => ({ address: concord.address, hostToken: concord.hostToken, version: app.getVersion(), profile, discord: discord.state(), preferences: preferences.get(), preferencesWarning: preferences.warning }));
  handle('concord:preferences', value => preferences.save(value));
  handle('concord:invites-ready', () => { invitesReady = true; const value = pendingInvite; pendingInvite = undefined; return value || null; });
  let profileQueue = Promise.resolve();
  function saveProfile(change) {
    const saved = profileQueue.then(async () => {
      const next = visualProfile({ ...profile, ...change });
      await writeFile(profilePath + '.tmp', JSON.stringify(next), 'utf8'); await rename(profilePath + '.tmp', profilePath); profile = next; return profile;
    });
    profileQueue = saved.catch(() => {});
    return saved;
  }
  handle('concord:set-name', async value => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 32 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) throw new Error('Escolha um nome de 1 a 32 caracteres.');
    return saveProfile({ name: value.trim() });
  });
  function profileImage(original, kind) {
    if (original.isEmpty()) throw new Error('Não foi possível abrir a imagem. Use PNG ou JPG.');
    const size = original.getSize(), ratio = kind === 'avatar' ? 1 : 8 / 3;
    const width = Math.min(size.width, Math.max(1, Math.floor(size.height * ratio))), height = Math.min(size.height, Math.max(1, Math.floor(width / ratio)));
    const image = original.crop({ x: Math.floor((size.width - width) / 2), y: Math.floor((size.height - height) / 2), width, height })
      .resize({ width: kind === 'avatar' ? 128 : 512, height: kind === 'avatar' ? 128 : 192 });
    for (const quality of [75, 55, 35]) {
      const data = 'data:image/jpeg;base64,' + image.toJPEG(quality).toString('base64');
      if (data.length < (kind === 'avatar' ? 20000 : 40000)) return data;
    }
    throw new Error('A imagem é muito grande para o perfil.');
  }
  async function chooseProfileImage(kind) {
    const result = await dialog.showOpenDialog(window, { title: kind === 'avatar' ? 'Escolher foto' : 'Escolher banner', properties: ['openFile'], filters: [{ name: 'Imagens PNG/JPG', extensions: ['png', 'jpg', 'jpeg'] }] });
    if (result.canceled) return profile;
    const file = result.filePaths[0]; if ((await stat(file)).size > 20 * 1024 * 1024) throw new Error('Escolha uma imagem de até 20 MB.');
    return saveProfile({ [kind === 'avatar' ? 'photo' : 'banner']: profileImage(nativeImage.createFromPath(file), kind) });
  }
  handle('concord:choose-photo', () => chooseProfileImage('avatar'));
  handle('concord:remove-photo', () => saveProfile({ photo: '' }));
  handle('concord:choose-banner', () => chooseProfileImage('banner'));
  handle('concord:remove-banner', () => saveProfile({ banner: '' }));
  const normalizeDiscordImage = (bytes, kind) => {
      const original = nativeImage.createFromBuffer(bytes), size = original.getSize();
      if (original.isEmpty() || size.width > 4096 || size.height > 4096) throw new Error('Não consegui importar a imagem do Discord.');
      return profileImage(original, kind);
  };
  discord = await require('./discord.cjs').createDiscordLink({ file: path.join(app.getPath('userData'), 'discord-link.bin'), storage: safeStorage,
    openExternal: url => shell.openExternal(url), normalizeImage: normalizeDiscordImage
  });
  discordSocial = require('./discord-social.cjs').createDiscordSocial({
    binary: app.isPackaged ? path.join(process.resourcesPath, 'ConcordDiscord.exe') : path.join(__dirname, '..', '.runtime', 'ConcordDiscord.exe'),
    cwd: app.getPath('userData'), authorization: () => discord.socialToken(), normalizeImage: normalizeDiscordImage
  });
  const discordAction = async task => {
    try { const result = await task(); if (result && typeof result === 'object') {
        const change = { ...result }; if (!change.banner) delete change.banner; await saveProfile(change);
      }
      return { profile, discord: discord.state(), warning: typeof result === 'string' ? result : '' }; }
    catch (error) { return { profile, discord: discord.state(), error: error.message }; }
  };
  handle('concord:discord-link', () => discordAction(async () => { await discordSocial.disconnect(); return discord.link(); }));
  handle('concord:discord-refresh', () => discordAction(() => discord.refresh()));
  handle('concord:discord-unlink', () => discordAction(async () => { await discordSocial.disconnect(); return discord.unlink(); }));
  handle('concord:discord-cancel', () => { discord.cancel(); return true; });
  const socialAction = async task => { try { return { value: await task() }; } catch (error) { return { error: error.message, code: error.code || 'DISCORD' }; } };
  handle('concord:discord-friends', () => socialAction(() => discordSocial.friends()));
  handle('concord:discord-friend-photo', id => typeof id === 'string' ? discordSocial.photo(id) : '');
  handle('concord:discord-send-invite', (id, value) => socialAction(() => {
    if (typeof value !== 'string' || value.length > 2048) throw new Error('Convite inválido.');
    return discordSocial.invite(id, webInvite(value));
  }));
  updates = require('./updater.cjs').createUpdater({ app, shutdown,
    send: state => { if (window && !window.isDestroyed()) window.webContents.send('concord:update-state', state); }
  });
  handle('concord:update-state', () => updates.state());
  handle('concord:update-ready', () => { updates.start(); return updates.state(); });
  handle('concord:check-updates', () => updates.check());
  handle('concord:install-update', () => updates.install());
  handle('concord:session', () => api('/api/session'));
  handle('concord:tunnel', () => api('/api/tunnel', 'POST'));
  handle('concord:close-tunnel', () => api('/api/tunnel', 'DELETE'));
  handle('concord:invite', () => api('/api/invite', 'POST'));
  handle('concord:copy-invite', async value => {
    if (value !== undefined) { if (typeof value !== 'string' || value.length > 2048) throw new Error('Convite inválido.'); parseInvite(value); }
    const code = value === undefined ? (await api('/api/session')).guestInvite : value;
    clipboard.writeText(code); return true;
  });
  handle('concord:copy-link', async value => {
    if (typeof value !== 'string' || value.length > 2048) throw new Error('Convite inválido.');
    clipboard.writeText(webInvite(value)); return true;
  });
  handle('concord:stop-app-audio', () => { stopAppAudio(); return true; });
  handle('concord:start-app-audio', async id => {
    if (typeof id !== 'string' || !/^window:\d+:\d+$/.test(id)) throw new Error('Escolha a janela do jogo/app para capturar seu áudio.');
    stopAppAudio(); const generation = appAudioGeneration;
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
    if (quitting) throw new Error('O Concord está fechando.');
    if (generation !== appAudioGeneration) throw new Error('Teste de áudio cancelado.');
    if (!sources.some(source => source.id === id)) throw new Error('A janela do áudio foi fechada. Escolha novamente.');
    const binary = app.isPackaged ? path.join(process.resourcesPath, 'ConcordAudio.exe') : path.join(__dirname, '..', '.runtime', 'ConcordAudio.exe');
    return new Promise((resolve, reject) => {
      const child = spawn(binary, ['--window', id.split(':')[1]], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      appAudio = child; let pending = Buffer.alloc(0), errorText = '', ready = false, settled = false;
      const timeout = setTimeout(() => fail(new Error('O Windows não iniciou o áudio do app a tempo.')), 12000);
      function fail(error) { if (!settled) { settled = true; clearTimeout(timeout); if (appAudio === child) stopAppAudio(); reject(error); } }
      child.stdout.on('data', chunk => {
        if (!ready || appAudio !== child || window?.isDestroyed()) return;
        pending = Buffer.concat([pending, chunk]); const length = pending.length - pending.length % 4;
        if (length) { window.webContents.send('concord:app-audio-data', new Uint8Array(pending.subarray(0, length))); pending = pending.subarray(length); }
      });
      child.stderr.on('data', chunk => {
        errorText = (errorText + chunk.toString('utf8')).slice(-4000);
        if (errorText.includes('READY 48000 2 s16le') && !settled) { ready = settled = true; clearTimeout(timeout); resolve({ sampleRate: 48000, channels: 2 }); }
        if (errorText.includes('ERROR ')) fail(new Error(errorText.split('ERROR ').pop().trim()));
      });
      child.once('error', () => fail(new Error('O capturador de áudio do app não está disponível. Reabra a versão completa do Concord.')));
      child.once('exit', () => {
        clearTimeout(timeout);
        if (!settled) fail(new Error(errorText.trim() || 'O capturador de áudio encerrou antes de iniciar.'));
        if (appAudio === child) {
          appAudio = undefined;
          if (!child.stopping && ready && !window?.isDestroyed()) window.webContents.send('concord:app-audio-error', errorText.includes('ERROR ') ? errorText.split('ERROR ').pop().trim() : 'A captura de áudio do app foi encerrada.');
        }
      });
    });
  });
  handle('concord:allow-camera', () => { cameraUntil = Date.now() + 15000; return true; });
  handle('concord:sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 360, height: 210 }, fetchWindowIcons: false });
    return sources.filter(source => !source.name.startsWith('Concord')).map(source => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() }));
  });
  handle('concord:select-source', async id => {
    if (typeof id !== 'string' || id.length > 160) throw new Error('Fonte inválida.');
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
    const source = sources.find(item => item.id === id);
    if (!source) throw new Error('Essa janela foi fechada. Escolha outra.');
    selection = { source, expires: Date.now() + 15000 };
    return true;
  });
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const own = contents === window?.webContents && details.requestingUrl?.startsWith(concord.address + '/');
    // Camera is granted once, only right after the user clicked Ligar câmera (concord:allow-camera).
    const camera = permission === 'media' && details.mediaTypes?.includes('video') && Date.now() < cameraUntil;
    if (camera) cameraUntil = 0;
    callback(Boolean(own && (['display-capture', 'fullscreen'].includes(permission) || camera || (permission === 'media' && !details.mediaTypes?.includes('video')))));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details) => Boolean(
    contents === window?.webContents && origin === concord.address && (['display-capture', 'fullscreen'].includes(permission) || (permission === 'media' && details.mediaType !== 'video'))
  ));
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const chosen = selection; selection = undefined;
    if (request.frame !== window?.webContents.mainFrame || !chosen || chosen.expires < Date.now()) { callback({}); return; }
    callback({ video: chosen.source, ...(request.audioRequested ? { audio: 'loopback' } : {}) });
  });
  window = new BrowserWindow({ width: 1280, height: 850, minWidth: 880, minHeight: 640,
    title: 'Concord', backgroundColor: '#101114', autoHideMenuBar: true, icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== concord.address + '/') event.preventDefault(); });
  window.on('close', event => {
    if (!quitting && window.webContents.getTitle().includes('AO VIVO')) {
      if (dialog.showMessageBoxSync(window, { type: 'question', buttons: ['Continuar transmitindo', 'Fechar Concord'], defaultId: 0, cancelId: 0,
        title: 'Encerrar transmissão?', message: 'Fechar o Concord vai encerrar sua transmissão.' }) === 0) event.preventDefault();
    }
  });
  await window.loadURL(concord.address + '/');
}).catch(error => { dialog.showErrorBox('Não consegui abrir o Concord', error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting || !concord) return;
  event.preventDefault(); quitting = true;
  shutdown().finally(() => app.quit());
});
