import { createHash, timingSafeEqual } from 'node:crypto';
import { lstat, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const releaseManifestFilename = 'RELEASE-MANIFEST.json';
export const releaseManifestFormat = 'project-manager-dashboard-release';
export const releaseManifestVersion = 1;

export async function generateReleaseManifest(rootDirectory, metadata) {
  const root = resolve(rootDirectory);
  validateMetadata(metadata);
  const files = await collectReleaseFiles(root);
  const manifest = {
    format: releaseManifestFormat,
    version: releaseManifestVersion,
    application: {
      name: metadata.applicationName,
      version: metadata.applicationVersion
    },
    target: { platform: 'win32', architecture: metadata.architecture },
    runtime: {
      nodeVersion: metadata.nodeVersion,
      sourceArchive: metadata.runtimeArchive,
      sourceArchiveSha256: metadata.runtimeArchiveSha256
    },
    launcher: { host: '127.0.0.1', port: metadata.port, entrypoint: 'start-dashboard.cmd' },
    createdAt: metadata.createdAt,
    files
  };
  const destination = join(root, releaseManifestFilename);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rename(temporary, destination);
  return manifest;
}

export async function verifyReleaseManifest(rootDirectory) {
  const root = resolve(rootDirectory);
  const manifest = JSON.parse(await readFile(join(root, releaseManifestFilename), 'utf8'));
  validateManifest(manifest);
  const actualFiles = await collectReleaseFiles(root);
  if (actualFiles.length !== manifest.files.length) {
    throw new Error(
      `Release contains ${actualFiles.length} files, but the manifest lists ${manifest.files.length}.`
    );
  }
  for (const [index, expected] of manifest.files.entries()) {
    const actual = actualFiles[index];
    if (!actual || actual.path !== expected.path) {
      throw new Error(`Release file set differs at ${expected.path}.`);
    }
    if (actual.bytes !== expected.bytes || !equalDigest(actual.sha256, expected.sha256)) {
      throw new Error(`Release file failed integrity verification: ${expected.path}`);
    }
  }
  return manifest;
}

async function collectReleaseFiles(root) {
  const files = [];
  await walk(root, root, files);
  return files.sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

async function walk(root, directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const absolutePath = join(directory, entry.name);
    const details = await lstat(absolutePath);
    if (details.isSymbolicLink()) {
      throw new Error(
        `Release must not contain symbolic links or junctions: ${releasePath(root, absolutePath)}`
      );
    }
    if (details.isDirectory()) {
      await walk(root, absolutePath, files);
      continue;
    }
    if (!details.isFile())
      throw new Error(`Unsupported release entry: ${releasePath(root, absolutePath)}`);
    const path = releasePath(root, absolutePath);
    if (path === releaseManifestFilename || path === `${releaseManifestFilename}.tmp`) continue;
    const content = await readFile(absolutePath);
    files.push({
      path,
      bytes: (await stat(absolutePath)).size,
      sha256: createHash('sha256').update(content).digest('hex')
    });
  }
}

function releasePath(root, absolutePath) {
  const path = relative(root, absolutePath).split(sep).join('/');
  if (!path || path.startsWith('../') || path.includes('/../')) {
    throw new Error(`Release path escapes its root: ${absolutePath}`);
  }
  return path;
}

function validateMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') throw new Error('Release metadata is required.');
  requireText(metadata.applicationName, 'applicationName');
  requireText(metadata.applicationVersion, 'applicationVersion');
  if (!['x64', 'arm64'].includes(metadata.architecture))
    throw new Error('Unsupported architecture.');
  if (!/^24\.\d+\.\d+$/.test(metadata.nodeVersion)) throw new Error('Node 24 version is required.');
  requireText(metadata.runtimeArchive, 'runtimeArchive');
  requireDigest(metadata.runtimeArchiveSha256, 'runtimeArchiveSha256');
  if (!Number.isSafeInteger(metadata.port) || metadata.port < 1024 || metadata.port > 65535) {
    throw new Error('Release port must be a non-privileged TCP port.');
  }
  if (Number.isNaN(Date.parse(metadata.createdAt))) throw new Error('createdAt must be ISO-8601.');
}

function validateManifest(manifest) {
  if (manifest?.format !== releaseManifestFormat || manifest?.version !== releaseManifestVersion) {
    throw new Error('Unsupported release manifest.');
  }
  if (!Array.isArray(manifest.files)) throw new Error('Release manifest files are missing.');
  let previous = '';
  const seen = new Set();
  for (const file of manifest.files) {
    requireText(file?.path, 'files.path');
    if (
      file.path.startsWith('/') ||
      file.path.includes('\\') ||
      file.path.split('/').includes('..')
    ) {
      throw new Error(`Unsafe release manifest path: ${file.path}`);
    }
    if (seen.has(file.path) || (previous && previous.localeCompare(file.path, 'en') >= 0)) {
      throw new Error(`Release manifest paths are duplicate or unsorted: ${file.path}`);
    }
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0)
      throw new Error('Invalid release file size.');
    requireDigest(file.sha256, `files.${file.path}.sha256`);
    seen.add(file.path);
    previous = file.path;
  }
}

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    throw new Error(`${name} must be a bounded non-empty string.`);
  }
}

function requireDigest(value, name) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(`${name} must be a SHA-256 digest.`);
  }
}

function equalDigest(left, right) {
  requireDigest(left, 'actual digest');
  requireDigest(right, 'expected digest');
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

async function runCommand() {
  const [command, rootDirectory, metadataPath] = process.argv.slice(2);
  if (command === 'generate' && rootDirectory && metadataPath) {
    const metadata = JSON.parse(await readFile(resolve(metadataPath), 'utf8'));
    await generateReleaseManifest(rootDirectory, metadata);
    return;
  }
  if (command === 'verify' && rootDirectory) {
    await verifyReleaseManifest(rootDirectory);
    return;
  }
  throw new Error(
    'Usage: node release/release-manifest.mjs generate <release-root> <metadata.json> | verify <release-root>'
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCommand().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
