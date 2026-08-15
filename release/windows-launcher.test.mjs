import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('portable release uses bundled Node without packaged PowerShell or per-file hashing', async () => {
  const [
    builder,
    launcher,
    startCommand,
    stopCommand,
    verifyCommand,
    acceptanceWrapper,
    acceptanceJourney,
    browserAcceptance,
    portableWorkflow,
    releaseWorkflow,
    configText
  ] = await Promise.all([
    readFile(new URL('./build-windows-portable.ps1', import.meta.url), 'utf8'),
    readFile(new URL('./windows/launcher.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./windows/start-dashboard.cmd', import.meta.url), 'utf8'),
    readFile(new URL('./windows/stop-dashboard.cmd', import.meta.url), 'utf8'),
    readFile(new URL('./windows/verify-release.cmd', import.meta.url), 'utf8'),
    readFile(new URL('./verify-windows-portable.ps1', import.meta.url), 'utf8'),
    readFile(new URL('./production-acceptance.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./browser-acceptance.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/windows-portable.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/windows-release.yml', import.meta.url), 'utf8'),
    readFile(new URL('./windows-portable.config.json', import.meta.url), 'utf8')
  ]);
  const config = JSON.parse(configText);
  const commands = `${startCommand}\n${stopCommand}\n${verifyCommand}`;

  assert.equal(config.nodeVersion, '24.19.0');
  assert.match(config.runtimeArchives.x64.url, /\/v24\.19\.0\/node-v24\.19\.0-win-x64\.zip$/);
  assert.match(config.runtimeArchives.x64.sha256, /^[0-9a-f]{64}$/);
  assert.match(builder, /--frozen-lockfile/);
  assert.match(builder, /process\.platform/);
  assert.match(builder, /verify-native-runtime\.mjs/);
  assert.match(builder, /RELEASE-INFO\.json/);
  assert.match(builder, /launcher\\launcher\.mjs/);
  assert.equal((builder.match(/Get-FileHash/g) ?? []).length, 1);
  assert.doesNotMatch(builder, /release-manifest|verify-release\.ps1/i);

  assert.match(launcher, /127\.0\.0\.1/);
  assert.match(launcher, /LOCALAPPDATA/);
  assert.match(launcher, /project-manager-api/);
  assert.match(launcher, /unmanaged or older dashboard service/);
  assert.match(launcher, /taskkill \/F \/PID/);
  assert.match(launcher, /does not support the authenticated stop \(HTTP 404\)/);
  assert.match(launcher, /clearLauncherState/);
  assert.match(launcher, /PM_LAUNCHER_NO_BROWSER/);
  assert.match(launcher, /PM_LAUNCH_TOKEN/);
  assert.doesNotMatch(launcher, /0\.0\.0\.0|createHash|Get-FileHash/);

  assert.match(commands, /runtime\\node\.exe/i);
  assert.match(commands, /launcher\\launcher\.mjs/i);
  assert.doesNotMatch(commands, /powershell|\.ps1|ExecutionPolicy|Unblock-File/i);

  assert.match(acceptanceWrapper, /Expand-Archive/);
  assert.match(acceptanceWrapper, /start-dashboard\.cmd/);
  assert.match(acceptanceWrapper, /--phase setup/);
  assert.match(acceptanceWrapper, /--phase verify/);
  assert.match(acceptanceWrapper, /Microsoft\\Edge/);
  assert.match(acceptanceWrapper, /browser-acceptance\.mjs/);
  assert.match(acceptanceJourney, /\/api\/workspace\/tables/);
  assert.match(acceptanceJourney, /export\/editable\.xlsx/);
  assert.match(acceptanceJourney, /export\/presentation\.xlsx/);
  assert.match(acceptanceJourney, /\/api\/workspace\/backup/);
  assert.match(browserAcceptance, /create table from the real module composer/);
  assert.match(browserAcceptance, /reload and verify persistence/);
  assert.match(portableWorkflow, /verify-windows-portable\.ps1/);
  assert.match(releaseWorkflow, /verify-windows-portable\.ps1/);
});
