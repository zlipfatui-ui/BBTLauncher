import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import * as support from './release-support.mjs';
import * as publisher from './publish-github-release.mjs';
const version = '0.3.8';
const commit = '1234567890abcdef1234567890abcdef12345678';
const setupName = 'BeforeBedtime-Launcher-Setup-0.3.8.exe';
const portableName = 'BeforeBedtime-Launcher-Portable-0.3.8.exe';
const hash = (value) => createHash('sha512').update(value).digest('base64');

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bbt-release-test-'));
  const releaseDir = path.join(root, 'BBTLauncher-release');
  await mkdir(releaseDir);
  t.after(() => rm(root, { recursive: true, force: true }));
  const setup = Buffer.from('MZ valid setup fixture');
  const files = {
    [setupName]: setup,
    [`${setupName}.blockmap`]: Buffer.from('blockmap fixture'),
    [portableName]: Buffer.from('MZ portable fixture'),
    'latest.yml': Buffer.from(`version: 0.3.8\nfiles:\n  - url: ${setupName}\n    sha512: ${hash(setup)}\n    size: ${setup.length}\npath: ${setupName}\nsha512: ${hash(setup)}\nreleaseDate: '2026-09-20T00:00:00.000Z'\n`)
  };
  for (const [name, value] of Object.entries(files)) await writeFile(path.join(releaseDir, name), value);
  return { root, releaseDir, files };
}

test('validates every artifact and ties latest.yml to the installer bytes', async (t) => {
  assert.equal(typeof support.validateLocalRelease, 'function', 'local release validation is implemented');
  const { releaseDir } = await fixture(t);
  const result = await support.validateLocalRelease({ releaseDir, version });
  assert.equal(result.assets.length, 4);
  assert.deepEqual(result.assets.map((asset) => asset.name).sort(), [setupName, `${setupName}.blockmap`, portableName, 'latest.yml'].sort());
  assert.equal(result.assets.find((asset) => asset.name === setupName).sha512, hash(Buffer.from('MZ valid setup fixture')));
});

for (const [label, mutate] of [
  ['wrong version', (text) => text.replace('version: 0.3.8', 'version: 0.3.7')],
  ['path traversal', (text) => text.replaceAll(setupName, `../${setupName}`)],
  ['wrong size', (text) => text.replace(/size: \d+/, 'size: 1')],
  ['wrong hash', (text) => text.replace(/sha512: .+/g, 'sha512: corrupt')],
  ['duplicate YAML keys', (text) => `version: 0.3.7\n${text}`]
]) {
  test(`rejects metadata with ${label}`, async (t) => {
    assert.equal(typeof support.validateLocalRelease, 'function');
    const { releaseDir } = await fixture(t);
    const filename = path.join(releaseDir, 'latest.yml');
    await writeFile(filename, mutate(await readFile(filename, 'utf8')));
    await assert.rejects(support.validateLocalRelease({ releaseDir, version }));
  });
}

test('rejects missing and empty portable files before publication', async (t) => {
  assert.equal(typeof support.validateLocalRelease, 'function');
  const { releaseDir } = await fixture(t);
  await rm(path.join(releaseDir, portableName));
  await assert.rejects(support.validateLocalRelease({ releaseDir, version }));
  await writeFile(path.join(releaseDir, portableName), '');
  await assert.rejects(support.validateLocalRelease({ releaseDir, version }), /empty|non-empty/i);
});

test('release cleanup rejects source paths and resolves the explicit output directory', async (t) => {
  assert.equal(typeof support.resolveReleaseDirectory, 'function');
  assert.equal(typeof support.cleanReleaseDirectory, 'function');
  const { root, releaseDir } = await fixture(t);
  const projectDir = path.join(root, 'source');
  await mkdir(projectDir);
  assert.equal(support.resolveReleaseDirectory(projectDir, releaseDir), releaseDir);
  assert.throws(() => support.resolveReleaseDirectory(projectDir, projectDir), /refus|release directory/i);
  assert.throws(() => support.resolveReleaseDirectory(projectDir, root), /refus|release directory/i);
  await support.cleanReleaseDirectory({ rootDir: projectDir, releaseDir });
  await assert.rejects(readFile(path.join(releaseDir, setupName)), { code: 'ENOENT' });
});

test('release cleanup refuses junctions without deleting the target data', async (t) => {
  const { root, releaseDir } = await fixture(t);
  const target = path.join(root, 'important-output');
  await mkdir(target);
  await writeFile(path.join(target, 'keep.txt'), 'keep');
  await rm(releaseDir, { recursive: true, force: true });
  await symlink(target, releaseDir, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(support.cleanReleaseDirectory({ rootDir: path.join(root, 'source'), releaseDir }), /linked|redirected/i);
  assert.equal(await readFile(path.join(target, 'keep.txt'), 'utf8'), 'keep');
});

test('requires an exact clean HEAD and rejects another commit or a dirty tracked file', async (t) => {
  assert.equal(typeof support.verifyGitCommit, 'function');
  const { root } = await fixture(t);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'qa@example.invalid');
  git('config', 'user.name', 'Release QA');
  await writeFile(path.join(root, 'tracked.txt'), 'original');
  git('add', 'tracked.txt');
  git('commit', '-qm', 'fixture');
  const head = git('rev-parse', 'HEAD');
  assert.equal(await support.verifyGitCommit(root, head), head);
  await assert.rejects(support.verifyGitCommit(root, head.slice(0, 7)), /full|40/i);
  await assert.rejects(support.verifyGitCommit(root, commit), /HEAD|commit/i);
  await writeFile(path.join(root, 'tracked.txt'), 'changed');
  await assert.rejects(support.verifyGitCommit(root, head), /clean|tracked/i);
});

test('manifest rejects any artifact changed after the pinned build', async (t) => {
  assert.equal(typeof support.writeReleaseManifest, 'function');
  assert.equal(typeof support.verifyReleaseManifest, 'function');
  const { releaseDir } = await fixture(t);
  const local = await support.validateLocalRelease({ releaseDir, version });
  await support.writeReleaseManifest({ releaseDir, version, commit, assets: local.assets });
  await support.verifyReleaseManifest({ releaseDir, version, commit, assets: local.assets });
  await writeFile(path.join(releaseDir, portableName), 'MZ modified after QA');
  const changed = await support.validateLocalRelease({ releaseDir, version });
  await assert.rejects(support.verifyReleaseManifest({ releaseDir, version, commit, assets: changed.assets }), /manifest|changed/i);
  await assert.rejects(support.verifyReleaseManifest({ releaseDir, version, commit: 'a'.repeat(40), assets: local.assets }), /commit|manifest/i);
});

// Only the external GitHub boundary is replaced. Real local files, hashing,
// metadata validation, upload streams and publication orchestration are used.
function githubFixture(files, { existing, corruptDownload, failUpload, tagCommit, draftOnly } = {}) {
  const events = [];
  const assets = [];
  let draft = true;
  const release = () => ({ id: 42, tag_name: 'v0.3.8', target_commitish: commit, name: version, draft, prerelease: false, upload_url: 'https://uploads.github.com/repos/zlipfatui-ui/BBTLauncher/releases/42/assets{?name,label}', html_url: 'https://github.com/zlipfatui-ui/BBTLauncher/releases/tag/v0.3.8', assets });
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method ?? 'GET';
    const pathname = url.pathname;
    if (pathname.endsWith('/git/ref/tags/v0.3.8')) return tagCommit ? json({ object: { type: 'commit', sha: tagCommit } }) : json({ message: 'Not Found' }, 404);
    if (pathname.endsWith('/commits/' + commit)) return json({ sha: commit });
    if (pathname.endsWith('/releases/tags/v0.3.8')) return existing && !draftOnly ? json({ ...release(), ...existing }) : json({ message: 'Not Found' }, 404);
    if (pathname.endsWith('/releases') && method === 'GET') return existing ? json([{ ...release(), ...existing }]) : json([]);
    if (pathname.endsWith('/releases') && method === 'POST') {
      const body = JSON.parse(options.body);
      events.push({ action: 'create', body });
      draft = body.draft;
      return json(release(), 201);
    }
    if (url.hostname === 'uploads.github.com') {
      const name = url.searchParams.get('name');
      events.push({ action: 'upload', name });
      if (name === failUpload) return json({ message: 'upload failed' }, 500);
      const chunks = [];
      for await (const chunk of options.body) chunks.push(chunk);
      assert.deepEqual(Buffer.concat(chunks), files[name]);
      const asset = { id: assets.length + 1, name, size: files[name].length, state: 'uploaded' };
      assets.push(asset);
      return json(asset, 201);
    }
    if (pathname.endsWith('/releases/42/assets')) return json(assets);
    const assetId = pathname.match(/\/releases\/assets\/(\d+)$/)?.[1];
    if (assetId) {
      const asset = assets.find((item) => item.id === Number(assetId));
      events.push({ action: 'verify', name: asset.name });
      return new Response(asset.name === corruptDownload ? Buffer.from('corrupt') : files[asset.name]);
    }
    if (pathname.endsWith('/releases/42') && method === 'GET') return json(release());
    if (pathname.endsWith('/releases/42') && method === 'PATCH') {
      const body = JSON.parse(options.body);
      events.push({ action: 'publish', body });
      draft = body.draft;
      return json(release());
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  return { fetchImpl, events, isDraft: () => draft };
}

async function publishFixture(t, behavior) {
  assert.equal(typeof publisher.publishRelease, 'function', 'publisher exports testable orchestration without side effects');
  const local = await fixture(t);
  const validated = await support.validateLocalRelease({ releaseDir: local.releaseDir, version });
  const remote = githubFixture(local.files, behavior);
  return { local, remote, publish: () => publisher.publishRelease({ version, commit, assets: validated.assets, token: 'fixture-token', fetchImpl: remote.fetchImpl, log: () => {} }) };
}

test('only publishes stable Latest after all four remote sizes and SHA512 hashes verify', async (t) => {
  const { remote, publish } = await publishFixture(t);
  await publish();
  assert.deepEqual(remote.events[0].body, { tag_name: 'v0.3.8', target_commitish: commit, name: '0.3.8', body: publisher.releaseNotes('0.3.8'), draft: true, prerelease: false });
  assert.equal(remote.events.filter((event) => event.action === 'upload').length, 4);
  assert.equal(remote.events.filter((event) => event.action === 'verify').length, 4);
  assert.deepEqual(remote.events.at(-1), { action: 'publish', body: { name: '0.3.8', draft: false, prerelease: false, make_latest: 'true' } });
  assert.equal(remote.isDraft(), false);
});

test('resumes a matching draft found through the authenticated release list', async (t) => {
  const { remote, publish } = await publishFixture(t, { existing: { draft: true }, draftOnly: true });
  await publish();
  assert.equal(remote.events.some((event) => event.action === 'create'), false);
  assert.equal(remote.events.at(-1).action, 'publish');
});

for (const [label, behavior] of [
  ['asset upload fails', { failUpload: portableName }],
  ['remote bytes fail verification', { corruptDownload: portableName }]
]) {
  test(`leaves the release draft when ${label}`, async (t) => {
    const { remote, publish } = await publishFixture(t, behavior);
    await assert.rejects(publish());
    assert.equal(remote.isDraft(), true);
    assert.equal(remote.events.some((event) => event.action === 'publish'), false);
  });
}

for (const [label, behavior] of [
  ['already published release', { existing: { draft: false } }],
  ['draft pinned to another commit', { existing: { target_commitish: 'a'.repeat(40) } }],
  ['existing tag targeting another commit', { tagCommit: 'b'.repeat(40) }]
]) {
  test(`refuses to mutate an ${label}`, async (t) => {
    const { remote, publish } = await publishFixture(t, behavior);
    await assert.rejects(publish(), /published|commit|tag/i);
    assert.deepEqual(remote.events, []);
  });
}
