const { app, BrowserWindow, desktopCapturer, ipcMain, session, dialog, clipboard } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { mkdir } = require('node:fs/promises');

let window, concord, selection, quitting = false;
app.setName('Concord');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Keep capture encoding alive when the window is minimized.
app.commandLine.appendSwitch('disable-renderer-backgrounding');

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
  handle('concord:copy-invite', async () => { const data = await api('/api/session'); clipboard.writeText(data.guestLink); return true; });
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
  concord.close().finally(() => app.quit());
});
