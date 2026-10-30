import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { _electron } from 'playwright';
const openShare = page => page.evaluate(() => { const dialog = document.getElementById('share-dialog'); if (dialog && !dialog.open) dialog.showModal(); });

const root = process.cwd(), apps = [], errors = [];
const run = path.join(root, 'test-results', 'member-profile-' + Date.now());
await mkdir(run, { recursive: true });
const result = { executable: process.env.CONCORD_EXE || 'development', checks: [], passed: false };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function launch(name) {
  const data = path.join(run, name);
  // Unrelated UI/media checks must not provision real public tunnels on every run.
  await mkdir(path.join(data, 'tunnel'), { recursive: true });
  await writeFile(path.join(data, 'tunnel/invite-retry.json'), JSON.stringify({ code: 'RATE_LIMIT', failures: 1, retryAt: Date.now() + 300000 }));
  const app = await _electron.launch({
    executablePath: process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: [...(process.env.CONCORD_EXE ? [] : [root]), '--mute-audio', '--use-fake-device-for-media-stream'], env: { ...process.env, CONCORD_DATA_DIR: data }, timeout: 45000
  });
  apps.push(app);
  const page = await app.firstWindow(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#name-picker[open]').waitFor();
  await page.evaluate(() => {
    const Original = WebSocket; window.profileSockets = [];
    window.WebSocket = class extends Original { constructor(...args) { super(...args); window.profileSockets.push(this); } };
  });
  await page.locator('#display-name').fill(name); await page.locator('#save-name').click();
  await page.locator('#create-room').click();
  await page.waitForFunction(() => document.body.dataset.connected === 'true');
  // 0.6.0+: creating a room never provisions a tunnel; the P2P link is ready at once.
  await page.waitForFunction(() => document.querySelector('#invite-link').value.startsWith('concord:p2p:'));
  return { app, page, data };
}
async function start(page, color) {
  await openShare(page); await page.locator('#advanced-options').evaluate(details => { details.open = true; }); await openShare(page); await page.locator('#audio-mode').selectOption('system');
  await openShare(page); await page.locator('#quality').selectOption('720'); await openShare(page); await page.locator('#fps').selectOption('30');
  // Both clients transmit generated moving video/tone, never the user's screen/audio.
  await page.evaluate(color => {
    navigator.mediaDevices.getDisplayMedia = async options => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const drawing = canvas.getContext('2d'); let frame = 0;
      const timer = setInterval(() => {
        drawing.fillStyle = color; drawing.fillRect(0, 0, 640, 360);
        drawing.fillStyle = 'white'; drawing.fillRect(frame++ * 8 % 640, 70, 60, 80);
      }, 33);
      const stream = canvas.captureStream(30), context = new AudioContext();
      const tone = context.createOscillator(), gain = context.createGain(), output = context.createMediaStreamDestination();
      gain.gain.value = .04; tone.connect(gain).connect(output); tone.start(); await context.resume();
      if (options.audio) stream.addTrack(output.stream.getAudioTracks()[0]);
      const track = stream.getVideoTracks()[0], stop = track.stop.bind(track); let stopped = false;
      track.stop = () => { if (stopped) return; stopped = true; clearInterval(timer); tone.stop(); void context.close(); stop(); };
      window.profileCapture = stream; return stream;
    };
  }, color);
  await openShare(page); await page.locator('#choose-source').click(); await page.locator('.source-choice').first().click();
  await openShare(page); await page.locator('#start-button').click(); await page.locator('#bar-screen[aria-pressed="true"]').waitFor();
}
async function frames(page, count) {
  await page.waitForFunction(count => [...document.querySelectorAll('.stream-tile video')].filter(v => v.videoWidth > 0 && v.currentTime > 0).length === count, count, { timeout: 30000 });
  const before = await page.evaluate(() => [...document.querySelectorAll('.stream-tile video')].map(v => v.getVideoPlaybackQuality().totalVideoFrames));
  await pause(1000);
  const after = await page.evaluate(() => [...document.querySelectorAll('.stream-tile video')].map(v => v.getVideoPlaybackQuality().totalVideoFrames));
  assert.ok(after.every((v, i) => v > before[i]), 'todas as transmissões continuam recebendo quadros');
  return { before, after };
}
async function audioRms(page) {
  return page.evaluate(async () => {
    const video = [...document.querySelectorAll('.stream-tile video')].find(v => v.id !== 'screen-video');
    assertAudible();
    function assertAudible() { if (video.muted || video.paused) throw new Error('Stream recebida muda/pausada'); }
    const context = new AudioContext(), analyser = context.createAnalyser(), silence = context.createGain();
    silence.gain.value = 0; context.createMediaStreamSource(video.srcObject).connect(analyser).connect(silence).connect(context.destination);
    await context.resume(); await new Promise(resolve => setTimeout(resolve, 700));
    const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples); await context.close();
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  });
}
async function remember(page) {
  await page.evaluate(() => {
    window.profileBefore = {
      sockets: [...window.profileSockets], capture: window.profileCapture,
      tiles: [...document.querySelectorAll('.stream-tile')].map(tile => {
        const video = tile.querySelector('video');
        return { tile, video, stream: video.srcObject, pressed: tile.getAttribute('aria-pressed'), hidden: tile.hidden, muted: video.muted, volume: video.volume };
      }), sound: document.querySelector('#sound-button').textContent, fullscreen: document.fullscreenElement
    };
  });
}
async function preserved(page) {
  assert.deepEqual(await page.evaluate(() => {
    const previous = window.profileBefore;
    return {
      connection: document.body.dataset.connected === 'true' && previous.sockets.length === window.profileSockets.length && previous.sockets.every((s, i) => s === window.profileSockets[i]) && previous.sockets.at(-1).readyState === WebSocket.OPEN,
      capture: previous.capture === window.profileCapture && previous.capture.getTracks().every(t => t.readyState === 'live') && !document.querySelector('#stop-button').hidden,
      streams: previous.tiles.every(item => item.tile.isConnected && item.tile.querySelector('video') === item.video && item.video.srcObject === item.stream),
      focus: previous.tiles.every(item => item.tile.hidden === item.hidden && item.tile.getAttribute('aria-pressed') === item.pressed),
      audio: previous.tiles.every(item => item.video.muted === item.muted && item.video.volume === item.volume) && document.querySelector('#sound-button').textContent === previous.sound,
      fullscreen: document.fullscreenElement === previous.fullscreen
    };
  }), { connection: true, capture: true, streams: true, focus: true, audio: true, fullscreen: true });
}
async function closed(page) {
  await page.waitForFunction(() => !document.querySelector('#member-profile').open);
  assert.equal(await page.locator('#member-profile-name').textContent(), '');
  assert.equal(await page.locator('#member-profile-photo').locator('*').count(), 0);
  assert.equal(await page.locator('.audience-person[aria-expanded="true"]').count(), 0);
}

try {
  const host = await launch('Dona'), guest = await launch('Amigo');
  result.version = (await host.page.evaluate(() => window.concord.bootstrap())).version;
  const files = ['public/index.html', 'public/app.js', 'public/style.css'];
  const packaged = await host.app.evaluate(({ app }, files) => {
    const fs = process.getBuiltinModule('fs'), path = process.getBuiltinModule('path');
    return Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(app.getAppPath(), file), 'utf8')]));
  }, files);
  for (const file of files) assert.equal(packaged[file].replaceAll('\r\n', '\n'), (await readFile(path.join(root, file), 'utf8')).replaceAll('\r\n', '\n'), 'fonte no executável: ' + file);

  const png = await host.page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const drawing = canvas.getContext('2d'); drawing.fillStyle = '#7262ac'; drawing.fillRect(0, 0, 128, 128);
    drawing.fillStyle = 'white'; drawing.font = 'bold 55px sans-serif'; drawing.fillText('D', 43, 84); return canvas.toDataURL('image/png');
  });
  const photo = path.join(run, 'photo.png'); await writeFile(photo, Buffer.from(png.split(',')[1], 'base64'));
  await host.app.evaluate(({ dialog }, photo) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [photo] }); }, photo);
  await host.page.locator('#profile-button').click(); await host.page.locator('#photo-menu-button').click(); await host.page.locator('#photo-button').click(); await host.page.locator('#save-name').click();
  const originalProfile = await readFile(path.join(host.data, 'profile.json'), 'utf8');
  const invite = (await host.page.evaluate(() => window.concord.session())).guestInvite;
  await guest.page.locator('#join-room-nav').click(); await guest.page.locator('#join-input').fill(invite); await guest.page.locator('#join-button').click();
  await host.page.locator('#audience-list').filter({ hasText: 'Amigo' }).waitFor();
  await guest.page.locator('#audience-list img').waitFor();
  await start(host.page, '#493876'); await frames(guest.page, 1); await start(guest.page, '#236b56');
  result.gridFrames = await frames(host.page, 2); await frames(guest.page, 2);
  await host.page.locator('.stream-tile:not(:has(#screen-video))').click();
  await host.page.locator('#volume').fill('0.45');
  await remember(host.page); await remember(guest.page);
  const row = host.page.locator('.audience-person');
  await row.locator('.audience-name').click();
  await host.page.locator('#member-profile[open]').waitFor();
  assert.equal(await host.page.locator('#member-profile-name').textContent(), 'Amigo');
  assert.equal(await host.page.locator('#member-profile-photo .avatar').textContent(), 'AM');
  assert.equal(await host.page.locator('#member-profile-photo img').count(), 0);
  assert.equal(await host.page.locator('#member-profile').innerText(), '×\nAM\nAmigo');
  assert.equal(await host.page.locator('#close-member-profile').evaluate(el => el === document.activeElement), true);
  await host.page.locator('#member-profile').evaluate(dialog => Promise.all(dialog.getAnimations().map(animation => animation.finished)));
  const layout = await host.page.evaluate(() => {
    const banner = document.querySelector('.member-profile-banner').getBoundingClientRect(), avatar = document.querySelector('.member-card-avatar').getBoundingClientRect();
    return { overlaps: avatar.top < banner.bottom && avatar.bottom > banner.bottom, visible: avatar.width === 88, cardWidth: document.querySelector('#member-profile').getBoundingClientRect().width };
  });
  assert.ok(layout.overlaps && layout.visible); result.layout = layout;
  await host.page.screenshot({ path: path.join(run, 'iniciais-em-foco.png') });
  result.openFrames = await frames(host.page, 2); await preserved(host.page); await preserved(guest.page);
  result.openAudioRms = await audioRms(host.page); assert.ok(result.openAudioRms > .002);
  await host.page.keyboard.press('m'); await host.page.keyboard.press('f'); await preserved(host.page);
  await host.page.locator('#close-member-profile').click(); await closed(host.page); await preserved(host.page);
  assert.equal(await row.evaluate(el => el === document.activeElement), true);
  await row.locator('.avatar').click(); await host.page.mouse.click(5, 5); await closed(host.page); await preserved(host.page);
  // An inside click does not dismiss; Escape must close the card without triggering the grid shortcut.
  await row.focus(); await host.page.keyboard.press('Enter');
  await host.page.locator('#member-profile-name').click(); assert.equal(await host.page.locator('#member-profile').evaluate(el => el.open), true);
  await host.page.keyboard.press('Escape'); await closed(host.page); await preserved(host.page);
  await row.focus(); await host.page.keyboard.press('Space'); await host.page.keyboard.press('Tab');
  // Tab goes from Fechar to the person's volume and stays inside the card.
  assert.equal(await host.page.locator('#member-profile').evaluate(el => el.contains(document.activeElement) && document.activeElement.id === 'member-volume'), true, 'Tab permanece no modal');
  await host.page.keyboard.press('Shift+Tab'); await host.page.keyboard.press('Space'); await closed(host.page); await preserved(host.page);
  result.checks.push('Nome/avatar/Enter/Espaço abrem; botão/clique fora/Esc fecham; Tab contido e foco devolvido; Esc/M/F não afetam chamada');

  await guest.page.locator('.audience-person img').click();
  await guest.page.waitForFunction(() => document.querySelector('#member-profile-photo img')?.naturalWidth === 128);
  assert.equal(await guest.page.locator('#member-profile-name').textContent(), 'Dona');
  assert.equal(await guest.page.locator('#member-profile-photo img').getAttribute('src'), (await host.page.evaluate(() => window.concord.bootstrap())).profile.photo);
  await guest.page.screenshot({ path: path.join(run, 'foto-na-grade.png') });
  await preserved(guest.page); await guest.page.keyboard.press('Escape'); await closed(guest.page);
  assert.equal(await readFile(path.join(host.data, 'profile.json'), 'utf8'), originalProfile, 'consultar perfil não altera dados salvos');
  result.checks.push('Cartão exibe só nome/foto JPEG já compartilhada ou as mesmas iniciais; consulta não grava perfil');

  await row.click();
  await guest.page.locator('#profile-button').click(); await guest.page.locator('#display-name').fill('Amiga <QA>'); await guest.page.locator('#save-name').click();
  await host.page.locator('#member-profile-name').filter({ hasText: 'Amiga <QA>' }).waitFor();
  assert.equal(await host.page.locator('#member-profile-name').locator('*').count(), 0, 'nome é texto, sem interpretar HTML');
  assert.equal(await host.page.locator('#close-member-profile').evaluate(el => el === document.activeElement), true);
  await host.page.keyboard.press('Escape'); await closed(host.page);
  assert.equal(await row.evaluate(el => el === document.activeElement), true, 'foco volta à linha atualizada');
  await preserved(host.page); await preserved(guest.page);
  // Exercise mute preservation and live photo updates while the card is open.
  await guest.page.locator('#sound-button').click(); await remember(guest.page);
  await guest.page.locator('.audience-person').click();
  await host.page.locator('#profile-button').click(); await host.page.locator('#photo-menu-button').click(); await host.page.locator('#remove-photo').click(); await host.page.locator('#save-name').click();
  await guest.page.waitForFunction(() => document.querySelector('#member-profile-photo .avatar')?.textContent === 'DO');
  await preserved(guest.page); await guest.page.keyboard.press('Escape'); await closed(guest.page);
  result.checks.push('Perfil aberto acompanha nome/foto atuais; silenciamento e controles das streams preservados');

  result.afterFrames = await frames(host.page, 2); result.afterAudioRms = await audioRms(host.page); assert.ok(result.afterAudioRms > .002);
  await host.page.evaluate(() => { window.staleMemberButton = document.querySelector('.audience-person'); });
  await row.click(); await guest.page.locator('#leave-button').click(); await closed(host.page);
  await host.page.waitForFunction(() => document.querySelectorAll('.audience-person').length === 0);
  await host.page.evaluate(() => window.staleMemberButton.click()); assert.equal(await host.page.locator('#member-profile').evaluate(el => el.open), false);
  assert.equal((await host.page.evaluate(() => window.concord.session())).active, true);
  assert.equal(await host.page.evaluate(() => window.profileCapture.getTracks().every(t => t.readyState === 'live')), true);
  result.checks.push('Saída do participante fecha e limpa cartão; botão antigo não abre perfil ausente; dona segue transmitindo');
  assert.deepEqual(errors, []); result.passed = true;
  console.log('MEMBER_PROFILE_PASS', JSON.stringify(result));
} catch (error) {
  result.error = error.stack;
  for (const [i, app] of apps.entries()) { const pages = app.windows(); if (pages[0]) await pages[0].screenshot({ path: path.join(run, `failure-${i}.png`) }).catch(() => {}); }
  throw error;
} finally {
  for (const app of apps.reverse()) { const child = app.process(); await app.close().catch(() => child.kill()); }
  await writeFile(path.join(run, 'result.json'), JSON.stringify({ ...result, errors }, null, 2) + '\n');
  console.log('Evidência:', run);
}
