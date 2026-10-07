import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = process.cwd(), apps = [], pages = [];
const run = path.join(root, 'test-results', 'call-' + Date.now()); await mkdir(run, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function launch(name, data = path.join(run, name), fresh = true) {
  const app = await _electron.launch({ executablePath: process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'), args: process.env.CONCORD_EXE ? [] : [root], env: { ...process.env, CONCORD_DATA_DIR: data }, timeout: 45000 }); apps.push(app);
  const page = await app.firstWindow(); pages.push(page); page.setDefaultTimeout(20000); page.on('pageerror', error => console.error('PAGE ERROR:', error.name, error.message, error.stack));
  if (fresh) {
    await page.locator('#name-picker[open]').waitFor();
    assert.ok(await page.locator('#invite-button').isDisabled(), 'convite prepara durante escolha do nome');
    const session = await page.evaluate(() => window.concord.session()); assert.equal(session.active, false, 'abertura não captura tela');
    await page.locator('#display-name').fill(name); await page.locator('#save-name').click();
  }
  await page.waitForFunction(() => document.body.dataset.connected === 'true' || document.querySelector('#connection-status')?.textContent.includes('Sala conectada'));
  await page.evaluate(() => { const PC = RTCPeerConnection; window.testPeers = []; window.RTCPeerConnection = class extends PC { constructor(...args) { super(...args); window.testPeers.push(this); } }; });
  return { app, page, data };
}
async function capture(page, color, frequency) {
  await page.locator('#audio-mode').selectOption('system');
  await page.evaluate(({ color, frequency }) => {
    navigator.mediaDevices.getDisplayMedia = async options => {
      const canvas = document.createElement('canvas'); canvas.width = options.video.width.ideal; canvas.height = options.video.height.ideal;
      const ctx = canvas.getContext('2d'); let frame = 0;
      const timer = setInterval(() => { ctx.fillStyle = color; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = 'white'; ctx.fillRect(frame++*8 % canvas.width,80,60,80); }, 33);
      const stream = canvas.captureStream(30), ac = new AudioContext(), tone = ac.createOscillator(), gain = ac.createGain(), destination = ac.createMediaStreamDestination();
      tone.frequency.value = frequency; gain.gain.value = .03; tone.connect(gain).connect(destination); tone.start();
      if (options.audio) stream.addTrack(destination.stream.getAudioTracks()[0]);
      const track = stream.getVideoTracks()[0], stop = track.stop.bind(track); let stopped = false;
      track.stop = () => { if (stopped) return; stopped = true; clearInterval(timer); tone.stop(); ac.close(); stop(); };
      return stream;
    };
  }, { color, frequency });
}
async function start(page, mode = 'auto') {
  await page.locator('#connection-mode').selectOption(mode);
  await page.locator('#choose-source').click(); await page.locator('.source-choice').first().click(); await page.locator('#start-button').click();
  await page.locator('#stop-button').waitFor();
}
async function join(page, invite) {
  await page.locator('#join-input').fill(invite); await page.locator('#join-button').click();
  await page.waitForFunction(() => document.body.dataset.connected === 'true' || document.querySelector('#connection-status')?.textContent.includes('Sala conectada'));
}
async function moving(page, expected = 1) {
  await page.waitForFunction(expected => [...document.querySelectorAll('.stream-tile video')].filter(video => video.videoWidth > 0 && video.currentTime > 0).length >= expected, expected, { timeout: 30000 });
  const first = await page.evaluate(() => [...document.querySelectorAll('.stream-tile video')].map(video => video.getVideoPlaybackQuality().totalVideoFrames));
  await sleep(1200);
  const second = await page.evaluate(() => [...document.querySelectorAll('.stream-tile video')].map(video => video.getVideoPlaybackQuality().totalVideoFrames));
  assert.ok(second.every((frames, index) => frames > first[index]), 'todas as transmissões avançam');
}
try {
  const host = await launch('Yuri'), a = await launch('Ana'), b = await launch('Bia');
  // Native photo chooser is replaced only in the test; user's files are untouched.
  const photo = path.join(run, 'photo.png'); await a.page.screenshot({ path: photo, mask: [a.page.locator('#invite-link')] });
  await a.app.evaluate(({ dialog }, file) => {
    global.testPhotoDialog = dialog.showOpenDialog; dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, photo);
  await a.page.locator('#profile-button').click(); await a.page.locator('#photo-button').click();
  await a.page.waitForFunction(() => document.querySelector('#name-avatar img')?.naturalWidth === 128);
  await a.page.locator('#save-name').click(); await a.app.evaluate(({ dialog }) => { dialog.showOpenDialog = global.testPhotoDialog; });
  if (process.env.CONCORD_TEST_TUNNEL === '1') await host.page.locator('#invite-result').waitFor({ timeout: 180000 });
  const session = await host.page.evaluate(() => window.concord.session()), invitation = session.guestInvite;
  if (process.env.CONCORD_TEST_TUNNEL === '1') { assert.ok(session.public); assert.match(invitation, /^concord:/); console.log('Convite público ficou pronto sem clique em criar'); }
  await join(a.page, invitation); await join(b.page, invitation);
  await host.page.locator('#audience-list').filter({ hasText: 'Ana' }).waitFor(); await host.page.locator('#audience-list').filter({ hasText: 'Bia' }).waitFor();
  await host.page.waitForFunction(() => document.querySelector('#audience-list img')?.naturalWidth === 128);
  console.log('Nome e foto locais chegaram à sala; 3 participantes conectados');
  await capture(host.page, '#cc3344', 440); await capture(a.page, '#338844', 660);
  await start(host.page); await moving(a.page); await moving(b.page);
  await start(a.page); await moving(host.page, 2); await moving(a.page, 2); await moving(b.page, 2);
  assert.equal(await b.page.locator('.stream-tile:not([hidden])').count(), 2);
  assert.deepEqual(await b.page.evaluate(() => [...document.querySelectorAll('.stream-tile video')].map(video => video.muted)), [false,false]);
  await b.page.locator('.stream-tile').first().click(); assert.equal(await b.page.locator('.stream-tile:not([hidden])').count(), 1);
  assert.equal(await b.page.evaluate(() => [...document.querySelectorAll('.stream-tile video')].filter(video => !video.muted).length), 1);
  await b.page.locator('.stream-tile').first().click(); assert.equal(await b.page.locator('.stream-tile:not([hidden])').count(), 2);
  assert.equal(await b.page.evaluate(() => [...document.querySelectorAll('.stream-tile video')].filter(video => !video.muted).length), 2);
  await b.page.locator('.stream-tile').first().click(); await b.page.locator('#grid-button').click();
  assert.equal(await b.page.locator('.stream-tile:not([hidden])').count(), 2);
  console.log('Duas streams simultâneas: foco por clique, segundo clique restaura grade/áudio; Ver todas preservado');
  await b.page.screenshot({ path: path.join(run, 'grid.png') });
  // Restart in compatibility to verify independent MediaSource streams.
  await host.page.locator('#stop-button').click(); await a.page.locator('#stop-button').click();
  await start(host.page, 'relay'); await start(a.page, 'relay'); await moving(b.page, 2);
  assert.equal(await b.page.locator('video[data-transport="relay"]').count(), 2);
  const levels = await b.page.evaluate(async () => {
    const context = new AudioContext(); await context.resume(); window.testAudioContext = context;
    const analysers = [...document.querySelectorAll('.stream-tile video')].map(video => { const source = context.createMediaElementSource(video), analyser = context.createAnalyser(); source.connect(analyser); analyser.connect(context.destination); return analyser; });
    await new Promise(resolve => setTimeout(resolve, 700));
    return analysers.map(analyser => { const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples); return Math.sqrt(samples.reduce((sum, value) => sum + value*value, 0) / samples.length); });
  }); assert.ok(levels.every(level => level > .002), 'áudio das duas streams decodificado');
  console.log('Áudio decodificado em ambas as streams: RMS', levels.map(level => level.toFixed(3)).join(', '));
  await capture(b.page, '#3344cc', 880); await start(b.page, 'relay'); await moving(host.page, 3); await moving(a.page, 3); await moving(b.page, 3);
  await b.page.setViewportSize({ width: 960, height: 700 });
  const layout = await b.page.evaluate(() => { const container = document.getElementById('stage').getBoundingClientRect(); return [...document.querySelectorAll('.stream-tile')].every(tile => { const box = tile.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.right <= container.right + 1 && box.bottom <= container.bottom + 1; }); }); assert.ok(layout);
  await sleep(14000); await moving(b.page, 3);
  console.log('Três streams WebM multiplexadas: grade adaptável e limpeza de buffer verificadas');
  await b.page.screenshot({ path: path.join(run, 'grid-3.png') });
  await a.page.locator('#stop-button').click(); await b.page.waitForFunction(() => document.querySelectorAll('.stream-tile').length === 2); await moving(b.page, 2);
  await host.page.evaluate(() => { window.testBufferDescriptor = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'bufferedAmount'); Object.defineProperty(WebSocket.prototype, 'bufferedAmount', { configurable: true, get: () => 40 * 1024 * 1024 }); });
  await host.page.locator('#notice').filter({ hasText: 'Seu upload não acompanhou' }).waitFor();
  assert.equal((await host.page.evaluate(() => window.concord.session())).active, false);
  await host.page.evaluate(() => Object.defineProperty(WebSocket.prototype, 'bufferedAmount', window.testBufferDescriptor));
  await moving(a.page, 1); console.log('Upload congestionado para só a própria stream; demais continuam');
  await host.page.evaluate(() => window.concord.renewInvite()); await a.page.locator('#notice').filter({ hasText: 'Convite substituído' }).waitFor(); await b.page.locator('#notice').filter({ hasText: 'Convite substituído' }).waitFor();
  await a.app.close(); apps.splice(apps.indexOf(a.app),1); pages.splice(pages.indexOf(a.page),1);
  const reopened = await launch('Ana', a.data, false); assert.equal(await reopened.page.locator('#name-picker[open]').count(), 0); assert.equal(await reopened.page.locator('#profile-name').textContent(), 'Ana');
  const profile = await reopened.page.evaluate(async () => (await window.concord.bootstrap()).profile); assert.ok(profile.photo.startsWith('data:image/jpeg;base64,'));
  console.log('Nome/foto persistiram após reabrir; revogação removeu todos');
  console.log('CALL_TEST_PASS');
} catch (error) {
  for (const page of pages) {
    const diagnostic = await page.evaluate(async () => {
      const peers = [];
      for (const pc of window.testPeers) {
        const stats = [...(await pc.getStats()).values()].filter(s => ['inbound-rtp','outbound-rtp'].includes(s.type));
        peers.push({ state: pc.connectionState, signaling: pc.signalingState, senders: pc.getSenders().map(s => s.track?.kind), counts: stats.map(s => ({ type: s.type, kind: s.kind, bytes: s.bytesReceived || s.bytesSent, frames: s.framesDecoded || s.framesEncoded })) });
      }
      return { notice: document.getElementById('notice').textContent, videos: [...document.querySelectorAll('.stream-tile video')].map(v => ({ id: v.dataset.publisher, width: v.videoWidth, time: v.currentTime, tracks: v.srcObject?.getTracks().map(t => ({ kind: t.kind, muted: t.muted, ready: t.readyState })), transport: v.dataset.transport })), peers };
    }).catch(() => ({}));
    console.log('DIAGNOSTIC', JSON.stringify(diagnostic));
  }
  throw error;
} finally {
  for (const page of pages) await page.evaluate(() => { const stop = document.getElementById('stop-button'); if (stop && !stop.hidden) stop.click(); }).catch(() => {});
  for (const app of apps.reverse()) await app.close().catch(() => app.process().kill());
}
