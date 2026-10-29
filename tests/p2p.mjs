// Real P2P signaling through the public brokers, three isolated app instances, no Cloudflare tunnel.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { P2P_PAGE } from '../public/invites.js';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = process.cwd(), apps = [], pages = [], errors = [];
const run = path.join(root, 'test-results', 'p2p-' + Date.now()); await mkdir(run, { recursive: true });
const result = { passed: false, checks: [], executable: process.env.CONCORD_EXE || 'development' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = text => { result.checks.push(text); console.log('OK', text); };
async function launch(name) {
  const data = path.join(run, name); await mkdir(data, { recursive: true });
  await writeFile(path.join(data, 'profile.json'), JSON.stringify({ name, photo: '' }));
  const app = await _electron.launch({ executablePath: process.env.CONCORD_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'), args: process.env.CONCORD_EXE ? [] : [root], env: { ...process.env, CONCORD_DATA_DIR: data }, timeout: 45000 });
  apps.push(app); const page = await app.firstWindow(); pages.push(page); page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(name + ': ' + error.message));
  await page.locator('#create-room:not([disabled])').waitFor();
  const { address, hostToken } = await page.evaluate(() => window.concord.bootstrap());
  // The fallback never provisions a real tunnel here: it answers with this PC's loopback room.
  await app.evaluate(({ ipcMain, clipboard }, { address, hostToken }) => {
    globalThis.tunnelCalls = 0; clipboard.writeText = value => { globalThis.copied = value; };
    ipcMain.removeHandler('concord:tunnel');
    ipcMain.handle('concord:tunnel', async () => {
      globalThis.tunnelCalls++;
      if (globalThis.failNextTunnel) { globalThis.failNextTunnel = false; throw new Error('QA offline'); }
      const session = await (await fetch(address + '/api/session', { headers: { 'x-concord-host': hostToken } })).json();
      return { ...session, public: true, guestInvite: address + '/#join=' + session.inviteKey };
    });
  }, { address, hostToken });
  await page.evaluate(() => { const PC = RTCPeerConnection; window.testPeers = []; window.RTCPeerConnection = class extends PC { constructor(...args) { super(...args); window.testPeers.push(this); } }; });
  return { app, page, name };
}
async function capture(page, color) {
  await page.locator('#audio-mode').selectOption('system');
  await page.evaluate(color => {
    navigator.mediaDevices.getDisplayMedia = async options => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360; const ctx = canvas.getContext('2d'); let frame = 0;
      setInterval(() => { ctx.fillStyle = color; ctx.fillRect(0, 0, 640, 360); ctx.fillStyle = 'white'; ctx.fillRect(frame++ * 8 % 640, 80, 60, 80); }, 33);
      const stream = canvas.captureStream(30), ac = new AudioContext(), tone = ac.createOscillator(), destination = ac.createMediaStreamDestination();
      tone.connect(destination); tone.start(); if (options.audio) stream.addTrack(destination.stream.getAudioTracks()[0]);
      return stream;
    };
  }, color);
}
async function start(page, relay = false) {
  // Only media connections are forced to fail; the P2P DataChannel to the host has no transceivers.
  if (relay) await page.evaluate(() => { for (const pc of window.testPeers.filter(pc => pc.getTransceivers().length)) { Object.defineProperty(pc, 'connectionState', { configurable: true, value: 'failed' }); pc.dispatchEvent(new Event('connectionstatechange')); } });
  await page.locator('#choose-source').click(); await page.locator('.source-choice').first().click(); await page.locator('#start-button').click();
  await page.locator('#stop-button').waitFor();
}
async function moving(page, expected = 1) {
  await page.waitForFunction(expected => [...document.querySelectorAll('.stream-tile video')].filter(video => video.videoWidth > 0 && video.currentTime > 0).length >= expected, expected, { timeout: 40000 });
  const first = await page.evaluate(() => [...document.querySelectorAll('.stream-tile video')].map(video => video.getVideoPlaybackQuality().totalVideoFrames));
  await sleep(1200);
  const second = await page.evaluate(() => [...document.querySelectorAll('.stream-tile video')].map(video => video.getVideoPlaybackQuality().totalVideoFrames));
  assert.ok(second.every((frames, index) => frames > first[index]), 'transmissões avançam');
}
async function join(page, code, timeout = 60000) {
  await page.locator('#join-room-nav').click(); await page.locator('#join-input').fill(code); await page.locator('#join-button').click();
  await page.waitForFunction(() => document.body.dataset.connected === 'true', null, { timeout });
  return page.evaluate(() => document.body.dataset.route);
}
try {
  const host = await launch('Yuri'), ana = await launch('Ana'), bia = await launch('Bia');
  result.version = (await host.page.evaluate(() => window.concord.bootstrap())).version;
  await host.page.locator('#create-room').click();
  await host.page.waitForFunction(() => document.body.dataset.connected === 'true');
  await host.page.waitForFunction(() => document.querySelector('#invite-link').value.startsWith('concord:p2p:'), null, { timeout: 3000 });
  const code = await host.page.locator('#invite-link').inputValue();
  assert.equal(await host.app.evaluate(() => globalThis.tunnelCalls), 0);
  check('Criar sala mostra o convite P2P na hora, sem pedir túnel à Cloudflare.');
  await host.page.locator('#copy-link-button').click();
  assert.equal(await host.app.evaluate(() => globalThis.copied), P2P_PAGE + '?join=' + code.slice(12));
  check('Copiar link gera a página estática do GitHub Pages.');

  assert.equal(await join(ana.page, code), 'direct');
  await host.page.locator('#audience-list').filter({ hasText: 'Ana' }).waitFor();
  check('Convidada entrou por DataChannel direto, via brokers públicos, sem túnel.');
  await capture(host.page, '#cc3344'); await capture(ana.page, '#338844');
  await start(host.page); await moving(ana.page);
  check('Transmissão do host chega à convidada P2P (sinalização WebRTC pela ponte).');
  await start(ana.page, true); await moving(host.page, 2);
  assert.equal(await host.page.locator('video[data-transport="relay"]').count(), 1);
  check('Modo de compatibilidade (WebM) atravessa a ponte DataChannel com fragmentação.');

  // Bia simulates a strict NAT: no ICE candidates, so the direct channel cannot open.
  await bia.page.evaluate(() => { const PC = window.RTCPeerConnection; window.RTCPeerConnection = class extends PC { constructor(config = {}) { super({ ...config, iceServers: [], iceTransportPolicy: 'relay' }); } }; });
  await host.app.evaluate(() => { globalThis.failNextTunnel = true; });
  await bia.page.locator('#join-room-nav').click(); await bia.page.locator('#join-input').fill(code); await bia.page.locator('#join-button').click();
  await bia.page.locator('#join-error').filter({ hasText: 'modo de compatibilidade' }).waitFor({ timeout: 60000 });
  await host.page.locator('#invite-status').filter({ hasText: 'modo de compatibilidade' }).waitFor();
  await bia.page.locator('#cancel-join').click();
  check('Falha no plano B volta como erro claro para a convidada e aparece para o host.');
  assert.equal(await join(bia.page, code, 90000), 'tunnel');
  assert.equal(await host.app.evaluate(() => globalThis.tunnelCalls), 2);
  await host.page.locator('#audience-list').filter({ hasText: 'Bia' }).waitFor(); await moving(bia.page, 2);
  check('Sem conexão direta, a convidada pediu o plano B e entrou pelo acesso do host (túnel simulado).');

  await host.page.locator('.invite-manage summary').click(); await host.page.locator('#renew-button').click();
  await ana.page.locator('#notice').filter({ hasText: 'Convite substituído' }).waitFor(); await bia.page.locator('#notice').filter({ hasText: 'Convite substituído' }).waitFor();
  await host.page.waitForFunction(old => { const value = document.querySelector('#invite-link').value; return value.startsWith('concord:p2p:') && value !== old; }, code);
  check('Trocar convite derruba convidados P2P e do plano B com o motivo, e gera novo link.');

  await ana.page.locator('#join-room-nav').click(); await ana.page.locator('#join-input').fill(code); await ana.page.locator('#join-button').click();
  await ana.page.locator('#join-error').filter({ hasText: 'Sala não encontrada' }).waitFor({ timeout: 45000 });
  await ana.page.locator('#cancel-join').click();
  check('Link antigo não encontra a sala e mostra erro claro.');

  await host.page.locator('#close-invite').click();
  await host.page.locator('#invite-button:not([hidden])').waitFor(); assert.equal(await host.page.locator('#invite-result').isHidden(), true);
  await host.page.locator('#invite-button').click();
  await host.page.waitForFunction(() => document.querySelector('#invite-link').value.startsWith('concord:p2p:'));
  check('Fechar acesso esconde o link; Gerar novo convite cria outro.');
  assert.deepEqual(errors, []);
  result.passed = true; console.log('P2P_TEST_PASS');
} catch (error) {
  result.error = error.message; result.errors = errors;
  for (const page of pages) console.log('DIAGNOSTIC', await page.evaluate(() => ({ route: document.body.dataset.route, notice: document.getElementById('notice').textContent, status: document.getElementById('invite-status').textContent, join: document.getElementById('join-error').textContent })).catch(() => ({})));
  throw error;
} finally {
  await writeFile(path.join(run, 'result.json'), JSON.stringify(result, null, 2));
  for (const app of apps.reverse()) await app.close().catch(() => app.process().kill());
}
