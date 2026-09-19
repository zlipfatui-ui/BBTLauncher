# Windows release

Finish implementation, run `npm test` and the required UI/updater QA, then commit all source changes. `release:win` requires that exact full commit SHA and a clean tracked Git state. It preserves the production app ID, product name, update provider, and default `../../BBTLauncher-release` layout. `BBT_RELEASE_DIR` or `--release-dir` can select another dedicated directory whose leaf name is `BBTLauncher-release`; cleanup rejects junctions and redirected paths.

Package from a physical checkout with physical `node_modules`. A Windows junction to another checkout can make npm report hoisted dependencies as missing and electron-builder silently omit them; the release builder rejects that layout before cleaning/building. Use a physical checkout on a drive with enough free space for dependencies, unpacked Electron, both installers, and temporary archives.

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
$env:BBT_RELEASE_COMMIT = $releaseCommit
# Optional explicit worktree output (default is already outside the repository):
$env:BBT_RELEASE_DIR = 'C:/Users/zLip/.codex/worktrees/BBTLauncher-release'
npm run release:win
```

Builds always pass `--publish never` to electron-builder. The local `release-manifest.json` records the pinned commit, names, sizes, SHA512, and SHA256 for Setup.exe, Setup.exe.blockmap, Portable.exe, and latest.yml. The feed must name the exact Setup version/path/size/SHA512. Test and inspect the final production artifacts before publication. The [isolated updater harness](qa/README.md) exercises installer/relaunch independently of the normal launcher.

Publication uploads the already reviewed artifacts and never rebuilds them. Push the pinned commit to GitHub first. Obtain the token without printing it:

```powershell
npm run publish:win -- --commit $releaseCommit --validate-only
$env:GH_TOKEN = (gh auth token).Trim()
try {
  npm run publish:win -- --commit $releaseCommit
} finally {
  Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
}
```

The publisher validates local bytes against the build manifest, refuses an existing published release or mismatched tag/commit, and creates or resumes a pinned draft. It uploads missing assets, downloads every remote asset to verify its complete SHA512 and size, checks GitHub SHA256 digests when available, and only then publishes stable `0.3.8` / `v0.3.8` with `make_latest: true`. Failures before the final publish request leave the draft and its uploaded assets for inspection; existing assets are never silently deleted. If a network failure occurs during the final publish request, inspect GitHub because its outcome may be uncertain. After publication, independently verify the public Latest release, public `latest.yml`, and public artifact downloads.

`npm run test:release` tests the release logic with temporary local files and a controlled GitHub transport. It performs no real GitHub writes.
