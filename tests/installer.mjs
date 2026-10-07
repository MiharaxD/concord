import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, readFile, writeFile, unlink, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import config from '../build/installer.cjs';
const exec = promisify(execFile);
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const installer = path.resolve(config.directories.output, `Concord-${pkg.version}-Setup.exe`);
const baseline = process.env.CONCORD_BASELINE_INSTALLER ? path.resolve(process.env.CONCORD_BASELINE_INSTALLER) : installer;
const firstVersion = process.env.CONCORD_BASELINE_VERSION || pkg.version;
const stateScript = path.resolve('tests/installer-state.ps1');
const run = path.resolve('test-results/installer-' + Date.now());
const workingDirectory = path.join(os.tmpdir(), 'Concord-installer-' + Date.now());
const data = path.join(run, 'user-data');
const profilePath = path.join(data, 'profile.json');
const defaultProfile = path.join(process.env.APPDATA, 'Concord', 'profile.json');
const sentinel = path.join(process.env.APPDATA, 'Concord', 'installer-test-' + Date.now() + '.txt');
const normalize = value => path.resolve(value).toLowerCase();
const windowsPath = path.join(process.env.SystemRoot, 'System32') + ';' + process.env.SystemRoot;
const runtimeEnv = { ...process.env, PATH: windowsPath, CONCORD_DATA_DIR: data };
delete runtimeEnv.NODE_OPTIONS; delete runtimeEnv.NODE_PATH;
let app, ownedLocation, installed = false;
async function hash(file) { try { return createHash('sha256').update(await readFile(file)).digest('hex'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function state() { const result = await exec('powershell.exe', ['-NoProfile', '-File', stateScript, '-InstallDirectory', ownedLocation || ''], { windowsHide: true, timeout: 20000 }); return JSON.parse(result.stdout); }
async function waitFor(check, label, timeout = 30000) { const end = Date.now() + timeout; while (Date.now() < end) { const result = await check(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 300)); } throw new Error(label); }
async function install(file, flags = []) { await exec(file, ['/S', '/currentuser', ...flags], { cwd: workingDirectory, env: runtimeEnv, windowsHide: true, timeout: 120000 }); }
async function launch(version, first = false, defaultData = false) {
  const env = { ...runtimeEnv }; if (defaultData) delete env.CONCORD_DATA_DIR;
  app = await _electron.launch({ executablePath: path.join(ownedLocation, 'Concord.exe'), args: [], cwd: workingDirectory, env, timeout: 45000 });
  const page = await app.firstWindow(); page.setDefaultTimeout(20000);
  if (first) { await page.locator('#name-picker[open]').waitFor(); await page.locator('#display-name').fill('Teste de instalacao'); await page.locator('#save-name').click(); }
  await page.waitForFunction(() => document.body.dataset.connected === 'true' || document.querySelector('#connection-status')?.textContent.includes('Sala conectada'));
  const runtime = await app.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged, appPath: app.getAppPath(), resources: process.resourcesPath, userData: app.getPath('userData'), cwd: process.cwd() }));
  assert.equal(runtime.version, version); assert.equal(runtime.packaged, true);
  assert.ok(normalize(runtime.appPath).startsWith(normalize(ownedLocation) + path.sep));
  assert.equal(normalize(runtime.cwd), normalize(workingDirectory));
  assert.equal(normalize(runtime.userData), normalize(defaultData ? path.dirname(defaultProfile) : data));
  const assets = await page.evaluate(async () => Promise.all(['/', '/app.js', '/room-media.js', '/style.css', '/icon.svg', '/app-audio-worklet.js'].map(async url => (await fetch(url)).status)));
  assert.ok(assets.every(status => status === 200));
  assert.notEqual(await page.locator('.sidebar').evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
  return page;
}
async function closeApp() {
  if (!app) return;
  const current = app; app = undefined;
  const child = current.process();
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('O app instalado nao fechou em 15 segundos')), 15000).unref());
  try { await Promise.race([current.close(), timeout]); } finally { if (child.exitCode === null) child.kill(); }
}
async function uninstall() {
  if (!installed) return;
  const snapshot = await state();
  assert.equal(normalize(snapshot.Registration.Location), normalize(ownedLocation), 'desinstalar somente a instalacao criada pelo teste');
  const uninstaller = path.resolve(ownedLocation, 'Uninstall Concord.exe');
  assert.ok(normalize(uninstaller).startsWith(normalize(ownedLocation) + path.sep));
  await exec(uninstaller, ['/S', '/currentuser'], { cwd: workingDirectory, env: runtimeEnv, windowsHide: true, timeout: 120000 });
  await waitFor(async () => !(await state()).Registration, 'desinstalador nao removeu o registro');
  installed = false;
}

const before = await state();
assert.equal(before.Registration, null, 'teste requer Windows sem Concord instalado; nao substituir uma instalacao pessoal');
assert.equal(before.DefaultFolderExists, false, 'nao modificar uma pasta Concord preexistente');
assert.equal(before.Desktop, null, 'nao substituir um atalho pessoal'); assert.equal(before.StartMenu, null, 'nao substituir um atalho pessoal');
const defaultHash = await hash(defaultProfile);
await mkdir(run, { recursive: true }); await mkdir(workingDirectory, { recursive: true }); await mkdir(path.dirname(sentinel), { recursive: true });
await writeFile(sentinel, 'dados do usuario preservados', { flag: 'wx' });
try {
  await install(baseline); installed = true;
  const initial = await state();
  ownedLocation = initial.Registration.Location;
  assert.equal(initial.Registration.Version, firstVersion);
  assert.ok(initial.Desktop, 'atalho de desktop ausente; escolha registrada: ' + initial.Registration.DesktopChoice);
  assert.equal(normalize(initial.StartMenu.Target), normalize(path.join(ownedLocation, 'Concord.exe')));
  assert.equal(normalize(initial.Desktop.Target), normalize(path.join(ownedLocation, 'Concord.exe')));
  console.log('Instalacao por usuario, registro e atalhos confirmados; token admin:', before.Administrator);
  let page = await launch(firstVersion, true);
  const photo = path.join(run, 'profile.png'); await page.screenshot({ path: photo, mask: [page.locator('#invite-link')] });
  await app.evaluate(({ dialog }, file) => { global.testPhotoDialog = dialog.showOpenDialog; dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, photo);
  await page.locator('#profile-button').click(); await page.locator('#photo-button').click();
  await page.waitForFunction(() => document.querySelector('#name-avatar img')?.naturalWidth === 128); await page.locator('#save-name').click();
  await app.evaluate(({ dialog }) => { dialog.showOpenDialog = global.testPhotoDialog; });
  await closeApp();
  const savedHash = await hash(profilePath); assert.ok(savedHash);

  await install(installer);
  const updated = await state(); assert.equal(updated.Registration.Version, pkg.version);
  assert.equal(normalize(updated.Registration.Location), normalize(ownedLocation));
  assert.equal(await hash(profilePath), savedHash); assert.equal(await hash(defaultProfile), defaultHash); await access(sentinel);
  assert.ok(updated.StartMenu && updated.Desktop);
  console.log('Atualizacao', firstVersion, '->', pkg.version, 'preservou nome/foto, dados pessoais e atalhos');
  await install(installer, ['--no-desktop-shortcut']);
  assert.equal((await state()).Desktop, null); assert.ok((await state()).StartMenu);
  assert.equal(await hash(profilePath), savedHash);

  page = await launch(pkg.version);
  assert.equal(await page.locator('#name-picker[open]').count(), 0);
  assert.equal(await page.locator('#profile-name').textContent(), 'Teste de instalacao');
  assert.ok((await page.evaluate(() => window.concord.bootstrap())).profile.photo.startsWith('data:image/jpeg;base64,'));
  assert.ok((await page.evaluate(() => window.concord.sources())).length > 0);
  for (const resource of ['cloudflared.exe', 'ConcordAudio.exe', 'cloudflared-version.json', 'cloudflared-LICENSE.txt']) await access(path.join(ownedLocation, 'resources', resource));
  await waitFor(async () => (await state()).Processes.some(process => process.Name === 'cloudflared.exe'), 'componente de conexao embutido nao iniciou');
  await page.evaluate(() => { document.title = 'Teste de audio instalado'; const context = new AudioContext(), tone = context.createOscillator(), gain = context.createGain(); gain.gain.value = .01; tone.connect(gain).connect(context.destination); tone.start(); window.testInstalledTone = context; });
  const source = await page.evaluate(async () => (await window.concord.sources()).find(source => source.name === 'Teste de audio instalado')); assert.ok(source);
  await page.evaluate(async id => { window.installedAudioBytes = 0; window.concord.onAppAudio(bytes => { window.installedAudioBytes += bytes.length; }); await window.concord.startAppAudio(id); }, source.id);
  await page.waitForFunction(() => window.installedAudioBytes > 5000);
  assert.ok((await state()).Processes.some(process => process.Name === 'ConcordAudio.exe'));
  console.log('App fora do projeto abriu sem Node/Python no PATH; assets, servidor, tunel e audio PCM confirmados');
  let busy;
  try { await install(installer); } catch (error) { busy = error; }
  assert.equal(busy?.code, 2, 'instalador deve pedir fechamento, sem matar a sala');
  assert.equal((await page.evaluate(() => window.concord.bootstrap())).version, pkg.version);
  await closeApp();
  await waitFor(async () => (await state()).Processes.length === 0, 'processos auxiliares ficaram abertos');
  console.log('Atualizacao bloqueada com app aberto; fechamento normal encerrou todos os auxiliares');

  await launch(pkg.version, false, true); await closeApp();
  assert.equal(await hash(defaultProfile), defaultHash, 'perfil pessoal existente fica intacto');
  await uninstall();
  const removed = await state(); assert.equal(removed.Desktop, null); assert.equal(removed.StartMenu, null);
  assert.equal(await hash(profilePath), savedHash); assert.equal(await hash(defaultProfile), defaultHash); await access(sentinel);
  assert.equal(await hash(path.join(ownedLocation, 'Concord.exe')), null);
  await writeFile(path.join(run, 'result.json'), JSON.stringify({ version: pkg.version, from: firstVersion, location: ownedLocation, administrator: before.Administrator, profilePreserved: true, helperShutdown: true, uninstall: true }, null, 2));
  console.log('Desinstalacao removeu programa/atalhos/registro e preservou dados; INSTALLER_TEST_PASS');
} finally {
  await closeApp().catch(() => {});
  if (installed) await uninstall().catch(error => console.error('Instalacao de teste ainda presente:', error.message));
  await unlink(sentinel).catch(() => {});
}
