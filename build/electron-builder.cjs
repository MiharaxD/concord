const { version } = require('../package.json');
// Credentials stay outside the repository. Resource editing remains enabled unsigned.
const certificateSubject = process.env.CONCORD_CERT_SUBJECT;
const signing = Boolean(certificateSubject || process.env.WIN_CSC_LINK || process.env.CSC_LINK);

module.exports = {
  appId: 'local.concord.desktop',
  productName: 'Concord',
  directories: { output: `dist/${version}`, buildResources: 'build' },
  files: ['desktop/**/*', 'public/**/*', 'server.mjs', 'package.json'],
  extraResources: [
    { from: '.runtime/cloudflared.exe', to: 'cloudflared.exe' },
    { from: '.runtime/cloudflared-version.json', to: 'cloudflared-version.json' },
    { from: '.runtime/cloudflared-LICENSE.txt', to: 'cloudflared-LICENSE.txt' },
    { from: '.runtime/ConcordAudio.exe', to: 'ConcordAudio.exe' }
  ],
  asar: true,
  compression: 'normal',
  forceCodeSigning: signing,
  win: {
    target: [{ target: 'portable', arch: ['x64'] }],
    icon: 'desktop/icon.ico',
    requestedExecutionLevel: 'asInvoker',
    signExecutable: signing,
    signtoolOptions: { signingHashAlgorithms: ['sha256'], ...(certificateSubject ? { certificateSubjectName: certificateSubject } : {}) }
  },
  portable: { artifactName: 'Concord-${version}-Windows.exe' },
  publish: { provider: 'github', owner: 'MiharaxD', repo: 'concord', private: false, releaseType: 'draft' },
  electronUpdaterCompatibility: '>= 2.16'
};
