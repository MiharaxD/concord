const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../desktop/updater.cjs'), 'utf8');

function harness({ packaged = true, installed = true, portable = false } = {}) {
  const updater = new EventEmitter(), sent = [], calls = [], tasks = [];
  let mode = 'same', checks = 0;
  updater.checkForUpdates = async () => {
    checks++; updater.emit('checking-for-update');
    if (mode === 'error') { updater.emit('error', new Error('offline')); throw new Error('offline'); }
    if (mode === 'download') {
      updater.emit('update-available', { version: '1.0.1' });
      return { downloadPromise: new Promise(resolve => tasks.push(() => {
        updater.emit('download-progress', { percent: 47 });
        updater.emit('update-downloaded', { version: '1.0.1' }); resolve();
      })) };
    }
    updater.emit('update-not-available'); return {};
  };
  updater.quitAndInstall = (...args) => calls.push(['install', ...args]);
  const module = { exports: {} };
  vm.runInNewContext(source, { module, process: { platform: 'win32', env: portable ? { PORTABLE_EXECUTABLE_FILE: 'app.exe' } : {} }, setImmediate,
    require: name => {
      if (name === 'node:path') return path;
      if (name === 'node:fs') return { existsSync: () => installed };
      if (name === 'node:fs/promises') return { stat: async () => ({ size: 0 }), appendFile: async () => {}, rename: async () => {} };
      if (name === 'electron-updater') { calls.push(['load']); return { autoUpdater: updater }; }
      return { concordDistribution: 'installer' };
    }
  });
  const app = { isPackaged: packaged, getAppPath: () => 'app', getVersion: () => '1.0.0', getPath: () => 'app.exe' };
  const controller = module.exports.createUpdater({ app, send: state => sent.push(state), shutdown: async () => calls.push(['shutdown']) });
  return { controller, updater, sent, calls, tasks, set mode(value) { mode = value; }, get checks() { return checks; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('desenvolvimento, portatil e pacote sem instalacao nao carregam updater', async () => {
  for (const options of [{ packaged: false }, { portable: true }, { installed: false }]) {
    const h = harness(options); h.controller.start(); await tick(); await h.controller.check();
    assert.equal(h.controller.state().enabled, false); assert.equal(h.checks, 0); assert.deepEqual(h.calls, []);
  }
});
test('inicializacao verifica uma vez e erro offline permite verificacao manual', async () => {
  const h = harness(); h.mode = 'error'; h.controller.start(); h.controller.start(); await tick(); await tick();
  assert.equal(h.checks, 1); assert.equal(h.controller.state().phase, 'error'); assert.equal(h.controller.state().manual, false);
  h.mode = 'same'; await h.controller.check(); assert.equal(h.checks, 2); assert.equal(h.controller.state().phase, 'idle'); assert.equal(h.controller.state().manual, true);
});
test('download concorrente nao duplica consulta e instala somente apos shutdown', async () => {
  const h = harness(); h.mode = 'download';
  const check = h.controller.check(); await tick(); const duplicate = h.controller.check();
  assert.equal(h.checks, 1); assert.equal(h.updater.autoInstallOnAppQuit, false); assert.equal(await h.controller.install(), false);
  h.tasks[0](); await check; await duplicate;
  assert.ok(h.sent.some(state => state.phase === 'downloading' && state.percent === 47));
  assert.equal(h.controller.state().phase, 'ready'); assert.equal(h.calls.some(call => call[0] === 'install'), false);
  await h.controller.install(); await h.controller.install();
  assert.deepEqual(h.calls.slice(-2), [['shutdown'], ['install', true, true]]);
});
