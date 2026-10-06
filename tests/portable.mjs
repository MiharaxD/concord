import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const child = spawn(path.resolve('dist/Concord-0.1.0-Windows.exe'), [`--remote-debugging-port=${port}`], { stdio: 'ignore' });
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
  await page.locator('#connection-status').filter({ hasText: 'Sala conectada' }).waitFor();
  assert.equal(await page.evaluate(async () => (await window.concord.bootstrap()).version), '0.1.0');
  assert.ok(await page.evaluate(async () => (await window.concord.sources()).length > 0));
  await page.screenshot({ path: path.resolve('test-results/concord-portatil.png') });
  console.log('Portátil: extração, abertura, sala autenticada e seleção de tela confirmadas');
  await page.close();
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('Portátil não encerrou')), 10000).unref())]);
  console.log('PORTABLE_TEST_PASS');
} finally { await browser?.close().catch(() => {}); if (child.exitCode === null) child.kill(); }
