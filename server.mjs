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
import { visualProfile } from './public/profile.js';
import inviteRetry from './desktop/invite-retry.cjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const secret = () => randomBytes(32).toString('base64url');
const same = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const send = (ws, value) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); };
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
  && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')
  && !req.headers['x-forwarded-for'] && !req.headers['cf-connecting-ip'];

export function createConcord({ port = 4173, cloudflared, publicUrl = '', tunnelCwd = path.join(ROOT, '.runtime') } = {}) {
  const hostToken = secret();
  let guestToken = secret(), inviteToken = randomBytes(16).toString('base64url'), host, tunnel, tunnelPromise, cancelTunnel, tunnelUrl = publicUrl;
  let inviteError = null;
  const retry = inviteRetry.createInviteRetry(path.join(tunnelCwd, 'invite-retry.json'));
  const members = new Map();
  const roster = () => [...members.values()].map(ws => ({ id: ws.memberId, ...ws.profile, stream: ws.streamState, features: ws.features }));
  const broadcast = value => { for (const peer of members.values()) send(peer, value); };
  const sockets = new Set();
  const attempts = new Map();
  const files = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/stream-settings.js', ['stream-settings.js', 'text/javascript; charset=utf-8']],
    ['/invites.js', ['invites.js', 'text/javascript; charset=utf-8']],
    ['/profile.js', ['profile.js', 'text/javascript; charset=utf-8']],
    ['/invite', ['invite.html', 'text/html; charset=utf-8']],
    ['/invite.js', ['invite.js', 'text/javascript; charset=utf-8']],
    ['/invite.css', ['invite.css', 'text/css; charset=utf-8']],
    ['/invite-icon.png', ['invite-icon.png', 'image/png']],
    ['/room-media.js', ['room-media.js', 'text/javascript; charset=utf-8']],
    ['/p2p.js', ['p2p.js', 'text/javascript; charset=utf-8']],
    ['/mqtt.js', ['mqtt.js', 'text/javascript; charset=utf-8']],
    ['/app-audio-worklet.js', ['app-audio-worklet.js', 'text/javascript; charset=utf-8']],
    ['/audio-meter.js', ['audio-meter.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']],
    ['/icon.svg', ['icon.svg', 'image/svg+xml']]
  ]);
  function headers(res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' wss: ws://127.0.0.1:* ws://localhost:*; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Permissions-Policy', 'camera=(self), display-capture=(self), microphone=(self)');
  }
  function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
  const admin = req => isLocal(req) && same(req.headers['x-concord-host'], hostToken);
  function session() {
    const base = tunnelUrl || `http://127.0.0.1:${server.address().port}`;
    return { guestLink: `${base}/#join=${guestToken}`, guestInvite: shortInvite(base, inviteToken), inviteKey: inviteToken, p2pInvite: 'concord:p2p:' + inviteToken, public: Boolean(tunnelUrl), inviteError, viewer: [...members.values()].some(ws => ws.role === 'viewer'), members: roster(), active: Boolean(host?.streamState.active) };
  }
  const stoppingTunnels = new Set();
  function stopTunnel() {
    cancelTunnel?.(); cancelTunnel = undefined; tunnelPromise = undefined;
    const child = tunnel;
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise(resolve => child.once('close', resolve));
      stoppingTunnels.add(stopped); stopped.finally(() => stoppingTunnels.delete(stopped));
      child.kill();
    }
    tunnel = undefined;
    tunnelUrl = publicUrl;
  }
  function openTunnel() {
    if (tunnelUrl) return Promise.resolve(tunnelUrl);
    if (tunnelPromise) return tunnelPromise;
    const binary = cloudflared || path.join(ROOT, '.runtime', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
    let cancelled = false;
    cancelTunnel = () => { cancelled = true; };
    const pending = (async () => {
      const blocked = await retry.blocked();
      if (cancelled) throw new Error('Preparação do convite cancelada.');
      if (blocked) { inviteError = blocked; throw new Error(blocked.message); }
      inviteError = null;
      if (!existsSync(binary)) {
        inviteError = { code: 'COMPONENT', message: 'O componente de convites não foi encontrado. Reinstale o Concord com o instalador completo.' };
        throw new Error(inviteError.message);
      }
      return new Promise((resolve, reject) => {
        let complete = false, output = '', checking = false;
        const controller = new AbortController();
        const child = spawn(binary, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${server.address().port}`], {
          cwd: tunnelCwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
        });
        tunnel = child;
        const timer = setTimeout(() => finish({ code: 'TIMEOUT', message: 'A Cloudflare demorou para liberar o convite. Tente novamente em instantes.' }), 150000);
        cancelTunnel = () => finish({ code: 'CANCELLED', message: 'Preparação do convite cancelada.' });
        async function finish(error, url) {
          if (complete) return;
          complete = true;
          clearTimeout(timer); controller.abort();
          if (error) {
            child.kill();
            inviteError = error.code === 'RATE_LIMIT' ? await retry.limited() : error.code === 'CANCELLED' ? null : error;
            reject(new Error((inviteError || error).message));
          } else { tunnelUrl = url; inviteError = null; await retry.clear(); resolve(url); }
        }
        async function verify(url) {
          const hostname = new URL(url).hostname;
          while (!complete) {
            try {
              // Wait for DNS publication before involving the OS/browser cache.
              // Quick Tunnels can print the hostname while it still returns NXDOMAIN.
              await resolve4(hostname);
              if (complete) return;
              const response = await fetch(url + '/icon.svg', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
              if (response.ok && (await response.text()).includes('viewBox="0 0 64 64"')) { finish(null, url); return; }
            } catch { /* Retry while the provider publishes the new hostname. */ }
            if (!complete) await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        function data(chunk) {
          output = (output + chunk.toString()).slice(-12000);
          const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
          if (match && !checking && output.includes('Registered tunnel connection')) { checking = true; void verify(match[0]); }
        }
        child.stdout.on('data', data);
        child.stderr.on('data', data);
        child.once('error', () => finish({ code: 'COMPONENT', message: 'Não consegui executar o componente de convites. Reinstale o Concord com o instalador completo.' }));
        child.once('close', () => {
          const wasReady = complete && Boolean(tunnelUrl);
          void finish(inviteRetry.tunnelFailure(output));
          if (tunnel === child) { tunnel = undefined; tunnelUrl = publicUrl; if (wasReady) send(host, { type: 'tunnel-closed' }); }
        });
      });
    })().finally(() => { if (tunnelPromise === pending) { tunnelPromise = undefined; cancelTunnel = undefined; } });
    tunnelPromise = pending;
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
          guestToken = secret(); inviteToken = randomBytes(16).toString('base64url');
          for (const member of members.values()) if (member.role === 'viewer') member.close(4003, 'Convite substituído');
          return json(res, 200, session());
        }
        return json(res, 404, { error: 'Não encontrado.' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Método não permitido.' });
      const file = url.pathname === '/' && !isLocal(req) ? files.get('/invite') : files.get(url.pathname);
      if (!file) return json(res, 404, { error: 'Não encontrado.' });
      let content = await readFile(path.join(ROOT, 'public', file[0]));
      if (file[0] === 'invite.html') {
        // Preview HTML never contains the invite key or a participant roster. No request/access logging.
        const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
        const name = host?.profile.name, title = name ? 'Entrar na sala de ' + name : 'Convite para o Concord';
        const origin = new URL(tunnelUrl || `http://127.0.0.1:${server.address().port}`).origin;
        const meta = `<meta property="og:type" content="website"><meta property="og:site_name" content="Concord"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="Abra este convite no aplicativo Concord para entrar na sala."><meta property="og:image" content="${escape(origin)}/invite-icon.png?v=camera-1"><meta property="og:image:width" content="512"><meta property="og:image:height" content="512"><meta name="theme-color" content="#9b86ff">`;
        content = Buffer.from(content.toString('utf8').replace('<!--INVITE_META-->', meta).replace('<title>Convite para o Concord</title>', '<title>' + escape(title) + '</title>'));
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), display-capture=()');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      }
      res.writeHead(200, { 'Content-Type': file[1] }); res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) { json(res, 503, { error: error.message || 'Falha no servidor.' }); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let origin, url;
    try { origin = new URL(req.headers.origin); url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
    const desktopOrigin = ['127.0.0.1', 'localhost'].includes(origin.hostname) && origin.protocol === 'http:';
    // The host app bridges P2P guests over loopback; ?via=p2p only removes local privileges.
    req.bridged = url.search === '?via=p2p';
    if (url.pathname !== '/socket' || (url.search && !req.bridged) || (!desktopOrigin && origin.host !== req.headers.host) || !['http:', 'https:'].includes(origin.protocol)) { socket.destroy(); return; }
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
        if (binary || buffer.length > 64 * 1024) { ws.close(4001, 'Convite inválido'); return; }
        let auth;
        try { auth = JSON.parse(buffer); } catch { ws.close(4001, 'Convite inválido'); return; }
        if (auth.type !== 'auth') { ws.close(4001, 'Convite inválido'); return; }
        if (auth.role === 'host' && isLocal(req) && !req.bridged && same(auth.token, hostToken)) {
          if (host) { ws.close(4002, 'A sala já está aberta neste PC'); return; }
          host = ws; ws.role = 'host'; ws.memberId = 'host';
        } else if (auth.role === 'viewer' && (same(auth.token, guestToken) || same(auth.token, inviteToken))) {
          if ([...members.values()].filter(member => member.role === 'viewer').length >= 7) { ws.close(4002, 'A sala já tem 7 convidados.'); return; }
          ws.role = 'viewer'; ws.memberId = randomBytes(12).toString('base64url');
        } else { ws.close(4001, 'Convite inválido ou expirado'); return; }
        ws.profile = visualProfile(auth.profile); ws.profile.name ||= 'Amigo';
        ws.streamState = { active: false }; ws.relayTargets = new Set(); ws.cameraTargets = new Set(); ws.relayStream = 'screen';
        // 0.7.0+: members that can send/receive a second (camera) video.
        ws.features = Array.isArray(auth.features) && auth.features.includes('camera') ? ['camera'] : [];
        members.set(ws.memberId, ws); clearTimeout(timeout);
        send(ws, { type: 'welcome', role: ws.role, self: ws.memberId, members: roster(), features: ['camera'] });
        broadcast({ type: 'room', members: roster() });
        return;
      }
      if (ws.readyState !== WebSocket.OPEN) return;
      if (binary) {
        const targets = ws.relayStream === 'camera' ? ws.cameraTargets : ws.relayTargets;
        if (!ws.streamState.active) { ws.close(4001, 'Inicie sua transmissão antes de enviar mídia'); return; }
        // A target may have just left; late chunks are dropped instead of closing the publisher.
        if (!targets.size) return;
        // Prefix each chunk with the authenticated publisher, never a client-supplied ID.
        const id = Buffer.from(ws.memberId + (ws.relayStream === 'camera' ? ':camera' : ''));
        const packet = Buffer.concat([Buffer.from([id.length]), id, buffer]);
        for (const targetId of targets) {
          const peer = members.get(targetId);
          if (peer?.readyState !== WebSocket.OPEN) continue;
          if (peer.bufferedAmount > 32 * 1024 * 1024) { peer.close(4004, 'Sua conexão ficou para trás. Reconecte.'); continue; }
          peer.send(packet, { binary: true });
        }
        return;
      }
      if (buffer.length > 65536) { ws.close(4001, 'Mensagem muito grande'); return; }
      let msg;
      try { msg = JSON.parse(buffer); } catch { ws.close(4001, 'Mensagem inválida'); return; }
      if (msg.type === 'profile') {
        if (typeof msg.name === 'string' && msg.name.trim() && msg.name.length <= 32) ws.profile.name = msg.name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
        if (typeof msg.photo === 'string' && msg.photo.length < 60000 && (!msg.photo || /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(msg.photo))) ws.profile.photo = msg.photo;
        const appearance = visualProfile(msg);
        if (msg.banner !== undefined) ws.profile.banner = appearance.banner;
        if (msg.accentColor !== undefined) ws.profile.accentColor = appearance.accentColor;
        ws.profile = visualProfile(ws.profile);
        broadcast({ type: 'room', members: roster() });
      } else if (msg.type === 'stream-state') {
        const active = Boolean(msg.active);
        // Clients before 0.7.0 send only `active`, which always meant the screen.
        ws.streamState = { active, screen: active && (msg.screen === undefined || Boolean(msg.screen)), camera: active && Boolean(msg.camera), label: String(msg.label || '').slice(0, 120), quality: String(msg.quality || '').slice(0, 60), relay: Boolean(msg.relay) };
        if (!ws.streamState.active) { ws.relayTargets.clear(); ws.cameraTargets.clear(); }
        broadcast({ type: 'room', members: roster() });
      } else if (['offer', 'answer', 'ice', 'fallback'].includes(msg.type)) {
        const peer = members.get(msg.to);
        if (peer && peer !== ws) send(peer, { ...msg, from: ws.memberId });
      } else if (msg.type === 'relay-stream') {
        // Selects which of this member's encoders the following binary chunks belong to.
        ws.relayStream = msg.stream === 'camera' ? 'camera' : 'screen';
      } else if (msg.type === 'relay-start' && ws.streamState.active) {
        if (!/^video\/webm;codecs=vp8(?:,opus)?$/.test(msg.mime || '')) return;
        const ids = Array.isArray(msg.to) ? msg.to.slice(0, 8) : [];
        const targets = new Set(ids.filter(id => id !== ws.memberId && members.has(id)));
        if (msg.stream === 'camera') ws.cameraTargets = targets; else ws.relayTargets = targets;
        for (const id of targets) send(members.get(id), { type: 'relay-start', from: ws.memberId, mime: msg.mime, ...(msg.stream === 'camera' ? { stream: 'camera' } : {}) });
      }
    });
    ws.on('error', () => {});
    ws.once('close', () => {
      clearTimeout(timeout); sockets.delete(ws);
      if (ws === host) host = undefined;
      if (members.get(ws.memberId) === ws) {
        members.delete(ws.memberId);
        for (const peer of members.values()) { peer.relayTargets.delete(ws.memberId); peer.cameraTargets.delete(ws.memberId); }
        broadcast({ type: 'room', members: roster() });
      }
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
      const pendingTunnel = tunnelPromise;
      clearInterval(heartbeat); stopTunnel(); for (const ws of sockets) ws.terminate(); wss.close();
      await new Promise(resolve => {
        server.close(resolve);
        // Chromium can preconnect without sending HTTP headers. Those sockets
        // otherwise keep server.close() pending until the header timeout.
        server.closeAllConnections();
      });
      await Promise.all([...stoppingTunnels]);
      await pendingTunnel?.catch(() => {}); await retry.flushed();
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
