import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface RuntimeCacheOptions {
  rootDir: string;
  projectId: string;
  minecraftVersion: string;
  loaderVersion: string;
  javaPath: string;
}

export interface RuntimeMarker {
  projectId: string;
  minecraftVersion: string;
  loaderVersion: string;
  javaPath: string;
  writtenAt: string;
}

export interface RuntimeInspection {
  complete: boolean;
  missing: string[];
  marker?: RuntimeMarker;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function forgeVersionId(options: Pick<RuntimeCacheOptions, 'minecraftVersion' | 'loaderVersion'>): string {
  return `${options.minecraftVersion}-forge-${options.loaderVersion}`;
}

function markerPath(options: RuntimeCacheOptions): string {
  return join(
    options.rootDir,
    'minecraft',
    '.bbt-runtime',
    `${options.projectId}-${options.minecraftVersion}-forge-${options.loaderVersion}.json`
  );
}

async function readMarker(options: RuntimeCacheOptions): Promise<RuntimeMarker | undefined> {
  try {
    return JSON.parse(await readFile(markerPath(options), 'utf8')) as RuntimeMarker;
  } catch {
    return undefined;
  }
}

async function missingLibraryPaths(minecraftLocation: string, forgeJsonPath: string): Promise<string[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(forgeJsonPath, 'utf8'));
  } catch {
    return [`invalid:${forgeJsonPath}`];
  }

  const libraries = Array.isArray((parsed as { libraries?: unknown }).libraries)
    ? (parsed as { libraries: Array<{ downloads?: { artifact?: { path?: unknown }; classifiers?: Record<string, { path?: unknown }> } }> }).libraries
    : [];
  const missing: string[] = [];
  for (const library of libraries) {
    const paths = [
      library.downloads?.artifact?.path,
      ...Object.values(library.downloads?.classifiers || {}).map((classifier) => classifier.path)
    ];
    for (const path of paths) {
      if (typeof path !== 'string' || !path) continue;
      const libraryPath = join(minecraftLocation, 'libraries', ...path.split('/'));
      if (!(await exists(libraryPath))) missing.push(`library:${path}`);
    }
  }
  return missing;
}

export async function inspectMinecraftRuntime(options: RuntimeCacheOptions): Promise<RuntimeInspection> {
  const minecraftLocation = join(options.rootDir, 'minecraft');
  const forgeId = forgeVersionId(options);
  const vanillaDir = join(minecraftLocation, 'versions', options.minecraftVersion);
  const forgeDir = join(minecraftLocation, 'versions', forgeId);
  const forgeJsonPath = join(forgeDir, `${forgeId}.json`);
  const forgeLibraryDir = join(
    minecraftLocation,
    'libraries',
    'net',
    'minecraftforge',
    'forge',
    `${options.minecraftVersion}-${options.loaderVersion}`
  );

  const candidates: Array<[string, string]> = [
    ['vanilla-json', join(vanillaDir, `${options.minecraftVersion}.json`)],
    ['vanilla-jar', join(vanillaDir, `${options.minecraftVersion}.jar`)],
    ['forge-json', forgeJsonPath],
    ['forge-client-jar', join(forgeLibraryDir, `forge-${options.minecraftVersion}-${options.loaderVersion}-client.jar`)]
  ];

  const missing: string[] = [];
  for (const [label, path] of candidates) {
    if (!(await exists(path))) missing.push(label);
  }

  if (!missing.includes('forge-json')) {
    missing.push(...await missingLibraryPaths(minecraftLocation, forgeJsonPath));
  }

  return {
    complete: missing.length === 0,
    missing,
    marker: await readMarker(options)
  };
}

export async function writeRuntimeMarker(options: RuntimeCacheOptions): Promise<RuntimeMarker> {
  const marker: RuntimeMarker = {
    projectId: options.projectId,
    minecraftVersion: options.minecraftVersion,
    loaderVersion: options.loaderVersion,
    javaPath: options.javaPath,
    writtenAt: new Date().toISOString()
  };
  const path = markerPath(options);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(marker, null, 2)}\n`);
  return marker;
}
