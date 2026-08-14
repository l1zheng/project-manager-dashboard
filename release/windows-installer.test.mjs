import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Windows installer is per-user, console-free, and preserves application data', async () => {
  const [
    configText,
    launcher,
    installer,
    builder,
    verifier,
    toolInstaller,
    buildWorkflow,
    releaseWorkflow
  ] = await Promise.all([
    readFile(new URL('./windows-installer.config.json', import.meta.url), 'utf8'),
    readFile(
      new URL('./windows/installer/ProjectManagerDashboardLauncher.cs', import.meta.url),
      'utf8'
    ),
    readFile(new URL('./windows/installer/ProjectManagerDashboard.iss', import.meta.url), 'utf8'),
    readFile(new URL('./build-windows-installer.ps1', import.meta.url), 'utf8'),
    readFile(new URL('./verify-windows-installer.ps1', import.meta.url), 'utf8'),
    readFile(new URL('./install-inno-setup.ps1', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/windows-portable.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/windows-release.yml', import.meta.url), 'utf8')
  ]);
  const config = JSON.parse(configText);

  assert.equal(config.publisher, 'lz');
  assert.equal(config.appId, '0B838BD8-C96A-472E-9AC7-E51B2DDB5549');
  assert.equal(config.innoSetup.version, '7.0.2');
  assert.match(config.innoSetup.url, /^https:\/\/github\.com\/jrsoftware\/issrc\/releases\//);
  assert.equal(config.innoSetup.expectedSigner, 'Pyrsys B.V.');

  assert.match(installer, /AppPublisher=lz/);
  assert.match(installer, /DefaultDirName=\{localappdata\}\\Programs\\ProjectManagerDashboard/);
  assert.match(installer, /PrivilegesRequired=lowest/);
  assert.match(installer, /ArchitecturesAllowed=x64compatible/);
  assert.match(installer, /ProjectManagerDashboard\.exe/);
  assert.match(installer, /Parameters: "--stop"/);
  assert.match(installer, /SignTool=installer/);
  assert.match(installer, /SignedUninstaller=yes/);
  assert.doesNotMatch(
    installer,
    /\[UninstallDelete\]|ProjectManagerDashboard\}.*Type: filesandordirs/i
  );

  assert.match(launcher, /UseShellExecute = false/);
  assert.match(launcher, /CreateNoWindow = true/);
  assert.match(launcher, /--start.*--stop.*--check/s);
  assert.match(launcher, /runtime.*node\.exe/s);
  assert.match(launcher, /launcher.*launcher\.mjs/s);
  assert.match(launcher, /PM_LAUNCHER_NO_DIALOGS/);
  assert.doesNotMatch(launcher, /powershell|ExecutionPolicy/i);

  assert.match(builder, /target:winexe/);
  assert.match(builder, /platform:\$Architecture/);
  assert.match(builder, /RELEASE-INFO\.json/);
  assert.match(builder, /ProjectManagerDashboard\.iss/);
  assert.match(builder, /SignToolCommand/);
  assert.match(toolInstaller, /Get-AuthenticodeSignature/);
  assert.match(toolInstaller, /expectedSigner/);
  assert.match(toolInstaller, /attempt -le 4/);
  assert.match(toolInstaller, /Remove-Item -LiteralPath \$installerPath -Force/);

  assert.match(verifier, /\/VERYSILENT/);
  assert.match(verifier, /\.WaitForExit\(\)/);
  assert.match(verifier, /--phase setup/);
  assert.match(verifier, /--phase verify/);
  assert.match(verifier, /Upgrading in place/);
  assert.match(verifier, /In-place upgrade failed/);
  assert.match(verifier, /workspace\.sqlite/);
  assert.match(verifier, /Application files remained after uninstall/);
  assert.match(verifier, /Uninstall removed the user workspace database/);

  for (const workflow of [buildWorkflow, releaseWorkflow]) {
    assert.match(workflow, /build-windows-installer\.ps1/);
    assert.match(workflow, /verify-windows-installer\.ps1/);
    assert.match(workflow, /ProjectManagerDashboard-Setup-/);
  }
});
