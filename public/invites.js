// Quick Tunnel addresses are reconstructed locally; no shortening service is used.
const tunnelName = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const inviteKey = /^(?:[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})$/;
const shortKey = /^[A-Za-z0-9_-]{22}$/;
// Static page on GitHub Pages; it only hands the key to the installed app.
export const P2P_PAGE = 'https://miharaxd.github.io/concord/invite/';

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
  if (typeof text !== 'string' || text.length > 4096) throw new Error('O convite está incompleto ou inválido.');
  let value = text.trim();
  // Accept our copied Discord Markdown as well as the raw URL/code.
  if (value.startsWith('[') && value.endsWith(')') && value.lastIndexOf('](') > 0) value = value.slice(value.lastIndexOf('](') + 2, -1);
  if (value.startsWith('concord:link:')) {
    try { value = decodeURIComponent(value.slice(13)); } catch { throw new Error('O convite está incompleto ou inválido.'); }
    if (!/^https?:\/\//.test(value)) throw new Error('O convite está incompleto ou inválido.');
  }
  if (value.startsWith('concord:p2p:')) {
    const token = value.slice(12);
    if (!shortKey.test(token)) throw new Error('O convite está incompleto ou inválido. Copie ele inteiro.');
    return { p2p: true, token };
  }
  if (value.startsWith('concord:')) {
    const match = /^concord:([^:]+):([A-Za-z0-9_-]{22})$/.exec(value);
    if (!match || !tunnelName.test(match[1])) throw new Error('O convite está incompleto ou inválido. Copie ele inteiro.');
    return { address: `https://${match[1]}.trycloudflare.com`, token: match[2] };
  }
  let url;
  try { url = new URL(value); } catch { throw new Error('Insira um convite começando com concord: ou https://.'); }
  const page = new URL(P2P_PAGE);
  if (url.origin === page.origin && url.pathname.replace(/\/?$/, '/') === page.pathname) {
    const token = url.searchParams.get('join') || new URLSearchParams(url.hash.slice(1)).get('join');
    if (!shortKey.test(token || '') || url.username || url.password) throw new Error('O convite está incompleto ou inválido.');
    return { p2p: true, token };
  }
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('O convite precisa começar com concord: ou https://.');
  const fragment = new URLSearchParams(url.hash.slice(1)).get('join');
  const query = url.pathname === '/invite' ? url.searchParams.get('join') : null;
  if (fragment && query && fragment !== query) throw new Error('O convite está incompleto ou inválido.');
  const token = query || fragment;
  if (!inviteKey.test(token || '') || url.username || url.password) throw new Error('O convite está incompleto ou inválido.');
  return { address: url.origin, token };
}

export function webInvite(value) {
  const { address, token, p2p } = parseInvite(value);
  if (p2p) return `${P2P_PAGE}?join=${token}`;
  // Discord strips fragments from preview-card destinations, so the universal link uses a query.
  return `${address}/invite?join=${token}`;
}

export function desktopInvite(value) {
  const { address, token, p2p } = parseInvite(value);
  if (p2p) return 'concord:p2p:' + token;
  const short = shortInvite(address, token);
  return short.startsWith('concord:') && token.length === 22 ? short : 'concord:link:' + encodeURIComponent(`${address}/#join=${token}`);
}
