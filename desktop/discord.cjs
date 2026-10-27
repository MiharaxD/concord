const http = require('node:http');
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { readFile, writeFile, rename, unlink } = require('node:fs/promises');
const config = require('./discord-config.json');

const api = 'https://discord.com/api/v10';
const canceled = () => new Error('Vinculação cancelada.');
const validToken = value => typeof value === 'string' && value.length >= 8 && value.length <= 8192;
const same = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cleanName = value => String(value || '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 32);

async function createDiscordLink({ file, storage, openExternal, normalizeImage,
  clientId = config.clientId, redirectUri = config.redirectUri, scopes = config.scopes, fetcher = (...args) => fetch(...args), timeout = 600000 } = {}) {
  let credentials = null, operation, generation = 0, pendingWrites = Promise.resolve(), closed = false;
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' || !redirect.port || redirect.pathname !== '/discord/callback') throw new Error('Retorno do Discord inválido.');
  try {
    const value = JSON.parse(storage.decryptString(await readFile(file)));
    if (value.clientId === clientId && validToken(value.refreshToken) && validToken(value.accessToken) && Number.isFinite(value.expiresAt)) credentials = value;
  } catch {} // A missing/corrupted/foreign Windows credential never blocks manual profiles.
  const state = () => ({ configured: /^\d{17,20}$/.test(clientId || ''), linked: Boolean(credentials), social: Boolean(credentials?.scopes?.includes('sdk.social_layer')), busy: Boolean(operation), name: credentials?.name || '' });
  function persist(value) {
    const write = pendingWrites.then(async () => {
      if (value) { await writeFile(file + '.tmp', storage.encryptString(JSON.stringify(value))); await rename(file + '.tmp', file); }
      else await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
    });
    pendingWrites = write.catch(() => {}); return write;
  }
  function check(op) { if (closed || generation !== op.generation || op.abort.signal.aborted) throw canceled(); }
  async function commitCredentials(value, op) {
    check(op); await persist(value);
    try { check(op); } catch (error) { await persist(credentials); throw error; }
    credentials = value;
  }
  async function request(url, options, op) {
    check(op);
    try { return await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.any([op.abort.signal, AbortSignal.timeout(12000)]) }); }
    catch { check(op); throw new Error('Não consegui falar com o Discord. Confira a conexão e tente novamente.'); }
  }
  async function json(response) {
    const chunks = []; let length = 0;
    for await (const chunk of response.body) { length += chunk.length; if (length > 65536) throw new Error('O Discord enviou uma resposta inválida.'); chunks.push(chunk); }
    const text = Buffer.concat(chunks).toString('utf8');
    try { return JSON.parse(text); } catch { throw new Error('O Discord enviou uma resposta inválida.'); }
  }
  async function exchange(params, op) {
    const response = await request(api + '/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, ...params }).toString() }, op);
    if (!response.ok) {
      if (response.status === 429) throw new Error('O Discord pediu uma pausa. Tente vincular novamente mais tarde.');
      throw new Error('O Discord não autorizou o vínculo. Confira a configuração do aplicativo ou vincule novamente.');
    }
    const value = await json(response); check(op);
    if (!validToken(value.access_token) || !validToken(value.refresh_token) || !String(value.scope || '').split(' ').includes('identify') || value.token_type?.toLowerCase() !== 'bearer'
      || !Number.isFinite(value.expires_in) || value.expires_in <= 0 || value.expires_in > 31536000) throw new Error('A autorização do Discord está incompleta. Vincule novamente.');
    return { clientId, accessToken: value.access_token, refreshToken: value.refresh_token, scopes: String(value.scope).split(' '), expiresAt: Date.now() + value.expires_in * 1000 };
  }
  async function image(user, kind, op) {
    const hash = user[kind];
    if (!hash) return '';
    if (!/^(?:a_)?[a-f0-9]{32}$/.test(hash)) throw new Error('A imagem do perfil do Discord é inválida.');
    const response = await request(`https://cdn.discordapp.com/${kind === 'avatar' ? 'avatars' : 'banners'}/${user.id}/${hash}.png?size=${kind === 'avatar' ? 128 : 512}`, {}, op);
    if (!response.ok) throw new Error('Não consegui carregar a imagem do Discord. Tente atualizar o perfil novamente.');
    if (!/^image\/(png|jpeg|webp)(?:;|$)/i.test(response.headers.get('content-type') || '') || Number(response.headers.get('content-length') || 0) > 2097152) throw new Error('A imagem do Discord não pôde ser importada.');
    const chunks = []; let length = 0;
    for await (const chunk of response.body) { length += chunk.length; if (length > 2097152) throw new Error('A imagem do Discord é muito grande.'); chunks.push(chunk); }
    check(op); return normalizeImage(Buffer.concat(chunks), kind);
  }
  async function importProfile(tokens, op) {
    const response = await request(api + '/users/@me', { headers: { Authorization: 'Bearer ' + tokens.accessToken } }, op);
    if (!response.ok) throw new Error(response.status === 401 ? 'A autorização expirou. Vincule o Discord novamente.' : 'Não consegui carregar seu perfil do Discord. Tente novamente.');
    const user = await json(response); check(op);
    if (!/^\d{17,20}$/.test(user.id || '') || typeof user.username !== 'string') throw new Error('O Discord enviou um perfil inválido.');
    const [photo, banner] = await Promise.all([image(user, 'avatar', op), image(user, 'banner', op)]); check(op);
    const name = cleanName(user.global_name || user.username);
    if (!name) throw new Error('O perfil do Discord está sem nome.');
    const accentColor = Number.isInteger(user.accent_color) && user.accent_color >= 0 && user.accent_color <= 0xffffff ? '#' + user.accent_color.toString(16).padStart(6, '0') : '';
    await commitCredentials({ ...tokens, name }, op);
    return { name, photo, banner, accentColor };
  }
  function authorize(op) {
    return new Promise((resolve, reject) => {
      check(op);
      const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      let settled = false;
      const finish = (error, code) => {
        if (settled) return; settled = true; clearTimeout(timer); op.abort.signal.removeEventListener('abort', aborted);
        server.close(); server.closeAllConnections(); error ? reject(error) : resolve({ code, verifier });
      };
      const aborted = () => finish(canceled());
      const server = http.createServer((req, res) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
        const reply = (status, text) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); };
        if (req.method !== 'GET' || req.headers.host !== redirect.host || req.url.length > 4096) return reply(400, 'Retorno inválido.');
        const url = new URL(req.url, redirect.origin);
        if (url.pathname !== redirect.pathname || !same(url.searchParams.get('state'), state)) return reply(400, 'Retorno inválido. Volte ao Concord e tente novamente.');
        if (url.searchParams.has('iss') && url.searchParams.get('iss') !== 'https://discord.com') return reply(400, 'Origem inválida.');
        if (url.searchParams.has('error')) {
          const denied = url.searchParams.get('error') === 'access_denied';
          reply(200, 'Autorização não concluída. Volte ao Concord.');
          return setImmediate(() => finish(denied ? canceled() : new Error('O Discord recusou a autorização. Confira a habilitação do Social SDK e tente novamente.')));
        }
        const code = url.searchParams.get('code');
        if (!code || !/^[A-Za-z0-9_-]{8,2048}$/.test(code)) return reply(400, 'Código inválido.');
        reply(200, 'Autorização recebida. Pode fechar esta página e voltar ao Concord.');
        setImmediate(() => finish(null, code));
      });
      const timer = setTimeout(() => finish(new Error('A autorização demorou demais. Clique em Vincular Discord para tentar novamente.')), timeout);
      server.on('error', () => finish(new Error('Não consegui abrir o retorno do Discord neste PC. Feche outra tentativa de vinculação e tente novamente.')));
      op.abort.signal.addEventListener('abort', aborted, { once: true });
      server.listen(Number(redirect.port), '127.0.0.1', () => {
        if (settled) return;
        const url = new URL('https://discord.com/oauth2/authorize');
        url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', scope: scopes, redirect_uri: redirectUri, state,
          code_challenge: challenge, code_challenge_method: 'S256', prompt: 'consent' }).toString();
        Promise.resolve(openExternal(url.href)).catch(() => finish(new Error('Não consegui abrir o navegador. Tente vincular novamente.')));
      });
    });
  }
  function run(task) {
    if (closed) return Promise.reject(canceled());
    if (operation) return Promise.reject(new Error('Aguarde a operação do Discord terminar.'));
    if (!/^\d{17,20}$/.test(clientId || '')) return Promise.reject(new Error('A integração com o Discord ainda não foi configurada.'));
    if (!storage.isEncryptionAvailable()) return Promise.reject(new Error('O Windows não conseguiu proteger o vínculo. Seu perfil manual continua disponível.'));
    const op = { generation: ++generation, abort: new AbortController() }; operation = op;
    op.done = Promise.resolve().then(() => { check(op); return task(op); }).finally(() => { op.abort.abort(); if (operation === op) operation = null; });
    return op.done;
  }
  return {
    state,
    socialToken: () => run(async op => {
      if (!credentials || !credentials.scopes?.includes('sdk.social_layer')) throw Object.assign(new Error('Autorize o acesso aos amigos no Discord para usar os convites.'), { code: 'RELINK' });
      if (credentials.expiresAt <= Date.now() + 60000) await commitCredentials({ ...await exchange({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken }, op), name: credentials.name }, op);
      return { clientId, token: credentials.accessToken };
    }),
    link: () => run(async op => { const { code, verifier } = await authorize(op); check(op); return importProfile(await exchange({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri }, op), op); }),
    refresh: () => run(async op => {
      if (!credentials) throw new Error('Vincule seu Discord primeiro.');
      let tokens = credentials;
      if (tokens.expiresAt <= Date.now() + 60000) {
        tokens = await exchange({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken }, op);
        // Persist rotated refresh tokens even if the following profile/image request fails.
        await commitCredentials({ ...tokens, name: credentials.name }, op);
      }
      return importProfile(tokens, op);
    }),
    cancel() { if (operation) { ++generation; operation.abort.abort(); } },
    async unlink() {
      if (operation) { ++generation; operation.abort.abort(); await operation.done.catch(() => {}); }
      if (closed) throw canceled();
      const op = { generation: ++generation, abort: new AbortController() }; operation = op;
      op.done = (async () => {
        const previous = credentials; await persist(null); credentials = null;
        if (previous) {
          try {
            const response = await fetcher(api + '/oauth2/token/revoke', { method: 'POST', redirect: 'error', signal: AbortSignal.any([op.abort.signal, AbortSignal.timeout(8000)]),
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, token: previous.refreshToken, token_type_hint: 'refresh_token' }).toString() });
            if (!response.ok) throw new Error();
          } catch { return 'Vínculo removido deste PC. Não consegui revogar no Discord; remova o Concord em Configurações > Apps autorizados por lá.'; }
        }
        return '';
      })().finally(() => { if (operation === op) operation = null; });
      return op.done;
    },
    async close() { closed = true; if (operation) { ++generation; operation.abort.abort(); await operation.done.catch(() => {}); } await pendingWrites; }
  };
}
module.exports = { createDiscordLink };
