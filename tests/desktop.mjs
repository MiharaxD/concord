import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const executablePath = process.env.CONCORD_EXE || path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const apps = [];
await mkdir(path.join(root, 'test-results'), { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  async function launch() {
    const instance = await _electron.launch({ executablePath, args: process.env.CONCORD_EXE ? [] : [root], timeout: 45000 });
    apps.push(instance); const page = await instance.firstWindow();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => console.error('RENDERER ERROR:', error.message));
    await page.locator('#connection-status').filter({ hasText: 'Sala conectada' }).waitFor();
    return page;
  }
  const host = await launch(); const viewer = await launch();
  await host.locator('#audio-mode').selectOption('system');
  await host.screenshot({ path: path.join(root, 'test-results', 'concord-desktop.png') });
  await host.evaluate(() => {
    // Test-only synthetic moving screen and tone. No real desktop pixels enter the stream.
    navigator.mediaDevices.getDisplayMedia = async options => {
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext('2d'); let frame = 0;
      const timer = setInterval(() => {
        ctx.fillStyle = frame % 20 < 10 ? '#de3145' : '#35c989'; ctx.fillRect(0, 0, 1280, 720);
        ctx.fillStyle = '#161923'; ctx.fillRect(frame * 9 % 1100, 150, 140, 400);
        ctx.fillStyle = 'white'; ctx.font = '64px sans-serif'; ctx.fillText(`Concord · quadro ${frame++}`, 60, 100);
      }, 33);
      const capture = canvas.captureStream(30);
      const ac = new AudioContext(); const oscillator = ac.createOscillator(); const gain = ac.createGain();
      const dest = ac.createMediaStreamDestination(); oscillator.frequency.value = 440; gain.gain.value = .15;
      oscillator.connect(gain).connect(dest); oscillator.start();
      if (options.audio) capture.addTrack(dest.stream.getAudioTracks()[0]);
      capture.getVideoTracks()[0].addEventListener('ended', () => { clearInterval(timer); oscillator.stop(); ac.close(); });
      window.testCapture = capture; return capture;
    };
  });
  async function start(connection) {
    await host.locator('#connection-mode').selectOption(connection);
    await host.locator('#choose-source').click();
    await host.locator('.source-choice').first().waitFor();
    await host.locator('.source-choice').first().click();
    await host.locator('#start-button').click();
    await host.locator('#stage.has-video').waitFor();
  }
  let invitation = await host.evaluate(async () => (await window.concord.session()).guestInvite);
  async function join() {
    await viewer.locator('#viewer-tab').click();
    await viewer.locator('#join-input').fill(invitation);
    await viewer.locator('#join-button').click();
    await viewer.locator('#connection-status').filter({ hasText: 'Sala conectada' }).waitFor();
  }
  async function sample() {
    return viewer.evaluate(() => {
      const v = document.getElementById('screen-video'); const c = document.createElement('canvas'); c.width = 1; c.height = 1;
      const context = c.getContext('2d'); context.drawImage(v, 0, 0, 1, 1);
      return { time: v.currentTime, width: v.videoWidth, pixels: Array.from(context.getImageData(0, 0, 1, 1).data), frames: v.getVideoPlaybackQuality().totalVideoFrames };
    });
  }
  async function verifyVideo(label) {
    await viewer.locator('#stage.has-video').waitFor({ timeout: 20000 });
    await viewer.waitForFunction(() => document.getElementById('screen-video').videoWidth > 0);
    const first = await sample(); await sleep(1700); const second = await sample();
    assert.ok(second.width >= 720, `${label}: imagem tem resolução`);
    assert.ok(second.frames > first.frames, `${label}: quadros avançam`);
    assert.ok(second.time > first.time, `${label}: reprodução avança`);
    console.log(`${label}: imagem ${second.width}px, +${second.frames - first.frames} quadros, reprodução avançando`);
  }
  await start('auto'); await join(); await verifyVideo('WebRTC');
  await viewer.locator('#transport-label').filter({ hasText: 'Conexão direta' }).waitFor();
  await viewer.locator('#fullscreen-button').click();
  await viewer.waitForFunction(() => document.fullscreenElement?.id === 'stage');
  await viewer.keyboard.press('Escape');
  await viewer.waitForFunction(() => !document.fullscreenElement);
  assert.ok(await viewer.evaluate(() => document.getElementById('viewer-controls').getBoundingClientRect().bottom <= window.innerHeight), 'controles de áudio cabem na janela');
  console.log('Tela cheia e controles de áudio verificados');
  const hasAudio = await viewer.evaluate(() => document.getElementById('screen-video').srcObject.getAudioTracks().length);
  assert.equal(hasAudio, 1); console.log('WebRTC: faixa de áudio recebida');
  // An analyser confirms actual decoded sound, not just an audio-track label.
  const rms = await viewer.evaluate(async () => {
    const ac = new AudioContext(); await ac.resume(); const input = ac.createMediaStreamSource(document.getElementById('screen-video').srcObject);
    const analyser = ac.createAnalyser(); input.connect(analyser); await new Promise(resolve => setTimeout(resolve, 500));
    const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
    const result = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length); await ac.close(); return result;
  });
  assert.ok(rms > .005, `áudio decodificado RMS=${rms}`); console.log('WebRTC: áudio decodificado confirmado');
  await host.locator('#stop-button').click(); await viewer.locator('#empty-stage').waitFor();
  await start('relay'); await verifyVideo('Compatibilidade');
  await viewer.locator('#transport-label').filter({ hasText: 'Compatibilidade' }).waitFor();
  const relayRms = await viewer.evaluate(async () => {
    const ac = new AudioContext(); await ac.resume(); const v = document.getElementById('screen-video');
    v.muted = false; v.volume = 1;
    const input = ac.createMediaElementSource(v); const analyser = ac.createAnalyser(); input.connect(analyser);
    window.testElementAudio = ac;
    await new Promise(resolve => setTimeout(resolve, 600));
    const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  });
  assert.ok(relayRms > .005, `relay: áudio decodificado RMS=${relayRms}`);
  console.log('Compatibilidade: áudio decodificado confirmado');
  await viewer.screenshot({ path: path.join(root, 'test-results', 'concord-transmissao.png') });
  const before = await sample(); await sleep(35000); const after = await sample();
  assert.ok(after.frames > before.frames + 300, 'relay permanece reproduzindo e limpa buffer antigo');
  console.log('Compatibilidade: 35 segundos de reprodução contínua com limpeza do buffer');
  await viewer.locator('#leave-button').click(); await host.locator('#friend-label').filter({ hasText: 'Aguardando' }).waitFor();
  await join(); await verifyVideo('Reentrada durante transmissão');
  await host.evaluate(() => window.concord.renewInvite());
  await viewer.locator('#notice').filter({ hasText: 'Convite substituído' }).waitFor();
  console.log('Convite revogado: espectador removido');
  if (process.env.CONCORD_TEST_TUNNEL === '1') {
    await host.locator('#stop-button').click();
    await host.locator('#invite-button').click();
    await host.locator('#invite-result').waitFor({ timeout: 180000 });
    const session = await host.evaluate(() => window.concord.session()); invitation = session.guestInvite;
    assert.match(invitation, /^concord:[a-z0-9-]+:[A-Za-z0-9_-]{22}$/);
    assert.equal(await host.locator('#invite-link').inputValue(), invitation);
    await apps[0].evaluate(({ clipboard }) => { global.testWriteOriginal = clipboard.writeText; clipboard.writeText = text => { global.testInviteWritten = text; }; });
    await host.locator('#copy-button').click();
    await host.locator('#notice').filter({ hasText: 'Convite copiado' }).waitFor();
    const copied = await apps[0].evaluate(({ clipboard }) => { clipboard.writeText = global.testWriteOriginal; return global.testInviteWritten; });
    assert.equal(copied, invitation);
    console.log(`Convite público curto: ${invitation.length} caracteres; anterior ${session.guestLink.length}`);
    assert.ok(session.public); await start('relay');
    await join(); await verifyVideo('Internet via Cloudflare WSS');
    const remoteAccess = await host.evaluate(async () => {
      const session = await window.concord.session();
      const config = await window.concord.bootstrap();
      // Origin/CORS intentionally prevent the renderer from inspecting a remote admin endpoint.
      return { url: new URL(session.guestLink).origin, token: config.hostToken };
    });
    assert.equal((await fetch(remoteAccess.url + '/api/session', { headers: { 'x-concord-host': remoteAccess.token } })).status, 403);
    console.log('Internet: administração continua bloqueada no endereço público');
    await host.evaluate(() => window.concord.closeTunnel());
  }
  await host.locator('#stop-button').click();
  // Capture the real Electron screen path too, but keep only track metadata, no real screen images.
  const captureMetadata = await host.evaluate(async () => {
    const sources = await window.concord.sources();
    await window.concord.selectSource(sources.find(source => source.id.startsWith('screen:')).id);
    delete navigator.mediaDevices.getDisplayMedia;
    const capture = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const result = { video: capture.getVideoTracks().length, audio: capture.getAudioTracks().length, width: capture.getVideoTracks()[0].getSettings().width };
    capture.getTracks().forEach(track => track.stop()); return result;
  });
  assert.equal(captureMetadata.video, 1); assert.equal(captureMetadata.audio, 1); assert.ok(captureMetadata.width > 0);
  console.log('Captura nativa Windows: tela e áudio do sistema disponíveis');
  console.log('DESKTOP_TEST_PASS');
} finally {
  for (const instance of apps.reverse()) {
    for (const page of instance.windows()) await page.evaluate(() => { const stop = document.getElementById('stop-button'); if (stop && !stop.hidden) stop.click(); }).catch(() => {});
    await instance.close().catch(() => {});
  }
}
