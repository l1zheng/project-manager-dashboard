import assert from 'node:assert/strict';
import { symlink } from 'node:fs/promises';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { generateReleaseManifest, verifyReleaseManifest } from './release-manifest.mjs';

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('generates a sorted manifest and verifies the exact release file set', async () => {
  const root = await fixture();
  const manifest = await generateReleaseManifest(root, metadata());

  assert.deepEqual(
    manifest.files.map((file) => file.path),
    ['app/dist/server.js', 'runtime/node.exe', 'start-dashboard.cmd']
  );
  assert.equal(manifest.target.architecture, 'x64');
  assert.equal(manifest.launcher.host, '127.0.0.1');
  assert.equal((await verifyReleaseManifest(root)).files.length, 3);
});

test('rejects tampered, unexpected, and linked release entries', async () => {
  const root = await fixture();
  await generateReleaseManifest(root, metadata());
  await writeFile(join(root, 'app', 'dist', 'server.js'), 'tampered');
  await assert.rejects(() => verifyReleaseManifest(root), /integrity verification/);

  await writeFile(join(root, 'app', 'dist', 'server.js'), 'server');
  await generateReleaseManifest(root, metadata());
  await writeFile(join(root, 'unexpected.txt'), 'unexpected');
  await assert.rejects(() => verifyReleaseManifest(root), /manifest lists/);

  await rm(join(root, 'unexpected.txt'));
  try {
    await symlink(join(root, 'runtime', 'node.exe'), join(root, 'linked-node.exe'));
    await assert.rejects(() => generateReleaseManifest(root, metadata()), /symbolic links/);
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
  }
});

test('release scripts pin runtime, loopback, frozen deployment, local data, and a safe PowerShell policy', async () => {
  const [builder, launcher, verifier, startCommand, stopCommand, verifyCommand, configText] = await Promise.all([
    readFile(new URL('./build-windows-portable.ps1', import.meta.url), 'utf8'),
    readFile(new URL('./windows/start-dashboard.ps1', import.meta.url), 'utf8'),
    readFile(new URL('./windows/verify-release.ps1', import.meta.url), 'utf8'),
    readFile(new URL('./windows/start-dashboard.cmd', import.meta.url), 'utf8'),
    readFile(new URL('./windows/stop-dashboard.cmd', import.meta.url), 'utf8'),
    readFile(new URL('./windows/verify-release.cmd', import.meta.url), 'utf8'),
    readFile(new URL('./windows-portable.config.json', import.meta.url), 'utf8')
  ]);
  const config = JSON.parse(configText);
  assert.equal(config.nodeVersion, '24.19.0');
  assert.match(config.runtimeArchives.x64.url, /\/v24\.19\.0\/node-v24\.19\.0-win-x64\.zip$/);
  assert.match(config.runtimeArchives.x64.sha256, /^[0-9a-f]{64}$/);
  assert.match(builder, /--frozen-lockfile/);
  assert.match(builder, /process\.platform/);
  assert.match(builder, /verify-native-runtime\.mjs/);
  assert.match(launcher, /127\.0\.0\.1/);
  assert.match(launcher, /LocalApplicationData/);
  assert.match(launcher, /project-manager-api/);
  assert.doesNotMatch(launcher, /0\.0\.0\.0/);
  assert.doesNotMatch(`${builder}\n${launcher}\n${verifier}`, /ExecutionPolicy|EncodedCommand/i);
  assert.match(`${startCommand}\n${stopCommand}\n${verifyCommand}`, /-ExecutionPolicy RemoteSigned/i);
  assert.doesNotMatch(`${startCommand}\n${stopCommand}\n${verifyCommand}`, /ExecutionPolicy Bypass|EncodedCommand/i);
  assert.match(`${startCommand}\n${stopCommand}\n${verifyCommand}`, /ReleaseRoot "%RELEASE_ROOT:~0,-1%"/i);
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'project-manager-release-manifest-'));
  roots.push(root);
  await mkdir(join(root, 'app', 'dist'), { recursive: true });
  await mkdir(join(root, 'runtime'), { recursive: true });
  await writeFile(join(root, 'app', 'dist', 'server.js'), 'server');
  await writeFile(join(root, 'runtime', 'node.exe'), 'node');
  await writeFile(join(root, 'start-dashboard.cmd'), '@echo off');
  return root;
}

function metadata() {
  return {
    applicationName: 'ProjectManagerDashboard',
    applicationVersion: '0.1.0-test',
    architecture: 'x64',
    nodeVersion: '24.19.0',
    runtimeArchive: 'node-v24.19.0-win-x64.zip',
    runtimeArchiveSha256: 'a'.repeat(64),
    port: 4300,
    createdAt: '2026-08-04T00:00:00.000Z'
  };
}
