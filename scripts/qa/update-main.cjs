const { app, BrowserWindow, autoUpdater: nativeUpdater } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const metadata = require(path.join(app.getAppPath(), 'package.json'));
if (metadata.name !== 'bbt-update-qa-v038' || !metadata.bbtQaRoot) throw new Error('Run only the isolated packaged updater QA application.');
const qaRoot = path.resolve(metadata.bbtQaRoot);
if (path.basename(qaRoot) !== 'update-e2e') throw new Error('Unexpected updater QA output path.');
for (const name of ['user-data', 'session-data', 'local-app-data', 'roaming-app-data']) fs.mkdirSync(path.join(qaRoot, name), { recursive: true });
app.setName('BeforeBedtime Update QA 038');
app.setAppUserModelId('com.beforebedtime.launcher.update-qa.v038');
app.setPath('appData', path.join(qaRoot, 'roaming-app-data'));
app.setPath('userData', path.join(qaRoot, 'user-data'));
app.setPath('sessionData', path.join(qaRoot, 'session-data'));
// electron-updater uses LOCALAPPDATA independently of Electron's userData.
process.env.LOCALAPPDATA = path.join(qaRoot, 'local-app-data');
process.env.APPDATA = path.join(qaRoot, 'roaming-app-data');
const { autoUpdater } = require('electron-updater');
const log = (...args) => fs.appendFileSync(path.join(qaRoot, 'events.log'), `${new Date().toISOString()} ${args.map(String).join(' ')}\n`);
const failure = (error) => { log('FAILED', error?.stack || error); fs.writeFileSync(path.join(qaRoot, 'failed.txt'), String(error?.stack || error)); app.exit(1); };
process.on('uncaughtException', failure);
process.on('unhandledRejection', failure);
autoUpdater.logger = { info: log, warn: log, error: log, debug: log };
autoUpdater.setFeedURL({ provider: 'generic', url: 'http://127.0.0.1:19838' });
app.on('before-quit', () => log('before-quit', app.getVersion()));
app.on('quit', () => log('quit', app.getVersion()));
nativeUpdater.on('before-quit-for-update', () => {
  log('before-quit-for-update');
  for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.destroy();
});

app.whenReady().then(async () => {
  log('started', app.getVersion(), 'executable', process.execPath, 'userData', app.getPath('userData'));
  if (app.getVersion() === '0.3.8') {
    const evidence = JSON.parse(fs.readFileSync(path.join(qaRoot, 'guards.json'), 'utf8'));
    assert.equal(evidence.passed, true);
    assert.equal(evidence.from, '0.3.7');
    fs.writeFileSync(path.join(qaRoot, 'updated.txt'), app.getVersion());
    log('PASS installed update and relaunched 0.3.8');
    app.quit();
    return;
  }
  assert.equal(app.getVersion(), '0.3.7');
  for (const name of ['updated.txt', 'failed.txt', 'guards.json']) fs.rmSync(path.join(qaRoot, name), { force: true });
  const servicePath = (name) => pathToFileURL(path.join(app.getAppPath(), 'dist-electron/main/services', name)).href;
  const { createLauncherUpdateService } = await import(servicePath('updater.js'));
  const { createRuntimeOperations } = await import(servicePath('runtime-operations.js'));
  const operations = createRuntimeOperations();
  let gameRunning = false;
  let installCalls = 0;
  const realInstall = autoUpdater.quitAndInstall.bind(autoUpdater);
  autoUpdater.quitAndInstall = (...args) => { installCalls += 1; log('quitAndInstall', ...args); realInstall(...args); };
  const service = createLauncherUpdateService({
    updater: autoUpdater,
    onStateChange: (state) => log('state', JSON.stringify(state)),
    prepareToInstall: () => {
      operations.assertIdle();
      if (gameRunning) throw new Error('Stop Minecraft before updating the launcher.');
    }
  });
  assert.equal(autoUpdater.autoInstallOnAppQuit, false);
  service.quitAndInstall();
  assert.equal(installCalls, 0, 'must not install before downloading');
  const window = new BrowserWindow({ show: false });
  await window.loadURL('data:text/html,<h1>Isolated updater QA 0.3.7 to 0.3.8</h1>');
  const timeout = setTimeout(() => failure(new Error('Updater QA timed out after 180 seconds.')), 180_000);
  autoUpdater.once('update-downloaded', () => {
    void (async () => {
      assert.equal(service.getState().version, '0.3.8');
      const passedGuards = ['before-download', 'automatic-install-disabled'];
      for (const [name, method] of [['download-content-operation', 'run'], ['directory-migration', 'changeDirectory'], ['screenshot-read', 'read']]) {
        let finish;
        const pending = operations[method](() => new Promise((resolve) => { finish = resolve; }));
        service.quitAndInstall();
        assert.equal(installCalls, 0, `${name} must block install`);
        assert.equal(service.getState().status, 'downloaded');
        assert.match(service.getState().message, /current download or game operation/);
        finish();
        await pending;
        passedGuards.push(name);
        log('PASS busy guard', name);
      }
      gameRunning = true;
      service.quitAndInstall();
      assert.equal(installCalls, 0, 'running game must block install');
      assert.equal(service.getState().status, 'downloaded');
      assert.match(service.getState().message, /Stop Minecraft/);
      gameRunning = false;
      passedGuards.push('running-game');
      fs.writeFileSync(path.join(qaRoot, 'guards.json'), JSON.stringify({ passed: true, from: '0.3.7', to: '0.3.8', guards: passedGuards, executable: process.execPath, userData: app.getPath('userData') }, null, 2));
      clearTimeout(timeout);
      log('PASS all busy guards; trigger Restart to update');
      service.quitAndInstall();
      service.quitAndInstall();
      assert.equal(installCalls, 1, 'install may be triggered only once');
    })().catch(failure);
  });
  await service.check();
  if (service.getState().status === 'error') throw new Error(service.getState().message);
}).catch(failure);
