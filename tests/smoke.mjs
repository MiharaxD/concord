import assert from 'node:assert/strict';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const executablePath = process.env.CONCORD_EXE || path.resolve('dist/win-unpacked/Concord.exe');
let app, preconnection;
try {
  app = await _electron.launch({ executablePath, args: [], timeout: 45000 });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  await page.locator('#connection-status').filter({ hasText: 'Sala conectada' }).waitFor();
  const config = await page.evaluate(() => window.concord.bootstrap()); assert.equal(config.version, '0.1.0');
  const sources = await page.evaluate(() => window.concord.sources()); assert.ok(sources.length > 0);
  // Spy on the native write so the test never overwrites the user's clipboard.
  await app.evaluate(({ clipboard }) => { global.testWriteOriginal = clipboard.writeText; clipboard.writeText = text => { global.testInviteWritten = text; }; });
  await page.evaluate(() => window.concord.copyInvite());
  const copied = await app.evaluate(({ clipboard }) => {
    clipboard.writeText = global.testWriteOriginal;
    return /^http:\/\/127\.0\.0\.1:\d+\/#join=[A-Za-z0-9_-]{43}$/.test(global.testInviteWritten);
  });
  assert.ok(copied);
  console.log('Executável: janela, seleção de tela e cópia nativa do convite disponíveis');
  await page.screenshot({ path: path.resolve('test-results/concord-final.png') });
  preconnection = net.connect(new URL(config.address).port, '127.0.0.1'); await once(preconnection, 'connect');
  const started = Date.now();
  await Promise.race([app.close(), new Promise((_, reject) => setTimeout(() => reject(new Error('Fechamento demorou mais de 10 segundos')), 10000).unref())]);
  app = undefined; console.log(`Executável encerrou em ${Date.now() - started}ms, incluindo preconexão sem HTTP`);
  console.log('PACKAGED_SMOKE_PASS');
} finally { preconnection?.destroy(); if (app) { app.process().kill(); } }
