const base = require('./electron-builder.cjs');
const { version } = require('../package.json');

module.exports = {
  ...base,
  extraMetadata: { concordDistribution: 'installer' },
  directories: { ...base.directories, output: `dist/installer/${version}` },
  win: { ...base.win, target: [{ target: 'nsis', arch: ['x64'] }] },
  nsis: {
    artifactName: 'Concord-${version}-Setup.exe',
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: false,
    createStartMenuShortcut: true,
    createDesktopShortcut: true,
    shortcutName: 'Concord',
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
    installerLanguages: ['pt_BR'],
    displayLanguageSelector: false,
    installerIcon: 'desktop/icon.ico',
    uninstallerIcon: 'desktop/icon.ico',
    include: 'build/installer.nsh'
  }
};
