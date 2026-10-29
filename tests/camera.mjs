// Camera publishing with Chromium's fake device: permission gate, picture-in-picture,
// fullscreen, detached tile, camera-only and the relay (compatibility) route.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = process.cwd(), apps = [], pages = [], errors = [];
const run = path.join(root, 'test-results', 'camera-' + Date.now()); await mkdir(run, { recursive: true });
const result = { passed: false, checks: [], executable: process.env.CONCORD_EXE || 'development' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = text => { result.checks.push(text); console.log('OK', text); };
async function launch(name) {
  const data = path.join(run, name); await mkdir(data, { recursive: true });
  await writeFile(path.join(data, 'profile.json'), JSON.stringify({ name, photo: '' }));
  const flags = ['--use-fake-device-for-media-stream'];
  const app = await _electron.launch({ executablePath: process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'), args: process.env.CONCORD_EXE ? flags : [root, ...flags], env: { ...process.env, CONCORD_DATA_DIR: data }, timeout: 45000 });
  apps.push(app); const page = await app.firstWindow(); pages.push(page); page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(name + ': ' + error.message));
  await page.locator('#create-room:not([disabled])').waitFor();
  await page.evaluate(() => { const PC = RTCPeerConnection; window.testPeers = []; window.RTCPeerConnection = class extends PC { constructor(...args) { super(...args); window.testPeers.push(this); } }; });
  return { app, page, name };
}
async function fakeScreen(page) {
  await page.locator('#audio-mode').selectOption('system');
  await page.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360; const ctx = canvas.getContext('2d'); let frame = 0;
      setInterval(() => { ctx.fillStyle = '#cc3344'; ctx.fillRect(0, 0, 640, 360); ctx.fillStyle = 'white'; ctx.fillRect(frame++ * 8 % 640, 80, 60, 80); }, 33);
      return canvas.captureStream(30);
    };
  });
}
async function startScreen(page) {
  await page.locator('#choose-source').click(); await page.locator('.source-choice').first().click(); await page.locator('#start-button').click();
  await page.locator('#stop-button').waitFor();
}
async function failMedia(page) {
  await page.evaluate(() => { for (const pc of window.testPeers.filter(pc => pc.getTransceivers().length)) { Object.defineProperty(pc, 'connectionState', { configurable: true, value: 'failed' }); pc.dispatchEvent(new Event('connectionstatechange')); } });
}
async function advancing(page, selector) {
  await page.waitForFunction(selector => { const video = document.querySelector(selector); return video && video.videoWidth > 0 && video.currentTime > 0; }, selector, { timeout: 40000, polling: 250 });
  const frames = () => page.evaluate(selector => document.querySelector(selector).getVideoPlaybackQuality().totalVideoFrames, selector);
  const first = await frames(); await sleep(1200); assert.ok(await frames() > first, 'vídeo avança: ' + selector);
}
try {
  const host = await launch('Yuri'), guest = await launch('Ana');
  result.version = (await host.page.evaluate(() => window.concord.bootstrap())).version;
  const denied = await host.page.evaluate(() => navigator.mediaDevices.getUserMedia({ video: true }).then(stream => { stream.getTracks().forEach(track => track.stop()); return 'granted'; }, error => error.name));
  assert.equal(denied, 'NotAllowedError');
  check('Sem clicar em Ligar câmera, o app nega a câmera.');

  await host.page.locator('#create-room').click(); await host.page.waitForFunction(() => document.body.dataset.connected === 'true', null, { polling: 250 });
  const invite = (await host.page.evaluate(() => window.concord.session())).guestInvite;
  await guest.page.locator('#join-room-nav').click(); await guest.page.locator('#join-input').fill(invite); await guest.page.locator('#join-button').click();
  await guest.page.waitForFunction(() => document.body.dataset.connected === 'true', null, { polling: 250 });
  await host.page.locator('#audience-list').filter({ hasText: 'Ana' }).waitFor();

  await fakeScreen(host.page); await startScreen(host.page);
  await host.page.locator('#camera-button').click(); await host.page.locator('#camera-button').filter({ hasText: 'Desligar câmera' }).waitFor();
  await advancing(host.page, '[data-member="' + await host.page.evaluate(() => document.querySelector('.stream-tile').dataset.member) + '"] .camera-pip video');
  check('Ligar câmera captura a webcam e mostra a prévia no canto da própria tela.');
  const hostTile = '.stream-tile[data-member="host"]';
  await advancing(guest.page, hostTile + ' > video'); await advancing(guest.page, hostTile + ' .camera-pip video');
  assert.equal(await guest.page.locator(hostTile + ' .camera-pip').isVisible(), true);
  assert.equal(await guest.page.locator(hostTile + ' .camera-pip video').getAttribute('data-transport'), 'direct');
  check('Quem assiste recebe tela e câmera; a câmera aparece no cantinho (picture-in-picture), por conexão direta.');
  await guest.page.screenshot({ path: path.join(run, 'pip.png') });

  await guest.page.locator(hostTile + ' .camera-pip').hover(); await guest.page.locator(hostTile + ' .camera-fullscreen').click();
  await guest.page.waitForFunction(() => document.fullscreenElement?.classList.contains('camera-box'), null, { polling: 250 });
  await guest.page.evaluate(() => document.exitFullscreen()); await guest.page.waitForFunction(() => !document.fullscreenElement, null, { polling: 250 });
  check('Botão de tela cheia da janelinha amplia só a câmera.');

  await guest.page.locator(hostTile + ' .camera-pip').hover(); await guest.page.locator(hostTile + ' .camera-detach').click();
  await advancing(guest.page, '.stream-tile[data-member="host:camera"] video');
  assert.equal(await guest.page.locator(hostTile + ' .camera-pip').isHidden(), true);
  assert.equal(await guest.page.locator('.stream-tile:not([hidden])').count(), 2);
  await guest.page.screenshot({ path: path.join(run, 'separada.png') });
  await guest.page.locator('.stream-tile[data-member="host:camera"]').click(); assert.equal(await guest.page.locator('.stream-tile:not([hidden])').count(), 1);
  await guest.page.locator('.stream-tile[data-member="host:camera"]').click();
  await guest.page.locator('.stream-tile[data-member="host:camera"] .camera-box').hover(); await guest.page.locator('.stream-tile[data-member="host:camera"] .camera-attach').click();
  await guest.page.locator('.stream-tile[data-member="host:camera"]').waitFor({ state: 'detached' }); await advancing(guest.page, hostTile + ' .camera-pip video');
  check('Separar vira um quadro próprio (com foco por clique) e Voltar ao canto devolve ao picture-in-picture.');

  await host.page.locator('#stop-button').click();
  await guest.page.waitForFunction(selector => document.querySelector(selector)?.classList.contains('camera-only'), hostTile, { polling: 250 });
  await advancing(guest.page, hostTile + ' .camera-pip video');
  check('Parar só a tela mantém a câmera, que passa a ocupar o quadro inteiro.');

  await host.page.locator('#camera-button').click(); await guest.page.locator(hostTile).waitFor({ state: 'detached' });
  await failMedia(host.page); await failMedia(guest.page);
  await startScreen(host.page); await host.page.locator('#camera-button').click();
  await guest.page.waitForFunction(selector => document.querySelector(selector + ' .camera-pip video')?.dataset.transport === 'relay', hostTile, { timeout: 40000, polling: 250 });
  await advancing(guest.page, hostTile + ' > video'); await advancing(guest.page, hostTile + ' .camera-pip video');
  assert.equal(await guest.page.locator(hostTile + ' > video').getAttribute('data-transport'), 'relay');
  check('No modo de compatibilidade, tela e câmera chegam como dois fluxos WebM separados.');

  await guest.page.locator('#camera-button').click();
  await host.page.waitForFunction(() => [...document.querySelectorAll('.stream-tile.camera-only')].some(tile => tile.dataset.member !== 'host'), null, { polling: 250 });
  const guestTile = await host.page.evaluate(() => '.stream-tile[data-member="' + [...document.querySelectorAll('.stream-tile.camera-only')].find(tile => tile.dataset.member !== 'host').dataset.member + '"]');
  await advancing(host.page, guestTile + ' .camera-pip video');
  check('Convidada transmitindo só a câmera aparece em quadro inteiro para o host.');
  await host.page.locator('#leave-button').click();
  assert.equal(await host.page.evaluate(() => [...document.querySelectorAll('video')].some(video => video.srcObject?.getVideoTracks().some(track => track.readyState === 'live' && track.label && !track.label.startsWith('canvas')))), false);
  assert.equal(await host.page.locator('#camera-button').textContent(), 'Ligar câmera');
  check('Sair da sala desliga a câmera.');
  assert.deepEqual(errors, []);
  result.passed = true; console.log('CAMERA_TEST_PASS');
} catch (error) {
  result.error = error.message; result.errors = errors;
  for (const page of pages) console.log('DIAGNOSTIC', await page.evaluate(() => ({ notice: document.getElementById('notice').textContent, tiles: [...document.querySelectorAll('.stream-tile')].map(tile => ({ id: tile.dataset.member, cls: tile.className, videos: [...tile.querySelectorAll('video')].map(video => ({ w: video.videoWidth, t: video.currentTime, tr: video.dataset.transport })) })) })).catch(() => ({})));
  throw error;
} finally {
  await writeFile(path.join(run, 'result.json'), JSON.stringify(result, null, 2));
  for (const app of apps.reverse()) await app.close().catch(() => app.process().kill());
}
