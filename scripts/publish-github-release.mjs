import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashStream, parseReleaseArgs, resolveReleaseDirectory, rootDir, validateLocalRelease, verifyGitCommit, verifyReleaseManifest } from './release-support.mjs';

const repository = '/repos/zlipfatui-ui/BBTLauncher';

export function releaseNotes(version) {
  return `BeforeBedtime Launcher ${version}\n\n- Redesigned black-and-white launcher with local fonts and artwork.\n- Persistent animated starfield and smooth, interruptible navigation, drawers, and button motion, with reduced-motion support.\n- Screenshot gallery for each project's real screenshots, with image preview and file/folder actions.\n- General text and images no longer select or drag accidentally; inputs and content file drops remain usable.\n- RAM settings adapt to each machine's total memory and preserve valid saved allocations.\n- Northvale remains locked; SaiNam, account sign-in, game management, and launcher updates remain connected to the existing launcher data.`;
}

export async function publishRelease({ version, commit, assets, token, fetchImpl = fetch, log = console.log }) {
  if (!token) throw new Error('GH_TOKEN is required to publish a GitHub Release.');
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('Publishing requires a full commit SHA.');
  const tagName = `v${version}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'BBTLauncher-release-publisher' };
  async function github(pathname, { allowMissing = false, ...options } = {}) {
    const response = await fetchImpl(`https://api.github.com${pathname}`, { ...options, headers: { ...headers, 'Content-Type': 'application/json', ...options.headers } });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub API ${response.status} ${pathname}: ${(await response.text()).slice(0, 500)}`);
    return response.status === 204 ? null : response.json();
  }
  async function verifyTag() {
    const ref = await github(`${repository}/git/ref/tags/${tagName}`, { allowMissing: true });
    if (!ref) return;
    let object = ref.object;
    for (let depth = 0; object?.type === 'tag' && depth < 5; depth += 1) {
      object = (await github(`${repository}/git/tags/${object.sha}`)).object;
    }
    if (object?.type !== 'commit' || object.sha !== commit) throw new Error(`Existing tag ${tagName} does not target pinned commit ${commit}.`);
  }
  await verifyTag();
  const remoteCommit = await github(`${repository}/commits/${commit}`);
  if (remoteCommit.sha !== commit) throw new Error('Pinned commit is not available on GitHub; push it before publishing.');
  let release = await github(`${repository}/releases/tags/${tagName}`, { allowMissing: true });
  // The tag endpoint documents published releases. Authenticated listing also
  // includes drafts, so interrupted uploads can resume without a duplicate.
  if (!release) {
    for (let page = 1; ; page += 1) {
      const pageReleases = await github(`${repository}/releases?per_page=100&page=${page}`);
      release = pageReleases.find((candidate) => candidate.tag_name === tagName);
      if (release || pageReleases.length < 100) break;
    }
  }
  const assertDraft = (candidate) => {
    if (candidate.draft !== true) throw new Error(`Refusing to modify already published release ${tagName}.`);
    if (candidate.target_commitish !== commit || candidate.tag_name !== tagName) throw new Error('Existing draft is not pinned to the requested commit and tag.');
  };
  if (release) assertDraft(release);
  else {
    release = await github(`${repository}/releases`, { method: 'POST', body: JSON.stringify({ tag_name: tagName, target_commitish: commit, name: version, body: releaseNotes(version), draft: true, prerelease: false }) });
    assertDraft(release);
  }
  log(`Draft ${tagName} pinned to ${commit}: ${release.html_url}`);
  try {
    const names = new Set(assets.map((asset) => asset.name));
    if (release.assets.some((asset) => !names.has(asset.name))) throw new Error('Draft contains unexpected assets; inspect it before retrying.');
    for (const asset of assets) {
      const existing = release.assets.filter((item) => item.name === asset.name);
      if (existing.length > 1) throw new Error(`Draft contains duplicate asset ${asset.name}.`);
      if (existing.length === 1) continue;
      const uploadUrl = new URL(release.upload_url.replace(/\{.*$/, ''));
      if (uploadUrl.protocol !== 'https:' || uploadUrl.hostname !== 'uploads.github.com' || uploadUrl.pathname !== `${repository}/releases/${release.id}/assets`) throw new Error('Unexpected GitHub upload URL.');
      uploadUrl.searchParams.set('name', asset.name);
      const response = await fetchImpl(uploadUrl.href, { method: 'POST', headers: { ...headers, 'Content-Type': asset.name.endsWith('.yml') ? 'application/x-yaml' : 'application/octet-stream', 'Content-Length': String(asset.size) }, body: createReadStream(asset.filePath), duplex: 'half' });
      if (!response.ok) throw new Error(`GitHub upload ${response.status} for ${asset.name}.`);
      const uploaded = await response.json();
      if (uploaded.name !== asset.name || uploaded.size !== asset.size || uploaded.state !== 'uploaded') throw new Error(`GitHub upload metadata mismatch: ${asset.name}`);
      log(`Uploaded ${asset.name} (${asset.size} bytes)`);
    }
    const remoteAssets = await github(`${repository}/releases/${release.id}/assets?per_page=100`);
    if (remoteAssets.length !== assets.length) throw new Error('Remote release does not contain exactly the four required assets.');
    for (const asset of assets) {
      const matches = remoteAssets.filter((item) => item.name === asset.name);
      if (matches.length !== 1 || matches[0].size !== asset.size || matches[0].state !== 'uploaded') throw new Error(`Remote asset size/state mismatch: ${asset.name}`);
      const remote = matches[0];
      if (remote.digest && remote.digest !== `sha256:${asset.sha256}`) throw new Error(`Remote asset SHA256 mismatch: ${asset.name}`);
      const response = await fetchImpl(`https://api.github.com${repository}/releases/assets/${remote.id}`, { headers: { ...headers, Accept: 'application/octet-stream' } });
      if (!response.ok || !response.body) throw new Error(`Cannot verify remote asset ${asset.name}: HTTP ${response.status}`);
      const downloaded = await hashStream(response.body);
      if (downloaded.size !== asset.size || downloaded.sha512 !== asset.sha512) throw new Error(`Remote asset SHA512/size mismatch: ${asset.name}`);
      log(`Verified remote SHA512 and size: ${asset.name}`);
    }
    await verifyTag();
    assertDraft(await github(`${repository}/releases/${release.id}`));
    const published = await github(`${repository}/releases/${release.id}`, { method: 'PATCH', body: JSON.stringify({ name: version, draft: false, prerelease: false, make_latest: 'true' }) });
    if (published.draft || published.prerelease || published.tag_name !== tagName) throw new Error('GitHub did not confirm stable publication; inspect the release before retrying.');
    log(`Published ${tagName}: ${published.html_url}`);
    return published;
  } catch (error) {
    log(`Release processing failed. Uploaded draft assets are retained for inspection: ${release.html_url}`);
    throw error;
  }
}

export async function main() {
  const options = parseReleaseArgs();
  const releaseDir = resolveReleaseDirectory(rootDir, options.releaseDir);
  const commit = await verifyGitCommit(rootDir, options.commit);
  const { version } = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
  const local = await validateLocalRelease({ releaseDir, version });
  await verifyReleaseManifest({ releaseDir, version, commit, assets: local.assets });
  console.log(`Validated all four ${version} artifacts against ${commit} in ${releaseDir}`);
  if (options.validateOnly) return;
  await publishRelease({ version, commit, assets: local.assets, token: process.env.GH_TOKEN });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
