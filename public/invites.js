// Quick Tunnel addresses are reconstructed locally; no shortening service is used.
const tunnelName = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const inviteKey = /^(?:[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})$/;

export function shortInvite(address, token) {
  const url = new URL(address);
  const suffix = '.trycloudflare.com';
  const name = url.hostname.endsWith(suffix) ? url.hostname.slice(0, -suffix.length) : '';
  if (url.protocol === 'https:' && !url.port && tunnelName.test(name)) {
    return `concord:${name}:${token}`;
  }
  return `${url.origin}/#join=${token}`;
}

export function parseInvite(text) {
  const value = text.trim();
  if (value.startsWith('concord:')) {
    const match = /^concord:([^:]+):([A-Za-z0-9_-]{22})$/.exec(value);
    if (!match || !tunnelName.test(match[1])) throw new Error('O convite está incompleto ou inválido. Copie ele inteiro.');
    return { address: `https://${match[1]}.trycloudflare.com`, token: match[2] };
  }
  let url;
  try { url = new URL(value); } catch { throw new Error('Cole o convite que seu amigo enviou, começando com concord: ou https://.'); }
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('O convite precisa começar com concord: ou https://.');
  const token = new URLSearchParams(url.hash.slice(1)).get('join');
  if (!inviteKey.test(token || '') || url.username || url.password) throw new Error('O convite está incompleto ou inválido.');
  return { address: url.origin, token };
}
