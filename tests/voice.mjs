import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
// Voice like Discord: the (fake) microphone opens on entering the room, the button only mutes.
const root = process.cwd(), apps = [], pages = [];
const run = path.join(root, 'test-results', 'voice-' + Date.now()); await mkdir(run, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = text => console.log('OK', text);
async function launch(name) {
  const app = await _electron.launch({ executablePath: process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: [...(process.env.CONCORD_EXE ? [] : [root]), '--mute-audio', '--use-fake-device-for-media-stream'], env: { ...process.env, CONCORD_DATA_DIR: path.join(run, name) }, timeout: 45000 });
  apps.push(app);
  const page = await app.firstWindow(); pages.push(page); page.setDefaultTimeout(20000);
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
  await page.locator('#name-picker[open]').waitFor(); await page.locator('#display-name').fill(name); await page.locator('#save-name').click();
  // Lets the test break the direct route on purpose.
  await page.evaluate(() => { const PC = RTCPeerConnection; window.testPeers = []; window.RTCPeerConnection = class extends PC { constructor(...args) { super(...args); window.testPeers.push(this); } }; });
  await page.evaluate(() => { const MR = MediaRecorder; window.testRecorders = []; window.MediaRecorder = class extends MR { constructor(...args) { super(...args); window.testRecorders.push(this); } }; });
  return { app, page };
}
// RMS of the voice received from `id`, read from its <audio> element's stream (direct) or captured output (relay).
const level = (page, id) => page.evaluate(async id => {
  const audio = document.querySelector(`#voice-audio audio[data-voice="${id}"]`); if (!audio) return -1;
  const stream = audio.srcObject || audio.captureStream(); const track = stream.getAudioTracks()[0]; if (!track) return -1;
  const context = new AudioContext(); await context.resume();
  const analyser = context.createAnalyser(); context.createMediaStreamSource(new MediaStream([track])).connect(analyser);
  let best = 0; const samples = new Float32Array(analyser.fftSize);
  for (let i = 0; i < 10; i++) { await new Promise(resolve => setTimeout(resolve, 100)); analyser.getFloatTimeDomainData(samples); best = Math.max(best, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)); }
  await context.close(); return best;
}, id);
async function waitLevel(page, id, test, message) {
  for (let i = 0; i < 20; i++) { const value = await level(page, id); if (test(value)) return value; await sleep(500); }
  throw new Error(message + ' (nível ' + await level(page, id) + ')');
}
try {
  const host = await launch('Yuri'), guest = await launch('Ana');
  assert.equal(await host.page.locator('#microphone').count(), 0, 'menu de transmissão sem microfone');
  assert.equal(await host.page.locator('#share-dialog #camera-device').count(), 0, 'câmera saiu do menu de transmissão');
  await host.page.locator('#create-room').click(); await host.page.waitForFunction(() => document.body.dataset.connected === 'true');
  await host.page.locator('#bar-mic[aria-pressed="true"]').waitFor();
  assert.equal(await host.page.locator('#bar-camera').getAttribute('aria-pressed'), 'false');
  assert.equal(await host.page.evaluate(() => getComputedStyle(document.querySelector('#bar-camera .icon-off')).display !== 'none'), true, 'câmera desligada aparece riscada');
  check('Microfone abre ao criar a sala; câmera desligada aparece riscada; menu de transmissão sem microfone/câmera.');

  const invite = (await host.page.evaluate(() => window.concord.session())).guestInvite;
  await guest.page.locator('#join-room-nav').click(); await guest.page.locator('#join-input').fill(invite); await guest.page.locator('#join-button').click();
  await guest.page.waitForFunction(() => document.body.dataset.connected === 'true');
  await guest.page.locator('#bar-mic[aria-pressed="true"]').waitFor();
  await guest.page.waitForFunction(() => document.querySelector('#voice-audio audio[data-voice="host"]')?.dataset.transport === 'direct');
  await waitLevel(guest.page, 'host', value => value > .005, 'voz do host não chegou');
  const hostId = 'host', guestId = await guest.page.evaluate(() => [...document.querySelectorAll('#audience-list [data-member]')].find(row => row.classList.contains('audience-me')).dataset.member);
  await waitLevel(host.page, guestId, value => value > .005, 'voz do convidado não chegou');
  check('Voz vai e volta por conexão direta sem ninguém transmitir tela.');

  await host.page.locator('#bar-mic').click(); await host.page.locator('#bar-mic[aria-pressed="false"]').waitFor();
  await guest.page.locator(`#audience-list [data-member="${hostId}"] .muted-icon`).waitFor();
  await waitLevel(guest.page, hostId, value => value >= 0 && value < .002, 'mutar não silenciou');
  await host.page.locator('#bar-mic').click(); await guest.page.locator(`#audience-list [data-member="${hostId}"] .muted-icon`).waitFor({ state: 'detached' });
  await waitLevel(guest.page, hostId, value => value > .005, 'desmutar não voltou o som');
  check('Mutar envia silêncio e mostra o microfone riscado para os outros; desmutar volta.');

  await guest.page.locator('#sound-button').click();
  assert.equal(await guest.page.evaluate(() => document.querySelector('#voice-audio audio[data-voice="host"]').muted), true, 'ensurdecer silencia a voz recebida');
  await guest.page.locator('#bar-mic[aria-pressed="false"]').waitFor(); await host.page.locator(`#audience-list [data-member="${guestId}"] .muted-icon`).waitFor();
  await guest.page.locator('#bar-mic').click(); await guest.page.locator('#bar-mic[aria-pressed="true"]').waitFor();
  assert.equal(await guest.page.evaluate(() => document.querySelector('#voice-audio audio[data-voice="host"]').muted), false, 'desmutar também tira o ensurdecer');
  check('Ensurdecer silencia a sala e o próprio microfone; desmutar desfaz os dois.');

  await guest.page.locator('#settings-button').click(); await guest.page.locator('#settings-dialog[open]').waitFor();
  await guest.page.waitForFunction(() => document.querySelectorAll('#mic-device option').length >= 2).catch(() => {});
  const options = await guest.page.locator('#mic-device option').allTextContents(); assert.ok(options.length >= 2, 'lista microfones: ' + options.join(', '));
  const before = await guest.page.evaluate(() => document.querySelector('#voice-audio') && window.concord && document.body.dataset.connected);
  await guest.page.locator('#mic-device').selectOption({ index: 1 });
  await guest.page.locator('#bar-mic[aria-pressed="true"]').waitFor(); await sleep(500);
  await waitLevel(host.page, guestId, value => value > .005, 'troca de microfone cortou a voz');
  await guest.page.locator('#close-settings').click();
  const saved = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(run, 'Ana', 'preferences.json'), 'utf8'));
  assert.equal(saved.micDevice, options[1]); assert.ok(before);
  check('Configurações listam microfones; trocar o microfone mantém a voz e salva a escolha pelo nome.');

  await guest.page.locator('#settings-button').click(); await guest.page.locator('#settings-dialog[open]').waitFor();
  await guest.page.evaluate(() => { const devices = navigator.mediaDevices, original = devices.getUserMedia.bind(devices); devices.getUserMedia = async () => { devices.getUserMedia = original; throw new DOMException('ocupado', 'NotReadableError'); }; });
  await guest.page.locator('#mic-device').selectOption({ index: 0 });
  await guest.page.locator('#notice').filter({ hasText: 'Continuo com o anterior' }).waitFor({ state: 'attached' });
  await guest.page.locator('#bar-mic[aria-pressed="true"]').waitFor({ state: 'attached' }); await guest.page.locator('#close-settings').click();
  assert.equal(await host.page.locator(`#audience-list [data-member="${guestId}"] .muted-icon`).count(), 0);
  await waitLevel(host.page, guestId, value => value > .005, 'falha ao trocar o microfone cortou a voz');
  check('Se o microfone novo falha, a voz continua no anterior.');

  await guest.page.evaluate(() => { for (const pc of window.testPeers) { Object.defineProperty(pc, 'connectionState', { configurable: true, value: 'failed' }); pc.dispatchEvent(new Event('connectionstatechange')); } });
  await guest.page.waitForFunction(() => document.querySelector('#voice-audio audio[data-voice="host"]')?.dataset.transport === 'relay', null, { timeout: 30000 });
  await guest.page.waitForFunction(() => document.querySelector('#voice-audio audio[data-voice="host"]').currentTime > 1, null, { timeout: 30000 });
  await waitLevel(guest.page, hostId, value => value > .005, 'voz pelo modo de compatibilidade sem som');
  check('Sem rota direta, a voz chega pelo modo de compatibilidade (Opus).');

  // A failed voice encoder restarts alone: no error notice, and the voice comes back.
  await host.page.evaluate(() => window.testRecorders.filter(recorder => recorder.mimeType.startsWith('audio/') && recorder.state === 'recording').at(-1).onerror(new Event('error')));
  await sleep(3000);
  assert.equal(await host.page.locator('#notice').textContent(), '', 'falha da voz não vira erro de transmissão');
  await host.page.waitForFunction(() => window.testRecorders.filter(recorder => recorder.mimeType.startsWith('audio/') && recorder.state === 'recording').length === 1);
  await waitLevel(guest.page, hostId, value => value > .005, 'voz não voltou depois da falha do codificador');
  check('Falha do codificador de voz reinicia só a voz, sem derrubar nada.');

  await host.page.locator('#leave-button').click(); await host.page.locator('#home-view').waitFor();
  assert.equal(await host.page.locator('#bar-mic').isDisabled(), true);
  await guest.page.waitForFunction(() => document.body.dataset.connected !== 'true' || !document.querySelector('#voice-audio audio[data-voice="host"]'), null, { timeout: 30000 });
  check('Sair da sala fecha o microfone.');

  await host.app.close();
  await guest.page.waitForFunction(() => document.body.dataset.connected !== 'true', null, { timeout: 30000 });
  await guest.page.locator('#bar-mic[aria-pressed="false"]').waitFor({ state: 'attached' });
  check('Enquanto tenta reconectar, o microfone do convidado fica fechado.');
  console.log('VOICE_TEST_PASS');
} catch (error) {
  for (const page of pages) console.log('DIAGNOSTIC', JSON.stringify(await page.evaluate(() => ({ notice: document.getElementById('notice').textContent, mic: document.getElementById('bar-mic').title, voices: [...document.querySelectorAll('#voice-audio audio')].map(audio => ({ id: audio.dataset.voice, transport: audio.dataset.transport, time: audio.currentTime, muted: audio.muted })) })).catch(() => ({}))));
  throw error;
} finally {
  for (const app of apps.reverse()) await app.close().catch(() => app.process().kill());
}
