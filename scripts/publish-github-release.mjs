import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.resolve(rootDir, '..', '..', 'BBTLauncher-release');
const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;
const tagName = `v${version}`;
const owner = 'zlipfatui-ui';
const repo = 'BBTLauncher';
const token = process.env.GH_TOKEN;

if (!token) {
  throw new Error('GH_TOKEN is required to publish a GitHub Release.');
}

if (!releaseDir.toLowerCase().endsWith(`${path.sep}bbtlauncher-release`.toLowerCase())) {
  throw new Error(`Refusing to publish from unexpected release directory: ${releaseDir}`);
}

const assetNames = [
  `BeforeBedtime-Launcher-Setup-${version}.exe`,
  `BeforeBedtime-Launcher-Setup-${version}.exe.blockmap`,
  'latest.yml',
  `BeforeBedtime-Launcher-Portable-${version}.exe`
];

async function github(pathname, options = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'BBTLauncher-release-publisher',
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = body?.message || response.statusText;
    throw new Error(`GitHub API ${response.status} ${pathname}: ${message}`);
  }

  return body;
}

async function getOrCreateRelease() {
  const existing = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tagName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'BBTLauncher-release-publisher'
    }
  });

  if (existing.ok) {
    const release = await existing.json();
    return github(`/repos/${owner}/${repo}/releases/${release.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: version,
        draft: false,
        prerelease: false,
        make_latest: 'true'
      })
    });
  }

  if (existing.status !== 404) {
    const body = await existing.text();
    throw new Error(`GitHub API ${existing.status} release lookup failed: ${body}`);
  }

  return github(`/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    body: JSON.stringify({
      tag_name: tagName,
      target_commitish: 'main',
      name: version,
      body: `v${version}`,
      draft: false,
      prerelease: false,
      make_latest: 'true'
    })
  });
}

async function uploadAsset(release, name) {
  const filePath = path.join(releaseDir, name);
  const fileStat = await stat(filePath);
  const staleAssets = release.assets.filter((asset) => asset.name === name);

  for (const asset of staleAssets) {
    await github(`/repos/${owner}/${repo}/releases/assets/${asset.id}`, { method: 'DELETE' });
    console.log(`Deleted existing asset: ${name}`);
  }

  const uploadBase = release.upload_url.replace(/\{.*$/, '');
  const uploadUrl = `${uploadBase}?name=${encodeURIComponent(name)}`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'BBTLauncher-release-publisher',
      'Content-Type': name.endsWith('.yml') ? 'application/x-yaml' : 'application/octet-stream',
      'Content-Length': String(fileStat.size)
    },
    body: createReadStream(filePath),
    duplex: 'half'
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = body?.message || response.statusText;
    throw new Error(`GitHub upload ${response.status} ${name}: ${message}`);
  }

  console.log(`Uploaded ${body.name} (${body.size} bytes)`);
}

const release = await getOrCreateRelease();
for (const name of assetNames) {
  await uploadAsset(release, name);
}

console.log(`Published ${tagName}: ${release.html_url}`);
