const path = require('node:path');
const { existsSync } = require('node:fs');
const { appendFile, stat, rename } = require('node:fs/promises');

function createUpdater({ app, send, shutdown }) {
  const metadata = require(path.join(app.getAppPath(), 'package.json'));
  const enabled = app.isPackaged && process.platform === 'win32' && metadata.concordDistribution === 'installer'
    && !process.env.PORTABLE_EXECUTABLE_FILE && existsSync(path.join(path.dirname(app.getPath('exe')), 'Uninstall Concord.exe'));
  let state = { enabled, phase: 'idle', version: app.getVersion(), nextVersion: '', percent: 0, manual: false };
  let started = false, checking, installing = false, logQueue = Promise.resolve();
  const logfile = path.join(app.getPath('userData'), 'updates.log');
  const logger = Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, (...values) => {
    // No invite, host token, profile or credentials are included in update logs.
    const message = values.map(value => value instanceof Error ? value.message : String(value)).join(' ').slice(0, 8000);
    logQueue = logQueue.then(async () => {
      try { if ((await stat(logfile)).size > 1024 * 1024) await rename(logfile, logfile + '.previous'); } catch {}
      await appendFile(logfile, `${new Date().toISOString()} [${level}] ${message}\n`);
    }).catch(() => {});
  }]));
  function change(next) { state = { ...state, ...next }; send({ ...state }); }
  function fail(error) {
    logger.error(error);
    if (state.phase !== 'ready') change({ phase: 'error', percent: 0 });
  }
  let updater;
  if (enabled) {
    try {
      updater = require('electron-updater').autoUpdater;
      updater.logger = logger;
      updater.autoDownload = true;
      updater.autoInstallOnAppQuit = false;
      updater.allowPrerelease = false;
      updater.allowDowngrade = false;
      updater.autoRunAppAfterInstall = true;
      updater.on('checking-for-update', () => change({ phase: 'checking', percent: 0 }));
      updater.on('update-available', info => change({ phase: 'available', nextVersion: info.version, percent: 0 }));
      updater.on('update-not-available', () => change({ phase: 'idle', nextVersion: '', percent: 0 }));
      updater.on('download-progress', info => change({ phase: 'downloading', percent: Math.max(0, Math.min(100, Number(info.percent) || 0)) }));
      updater.on('update-downloaded', info => change({ phase: 'ready', nextVersion: info.version, percent: 100 }));
      updater.on('error', fail);
      logger.info(`Concord ${app.getVersion()} iniciou; atualizacao por NSIS habilitada.`);
    } catch (error) { fail(error); }
  }
  async function check(manual = false) {
    if (!enabled || !updater || installing || ['available', 'downloading', 'ready'].includes(state.phase)) return { ...state };
    if (checking) return checking;
    change({ manual, phase: 'checking' });
    checking = (async () => {
      try {
        const result = await updater.checkForUpdates();
        if (result?.downloadPromise) await result.downloadPromise;
      } catch (error) { fail(error); }
      finally { checking = undefined; }
      return { ...state };
    })();
    return checking;
  }
  return {
    state: () => ({ ...state }),
    start: () => {
      if (started) return;
      started = true;
      // Renderer calls this after bootstrap, once. Network never blocks the UI.
      if (enabled) setImmediate(() => { void check(); });
    },
    check: () => check(true),
    install: async () => {
      if (!updater || state.phase !== 'ready' || installing) return false;
      installing = true; change({ phase: 'installing' });
      try {
        await shutdown();
        logger.info('Dados salvos e auxiliares encerrados; aplicando atualizacao.');
        await logQueue;
        updater.quitAndInstall(true, true);
        return true;
      } catch (error) { installing = false; fail(error); return false; }
    }
  };
}
module.exports = { createUpdater };
