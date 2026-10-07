import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../build/installer.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) throw new Error('Defina GH_TOKEN no ambiente de desenvolvimento/CI. Nunca inclua o token no app.');
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Use uma versao estavel MAJOR.MINOR.PATCH.');
const tag = `v${pkg.version}`;
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== tag) throw new Error('A tag precisa corresponder a version no package.json.');
const { owner, repo } = config.publish;
const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
if (!process.env.GITHUB_SHA && execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()) {
  throw new Error('Registre as alteracoes em um commit e envie ao GitHub antes de publicar.');
}
const base = `https://api.github.com/repos/${owner}/${repo}`;
const directory = path.resolve(root, config.directories.output);
const exe = `Concord-${pkg.version}-Setup.exe`;
const filenames = [exe, exe + '.blockmap', exe + '.sha256', 'latest.yml'];
const manifest = await readFile(path.join(directory, 'latest.yml'), 'utf8');
if (!manifest.split(/\r?\n/).includes(`version: ${pkg.version}`) || !manifest.includes(exe)) throw new Error('latest.yml nao corresponde ao instalador.');
const sha512 = createHash('sha512').update(await readFile(path.join(directory, exe))).digest('base64');
if (!manifest.includes(`sha512: ${sha512}`)) throw new Error('Checksum do instalador nao corresponde a latest.yml.');
for (const filename of filenames) await stat(path.join(directory, filename));
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
async function api(url, options = {}, allow404 = false) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub respondeu HTTP ${response.status}; a release incompleta fica em rascunho.`);
  return response.status === 204 ? null : response.json();
}
let release = await api(`${base}/releases/tags/${tag}`, {}, true);
if (!release) {
  // The tag endpoint serves published releases; authenticated listing also finds drafts.
  const recent = await api(`${base}/releases?per_page=100`);
  release = recent.find(item => item.tag_name === tag);
}
if (release && !release.draft) throw new Error('Essa versao ja esta publicada. Aumente version; nao substitua uma release entregue.');
if (!release) {
  release = await api(`${base}/releases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    tag_name: tag, target_commitish: commit, name: `Concord ${pkg.version}`, draft: true, prerelease: false,
    body: 'Instale o Concord pelo arquivo Setup.exe. Versoes com atualizador recebem este update pelo proprio aplicativo. Nome e foto sao preservados.'
  }) });
}
// Keep the release invisible to clients until every installer/metadata upload succeeds.
for (const filename of filenames) {
  const previous = release.assets.find(asset => asset.name === filename);
  if (previous) await api(`${base}/releases/assets/${previous.id}`, { method: 'DELETE' });
  const file = path.join(directory, filename), size = (await stat(file)).size;
  await api(`${release.upload_url.split('{')[0]}?name=${encodeURIComponent(filename)}`, { method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) }, body: createReadStream(file), duplex: 'half' });
  console.log('Enviado:', filename);
}
await api(`${base}/releases/${release.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false }) });
console.log(`Release publicada: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
