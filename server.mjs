import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve4 } from 'node:dns/promises';
import { WebSocketServer, WebSocket } from 'ws';
import { shortInvite } from './public/invites.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const secret = () => randomBytes(32).toString('base64url');
const same = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const send = (ws, value) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); };
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
  && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')
  && !req.headers['x-forwarded-for'] && !req.headers['cf-connecting-ip'];

export function createConcord({ port = 4173, cloudflared, publicUrl = '', tunnelCwd = path.join(ROOT, '.runtime') } = {}) {
  const hostToken = secret();
  let guestToken = secret(), inviteToken = randomBytes(16).toString('base64url'), host, viewer, tunnel, tunnelPromise, tunnelUrl = publicUrl;
  let state = { active: false };
  const sockets = new Set();
  const attempts = new Map();
  const files = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/stream-settings.js', ['stream-settings.js', 'text/javascript; charset=utf-8']],
    ['/invites.js', ['invites.js', 'text/javascript; charset=utf-8']],
    ['/app-audio-worklet.js', ['app-audio-worklet.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']],
    ['/icon.svg', ['icon.svg', 'image/svg+xml']]
  ]);
  function headers(res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' wss: ws://127.0.0.1:* ws://localhost:*; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Permissions-Policy', 'camera=(), display-capture=(self), microphone=(self)');
  }
  function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
  const admin = req => isLocal(req) && same(req.headers['x-concord-host'], hostToken);
  function session() {
    const base = tunnelUrl || `http://127.0.0.1:${server.address().port}`;
    return { guestLink: `${base}/#join=${guestToken}`, guestInvite: shortInvite(base, inviteToken), public: Boolean(tunnelUrl), viewer: Boolean(viewer), active: state.active };
  }
  function stopTunnel() {
    tunnel?.kill();
    tunnel = undefined;
    tunnelUrl = publicUrl;
  }
  function openTunnel() {
    if (tunnelUrl) return Promise.resolve(tunnelUrl);
    if (tunnelPromise) return tunnelPromise;
    const binary = cloudflared || path.join(ROOT, '.runtime', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
    if (!existsSync(binary)) return Promise.reject(new Error('Cloudflared não encontrado. Abra pelo Iniciar Concord.cmd para preparar o programa.'));
    tunnelPromise = new Promise((resolve, reject) => {
      let complete = false, output = '', checking = false;
      const child = spawn(binary, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${server.address().port}`], {
        cwd: tunnelCwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
      });
      tunnel = child;
      const timer = setTimeout(() => finish(new Error('O endereço público não ficou acessível a tempo. A Cloudflare pode estar lenta; tente criar o convite novamente.')), 150000);
      function finish(error, url) {
        if (complete) return;
        complete = true;
        clearTimeout(timer);
        if (error) { child.kill(); reject(error); }
        else { tunnelUrl = url; resolve(url); }
      }
      async function verify(url) {
        const hostname = new URL(url).hostname;
        while (!complete) {
          try {
            // Wait for DNS publication before involving the OS/browser cache.
            // Quick Tunnels can print the hostname while it still returns NXDOMAIN.
            await resolve4(hostname);
            const response = await fetch(url + '/icon.svg', { signal: AbortSignal.timeout(5000) });
            if (response.ok && (await response.text()).includes('viewBox="0 0 64 64"')) { finish(null, url); return; }
          } catch { /* Retry while the provider publishes the new hostname. */ }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      function data(chunk) {
        output = (output + chunk.toString()).slice(-12000);
        const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match && !checking && output.includes('Registered tunnel connection')) { checking = true; void verify(match[0]); }
      }
      child.stdout.on('data', data);
      child.stderr.on('data', data);
      child.once('error', () => finish(new Error('Não consegui executar o Cloudflared. Abra pelo iniciador e tente novamente.')));
      child.once('exit', () => {
        finish(new Error('O túnel encerrou antes de conectar. Verifique a internet e tente novamente.'));
        if (tunnel === child) { tunnel = undefined; tunnelUrl = publicUrl; send(host, { type: 'tunnel-closed' }); }
      });
    }).finally(() => { tunnelPromise = undefined; });
    return tunnelPromise;
  }
  const server = http.createServer(async (req, res) => {
    headers(res);
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (!admin(req)) return json(res, 403, { error: 'Acesso reservado ao transmissor neste PC.' });
        if (url.pathname === '/api/session' && req.method === 'GET') return json(res, 200, session());
        if (url.pathname === '/api/tunnel' && req.method === 'POST') { await openTunnel(); return json(res, 200, session()); }
        if (url.pathname === '/api/tunnel' && req.method === 'DELETE') { stopTunnel(); return json(res, 200, session()); }
        if (url.pathname === '/api/invite' && req.method === 'POST') {
          guestToken = secret(); inviteToken = randomBytes(16).toString('base64url'); viewer?.close(4003, 'Convite substituído');
          return json(res, 200, session());
        }
        return json(res, 404, { error: 'Não encontrado.' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Método não permitido.' });
      const file = files.get(url.pathname);
      if (!file) return json(res, 404, { error: 'Não encontrado.' });
      const content = await readFile(path.join(ROOT, 'public', file[0]));
      res.writeHead(200, { 'Content-Type': file[1] }); res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) { json(res, 503, { error: error.message || 'Falha no servidor.' }); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let origin;
    try { origin = new URL(req.headers.origin); } catch { socket.destroy(); return; }
    const desktopOrigin = ['127.0.0.1', 'localhost'].includes(origin.hostname) && origin.protocol === 'http:';
    if (req.url !== '/socket' || (!desktopOrigin && origin.host !== req.headers.host) || !['http:', 'https:'].includes(origin.protocol)) { socket.destroy(); return; }
    const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
    const now = Date.now(), entry = attempts.get(ip);
    const rate = !entry || now - entry.start > 60000 ? { start: now, count: 0 } : entry;
    attempts.set(ip, rate);
    if (++rate.count > 30 || sockets.size >= 16) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws, req) => {
    sockets.add(ws); ws.alive = true;
    const timeout = setTimeout(() => ws.close(4001, 'Convite necessário'), 5000);
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (buffer, binary) => {
      if (!ws.role) {
        if (binary || buffer.length > 1024) { ws.close(4001, 'Convite inválido'); return; }
        let auth;
        try { auth = JSON.parse(buffer); } catch { ws.close(4001, 'Convite inválido'); return; }
        if (auth.type !== 'auth') { ws.close(4001, 'Convite inválido'); return; }
        if (auth.role === 'host' && isLocal(req) && same(auth.token, hostToken)) {
          if (host) { ws.close(4002, 'O transmissor já está aberto em outra aba'); return; }
          host = ws; ws.role = 'host'; clearTimeout(timeout);
          send(ws, { type: 'welcome', role: 'host', viewer: Boolean(viewer) });
          if (viewer) send(ws, { type: 'viewer-joined' });
        } else if (auth.role === 'viewer' && (same(auth.token, guestToken) || same(auth.token, inviteToken))) {
          if (viewer) { ws.close(4002, 'Já tem alguém na sala. Feche a outra aba antes de entrar.'); return; }
          viewer = ws; ws.role = 'viewer'; clearTimeout(timeout);
          send(ws, { type: 'welcome', role: 'viewer', host: Boolean(host) });
          send(ws, { type: 'stream-state', ...state });
          send(host, { type: 'viewer-joined' });
        } else ws.close(4001, 'Convite inválido ou expirado');
        return;
      }
      const peer = ws.role === 'host' ? viewer : host;
      if (binary) {
        if (ws.role !== 'host' || !state.active) { ws.close(4001, 'Mensagem não permitida'); return; }
        if (peer?.readyState === WebSocket.OPEN) {
          if (peer.bufferedAmount > 32 * 1024 * 1024) { peer.close(4004, 'Sua conexão ficou para trás. Reconecte.'); return; }
          peer.send(buffer, { binary: true });
        }
        return;
      }
      if (buffer.length > 65536) { ws.close(4001, 'Mensagem muito grande'); return; }
      let msg;
      try { msg = JSON.parse(buffer); } catch { ws.close(4001, 'Mensagem inválida'); return; }
      const allowed = ws.role === 'host' ? ['stream-state', 'offer', 'ice', 'relay-start', 'relay-stop', 'mode'] : ['answer', 'ice', 'fallback'];
      if (!allowed.includes(msg.type)) return;
      if (msg.type === 'stream-state') {
        state = { active: Boolean(msg.active), label: String(msg.label || '').slice(0, 120), quality: String(msg.quality || '').slice(0, 40) };
        send(peer, { type: 'stream-state', ...state });
      } else send(peer, msg);
    });
    ws.on('error', () => {});
    ws.once('close', () => {
      clearTimeout(timeout); sockets.delete(ws);
      if (ws === host) { host = undefined; state = { active: false }; send(viewer, { type: 'stream-state', ...state }); send(viewer, { type: 'host-left' }); }
      if (ws === viewer) { viewer = undefined; send(host, { type: 'viewer-left' }); }
    });
  });
  const heartbeat = setInterval(() => {
    for (const ws of sockets) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
    for (const [ip, rate] of attempts) if (Date.now() - rate.start > 60000) attempts.delete(ip);
  }, 15000);
  heartbeat.unref();
  return {
    server, hostToken,
    get guestToken() { return guestToken; },
    get address() { return `http://127.0.0.1:${server.address().port}`; },
    async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); return this; },
    async close() {
      clearInterval(heartbeat); stopTunnel(); for (const ws of sockets) ws.terminate(); wss.close();
      await new Promise(resolve => {
        server.close(resolve);
        // Chromium can preconnect without sending HTTP headers. Those sockets
        // otherwise keep server.close() pending until the header timeout.
        server.closeAllConnections();
      });
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createConcord({ port: Number(process.env.PORT || 4173), publicUrl: process.env.CONCORD_PUBLIC_URL || '' });
  try {
    await app.listen();
    const url = `${app.address}/#host=${app.hostToken}`;
    console.log(`\nConcord está aberto em ${app.address}\nMantenha esta janela aberta enquanto usa. Ctrl+C para encerrar.\n`);
    if (process.argv.includes('--open')) {
      if (process.platform === 'win32') spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${url}'`], { windowsHide: true, stdio: 'ignore' });
      else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' });
    } else console.log(`Abra o transmissor: ${url}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? 'O Concord já está aberto ou a porta 4173 está ocupada. Feche a outra janela e tente novamente.' : error.message);
    process.exitCode = 1;
  }
}
