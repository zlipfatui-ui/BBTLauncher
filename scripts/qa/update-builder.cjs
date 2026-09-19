const path = require('node:path');

const version = process.env.BBT_QA_VERSION || '0.3.7';
if (!['0.3.7', '0.3.8'].includes(version)) throw new Error('QA builds support only 0.3.7 and 0.3.8.');
const qaRoot = path.resolve(process.env.BBT_QA_ROOT || path.join(__dirname, '../../release/qa/update-e2e'));
if (path.basename(qaRoot) !== 'update-e2e') throw new Error('BBT_QA_ROOT must name a dedicated update-e2e directory.');

module.exports = {
  extends: null,
  appId: 'com.beforebedtime.launcher.update-qa.v038',
  productName: 'BeforeBedtime Update QA 038',
  electronDist: 'node_modules/electron/dist',
  extraMetadata: { name: 'bbt-update-qa-v038', main: 'scripts/qa/update-main.cjs', version, bbtQaRoot: qaRoot },
  files: ['dist-electron/main/services/updater.js', 'dist-electron/main/services/runtime-operations.js', 'scripts/qa/update-main.cjs', 'package.json'],
  directories: { output: path.join(qaRoot, 'build', version) },
  publish: { provider: 'generic', url: 'http://127.0.0.1:19838' },
  asar: true,
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: false,
    createStartMenuShortcut: false,
    runAfterFinish: false,
    artifactName: 'Update-QA-038-${version}.exe'
  },
  win: { target: [{ target: 'nsis', arch: ['x64'] }], executableName: 'BeforeBedtime Update QA 038' }
};
