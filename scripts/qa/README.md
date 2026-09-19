# Isolated updater QA: 0.3.7 to 0.3.8

These sources package a separate application that imports the compiled production updater service and runtime-operation guards. The QA app has its own app ID, executable, installation, userData, sessionData, and updater cache. It never starts the normal launcher or loads player data. Both QA versions contain the current compiled updater logic; this tests version transition and the actual Windows installer/relaunch, while unit tests cover the production service behavior.

Run from the repository root in PowerShell. Build the production TypeScript first, then both isolated QA installers. Never publish these files.

Use physical `node_modules`; the QA config rejects a junction because it can cause electron-builder to omit transitive dependencies. An isolated staging project can contain copies of `package.json`, `package-lock.json`, `scripts/qa`, compiled `dist-electron`, and physical dependencies. Set `BBT_QA_ROOT` to a dedicated `update-e2e` directory on a drive with sufficient free space.

```powershell
npm run build:electron
$env:BBT_QA_ROOT = Join-Path (Get-Location) 'release/qa/update-e2e'
$env:BBT_QA_VERSION = '0.3.7'
npx electron-builder --config scripts/qa/update-builder.cjs --win --x64 --publish never
$env:BBT_QA_VERSION = '0.3.8'
npx electron-builder --config scripts/qa/update-builder.cjs --win --x64 --publish never
Remove-Item Env:BBT_QA_VERSION
```

Start the localhost server in a hidden background process, install **only the QA 0.3.7 installer** into the dedicated QA path, and launch that QA executable:

```powershell
$qaRoot = [System.IO.Path]::GetFullPath($env:BBT_QA_ROOT)
$serverScript = Join-Path (Get-Location) 'scripts/qa/update-server.cjs'
$qaServer = Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"' + $serverScript + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $qaRoot 'server.log') -RedirectStandardError (Join-Path $qaRoot 'server-error.log')
$qaInstaller = Join-Path $qaRoot 'build/0.3.7/Update-QA-038-0.3.7.exe'
$qaInstallDir = Join-Path $qaRoot 'installed'
$qaInstall = Start-Process -FilePath $qaInstaller -ArgumentList @('/S', ('/D=' + $qaInstallDir)) -WindowStyle Hidden -PassThru -Wait
if ($qaInstall.ExitCode -ne 0) { throw 'QA installer failed' }
$qaApp = Join-Path $qaInstallDir 'BeforeBedtime Update QA 038.exe'
Start-Process -FilePath $qaApp -WindowStyle Hidden
```

The app checks localhost, downloads 0.3.8, proves blocked installation before download and while a download/content operation, folder migration, screenshot read, or simulated game is active, and checks automatic install-on-quit stays off. It then installs once and relaunches the isolated 0.3.8 executable. `guards.json` must have `passed: true`, `updated.txt` must contain `0.3.8`, `events.log` must show the restart and version transition, and `failed.txt` must be absent. The game guard uses a controlled running-game state; this harness does not launch Minecraft.

After collecting evidence, stop only the server process started above:

```powershell
Get-Content (Join-Path $qaRoot 'guards.json')
Get-Content (Join-Path $qaRoot 'updated.txt')
Get-Content (Join-Path $qaRoot 'events.log')
if (Test-Path (Join-Path $qaRoot 'failed.txt')) { throw 'Updater QA failed; inspect failed.txt' }
Stop-Process -Id $qaServer.Id
Remove-Item Env:BBT_QA_ROOT
```

The source harness is excluded from production packaging. All outputs remain under the ignored `release/qa/update-e2e` directory. This QA executable has no visible UI and exits after the target version records success.
