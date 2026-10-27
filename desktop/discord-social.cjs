const { spawn } = require('node:child_process');
const validId = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 64) : '';
function createDiscordSocial({ binary, cwd, authorization, normalizeImage, spawnProcess = spawn, fetcher = (...args) => fetch(...args) }) {
  let child, buffer = '', sequence = 0, connection, token = '', closed = false, authorizing;
  const pending = new Map(), friends = new Map(), photos = new Map(), invites = new Map();
  function failure(code, status = 0) {
    const text = status === 429 ? 'Limite temporário do Discord. Tente novamente mais tarde.' : code === 'NOT_FRIEND' ? 'Esta pessoa não está mais na sua lista de amigos do Discord.'
      : code === 'AUTH' ? 'A autorização do Discord expirou. Vincule novamente.' : code === 'COMPONENT' ? 'O componente do Discord não está disponível. Reinstale o Concord atualizado.'
      : code === 'SEND' ? 'O Discord não confirmou o envio do convite. Confira a conversa antes de tentar novamente.' : 'Não foi possível conectar ao Discord. Tente novamente.';
    return Object.assign(new Error(text), { code });
  }
  function rejectAll() { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(failure('OFFLINE')); } pending.clear(); connection = null; token = ''; friends.clear(); photos.clear(); }
  function start() {
    if (closed) throw failure('OFFLINE');
    if (child) return child;
    const process = spawnProcess(binary, [], { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }); child = process; buffer = '';
    process.stdout.setEncoding('utf8');
    process.stdout.on('data', text => {
      if (child !== process) return;
      buffer += text; if (buffer.length > 1048576) { process.kill(); rejectAll(); return; }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let value; try { value = JSON.parse(line); } catch { continue; }
        const entry = pending.get(value.id); if (!entry) continue;
        pending.delete(value.id); clearTimeout(entry.timer);
        value.ok ? entry.resolve(value.value) : entry.reject(failure(value.code, value.status));
      }
    });
    process.on('error', () => { if (child === process) { child = null; rejectAll(); } });
    process.on('close', () => { if (child === process) { child = null; rejectAll(); } });
    process.stdin.on('error', () => {}); return process;
  }
  function request(type, data = {}, timeout = 20000) {
    let process; try { process = start(); } catch (error) { return Promise.reject(error); }
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(failure(type === 'invite' ? 'SEND' : 'OFFLINE')); }, timeout);
      pending.set(id, { resolve, reject, timer });
      process.stdin.write(JSON.stringify({ id, type, ...data }) + '\n', error => { if (error && pending.delete(id)) { clearTimeout(timer); reject(failure('OFFLINE')); } });
    });
  }
  async function ensure() {
    if (!authorizing) authorizing = authorization().finally(() => { authorizing = null; });
    const credentials = await authorizing;
    if (token === credentials.token && child && connection) return connection;
    if (!connection || token !== credentials.token) {
      token = credentials.token;
      const current = request('connect', credentials, 30000); connection = current;
      current.catch(() => { if (connection === current) { connection = null; token = ''; } });
    }
    return connection;
  }
  return {
    async friends() {
      await ensure(); const values = await request('friends');
      if (!Array.isArray(values) || values.length > 1000) throw failure('SDK');
      friends.clear(); photos.clear();
      for (const value of values) if (validId(value.id)) friends.set(value.id, { id: value.id, name: clean(value.name) || clean(value.username) || 'Usuário', username: clean(value.username),
        avatar: /^(?:a_)?[a-f0-9]{32}$/.test(value.avatar || '') ? value.avatar : '', online: Boolean(value.online) });
      return [...friends.values()].map(({ avatar, ...value }) => value).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'pt-BR'));
    },
    async photo(id) {
      const friend = friends.get(id); if (!friend?.avatar) return '';
      if (photos.has(id)) return photos.get(id);
      const pending = (async () => {
        try {
          const response = await fetcher(`https://cdn.discordapp.com/avatars/${id}/${friend.avatar}.png?size=128`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
          if (!response.ok || !/^image\/(png|jpeg|webp)(?:;|$)/i.test(response.headers.get('content-type') || '')) return '';
          const chunks = []; let length = 0;
          for await (const chunk of response.body) { length += chunk.length; if (length > 2097152) return ''; chunks.push(chunk); }
          return normalizeImage(Buffer.concat(chunks), 'avatar');
        } catch { return ''; }
      })(); photos.set(id, pending); return pending;
    },
    async invite(id, link) {
      if (!validId(id) || !friends.has(id)) throw failure('NOT_FRIEND');
      if (invites.has(id)) throw Object.assign(new Error('Aguarde o envio do convite para esta pessoa.'), { code: 'BUSY' });
      const task = (async () => { await ensure(); const result = await request('invite', { userId: id, link }); if (!result?.sent) throw failure('SEND'); return true; })();
      invites.set(id, task); try { return await task; } finally { if (invites.get(id) === task) invites.delete(id); }
    },
    async disconnect() {
      const process = child; child = null; rejectAll();
      if (!process) return;
      await new Promise(resolve => { const timer = setTimeout(() => { process.kill(); resolve(); }, 1500); process.once('close', () => { clearTimeout(timer); resolve(); }); process.stdin.end(); });
    },
    async close() { closed = true; await this.disconnect(); }
  };
}
module.exports = { createDiscordSocial };
