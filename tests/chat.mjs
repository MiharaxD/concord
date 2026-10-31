// Room chat between two app instances over the real P2P route: text, unread badge,
// image preview, a 3 MB file checked by SHA-256, executable warning and clearing on leave.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = process.cwd(), apps = [], pages = [], errors = [];
const run = path.join(root, 'test-results', 'chat-' + Date.now()); await mkdir(run, { recursive: true });
const result = { passed: false, checks: [], executable: process.env.CONCORD_EXE || 'development' };
const check = text => { result.checks.push(text); console.log('OK', text); };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAGklEQVR4nGP8z8AARMQBJlIUj2qgjgaSAgAyVQIQ+UvsVgAAAABJRU5ErkJggg==', 'base64');
async function launch(name) {
  const data = path.join(run, name); await mkdir(data, { recursive: true });
  await writeFile(path.join(data, 'profile.json'), JSON.stringify({ name, photo: '' }));
  const app = await _electron.launch({ executablePath: process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'), args: [...(process.env.CONCORD_EXE ? [] : [root]), '--mute-audio', '--use-fake-device-for-media-stream'], env: { ...process.env, CONCORD_DATA_DIR: data }, timeout: 45000 });
  apps.push(app); const page = await app.firstWindow(); pages.push(page); page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(name + ': ' + error.message));
  await page.locator('#create-room:not([disabled])').waitFor();
  return { app, page };
}
const say = async (page, text) => { await page.locator('.chat-input').fill(text); await page.locator('.chat-input').press('Enter'); };
try {
  const host = await launch('Yuri'), guest = await launch('Ana');
  result.version = (await host.page.evaluate(() => window.concord.bootstrap())).version;
  await host.page.locator('#create-room').click();
  await host.page.waitForFunction(() => document.querySelector('#invite-link').value.startsWith('concord:p2p:'), null, { polling: 250 });
  const code = await host.page.locator('#invite-link').inputValue();
  await guest.page.locator('#join-room-nav').click(); await guest.page.locator('#join-input').fill(code); await guest.page.locator('#join-button').click();
  await guest.page.waitForFunction(() => document.body.dataset.connected === 'true', null, { timeout: 60000, polling: 250 });
  assert.equal(await guest.page.evaluate(() => document.body.dataset.route), 'direct');
  await host.page.locator('#audience-list').filter({ hasText: 'Ana' }).waitFor();
  for (const { page } of [host, guest]) { assert.equal(await page.locator('#chat-root').isVisible(), false, 'chat começa fechado'); await page.locator('#chat-button').click(); await page.locator('.chat-input').waitFor(); }

  await say(host.page, 'Oi, tudo bem?');
  await guest.page.locator('.chat-msg').filter({ hasText: 'Oi, tudo bem?' }).filter({ hasText: 'Yuri' }).waitFor();
  assert.equal(await host.page.locator('.chat-msg').filter({ hasText: 'Oi, tudo bem?' }).count(), 1, 'remetente vê a própria mensagem uma vez');
  check('Texto chega pela conexão P2P com nome de quem enviou.');

  await guest.page.evaluate(() => { window.testPings = 0; const start = OscillatorNode.prototype.start; OscillatorNode.prototype.start = function (...args) { window.testPings++; return start.apply(this, args); }; });
  await guest.page.locator('#chat-toggle').click(); await guest.page.locator('#chat-root').waitFor({ state: 'hidden' }); assert.equal(await guest.page.locator('#chat-button').getAttribute('aria-expanded'), 'false');
  await say(host.page, 'Você viu?');
  await guest.page.locator('#chat-badge:not([hidden])').filter({ hasText: '1' }).waitFor();
  await guest.page.locator('#chat-toast:not([hidden])').filter({ hasText: 'Yuri' }).filter({ hasText: 'Você viu?' }).waitFor();
  await guest.page.waitForFunction(() => window.testPings === 1); assert.equal(await host.page.locator('#chat-toast').isHidden(), true, 'chat aberto não mostra aviso');
  await guest.page.keyboard.press('c'); await guest.page.locator('#chat-badge').waitFor({ state: 'hidden' }); await guest.page.locator('.chat-input').waitFor();
  assert.equal(await guest.page.locator('#chat-toast').isHidden(), true, 'abrir o chat some com o aviso');
  check('Chat começa fechado e abre pelo dock; escondido mostra o contador de não lidas; a tecla C abre e zera.');
  await guest.page.locator('#chat-toggle').click(); await guest.page.locator('#chat-root').waitFor({ state: 'hidden' });
  await say(host.page, 'Clica aqui');
  await guest.page.locator('#chat-toast:not([hidden])').filter({ hasText: 'Clica aqui' }).click(); await guest.page.locator('.chat-input').waitFor();
  assert.equal(await guest.page.locator('#chat-toast').isHidden(), true); assert.equal(await guest.page.evaluate(() => window.testPings), 2);
  check('Com o chat recolhido, mensagem nova mostra aviso com nome e texto e toca o som; clicar no aviso abre o chat.');

  await guest.page.locator('.chat-root input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
  await host.page.waitForFunction(() => [...document.querySelectorAll('.chat-img')].some(image => image.naturalWidth === 8), null, { timeout: 30000, polling: 250 });
  check('Imagem enviada aparece com prévia para quem recebe.');

  // A real 1 s WebM clip, sent without a MIME type so the preview must come from the extension.
  const clip = await guest.page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90; const ctx = canvas.getContext('2d'); let frame = 0;
    const timer = setInterval(() => { ctx.fillStyle = '#3366cc'; ctx.fillRect(0, 0, 160, 90); ctx.fillStyle = '#fff'; ctx.fillRect(frame++ * 6 % 160, 30, 20, 20); }, 33);
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp8' }), parts = [];
    recorder.ondataavailable = event => parts.push(event.data); recorder.start();
    await new Promise(resolve => setTimeout(resolve, 1000)); recorder.stop(); await new Promise(resolve => { recorder.onstop = resolve; }); clearInterval(timer);
    return [...new Uint8Array(await new Blob(parts).arrayBuffer())];
  });
  await guest.page.locator('.chat-root input[type=file]').setInputFiles({ name: 'clipe.webm', mimeType: 'application/octet-stream', buffer: Buffer.from(clip) });
  await host.page.waitForFunction(() => [...document.querySelectorAll('.chat-video')].some(video => video.videoWidth === 160 && video.controls && video.paused), null, { timeout: 30000, polling: 250 });
  assert.equal(await guest.page.locator('.chat-video').count(), 1, 'quem envia também vê a prévia');
  for (const name of ['foto.png', 'clipe.webm']) {
    const message = host.page.locator('.chat-file').filter({ has: host.page.locator(`.chat-media-download[download="${name}"]`) });
    assert.equal(await message.locator('.chat-card').isHidden(), true, 'mídia sem cartão de nome/Baixar: ' + name);
    const save = message.locator('.chat-media-download');
    assert.equal(await save.evaluate(node => getComputedStyle(node).opacity), '0');
    await message.locator('.chat-media').hover(); await host.page.waitForFunction(node => getComputedStyle(node).opacity === '1', await save.elementHandle(), { polling: 100 });
  }
  check('Imagem e vídeo aparecem só com a prévia; o ícone de download surge no canto ao passar o mouse.');
  check('Vídeo aparece com player no chat (sem tocar sozinho), inclusive sem tipo informado.');

  const big = randomBytes(3 * 1024 * 1024 + 123), digest = createHash('sha256').update(big).digest('hex');
  // The app CSP blocks fetch() of blob: URLs, so keep a reference to the Blob behind each link.
  await host.page.evaluate(() => { const create = URL.createObjectURL; window.testBlobs = new Map(); URL.createObjectURL = blob => { const url = create.call(URL, blob); window.testBlobs.set(url, blob); return url; }; });
  await guest.page.locator('.chat-root input[type=file]').setInputFiles({ name: 'dados.bin', mimeType: 'application/octet-stream', buffer: big });
  const link = host.page.locator('.chat-msg').filter({ hasText: 'dados.bin' }).locator('.chat-download');
  await link.waitFor({ timeout: 60000 });
  const received = await host.page.evaluate(async href => { const bytes = await window.testBlobs.get(href).arrayBuffer(); return { size: bytes.byteLength, hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('') }; }, await link.getAttribute('href'));
  assert.deepEqual(received, { size: big.length, hash: digest });
  await host.app.evaluate(({ session }) => { session.defaultSession.once('will-download', (event, item) => { global.testDownload = { name: item.getFilename(), size: item.getTotalBytes() }; item.cancel(); }); });
  await link.click(); await host.app.evaluate(() => new Promise(resolve => { const wait = () => global.testDownload ? resolve() : setTimeout(wait, 100); wait(); }));
  assert.deepEqual(await host.app.evaluate(() => global.testDownload), { name: 'dados.bin', size: big.length });
  check('Arquivo de 3 MB chega inteiro (SHA-256 confere) com botão Baixar, sem abrir sozinho.');

  await host.page.locator('.chat-root input[type=file]').setInputFiles({ name: 'programa.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ teste') });
  await guest.page.locator('.chat-msg').filter({ hasText: 'programa.exe' }).locator('.chat-warn').waitFor({ timeout: 30000 });
  check('Executável recebido mostra aviso de segurança.');
  assert.equal(await guest.page.locator('.chat-attach-btn').getAttribute('title'), 'Anexar arquivo ou imagem');

  await guest.page.locator('#leave-button').click();
  assert.equal(await guest.page.locator('.chat-msg').count(), 0);
  check('Sair da sala apaga a conversa local.');
  await guest.page.screenshot({ path: path.join(run, 'convidada.png') }); await host.page.screenshot({ path: path.join(run, 'host.png') });
  assert.deepEqual(errors, []);
  result.passed = true; console.log('CHAT_TEST_PASS');
} catch (error) {
  result.error = error.message; result.errors = errors;
  for (const page of pages) console.log('DIAGNOSTIC', await page.evaluate(() => ({ notice: document.getElementById('notice').textContent, log: document.querySelector('.chat-log')?.innerText.slice(-600) })).catch(() => ({})));
  throw error;
} finally {
  await writeFile(path.join(run, 'result.json'), JSON.stringify(result, null, 2));
  for (const app of apps.reverse()) await app.close().catch(() => app.process().kill());
}
