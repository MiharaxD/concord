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
const notes = [
      `## Novidades do Concord ${pkg.version}`,
      '',
      '- **Prévia de mídia no chat:** imagens e vídeos aparecem direto na conversa, e áudios ganham um player. Como no Discord, o ícone de download aparece no canto quando você passa o mouse.',
      '',
      '### Da 0.8.0',
      '',
      '- **Barra de controles estilo Discord:** Tela, Câmera, Microfone, Chat e Sair logo abaixo do vídeo. O botão Tela abre um pop-up com as opções de transmissão.',
      '- **Chat da sala:** mande texto, imagens (com prévia) e arquivos de qualquer tamanho pelo clipe. A conversa some quando a sala fecha.',
      '- **Microfone ao vivo:** liga e desliga durante a transmissão.',
      '- Botão **Chat** esconde a coluna lateral e deixa o vídeo ocupar a largura toda. Textos maiores e mais fáceis de ler.',
      '',
      '### Da 0.7.1',
      '',
      '- **Áudio automático:** compartilhando uma janela (como um jogo), vai só o som dela; compartilhando a tela inteira, vai o som do computador. A escolha manual da fonte do áudio foi para **Opções avançadas**.',
      '',
      '### Da 0.7.0',
      '',
      '- **Câmera:** transmita a webcam sozinha ou junto com a tela pelo botão **Ligar câmera**.',
      '- Quem assiste vê a câmera no cantinho da sua tela, com botões para **tela cheia** e para **separar** em um quadro próprio (e voltar ao canto).',
      '- A câmera só é liberada quando você clica em Ligar câmera. Quem ainda está na 0.6.x continua vendo a tela, sem a câmera.',
      '',
      '### Da 0.6.1',
      '',
      '- **Abrir no Concord** pelo link agora entra na sala direto quando o app está parado. Se você já estiver em uma sala ou transmitindo, ele ainda pede confirmação.',
      '- Avisos como **Link copiado.** somem sozinhos depois de alguns segundos; mensagens de erro continuam na tela.',
      '',
      '### Da 0.6.0',
      '',
      '- **Conexão direta entre os PCs:** o link da sala fica pronto assim que você clica em **Criar sala**, sem esperar a Cloudflare.',
      '- Os PCs se encontram por servidores MQTT públicos com mensagens cifradas pela chave do convite; depois a sala passa por uma conexão direta.',
      '- **Cloudflare vira plano B:** só é usada quando a conexão direta não abre, e apenas para a pessoa que precisou. Bem menos bloqueios temporários.',
      '- O link agora abre uma página fixa no GitHub Pages, que continua no ar mesmo depois que a sala fecha.',
      '- Link antigo ou de sala fechada mostra **Sala não encontrada** em vez de ficar tentando.',
      '- Salas, transmissões simultâneas, perfil, Discord, áudio, preferências e atualizador preservados.',
      '',
      '**Importante:** salas criadas na 0.6.0 exigem a 0.6.0 ou mais nova para entrar; atualize todos os participantes. A prévia no Discord passa a mostrar um convite genérico, sem o nome da sala. A cota de desenvolvimento do Discord continua em 100 mensagens diretas a cada 2 horas para toda a aplicação.',
      '',
      'Instale pelo arquivo Setup.exe. Versões com atualizador recebem esta versão pelo próprio aplicativo. Perfil e preferências são preservados; o Discord continua opcional.'
].join('\n');
async function upload(release, filename) {
  const file = path.join(directory, filename), size = (await stat(file)).size;
  await api(`${release.upload_url.split('{')[0]}?name=${encodeURIComponent(filename)}`, { method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) }, body: createReadStream(file), duplex: 'half' });
  console.log('Enviado:', filename);
}
// One-off, explicitly authorized by the owner: build/replace-release.json turns an already
// published entry (same release ID) into this version instead of creating a new one.
const replace = await readFile(path.join(root, 'build', 'replace-release.json'), 'utf8').then(JSON.parse, () => null);
if (replace) {
  if (replace.version !== pkg.version || !/^v\d+\.\d+\.\d+$/.test(replace.from || '') || replace.from === tag) throw new Error('build/replace-release.json nao corresponde a esta versao.');
  if (await api(`${base}/releases/tags/${tag}`, {}, true)) throw new Error('Essa versao ja esta publicada. Aumente version; nao substitua uma release entregue.');
  const release = await api(`${base}/releases/tags/${replace.from}`);
  // New installer files first; swapping latest.yml is the only moment updaters see a change.
  for (const filename of filenames.slice(0, 3)) await upload(release, filename);
  const manifest = release.assets.find(asset => asset.name === 'latest.yml');
  if (manifest) await api(`${base}/releases/assets/${manifest.id}`, { method: 'DELETE' });
  await upload(release, 'latest.yml');
  for (const asset of release.assets) if (asset.name !== 'latest.yml' && !filenames.includes(asset.name)) await api(`${base}/releases/assets/${asset.id}`, { method: 'DELETE' });
  await api(`${base}/releases/${release.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tag, target_commitish: commit, name: `Concord ${pkg.version}`, body: notes }) });
  console.log(`Release ${release.id} editada de ${replace.from} para ${tag}: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
} else {
  let release = await api(`${base}/releases/tags/${tag}`, {}, true);
  if (!release) {
    // The tag endpoint serves published releases; authenticated listing also finds drafts.
    const recent = await api(`${base}/releases?per_page=100`);
    release = recent.find(item => item.tag_name === tag);
  }
  if (release && !release.draft) throw new Error('Essa versao ja esta publicada. Aumente version; nao substitua uma release entregue.');
  if (!release) release = await api(`${base}/releases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    tag_name: tag, target_commitish: commit, name: `Concord ${pkg.version}`, draft: true, prerelease: false, body: notes }) });
  // Keep the release invisible to clients until every installer/metadata upload succeeds.
  for (const filename of filenames) {
    const previous = release.assets.find(asset => asset.name === filename);
    if (previous) await api(`${base}/releases/assets/${previous.id}`, { method: 'DELETE' });
    await upload(release, filename);
  }
  await api(`${base}/releases/${release.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false }) });
  console.log(`Release publicada: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
}
