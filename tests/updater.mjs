import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, access, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import config from '../build/installer.cjs';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const exec = promisify(execFile), pkg = JSON.parse(await readFile('package.json', 'utf8'));
const output = path.resolve(config.directories.output), filename = `Concord-${pkg.version}-Setup.exe`;
const baseline = path.resolve(process.env.CONCORD_UPDATE_BASELINE || 'test-results/updater-baseline/Concord-0.3.2-Setup.exe');
const oldVersion = process.env.CONCORD_UPDATE_OLD_VERSION || '0.3.2';
assert.notEqual(oldVersion, pkg.version, 'o teste precisa de duas versoes diferentes');
const id = Date.now(), run = path.resolve(`test-results/updater-${id}`), data = path.join(run, 'user-data');
const cwd = path.join(os.tmpdir(), `Concord-updater-${id}`), stateScript = path.resolve('tests/installer-state.ps1');
const profile = path.join(data, 'profile.json'), log = path.join(data, 'updates.log');
const defaultProfile = path.join(process.env.APPDATA, 'Concord', 'profile.json');
const env = { ...process.env, PATH: process.env.SystemRoot + '\\System32;' + process.env.SystemRoot, CONCORD_DATA_DIR: data };
delete env.NODE_OPTIONS; delete env.NODE_PATH; delete env.GH_TOKEN; delete env.GITHUB_TOKEN;
let location, app, installed = false, mode = 'offline', requests = [], progress;
let ownsDefaultProfile = false, expectedDefaultHash;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function hash(file) { try { return createHash('sha256').update(await readFile(file)).digest('hex'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function state() { return JSON.parse((await exec('powershell.exe', ['-NoProfile', '-File', stateScript, '-InstallDirectory', location || ''], { windowsHide: true, timeout: 20000 })).stdout); }
async function wait(check, label, timeout = 45000) { const end = Date.now() + timeout; while (Date.now() < end) { const value = await check(); if (value) return value; await pause(300); } throw new Error(label); }
async function close() { if (app) { const current = app; app = undefined; await current.close(); } }
async function closeOwnedWindows() {
  for (const proc of (await state()).Processes.filter(proc => proc.Name === 'Concord.exe')) {
    await exec('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${Number(proc.Id)} -ErrorAction SilentlyContinue).CloseMainWindow()`], { windowsHide: true }).catch(() => {});
  }
  await wait(async () => !(await state()).Processes.length, 'processos do teste nao fecharam');
}
async function launch() {
  app = await _electron.launch({ executablePath: path.join(location, 'Concord.exe'), args: [], cwd, env, timeout: 45000 });
  const page = await app.firstWindow(); page.setDefaultTimeout(25000);
  await page.waitForURL('http://127.0.0.1:*/');
  assert.equal((await page.evaluate(() => window.concord.bootstrap())).version, oldVersion);
  assert.equal((await page.evaluate(() => window.concord.updateState())).enabled, true);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const preferences = await app.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration };
  });
  assert.deepEqual(preferences, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  return page;
}
const latest = await readFile(path.join(output, 'latest.yml'), 'utf8');
const allowed = new Map([[filename, path.join(output, filename)], [filename + '.blockmap', path.join(output, filename + '.blockmap')]]);
const feed = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname.slice(1));
    requests.push({ name, range: req.headers.range || null });
    if (name === 'latest.yml') {
      if (mode === 'offline') { res.writeHead(503); res.end('offline'); return; }
      const content = mode === 'same' ? latest.replace(`version: ${pkg.version}`, `version: ${oldVersion}`) : latest;
      res.writeHead(200, { 'Content-Type': 'text/yaml', 'Content-Length': Buffer.byteLength(content) }); res.end(content); return;
    }
    const file = allowed.get(name); if (!file) { res.writeHead(404); res.end(); return; }
    const size = (await stat(file)).size;
    let start = 0, end = size - 1;
    if (req.headers.range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (!match) { res.writeHead(416); res.end(); return; }
      start = Number(match[1]); end = match[2] ? Number(match[2]) : end;
      if (start > end || end >= size) { res.writeHead(416); res.end(); return; }
    }
    res.writeHead(req.headers.range ? 206 : 200, { 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
      ...(req.headers.range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    for await (const chunk of createReadStream(file, { start, end, highWaterMark: 256 * 1024 })) {
      if (res.destroyed) break;
      if (!res.write(chunk)) await once(res, 'drain');
      await pause(25); // Real HTTP transfer long enough to observe intermediate progress.
    }
    res.end();
  } catch (error) { res.destroy(error); }
});
const before = await state();
assert.equal(before.Registration, null, 'use Windows sem Concord instalado; nao alterar instalacao pessoal');
assert.equal(before.DefaultFolderExists, false); assert.equal(before.Desktop, null); assert.equal(before.StartMenu, null);
await access(baseline); const defaultHash = await hash(defaultProfile);
expectedDefaultHash = defaultHash;
await mkdir(data, { recursive: true }); await mkdir(cwd, { recursive: true });
await new Promise(resolve => feed.listen(0, '127.0.0.1', resolve));
const feedUrl = `http://127.0.0.1:${feed.address().port}/`;
try {
  await exec(baseline, ['/S', '/currentuser'], { cwd, env, windowsHide: true, timeout: 120000 }); installed = true;
  location = (await state()).Registration.Location;
  assert.equal((await state()).Registration.Version, oldVersion);
  // Alter ONLY the throwaway installed fixture's feed. Production artifacts keep public GitHub.
  await writeFile(path.join(location, 'resources/app-update.yml'), `provider: generic\nurl: ${feedUrl}\nuseMultipleRangeRequest: false\nupdaterCacheDirName: concord-updater-test-${id}\n`);
  let page = await launch();
  await page.locator('#name-picker[open]').waitFor(); await page.locator('#display-name').fill('Teste de atualizacao'); await page.locator('#save-name').click();
  await page.waitForFunction(() => document.body.dataset.connected === 'true' || document.querySelector('#connection-status')?.textContent.includes('Sala conectada'));
  await page.waitForFunction(async () => (await window.concord.updateState()).phase === 'error');
  assert.equal(await page.locator('#update-label').isVisible(), false);
  const photo = path.join(run, 'photo.png'); await page.screenshot({ path: photo, mask: [page.locator('#invite-link')] });
  await app.evaluate(({ dialog }, photo) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [photo] }); }, photo);
  // Concurrent saves must preserve both fields before closing/restarting.
  await page.evaluate(() => Promise.all([window.concord.setName('Teste de atualizacao'), window.concord.choosePhoto()]));
  const saved = JSON.parse(await readFile(profile, 'utf8')); assert.equal(saved.name, 'Teste de atualizacao'); assert.ok(saved.photo.startsWith('data:image/jpeg;base64,'));
  const savedHash = await hash(profile);
  const firstChecks = requests.filter(req => req.name === 'latest.yml').length;
  await page.evaluate(() => window.concord.updatesReady()); await pause(1200);
  assert.equal(requests.filter(req => req.name === 'latest.yml').length, firstChecks);
  mode = 'same'; await page.locator('#check-updates').click();
  await page.locator('#update-label').filter({ hasText: 'versão mais recente' }).waitFor();
  assert.equal((await page.evaluate(() => window.concord.updateState())).phase, 'idle');
  await close();
  console.log('Offline sem bloquear, uma consulta por abertura, consulta manual e perfil concorrente confirmados');

  // NSIS reopens through the Windows shell, using the normal Windows profile.
  // Use an existing profile read-only; create a fixture only when none exists.
  if (defaultHash === null) {
    await mkdir(path.dirname(defaultProfile), { recursive: true });
    await writeFile(defaultProfile, JSON.stringify(saved), { flag: 'wx' }); ownsDefaultProfile = true;
    expectedDefaultHash = await hash(defaultProfile);
  }
  const normalProfile = JSON.parse(await readFile(defaultProfile, 'utf8'));
  assert.ok(normalProfile.name, 'o perfil normal precisa de um nome para este teste');
  delete env.CONCORD_DATA_DIR;
  const restartedLog = path.join(path.dirname(defaultProfile), 'updates.log');
  mode = 'update'; requests = []; page = await launch();
  await page.waitForFunction(async () => (await window.concord.updateState()).phase === 'downloading', null, { timeout: 60000 });
  await page.waitForFunction(() => { const p = document.querySelector('#update-progress'); return !p.hidden && p.value > 0 && p.value < 100; });
  progress = await page.locator('#update-label').textContent();
  await page.screenshot({ path: path.join(run, 'download.png'), mask: [page.locator('#invite-link')] });
  await page.locator('#install-update').waitFor({ state: 'visible', timeout: 180000 });
  assert.equal((await state()).Registration.Version, oldVersion);
  await page.screenshot({ path: path.join(run, 'ready.png'), mask: [page.locator('#invite-link')] });
  await close();
  assert.equal((await state()).Registration.Version, oldVersion, 'fechar normalmente nao instala sem o clique');
  console.log('Download HTTP real, progresso e instalacao somente com clique confirmados:', progress);

  page = await launch(); await page.locator('#install-update').waitFor({ state: 'visible', timeout: 60000 });
  await wait(async () => (await state()).Processes.some(proc => proc.Name === 'cloudflared.exe'), 'tunel nao iniciou');
  await page.evaluate(() => { document.title = 'Teste de audio para atualizar'; const context = new AudioContext(), tone = context.createOscillator(), gain = context.createGain(); gain.gain.value = .01; tone.connect(gain).connect(context.destination); tone.start(); window.testTone = context; });
  const source = await page.evaluate(async () => (await window.concord.sources()).find(source => source.name === 'Teste de audio para atualizar')); assert.ok(source);
  await page.evaluate(async id => { window.audioBytes = 0; window.concord.onAppAudio(bytes => { window.audioBytes += bytes.length; }); await window.concord.startAppAudio(id); }, source.id);
  await page.waitForFunction(() => window.audioBytes > 5000);
  const oldProcesses = (await state()).Processes; assert.ok(oldProcesses.some(proc => proc.Name === 'ConcordAudio.exe'));
  const oldPid = app.process().pid;
  const logOffset = (await readFile(restartedLog, 'utf8')).length;
  await page.locator('#install-update').click();
  await wait(async () => (await state()).Registration?.Version === pkg.version, 'NSIS nao instalou a nova versao', 120000);
  app = undefined;
  const restarted = await wait(async () => {
    const snapshot = await state();
    const running = snapshot.Processes.find(proc => proc.Name === 'Concord.exe' && !oldProcesses.some(old => old.Id === proc.Id));
    let text = ''; try { text = (await readFile(restartedLog, 'utf8')).slice(logOffset); } catch {}
    return running && text.includes(`Concord ${pkg.version} iniciou`) ? running : false;
  }, 'nova versao nao reabriu automaticamente', 60000);
  const after = await state();
  assert.ok(!after.Processes.some(proc => oldProcesses.some(old => old.Id === proc.Id)), 'auxiliares/Concord antigos ficaram abertos');
  assert.equal(await hash(profile), savedHash); assert.equal(await hash(defaultProfile), expectedDefaultHash);
  assert.ok(after.Desktop && after.StartMenu);
  await closeOwnedWindows();
  app = await _electron.launch({ executablePath: path.join(location, 'Concord.exe'), args: [], cwd, env, timeout: 45000 }); page = await app.firstWindow();
  await page.waitForFunction(() => document.body.dataset.connected === 'true' || document.querySelector('#connection-status')?.textContent.includes('Sala conectada'));
  const actual = await page.evaluate(() => window.concord.bootstrap());
  assert.equal(actual.version, pkg.version); assert.equal(actual.profile.name, normalProfile.name); assert.equal(actual.profile.photo, normalProfile.photo);
  assert.equal(await page.locator('#name-picker[open]').count(), 0);
  await page.screenshot({ path: path.join(run, 'updated.png'), mask: [page.locator('#invite-link')] });
  await close();
  console.log('quitAndInstall real:', oldVersion, '->', pkg.version, '; reinicio automatico e nome/foto preservados');
  await writeFile(path.join(run, 'result.json'), JSON.stringify({ ok: true, version: pkg.version, from: oldVersion, feed: 'HTTP local; electron-updater/NSIS reais', progress,
    oldPid, restartedPid: restarted.Id, profileSha256: expectedDefaultHash, qaProfileSha256: savedHash, defaultProfileUntouched: true, auxiliaryShutdown: true, requests }, null, 2));
} finally {
  await close().catch(() => {});
  if (installed && location) {
    await closeOwnedWindows();
    await exec(path.join(location, 'Uninstall Concord.exe'), ['/S', '/currentuser'], { cwd, env, windowsHide: true, timeout: 120000 });
    await wait(async () => !(await state()).Registration, 'desinstalacao do teste nao terminou');
    assert.equal(await hash(defaultProfile), expectedDefaultHash);
  }
  if (ownsDefaultProfile) { assert.equal(await hash(defaultProfile), expectedDefaultHash); await unlink(defaultProfile); }
  feed.closeAllConnections(); await new Promise(resolve => feed.close(resolve));
}
