import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { _electron } from 'playwright';

const root = process.cwd(), apps = [];
const run = path.join(root, 'test-results', 'room-navigation-' + Date.now());
await mkdir(run, { recursive: true });
const result = { executable: process.env.CONCORD_EXE || 'development', checks: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function launch(name) {
  const app = await _electron.launch({
    executablePath: process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: process.env.CONCORD_EXE ? [] : [root],
    env: { ...process.env, CONCORD_DATA_DIR: path.join(run, name) }, timeout: 45000
  });
  apps.push(app);
  const page = await app.firstWindow(); page.setDefaultTimeout(20000);
  await page.locator('#name-picker[open]').waitFor();
  // Observe connection identity before onboarding creates the first socket.
  await page.evaluate(() => {
    const Original = WebSocket; window.navigationSockets = [];
    window.WebSocket = class extends Original {
      constructor(...args) { super(...args); window.navigationSockets.push(this); }
    };
  });
  await page.locator('#display-name').fill(name); await page.locator('#save-name').click();
  if (await page.locator('#create-room').count()) await page.locator('#create-room').click();
  await page.waitForFunction(() => document.body.dataset.connected === 'true');
  if (await page.locator('#cancel-invite').isVisible()) {
    await page.locator('#cancel-invite').click();
    await page.locator('#invite-status').filter({ hasText: 'Acesso fechado' }).waitFor();
  } else if (await page.locator('#close-invite').isVisible()) {
    await page.locator('#close-invite').click();
    await page.locator('#invite-status').filter({ hasText: 'Acesso fechado' }).waitFor();
  }
  return { app, page };
}

async function start(page) {
  await page.locator('#audio-mode').selectOption('system');
  // Generated moving video/tone: this test never transmits the user's screen/audio.
  await page.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = async options => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const context = canvas.getContext('2d'); let frame = 0;
      const timer = setInterval(() => {
        context.fillStyle = '#513b92'; context.fillRect(0, 0, 640, 360);
        context.fillStyle = 'white'; context.fillRect(frame++ * 8 % 640, 80, 60, 80);
      }, 33);
      const stream = canvas.captureStream(30), audio = new AudioContext();
      const oscillator = audio.createOscillator(), gain = audio.createGain(), output = audio.createMediaStreamDestination();
      oscillator.frequency.value = 440; gain.gain.value = .03;
      oscillator.connect(gain).connect(output); oscillator.start(); await audio.resume();
      if (options.audio) stream.addTrack(output.stream.getAudioTracks()[0]);
      window.navigationCapture = stream; window.navigationStops = 0;
      const track = stream.getVideoTracks()[0], originalStop = track.stop.bind(track); let stopped = false;
      track.stop = () => {
        if (stopped) return; stopped = true;
        window.navigationStops++; clearInterval(timer); oscillator.stop(); void audio.close(); originalStop();
      };
      return stream;
    };
  });
  await page.locator('#choose-source').click(); await page.locator('.source-choice').first().click();
  await page.locator('#start-button').click(); await page.locator('#stop-button').waitFor();
}

async function moving(page) {
  await page.waitForFunction(() => {
    const video = document.querySelector('.stream-tile video');
    return video?.videoWidth > 0 && video.currentTime > 0;
  }, null, { timeout: 30000 });
  const before = await page.evaluate(() => document.querySelector('.stream-tile video').getVideoPlaybackQuality().totalVideoFrames);
  await sleep(1200);
  const after = await page.evaluate(() => document.querySelector('.stream-tile video')?.getVideoPlaybackQuality().totalVideoFrames);
  assert.ok(after > before, 'espectador continua recebendo novos quadros');
  return { before, after };
}

async function audible(page) {
  return page.evaluate(async () => {
    if (!window.navigationAnalyser) {
      const audio = new AudioContext(); await audio.resume(); window.navigationAudio = audio;
      const analyser = audio.createAnalyser();
      const video = document.querySelector('.stream-tile video');
      if (video.muted || video.paused) throw new Error('Player recebido está mudo ou pausado');
      const source = video.srcObject ? audio.createMediaStreamSource(video.srcObject) : audio.createMediaElementSource(video);
      source.connect(analyser);
      analyser.connect(audio.destination); window.navigationAnalyser = analyser;
    }
    await new Promise(resolve => setTimeout(resolve, 700));
    const samples = new Float32Array(window.navigationAnalyser.fftSize);
    window.navigationAnalyser.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  });
}

try {
  const host = await launch('Dona'), guest = await launch('Amigo');
  result.version = (await host.page.evaluate(() => window.concord.bootstrap())).version;
  const invite = (await host.page.evaluate(() => window.concord.session())).guestInvite;
  if (await guest.page.locator('#join-room-nav').count()) await guest.page.locator('#join-room-nav').click();
  await guest.page.locator('#join-input').fill(invite); await guest.page.locator('#join-button').click();
  await host.page.locator('#audience-list').filter({ hasText: 'Amigo' }).waitFor();
  await start(host.page); await moving(guest.page);
  assert.ok(await audible(guest.page) > .002, 'espectador ouve a transmissão sem clicar no volume');
  await host.page.locator('.stream-tile').click();
  await host.page.evaluate(() => {
    const tile = document.querySelector('.stream-tile');
    window.navigationBefore = { tile, stream: tile.querySelector('video').srcObject, socket: window.navigationSockets.at(-1), sockets: window.navigationSockets.length };
  });
  await guest.page.evaluate(() => { window.navigationRemote = document.querySelector('.stream-tile video'); });
  for (let i = 0; i < 3; i++) await host.page.locator('#host-tab').click();
  const preserved = await host.page.evaluate(() => ({
    capture: window.navigationStops === 0 && window.navigationCapture.getTracks().every(track => track.readyState === 'live'),
    preview: document.querySelector('.stream-tile') === window.navigationBefore.tile && window.navigationBefore.tile.querySelector('video').srcObject === window.navigationBefore.stream,
    connection: window.navigationSockets.length === window.navigationBefore.sockets && window.navigationBefore.socket.readyState === WebSocket.OPEN,
    focus: window.navigationBefore.tile.getAttribute('aria-pressed') === 'true',
    audience: document.querySelector('#audience-list').textContent.includes('Amigo'),
    clock: !document.querySelector('#stream-clock').hidden
  }));
  result.preserved = preserved;
  assert.ok(preserved.capture, 'Minha sala não encerra a captura ao já estar na sala própria');
  assert.ok(Object.values(preserved).every(Boolean), 'conexão, prévia, foco, espectadores e relógio preservados');
  result.frames = await moving(guest.page); result.audioRms = await audible(guest.page);
  assert.ok(result.audioRms > .002, 'áudio continua decodificando após os cliques');
  assert.ok(await guest.page.evaluate(() => document.querySelector('.stream-tile video') === window.navigationRemote), 'espectador mantém o mesmo player');
  result.checks.push('Clique repetido na sala atual preserva captura, conexão, espectadores, foco, relógio, vídeo e áudio');

  // Returning from a friend's room is a real navigation and must still work.
  if (await guest.page.locator('#home-tab').count()) { await guest.page.locator('#home-tab').click(); await guest.page.locator('#create-room').click(); }
  else await guest.page.locator('#host-tab').click();
  await host.page.waitForFunction(() => !document.querySelector('#audience-list').textContent.includes('Amigo'));
  await guest.page.waitForFunction(() => document.body.dataset.connected === 'true' && document.querySelectorAll('.stream-tile').length === 0);
  assert.equal(await guest.page.evaluate(() => window.navigationSockets.at(-1).url),
    (await guest.page.evaluate(() => window.concord.bootstrap())).address.replace(/^http/, 'ws') + '/socket');
  assert.equal((await host.page.evaluate(() => window.concord.session())).active, true, 'saída do convidado não para a dona');
  result.checks.push('Convidado volta para a própria sala e transmissão da dona continua');

  await host.page.locator('#leave-button').click();
  await host.page.waitForFunction(() => document.querySelector('#stop-button').hidden && (document.body.dataset.view === 'home' || document.body.dataset.connected === 'true'));
  assert.equal((await host.page.evaluate(() => window.concord.session())).active, false);
  assert.ok(await host.page.evaluate(() => window.navigationCapture.getTracks().every(track => track.readyState === 'ended')));
  result.checks.push('Sair da sala explicitamente continua encerrando a captura');
  result.passed = true; console.log('ROOM_NAVIGATION_PASS', JSON.stringify(result));
} catch (error) {
  result.passed = false; result.error = error.message; throw error;
} finally {
  for (const app of apps.reverse()) {
    const child = app.process();
    await app.close().catch(() => child.kill());
  }
  await writeFile(path.join(run, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('Evidência:', run);
}
