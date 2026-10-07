import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const apps = []; const run = path.resolve('test-results/quality-' + Date.now());
await mkdir('test-results', { recursive: true });
try {
  async function launch() {
    const app = await _electron.launch({ executablePath: process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'), args: process.env.CONCORD_EXE ? [] : [root], env: { ...process.env, CONCORD_DATA_DIR: path.join(run, String(apps.length)) }, timeout: 45000 }); apps.push(app);
    const page = await app.firstWindow(); page.setDefaultTimeout(25000);
    await page.locator('#name-picker[open]').waitFor(); await page.locator('#display-name').fill('Teste ' + apps.length); await page.locator('#save-name').click();
    await page.waitForFunction(() => document.body.dataset.connected === 'true' || document.querySelector('#connection-status')?.textContent.includes('Sala conectada'));
    page.on('pageerror', error => console.error('PAGE ERROR', error.message)); return page;
  }
  const host = await launch(), viewer = await launch();
  await host.evaluate(() => {
    const set = RTCRtpSender.prototype.setParameters;
    RTCRtpSender.prototype.setParameters = async function(params) { const result = await set.call(this, params); if (this.track?.kind === 'video') window.testSender = this; return result; };
    const Recorder = MediaRecorder;
    window.MediaRecorder = class extends Recorder { constructor(stream, options) { super(stream, options); window.testRecorder = this; } };
    window.testCaptures = 0;
    navigator.mediaDevices.getDisplayMedia = async options => {
      window.testCaptures++;
      const canvas = document.createElement('canvas'); canvas.width = options.video.width.ideal; canvas.height = options.video.height.ideal;
      const ctx = canvas.getContext('2d'); let frame = 0;
      const timer = setInterval(() => { ctx.fillStyle = frame % 30 < 15 ? '#7349c9' : '#238774'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = 'white'; ctx.font = '60px sans-serif'; ctx.fillText(`Concord · ${canvas.width}×${canvas.height} · ${frame++}`, 60, 90); }, 1000 / options.video.frameRate.ideal);
      const stream = canvas.captureStream(options.video.frameRate.ideal);
      const ac = new AudioContext(); const oscillator = ac.createOscillator(); const gain = ac.createGain(); const destination = ac.createMediaStreamDestination();
      oscillator.frequency.value = 440; gain.gain.value = .1; oscillator.connect(gain).connect(destination); oscillator.start();
      if (options.audio) stream.addTrack(destination.stream.getAudioTracks()[0]);
      const track = stream.getVideoTracks()[0], stop = track.stop.bind(track); let stopped = false;
      track.stop = () => { if (!stopped) { stopped = true; clearInterval(timer); oscillator.stop(); ac.close(); } stop(); };
      return stream;
    };
  });
  await viewer.evaluate(() => {
    const play = HTMLMediaElement.prototype.play; let interrupted = false;
    HTMLMediaElement.prototype.play = function() {
      if (!interrupted && this.srcObject && this.dataset.publisher === 'host') { interrupted = true; return new Promise((_, reject) => setTimeout(() => reject(new DOMException('Mudança de fonte', 'AbortError')), 300)); }
      return play.call(this);
    };
  });
  await host.locator('#audio-mode').selectOption('system');
  await host.locator('#quality').selectOption('1440:60');
  assert.match(await host.locator('#bitrate-mode option').first().textContent(), /24 Mbps/);
  await host.locator('#bitrate-mode').selectOption('manual'); await host.locator('#bitrate-value').fill('11.5');
  await host.locator('#choose-source').click(); await host.locator('.source-choice').first().click();
  await host.locator('#bitrate-value').fill('0'); await host.locator('#start-button').click();
  assert.equal(await host.evaluate(() => window.testCaptures), 0, 'entrada inválida não abre captura');
  await host.locator('#bitrate-value').fill('11.5'); await host.locator('#start-button').click();
  const invite = await host.evaluate(async () => (await window.concord.session()).guestLink);
  await viewer.locator('#join-input').fill(invite); await viewer.locator('#join-button').click();
  await viewer.locator('#transport-label').filter({ hasText: 'Conexão direta' }).waitFor();
  await viewer.waitForFunction(() => document.querySelector('video[data-publisher="host"]')?.videoWidth === 2560);
  await new Promise(resolve => setTimeout(resolve, 1000));
  const direct = await host.evaluate(() => window.testSender.getParameters());
  assert.equal(direct.encodings[0].maxBitrate, 11_500_000); assert.equal(direct.encodings[0].maxFramerate, 60);
  const audible = await viewer.evaluate(() => { const video = document.querySelector('video[data-publisher="host"]'); return !video.muted && video.volume > 0 && !video.paused; });
  assert.ok(audible, 'som inicia sem mexer no volume, mesmo após AbortError tardio');
  assert.match(await viewer.locator('#stream-quality').textContent(), /tela/);
  console.log('WebRTC: 1440p, limite de 11,5 Mbps e 60 FPS aplicados; player inicia com som sem clique de volume');
  await host.locator('#stop-button').click();
  await host.locator('#quality').selectOption('2160:30'); await host.locator('#bitrate-value').fill('17.5'); await host.locator('#connection-mode').selectOption('relay');
  await host.locator('#start-button').click();
  await viewer.waitForFunction(() => document.querySelector('video[data-publisher="host"]')?.videoWidth === 3840);
  const initialFrames = await viewer.evaluate(() => document.querySelector('video[data-publisher="host"]').getVideoPlaybackQuality().totalVideoFrames);
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.ok(await viewer.evaluate(() => document.querySelector('video[data-publisher="host"]').getVideoPlaybackQuality().totalVideoFrames) > initialFrames, '4K reproduz quadros em movimento');
  assert.equal(await host.evaluate(() => window.testRecorder.videoBitsPerSecond), 17_500_000);
  assert.ok(await viewer.evaluate(() => !document.querySelector('video[data-publisher="host"]').muted));
  const rms = await viewer.evaluate(async () => {
    const ac = new AudioContext(); await ac.resume(); const source = ac.createMediaElementSource(document.querySelector('video[data-publisher="host"]')); const analyser = ac.createAnalyser(); source.connect(analyser);
    let result = 0;
    for (let retry = 0; retry < 40 && result <= .005; retry++) {
      await new Promise(resolve => setTimeout(resolve, 200)); const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
      result = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    }
    window.testAudioAnalyser = { ac, source, analyser }; return result;
  });
  assert.ok(rms > .005, `compatibilidade: áudio no player RMS=${rms}`);
  await host.screenshot({ path: path.resolve('test-results/qualidade-bitrate.png') });
  console.log('Compatibilidade: 4K recebido, 17,5 Mbps no encoder e som decodificado automaticamente');
  await host.locator('#stop-button').click();
  // Two independent process trees render tones into the real Windows output.
  for (const [page, frequency, title] of [[host, 440, 'Jogo de teste Concord'], [viewer, 1000, 'Outro app de teste Concord']]) {
    await page.evaluate(({ frequency, title }) => {
      document.title = title; const ac = new AudioContext(); const tone = ac.createOscillator(), gain = ac.createGain();
      tone.frequency.value = frequency; gain.gain.value = .025; tone.connect(gain).connect(ac.destination); tone.start();
      window.testPhysicalTone = ac;
    }, { frequency, title });
  }
  const game = await host.evaluate(async () => (await window.concord.sources()).find(source => source.name === 'Jogo de teste Concord'));
  assert.ok(game, 'janela do app sonoro disponível para seleção');
  await host.evaluate(async id => {
    window.testPcm = []; window.testPcmOff = window.concord.onAppAudio(bytes => { if (window.testPcm.length < 200) window.testPcm.push(new Uint8Array(bytes)); });
    await window.concord.startAppAudio(id);
  }, game.id);
  await new Promise(resolve => setTimeout(resolve, 2500));
  const spectrum = await host.evaluate(async () => {
    await window.concord.stopAppAudio(); window.testPcmOff();
    const bytes = window.testPcm; const samples = [];
    for (const chunk of bytes) { const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength); for (let offset = 0; offset + 3 < chunk.length; offset += 4) samples.push(view.getInt16(offset, true) / 32768); }
    const data = samples.slice(-48000);
    const power = frequency => { let re = 0, im = 0; for (let i = 0; i < data.length; i++) { const phase = 2 * Math.PI * frequency * i / 48000; re += data[i] * Math.cos(phase); im += data[i] * Math.sin(phase); } return Math.hypot(re, im) / data.length; };
    return { target: power(440), background: power(1000), samples: samples.length };
  });
  assert.ok(spectrum.samples > 12000 && spectrum.target > .001, `áudio do alvo capturado: ${JSON.stringify(spectrum)}`);
  assert.ok(spectrum.background < spectrum.target / 20, `outro app ficou fora: ${JSON.stringify(spectrum)}`);
  console.log(`Áudio por processo: tom do jogo presente; outro app pelo menos 26 dB abaixo (razão ${Math.round(spectrum.target / Math.max(spectrum.background, 1e-9))}×)`);
  // Verify the Worklet path, not just helper PCM: choose the same native audio window in the UI.
  await host.evaluate(async () => { await window.testPhysicalTone.close(); });
  await viewer.evaluate(async () => { await window.testPhysicalTone.close(); });
  await host.locator('#quality').selectOption('720:30'); await host.locator('#bitrate-mode').selectOption('auto'); await host.locator('#audio-mode').selectOption('application');
  await host.locator('#choose-audio-source').click(); await host.locator('.source-choice').filter({ hasText: 'Jogo de teste Concord' }).click();
  await host.evaluate(() => {
    const ac = new AudioContext(), tone = ac.createOscillator(), gain = ac.createGain(); tone.frequency.value = 440; gain.gain.value = .025;
    tone.connect(gain).connect(ac.destination); tone.start(); window.testPhysicalTone = ac;
  });
  await host.locator('#start-button').click();
  await viewer.waitForFunction(() => document.querySelector('video[data-publisher="host"]')?.videoWidth === 1280);
  assert.equal(await host.evaluate(() => window.testRecorder.videoBitsPerSecond), 4_000_000, 'bitrate automático chega ao encoder');
  const appRms = await viewer.evaluate(async () => {
    const ac = new AudioContext(); await ac.resume(); const source = ac.createMediaElementSource(document.querySelector('video[data-publisher="host"]')), analyser = ac.createAnalyser(); source.connect(analyser); window.testAppAnalyser = ac;
    let result = 0;
    for (let retry = 0; retry < 40 && result <= .001; retry++) {
      await new Promise(resolve => setTimeout(resolve, 200)); const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
      result = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    }
    return result;
  });
  assert.ok(appRms > .001, `Worklet: som seletivo decodificado no receptor RMS=${appRms}`);
  await host.locator('#stop-button').click();
  console.log('Captura seletiva integrada ao player; fim da transmissão libera o capturador');
  console.log('QUALITY_AUDIO_TEST_PASS');
} finally {
  for (const app of apps.reverse()) {
    for (const page of app.windows()) await page.evaluate(async () => { const stop = document.getElementById('stop-button'); if (stop && !stop.hidden) stop.click(); await window.concord.stopAppAudio(); await window.testPhysicalTone?.close(); }).catch(() => {});
    await app.close().catch(() => {});
  }
}
