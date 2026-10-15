const { readFile, writeFile, rename, unlink, mkdir } = require('node:fs/promises');
const path = require('node:path');

const rateMessage = 'A Cloudflare limitou temporariamente a criação de convites. Aguarde a contagem para tentar novamente.';
function tunnelFailure(output = '') {
  const status = output.match(/(?:provisioning failed with status|status code[:=]?)\s*(\d{3})\b/i)?.[1];
  if (status === '429') return { code: 'RATE_LIMIT', message: rateMessage };
  if (status?.startsWith('5')) return { code: 'PROVIDER', message: 'O serviço de convites da Cloudflare está indisponível agora. Tente novamente mais tarde.' };
  if (status === '403') return { code: 'PROVIDER', message: 'A Cloudflare recusou a criação do convite. Tente novamente mais tarde.' };
  if (/no such host|ENOTFOUND|EAI_AGAIN|lookup .*(?:timeout|refused)/i.test(output)) return { code: 'NETWORK', message: 'Não consegui localizar o serviço de convites. Confira a conexão e tente novamente.' };
  return { code: 'CONNECTION', message: 'Não consegui conectar ao serviço de convites. Tente novamente em instantes.' };
}

// Remember only the rate-limit deadline; never store invitation keys or tunnel output.
function createInviteRetry(file, now = Date.now) {
  let state, queue = Promise.resolve();
  const ready = readFile(file, 'utf8').then(text => {
    const value = JSON.parse(text), time = now();
    if (value.code === 'RATE_LIMIT' && Number.isInteger(value.failures) && value.failures >= 1 && value.failures <= 4
      && Number.isFinite(value.retryAt) && value.retryAt <= time + 300000 && value.retryAt > time - 1800000) state = value;
  }).catch(() => {});
  const publicState = () => state ? { code: 'RATE_LIMIT', message: rateMessage, retryAt: state.retryAt } : null;
  function save(value) {
    const saved = queue.then(async () => {
      if (!value) { await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; }); return; }
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file + '.tmp', JSON.stringify(value), 'utf8'); await rename(file + '.tmp', file);
    });
    queue = saved.catch(() => {}); return queue;
  }
  return {
    async blocked() { await ready; return state && state.retryAt > now() ? publicState() : null; },
    async limited() {
      await ready;
      const failures = Math.min((state && state.retryAt > now() - 1800000 ? state.failures : 0) + 1, 4);
      state = { code: 'RATE_LIMIT', failures, retryAt: now() + Math.min(60000 * 2 ** (failures - 1), 300000) };
      await save(state); return publicState();
    },
    async clear() { await ready; state = null; await save(null); },
    async flushed() { await ready; await queue; }
  };
}
module.exports = { createInviteRetry, tunnelFailure };
