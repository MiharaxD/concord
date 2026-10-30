import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { _electron } from 'playwright';
import { QUALITY_PRESETS } from '../public/stream-settings.js';
import { webInvite } from '../public/invites.js';
const closeShare = page => page.evaluate(() => { const dialog = document.getElementById('share-dialog'); if (dialog?.open) dialog.close(); });
const openShare = page => page.evaluate(() => { const dialog = document.getElementById('share-dialog'); if (dialog && !dialog.open) dialog.showModal(); });

const root = process.cwd(), run = path.join(root, 'test-results', 'experience-' + Date.now()), apps = [];
await mkdir(run, { recursive: true });
const executablePath = process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe');
const result = { executablePath, checks: [], passed: false }, errors = [];
const sampleInvite = 'concord:teste-concord:abcdefghijklmnopqrstuv';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function launch(name, { data = path.join(run, name), invite, fresh = true } = {}) {
  const app = await _electron.launch({ executablePath, args: [...(process.env.CONCORD_EXE ? [] : [root]), '--use-fake-device-for-media-stream', ...(invite ? [invite] : [])],
    env: { ...process.env, CONCORD_DATA_DIR: data }, timeout: 45000 }); apps.push(app);
  const page = await app.firstWindow(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
  if (fresh) { await page.locator('#display-name').fill(name); await page.locator('#save-name').click(); }
  await page.waitForFunction(() => document.body.dataset.connected === 'false');
  await page.evaluate(() => {
    const Original = WebSocket; window.testSockets = [];
    window.WebSocket = class extends Original { constructor(...args) { super(...args); window.testSockets.push(this); } };
    const PC = RTCPeerConnection; window.testPeers = [];
    window.RTCPeerConnection = class extends PC { constructor(...args) { super(...args); window.testPeers.push(this); } };
  });
  return { app, page, data };
}
async function create(page) {
  await page.locator('#create-room').click(); await page.waitForFunction(() => document.body.dataset.connected === 'true');
  assert.equal((await page.evaluate(() => window.concord.session())).active, false);
}
async function synthetic(page, color) {
  await page.evaluate(color => {
    window.testCaptureRequests = []; window.testCaptures = [];
    navigator.mediaDevices.getDisplayMedia = async options => {
      window.testCaptureRequests.push(options);
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const context = canvas.getContext('2d'); let frame = 0;
      const timer = setInterval(() => { context.fillStyle = color; context.fillRect(0, 0, 1280, 720); context.fillStyle = 'white'; context.fillRect(frame++ * 9 % 1280, 50, 100, 100); }, 33);
      const stream = canvas.captureStream(30), audio = new AudioContext(), tone = audio.createOscillator(), gain = audio.createGain(), output = audio.createMediaStreamDestination();
      gain.gain.value = .04; tone.frequency.value = 440; tone.connect(gain).connect(output); tone.start(); await audio.resume();
      if (options.audio) stream.addTrack(output.stream.getAudioTracks()[0]);
      const track = stream.getVideoTracks()[0], stop = track.stop.bind(track); let stopped = false;
      track.stop = () => { if (stopped) return; stopped = true; clearInterval(timer); tone.stop(); void audio.close(); stop(); };
      window.testCaptures.push(stream); return stream;
    };
  }, color);
}
async function start(page) {
  await openShare(page); await page.locator('#choose-source').click(); await page.locator('.source-choice').first().click();
  await openShare(page); await page.locator('#start-button').click(); await page.locator('#bar-screen[aria-pressed="true"]').waitFor();
}
async function moving(page, count) {
  await page.waitForFunction(count => [...document.querySelectorAll('.stream-tile video')].filter(video => video.videoWidth > 0 && video.currentTime > 0).length === count, count, { timeout: 30000 });
  const before = await page.evaluate(() => [...document.querySelectorAll('.stream-tile video')].map(v => v.getVideoPlaybackQuality().totalVideoFrames));
  await pause(1300);
  const after = await page.evaluate(() => [...document.querySelectorAll('.stream-tile video')].map(v => v.getVideoPlaybackQuality().totalVideoFrames));
  assert.ok(after.every((value, index) => value > before[index]), 'quadros avançam em todas as telas'); return { before, after };
}
async function close(app) { const child = app.process(); await app.close().catch(() => child.kill()); apps.splice(apps.indexOf(app), 1); }
try {
  const host = await launch('Dona'), guest = await launch('Amigo');
  result.version = (await host.page.evaluate(() => window.concord.bootstrap())).version;
  const files = ['desktop/main.cjs', 'desktop/preload.cjs', 'desktop/preferences.cjs', 'public/index.html', 'public/app.js', 'public/audio-meter.js', 'public/style.css', 'public/room-media.js', 'public/invites.js', 'server.mjs'];
  const packaged = await host.app.evaluate(({ app }, files) => {
    const fs = process.getBuiltinModule('fs'), path = process.getBuiltinModule('path');
    return Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(app.getAppPath(), file), 'utf8')]));
  }, files);
  for (const file of files) assert.equal(packaged[file].replaceAll('\r\n', '\n'), (await readFile(path.join(root, file), 'utf8')).replaceAll('\r\n', '\n'), 'fonte empacotado corresponde: ' + file);
  assert.equal(await host.page.locator('#home-view').isVisible(), true);
  assert.equal((await host.page.evaluate(() => window.concord.session())).active, false);
  assert.equal(await host.page.evaluate(() => window.testSockets.length), 0);
  await host.page.screenshot({ path: path.join(run, 'painel.png') });
  await create(host.page); assert.equal(await host.page.locator('#connection-mode').count(), 0);
  assert.equal(await host.page.locator('#advanced-options').getAttribute('open'), null);
  // 0.6.0+: the P2P link is ready on create; Fechar acesso hides it until Gerar novo convite.
  await host.page.waitForFunction(() => document.querySelector('#invite-link').value.startsWith('concord:p2p:'));
  const firstCode = await host.page.locator('#invite-link').inputValue();
  await host.page.locator('.invite-manage summary').click(); await host.page.locator('#close-invite').click();
  await host.page.locator('#invite-status').filter({ hasText: 'Acesso fechado' }).waitFor();
  assert.equal(await host.page.locator('#invite-result').isHidden(), true);
  await host.page.locator('#invite-button').click();
  await host.page.waitForFunction(old => { const value = document.querySelector('#invite-link').value; return value.startsWith('concord:p2p:') && value !== old; }, firstCode);
  assert.equal(await host.page.locator('#choose-source').isEnabled(), true);
  for (const [key, preset] of Object.entries(QUALITY_PRESETS)) {
    const [resolution, fps] = key.split(':');
    await openShare(host.page); await host.page.locator('#quality').selectOption(resolution); await openShare(host.page); await host.page.locator('#fps').selectOption(fps);
    assert.match(await host.page.locator('#bitrate-mode option').first().textContent(), new RegExp(`${preset.bitrate / 1e6} Mbps`));
  }
  await host.app.evaluate(({ clipboard }) => { clipboard.writeText = text => { global.testCopied = text; }; });
  const p2pCode = await host.page.locator('#invite-link').inputValue();
  await closeShare(host.page);
  await host.page.locator('#copy-link-button').click(); assert.equal(await host.app.evaluate(() => global.testCopied), webInvite(p2pCode));
  result.checks.push('Painel sem captura, criar sala, oito combinações resolução/FPS, convite P2P imediato, fechar acesso/gerar novo convite e cópia do link');

  await openShare(host.page); await host.page.locator('#advanced-options summary').click(); await openShare(host.page); await host.page.locator('#quality').selectOption('1440'); await openShare(host.page); await host.page.locator('#fps').selectOption('60');
  await openShare(host.page); await host.page.locator('#bitrate-mode').selectOption('manual'); await openShare(host.page); await host.page.locator('#bitrate-value').fill('11.5');
  await openShare(host.page); await host.page.locator('#advanced-options').evaluate(details => { details.open = true; }); await openShare(host.page); await host.page.locator('#audio-mode').selectOption('system');
  await closeShare(host.page);
  const png = await host.page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; canvas.getContext('2d').fillRect(0, 0, 64, 64); return canvas.toDataURL('image/png'); });
  const photo = path.join(run, 'photo.png'); await writeFile(photo, Buffer.from(png.split(',')[1], 'base64'));
  await host.app.evaluate(({ dialog }, photo) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [photo] }); }, photo);
  await host.page.locator('#profile-button').click(); await host.page.locator('#photo-menu-button').click(); await host.page.locator('#photo-button').click(); await host.page.locator('#save-name').click();

  await guest.page.locator('#join-room').click(); await guest.page.locator('#join-input').fill('errado'); await guest.page.locator('#join-button').click();
  await guest.page.locator('#join-error').filter({ hasText: 'convite' }).waitFor(); assert.equal(await guest.page.evaluate(() => window.testSockets.length), 0);
  const invite = (await host.page.evaluate(() => window.concord.session())).guestInvite;
  const wrong = invite.slice(0, -1) + (invite.endsWith('a') ? 'b' : 'a');
  await guest.page.locator('#join-input').fill(wrong); await guest.page.locator('#join-button').click();
  await guest.page.locator('#join-error').filter({ hasText: /[Cc]onvite|[Aa]cesso/ }).waitFor();
  assert.equal(await guest.page.locator('#join-picker').isVisible(), true);
  await guest.page.keyboard.press('Escape'); await guest.page.locator('#join-picker').waitFor({ state: 'hidden' });
  await guest.page.locator('#join-room').click(); await guest.page.locator('#join-input').fill(invite); await guest.page.locator('#join-button').click();
  await host.page.locator('#audience-list').filter({ hasText: 'Amigo' }).waitFor();
  await guest.page.waitForFunction(() => document.querySelector('#audience-list img')?.naturalWidth === 128);
  await openShare(guest.page); await guest.page.locator('#advanced-options').evaluate(details => { details.open = true; }); await openShare(guest.page); await guest.page.locator('#audio-mode').selectOption('system');
  await closeShare(guest.page);
  await synthetic(host.page, '#493876'); await synthetic(guest.page, '#236b56');
  await start(host.page); await moving(guest.page, 1); await start(guest.page);
  result.directFrames = await moving(host.page, 2); await moving(guest.page, 2);
  assert.ok(await guest.page.evaluate(() => [...document.querySelectorAll('.stream-tile video')].every(video => video.muted === (video.id === 'screen-video'))), 'grade mantém recebidos audíveis e prévia própria muda');
  result.remoteAudioRms = await guest.page.evaluate(async () => {
    const video = [...document.querySelectorAll('.stream-tile video')].find(video => video.id !== 'screen-video');
    const context = new AudioContext(), analyser = context.createAnalyser(), silent = context.createGain();
    silent.gain.value = 0; context.createMediaStreamSource(video.srcObject).connect(analyser).connect(silent).connect(context.destination); await context.resume();
    await new Promise(resolve => setTimeout(resolve, 700));
    const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples); await context.close();
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  });
  assert.ok(result.remoteAudioRms > .002, 'som recebido continua decodificando na grade');
  await guest.page.locator('.stream-tile:has(#screen-video)').click();
  assert.ok(await guest.page.evaluate(() => [...document.querySelectorAll('.stream-tile video')].every(video => video.muted)), 'focar própria prévia silencia recebidos');
  await guest.page.keyboard.press('Escape');
  await host.page.waitForFunction(() => document.querySelector('#audio-level').value > 1);
  const requested = await host.page.evaluate(() => window.testCaptureRequests[0]);
  assert.equal(requested.video.height.ideal, 1440); assert.equal(requested.video.frameRate.ideal, 60);
  const sender = await host.page.evaluate(async () => {
    const pc = window.testPeers.at(-1); return pc.getSenders().find(s => s.track?.kind === 'video').getParameters().encodings[0];
  });
  assert.equal(sender.maxBitrate, 11500000); assert.equal(sender.maxFramerate, 60);
  const idsBefore = await host.page.evaluate(() => ({ count: window.testSockets.length, tracks: window.testCaptures[0].getTracks().map(t => t.id) }));
  await host.page.locator('#host-tab').click(); await host.page.locator('#host-tab').click();
  assert.deepEqual(await host.page.evaluate(() => ({ count: window.testSockets.length, tracks: window.testCaptures[0].getTracks().map(t => t.id) })), idsBefore);
  await guest.page.locator('.stream-tile').first().click(); assert.equal(await guest.page.locator('.stream-tile:not([hidden])').count(), 1);
  await guest.page.locator('.stream-tile:not([hidden])').click(); assert.equal(await guest.page.locator('.stream-tile:not([hidden])').count(), 2);
  await guest.page.locator('.stream-tile').first().click(); await guest.page.keyboard.press('Escape'); assert.equal(await guest.page.locator('.stream-tile:not([hidden])').count(), 2);
  await guest.page.locator('#sound-button').focus(); await guest.page.keyboard.press('m');
  assert.equal(await guest.page.locator('#sound-button').textContent(), 'Ativar som'); await guest.page.keyboard.press('m');
  await guest.page.keyboard.press('f'); await guest.page.waitForFunction(() => Boolean(document.fullscreenElement));
  await guest.page.evaluate(() => document.activeElement.blur()); await guest.page.keyboard.press('f'); await guest.page.waitForFunction(() => !document.fullscreenElement);
  await guest.page.locator('#join-room-nav').click(); await guest.page.locator('#join-input').fill('mf');
  await guest.page.keyboard.press('m'); await guest.page.keyboard.press('f');
  assert.equal(await guest.page.locator('#join-input').inputValue(), 'mfmf'); assert.equal(await guest.page.locator('#sound-button').textContent(), 'Silenciar');
  await guest.page.locator('#cancel-join').click();
  await guest.page.setViewportSize({ width: 960, height: 700 });
  assert.ok(await guest.page.evaluate(() => {
    const bounds = document.querySelector('#stage').getBoundingClientRect();
    return [...document.querySelectorAll('.stream-tile')].every(tile => { const box = tile.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.left >= bounds.left && box.top >= bounds.top && box.right <= bounds.right + 1 && box.bottom <= bounds.bottom + 1; });
  }), 'grade menor mantém todas as telas dentro da área');
  await guest.page.screenshot({ path: path.join(run, 'grade-menor.png') });
  await guest.page.setViewportSize({ width: 1280, height: 811 });
  await guest.page.screenshot({ path: path.join(run, 'grade.png') });
  result.checks.push('Duas streams com quadros em movimento, nome/foto, captura explícita, bitrate/FPS no encoder, medidor, clique/foco/grade e atalhos M/F/Esc sem agir na digitação');

  // Simulate a Windows second launch: same profile/executable and protocol argument.
  const child = spawn(executablePath, [...(process.env.CONCORD_EXE ? [] : [root]), sampleInvite], { env: { ...process.env, CONCORD_DATA_DIR: host.data }, windowsHide: true, stdio: 'ignore' });
  await host.page.locator('#join-picker[open]').waitFor(); assert.equal(await host.page.locator('#join-input').inputValue(), sampleInvite);
  assert.equal((await host.page.evaluate(() => window.concord.session())).active, true, 'abrir convite não interrompe captura nem entra sozinho');
  await host.page.locator('#cancel-join').click(); if (child.exitCode === null) await once(child, 'exit');
  result.checks.push('Link em segunda instância preenche convite e pede confirmação sem interromper sala/captura');

  await openShare(guest.page); await guest.page.locator('#stop-button').click();
  await guest.page.evaluate(() => { const pc = window.testPeers.at(-1); Object.defineProperty(pc, 'connectionState', { configurable: true, value: 'failed' }); pc.dispatchEvent(new Event('connectionstatechange')); });
  await guest.page.locator('#room-status').filter({ hasText: 'modo de compatibilidade' }).waitFor();
  await guest.page.waitForFunction(() => document.querySelector('video[data-transport="relay"]')?.videoWidth > 0, null, { timeout: 30000 });
  result.relayFrames = await moving(guest.page, 1);
  await openShare(host.page); await host.page.locator('#stop-button').click(); assert.equal(await host.page.locator('#audio-level').evaluate(el => el.value), 0);
  await host.page.waitForFunction(() => document.querySelector('#room-status').hidden);
  await guest.page.evaluate(() => window.testSockets.at(-1).close());
  await guest.page.locator('#room-status').filter({ hasText: 'Tentando voltar' }).waitFor();
  await guest.page.waitForFunction(() => document.body.dataset.connected === 'true');
  result.checks.push('Fallback automático sem seletor com novos quadros e aviso; reconexão com mensagem curta');

  // Native WASAPI + Worklet meter before streaming, explicitly selected app only.
  await host.page.evaluate(() => {
    document.title = 'Jogo QA Concord'; const audio = new AudioContext(), tone = audio.createOscillator(), gain = audio.createGain();
    gain.gain.value = .04; tone.connect(gain).connect(audio.destination); tone.start(); window.testPhysicalTone = audio;
  });
  // Automatic audio: a window shares only that app; a whole screen (listed first) shares the whole PC.
  await openShare(host.page); await host.page.locator('#advanced-options').evaluate(details => { details.open = true; }); await openShare(host.page); await host.page.locator('#audio-mode').selectOption('auto');
  await openShare(host.page); await host.page.locator('#choose-source').click(); await host.page.locator('.source-choice').filter({ hasText: 'Jogo QA Concord' }).click();
  await host.page.locator('#audio-summary').filter({ hasText: 'Som de Jogo QA Concord' }).waitFor();
  assert.equal(await host.page.locator('#test-audio').isVisible(), true); assert.equal(await host.page.locator('#choose-audio-source').isHidden(), true);
  await openShare(host.page); await host.page.locator('#choose-source').click(); await host.page.locator('.source-choice').first().click();
  await host.page.locator('#audio-summary').filter({ hasText: 'Som de todo o computador' }).waitFor(); assert.equal(await host.page.locator('#test-audio').isHidden(), true);
  result.checks.push('Áudio automático: janela usa só o som do app; tela inteira usa o som do computador');
  await openShare(host.page); await host.page.locator('#audio-mode').selectOption('application'); await openShare(host.page); await host.page.locator('#choose-audio-source').click();
  await host.page.locator('.source-choice').filter({ hasText: 'Jogo QA Concord' }).click();
  assert.equal(await host.page.locator('#audio-level').evaluate(el => el.value), 0, 'selecionar fonte não inicia teste');
  await openShare(host.page); await host.page.locator('#test-audio').click(); await host.page.waitForFunction(() => document.querySelector('#audio-level').value > 1);
  assert.equal((await host.page.evaluate(() => window.concord.session())).active, false);
  await openShare(host.page); await host.page.locator('#test-audio').click(); assert.equal(await host.page.locator('#audio-level').evaluate(el => el.value), 0);
  await openShare(host.page); await host.page.locator('#test-audio').click(); await openShare(host.page); await host.page.locator('#test-audio').click();
  await pause(300); assert.equal(await host.page.locator('#audio-level').evaluate(el => el.value), 0);
  await openShare(host.page); await host.page.locator('#test-audio').click(); await host.page.waitForFunction(() => document.querySelector('#audio-level').value > 1);
  await openShare(host.page); await host.page.locator('#advanced-options').evaluate(details => { details.open = true; }); await openShare(host.page); await host.page.locator('#audio-mode').selectOption('system'); assert.equal(await host.page.locator('#audio-level').evaluate(el => el.value), 0);
  await closeShare(host.page);
  await host.page.evaluate(() => window.testPhysicalTone.close());
  result.checks.push('Medidor real via WASAPI/Worklet antes da transmissão somente após Testar áudio; parar/trocar modo libera captura');
  await host.page.screenshot({ path: path.join(run, 'sala.png') });

  await close(host.app);
  const reopened = await launch('Dona', { data: host.data, fresh: false, invite: sampleInvite });
  await reopened.page.locator('#join-picker[open]').waitFor(); assert.equal(await reopened.page.locator('#join-input').inputValue(), sampleInvite);
  assert.equal(await reopened.page.evaluate(() => window.testSockets.length), 0);
  await reopened.page.locator('#cancel-join').click(); await create(reopened.page);
  assert.deepEqual(await reopened.page.evaluate(() => ({ q: document.querySelector('#quality').value, f: document.querySelector('#fps').value, b: document.querySelector('#bitrate-mode').value, n: document.querySelector('#bitrate-value').value, a: document.querySelector('#audio-mode').value })),
    { q: '1440', f: '60', b: 'manual', n: '11.5', a: 'system' });
  assert.equal(await reopened.page.locator('#source-name').textContent(), 'Escolher tela ou janela');
  assert.equal((await reopened.page.evaluate(() => window.concord.session())).active, false);
  assert.ok((await reopened.page.evaluate(() => window.concord.bootstrap())).profile.photo.startsWith('data:image/jpeg;base64,'));
  const saved = JSON.parse(await readFile(path.join(host.data, 'preferences.json'), 'utf8')); assert.equal(saved.resolution, '1440'); assert.equal(saved.fps, '60'); assert.equal('source' in saved, false);
  // Final native capture of this QA window only, without user's desktop/audio.
  await reopened.page.evaluate(() => { document.title = 'Janela de captura QA'; });
  await openShare(reopened.page); await reopened.page.locator('#system-audio').uncheck(); await openShare(reopened.page); await reopened.page.locator('#quality').selectOption('720'); await openShare(reopened.page); await reopened.page.locator('#fps').selectOption('30');
  await openShare(reopened.page); await reopened.page.locator('#choose-source').click(); await reopened.page.locator('.source-choice').filter({ hasText: 'Janela de captura QA' }).click();
  await openShare(reopened.page); await reopened.page.locator('#start-button').click(); await moving(reopened.page, 1);
  assert.equal((await reopened.page.evaluate(() => window.concord.session())).active, true);
  await reopened.page.evaluate(() => { window.testNativeTrack = document.querySelector('.stream-tile video').srcObject.getVideoTracks()[0]; });
  await openShare(reopened.page); await reopened.page.locator('#stop-button').click(); assert.equal(await reopened.page.evaluate(() => window.testNativeTrack.readyState), 'ended');
  await reopened.page.locator('#leave-button').click(); assert.equal(await reopened.page.locator('#home-view').isVisible(), true);
  result.checks.push('Link em abertura fria pede confirmação; preferências/nome/foto persistem, sem restaurar janela/captura; sair volta ao Painel');
  result.checks.push('Captura nativa da própria janela QA reproduziu novos quadros e liberou a track ao encerrar');
  assert.deepEqual(errors, []); result.passed = true; console.log('EXPERIENCE_PASS', JSON.stringify(result));
} catch (error) {
  result.error = error.message; result.pageErrors = errors;
  for (const [index, app] of apps.entries()) for (const page of app.windows()) {
    await page.screenshot({ path: path.join(run, 'failure-' + index + '.png') }).catch(() => {});
    console.log('DIAGNOSTIC', await page.evaluate(() => ({ view: document.body.dataset.view, connected: document.body.dataset.connected,
      notice: document.querySelector('#notice').textContent, join: document.querySelector('#join-error').textContent,
      videos: [...document.querySelectorAll('.stream-tile video')].map(v => ({ width: v.videoWidth, time: v.currentTime, route: v.dataset.transport })) })).catch(() => null));
  }
  throw error;
} finally {
  for (const app of [...apps].reverse()) await close(app);
  await writeFile(path.join(run, 'result.json'), JSON.stringify(result, null, 2)); console.log('Evidência:', run);
}
