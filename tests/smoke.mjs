import assert from 'node:assert/strict';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import buildConfig from '../build/electron-builder.cjs';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const executablePath = process.env.CONCORD_EXE || path.resolve(buildConfig.directories.output, 'win-unpacked/Concord.exe');
const directory = path.resolve('test-results/smoke-' + Date.now()); await mkdir(directory, { recursive: true });
let app, preconnection;
try {
  app = await _electron.launch({ executablePath, args: [], env: { ...process.env, CONCORD_DATA_DIR: directory }, timeout: 45000 });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  await page.locator('#name-picker[open]').waitFor(); await page.locator('#display-name').fill('Teste do pacote'); await page.locator('#save-name').click();
  await page.waitForFunction(() => document.body.dataset.connected === 'true' || document.querySelector('#connection-status')?.textContent.includes('Sala conectada'));
  const config = await page.evaluate(() => window.concord.bootstrap()); assert.equal(config.version, pkg.version);
  const sources = await page.evaluate(() => window.concord.sources()); assert.ok(sources.length > 0);
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; canvas.getContext('2d').fillRect(0,0,64,64); return canvas.toDataURL('image/png'); });
  assert.ok(await app.evaluate(({ nativeImage }, uri) => { const image = nativeImage.createFromBuffer(Buffer.from(uri.split(',')[1], 'base64')); return !image.isEmpty() && !nativeImage.createFromBuffer(image.toJPEG(75)).isEmpty(); }, png), 'PNG/JPG decodificados nativamente');
  // Spy on the native write so the test never overwrites the user's clipboard.
  await app.evaluate(({ clipboard }) => { global.testWriteOriginal = clipboard.writeText; clipboard.writeText = text => { global.testInviteWritten = text; }; });
  await page.evaluate(() => window.concord.copyInvite());
  const copied = await app.evaluate(({ clipboard }) => {
    clipboard.writeText = global.testWriteOriginal;
    return /^(?:http:\/\/127\.0\.0\.1:\d+\/#join=|concord:[a-z0-9-]+:)[A-Za-z0-9_-]{22}$/.test(global.testInviteWritten);
  });
  assert.ok(copied);
  if (await page.locator('#cancel-invite').isVisible()) {
    await page.locator('#cancel-invite').click(); await page.locator('#invite-status').filter({ hasText: 'Acesso fechado' }).waitFor();
    assert.equal((await page.evaluate(() => window.concord.session())).public, false);
    await page.locator('#invite-button').click(); assert.ok(await page.locator('#invite-button').isDisabled());
    console.log('Preparação automática pode ser cancelada e retomada');
  }
  console.log('Executável: janela, seleção de tela e cópia nativa do convite disponíveis');
  await page.screenshot({ path: path.resolve('test-results/concord-final.png') });
  preconnection = net.connect(new URL(config.address).port, '127.0.0.1'); await once(preconnection, 'connect');
  const started = Date.now();
  await Promise.race([app.close(), new Promise((_, reject) => setTimeout(() => reject(new Error('Fechamento demorou mais de 10 segundos')), 10000).unref())]);
  app = undefined; console.log(`Executável encerrou em ${Date.now() - started}ms, incluindo preconexão sem HTTP`);
  console.log('PACKAGED_SMOKE_PASS');
} finally { preconnection?.destroy(); if (app) { await app.close().catch(() => app.process().kill()); } }
