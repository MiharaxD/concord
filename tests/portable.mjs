import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import buildConfig from '../build/electron-builder.cjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const directory = path.resolve('test-results/portable-' + Date.now()); await mkdir(directory, { recursive: true });
const child = spawn(path.resolve(buildConfig.directories.output, `Concord-${pkg.version}-Windows.exe`), [`--remote-debugging-port=${port}`], { stdio: 'ignore', env: { ...process.env, CONCORD_DATA_DIR: directory } });
const exited = once(child, 'exit');
let browser;
try {
  const deadline = Date.now() + 45000; let ready = false;
  while (Date.now() < deadline) {
    try { const response = await fetch(`http://127.0.0.1:${port}/json/version`); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'o executável portátil extrai e abre a janela Electron');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0].pages()[0]; page.setDefaultTimeout(15000);
  await page.locator('#name-picker[open]').waitFor(); await page.locator('#display-name').fill('Teste portatil'); await page.locator('#save-name').click();
  await page.waitForFunction(() => document.body.dataset.connected === 'true' || document.querySelector('#connection-status')?.textContent.includes('Sala conectada'));
  assert.equal(await page.evaluate(async () => (await window.concord.bootstrap()).version), pkg.version);
  assert.ok(await page.evaluate(async () => (await window.concord.sources()).length > 0));
  await page.screenshot({ path: path.resolve('test-results/concord-portatil.png') });
  console.log('Portátil: extração, abertura, sala autenticada e seleção de tela confirmadas');
  await page.evaluate(() => {
    document.title = 'Teste de audio portatil';
    const ac = new AudioContext(), tone = ac.createOscillator(), gain = ac.createGain();
    gain.gain.value = .01; tone.connect(gain).connect(ac.destination); tone.start(); window.testPortableTone = ac;
  });
  const source = await page.evaluate(async () => (await window.concord.sources()).find(item => item.name === 'Teste de audio portatil'));
  assert.ok(source);
  await page.evaluate(async id => {
    window.testNativeBytes = 0; window.testOff = window.concord.onAppAudio(bytes => { window.testNativeBytes += bytes.length; });
    await window.concord.startAppAudio(id);
  }, source.id);
  await page.waitForFunction(() => window.testNativeBytes > 5000);
  await page.evaluate(async () => { await window.concord.stopAppAudio(); window.testOff(); await window.testPortableTone.close(); });
  console.log('Portátil: capturador de áudio por app embutido iniciou e entregou PCM');
  await page.close();
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('Portátil não encerrou')), 10000).unref())]);
  console.log('PORTABLE_TEST_PASS');
} finally { await browser?.close().catch(() => {}); if (child.exitCode === null) child.kill(); }
