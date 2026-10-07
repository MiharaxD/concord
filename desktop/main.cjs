const { app, BrowserWindow, desktopCapturer, ipcMain, session, dialog, clipboard } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { mkdir } = require('node:fs/promises');
const { spawn } = require('node:child_process');

let window, concord, selection, quitting = false, appAudio;
app.setName('Concord');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Keep capture encoding alive when the window is minimized.
app.commandLine.appendSwitch('disable-renderer-backgrounding');

function stopAppAudio() {
  const child = appAudio; appAudio = undefined;
  if (!child) return;
  child.stopping = true; child.stdin.end();
  const timeout = setTimeout(() => child.kill(), 1000); timeout.unref();
  child.once('exit', () => clearTimeout(timeout));
}

app.whenReady().then(async () => {
  const { createConcord } = await import(pathToFileURL(path.join(__dirname, '..', 'server.mjs')).href);
  const tunnelCwd = path.join(app.getPath('userData'), 'tunnel');
  await mkdir(tunnelCwd, { recursive: true });
  concord = await createConcord({ port: 0, tunnelCwd,
    cloudflared: app.isPackaged ? path.join(process.resourcesPath, 'cloudflared.exe') : path.join(__dirname, '..', '.runtime', 'cloudflared.exe')
  }).listen();
  const allowed = (event) => event.sender === window?.webContents && event.senderFrame?.url === `${concord.address}/`;
  const handle = (name, fn) => ipcMain.handle(name, (event, ...args) => {
    if (!allowed(event)) throw new Error('Acesso negado.');
    return fn(...args);
  });
  async function api(route, method = 'GET') {
    const response = await fetch(concord.address + route, { method, headers: { 'x-concord-host': concord.hostToken } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    return body;
  }
  handle('concord:bootstrap', () => ({ address: concord.address, hostToken: concord.hostToken, version: app.getVersion() }));
  handle('concord:session', () => api('/api/session'));
  handle('concord:tunnel', () => api('/api/tunnel', 'POST'));
  handle('concord:close-tunnel', () => api('/api/tunnel', 'DELETE'));
  handle('concord:invite', () => api('/api/invite', 'POST'));
  handle('concord:copy-invite', async () => { const data = await api('/api/session'); clipboard.writeText(data.guestInvite); return true; });
  handle('concord:stop-app-audio', () => { stopAppAudio(); return true; });
  handle('concord:start-app-audio', async id => {
    if (typeof id !== 'string' || !/^window:\d+:\d+$/.test(id)) throw new Error('Escolha a janela do jogo/app para capturar seu áudio.');
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
    if (!sources.some(source => source.id === id)) throw new Error('A janela do áudio foi fechada. Escolha novamente.');
    stopAppAudio();
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
    callback(Boolean(own && (['display-capture', 'fullscreen'].includes(permission) || (permission === 'media' && !details.mediaTypes?.includes('video')))));
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
  stopAppAudio();
  concord.close().finally(() => app.quit());
});
