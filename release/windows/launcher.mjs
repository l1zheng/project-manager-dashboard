import { randomBytes } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const releaseRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] ?? 'start';

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function run() {
  const release = await readReleaseInfo();
  const paths = resolvePaths(release);
  await checkRequiredFiles(paths);

  if (command === '--check') {
    console.log(
      `Project Manager Dashboard ${release.application.version} is ready for Windows ${release.target.architecture}.`
    );
    return;
  }
  if (command === '--stop') {
    await stopDashboard(paths, { allowAlreadyStopped: true });
    return;
  }
  if (command !== 'start' && command !== '--start') {
    throw new Error('Usage: launcher.mjs [--start|--stop|--check]');
  }
  await startDashboard(release, paths);
}

async function readReleaseInfo() {
  const path = join(releaseRoot, 'RELEASE-INFO.json');
  let release;
  try {
    release = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error(`Release information is missing or unreadable: ${path}`);
  }
  if (
    release?.format !== 'project-manager-dashboard-release' ||
    release?.version !== 1 ||
    typeof release?.application?.version !== 'string' ||
    release?.target?.platform !== 'win32' ||
    !['x64', 'arm64'].includes(release?.target?.architecture) ||
    release?.launcher?.host !== '127.0.0.1' ||
    !Number.isSafeInteger(release?.launcher?.port)
  ) {
    throw new Error('RELEASE-INFO.json has an unsupported format.');
  }
  if (process.platform !== 'win32') {
    throw new Error('This portable launcher can run only on Windows.');
  }
  if (process.arch !== release.target.architecture) {
    throw new Error(
      `This release requires Windows ${release.target.architecture}, but the current architecture is ${process.arch}.`
    );
  }
  return release;
}

function resolvePaths(release) {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  const dataRoot =
    process.env.PM_DATA_DIR?.trim() ||
    (localAppData ? join(localAppData, 'ProjectManagerDashboard') : '');
  if (!dataRoot) {
    throw new Error(
      'Windows LOCALAPPDATA is unavailable, so the local data directory cannot be resolved.'
    );
  }
  const logsDirectory = join(dataRoot, 'logs');
  return {
    releaseRoot,
    nodePath: join(releaseRoot, 'runtime', 'node.exe'),
    serverPath: join(releaseRoot, 'app', 'dist', 'server.js'),
    webPath: join(releaseRoot, 'web', 'dist'),
    dataRoot,
    logsDirectory,
    statePath: join(dataRoot, 'launcher-state.json'),
    baseUrl: `http://${release.launcher.host}:${release.launcher.port}`,
    healthUrl: `http://${release.launcher.host}:${release.launcher.port}/api/health`,
    shutdownUrl: `http://${release.launcher.host}:${release.launcher.port}/api/runtime/shutdown`
  };
}

async function checkRequiredFiles(paths) {
  await Promise.all([
    requireFile(paths.nodePath, 'Embedded Node runtime'),
    requireFile(paths.serverPath, 'Application server'),
    requireFile(join(paths.webPath, 'index.html'), 'Web application')
  ]);
}

async function requireFile(path, label) {
  try {
    const handle = await import('node:fs/promises').then(({ open }) => open(path, 'r'));
    await handle.close();
  } catch {
    throw new Error(`${label} is missing: ${path}`);
  }
}

async function getDashboardHealth(paths) {
  try {
    const response = await fetch(paths.healthUrl, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return null;
    const health = await response.json();
    if (health?.service !== 'project-manager-api') {
      throw new Error(`Port ${new URL(paths.baseUrl).port} belongs to another service.`);
    }
    return health;
  } catch (error) {
    if (error instanceof Error && error.message.includes('belongs to another service')) throw error;
    return null;
  }
}

async function readLauncherState(paths) {
  try {
    const state = JSON.parse(await readFile(paths.statePath, 'utf8'));
    return state?.version === 1 ? state : null;
  } catch {
    return null;
  }
}

async function writeLauncherState(paths, state) {
  mkdirSync(paths.dataRoot, { recursive: true });
  const temporaryPath = `${paths.statePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, paths.statePath);
}

async function stopDashboard(paths, { allowAlreadyStopped = false } = {}) {
  const health = await getDashboardHealth(paths);
  if (!health) {
    if (allowAlreadyStopped) {
      console.log('Project Manager Dashboard is not running.');
      return;
    }
    throw new Error('Project Manager Dashboard is not running.');
  }
  const state = await readLauncherState(paths);
  if (!state || !/^[0-9a-f]{64}$/i.test(state.launchToken ?? '')) {
    throw new Error(
      `The running dashboard cannot be authenticated for a clean stop. State file: ${paths.statePath}`
    );
  }
  const response = await fetch(paths.shutdownUrl, {
    method: 'POST',
    headers: { 'x-project-manager-launch-token': state.launchToken },
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok)
    throw new Error(`The local service rejected the stop request (${response.status}).`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await delay(250);
    if (!(await getDashboardHealth(paths))) {
      console.log('Project Manager Dashboard stopped.');
      return;
    }
  }
  throw new Error('The running dashboard did not stop within 10 seconds.');
}

async function startDashboard(release, paths) {
  mkdirSync(paths.logsDirectory, { recursive: true });
  const health = await getDashboardHealth(paths);
  if (health) {
    const state = await readLauncherState(paths);
    if (!state) {
      throw new Error(
        `Port ${new URL(paths.baseUrl).port} is already used by an unmanaged or older dashboard service. Close that process and try again.`
      );
    }
    const differentRelease =
      state.releaseRoot !== paths.releaseRoot || state.executablePath !== paths.nodePath;
    const differentVersion = state.applicationVersion !== release.application.version;
    if (health.storage?.restorePending || differentRelease || differentVersion) {
      console.log('Restarting the local service to apply a restore or application update...');
      await stopDashboard(paths);
    } else {
      openBrowser(paths.baseUrl);
      console.log(`Project Manager Dashboard is ready at ${paths.baseUrl}`);
      return;
    }
  }

  const launchToken = randomBytes(32).toString('hex');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const standardLog = join(paths.logsDirectory, `server-${stamp}.log`);
  const errorLog = join(paths.logsDirectory, `server-${stamp}.error.log`);
  const standardFd = openSync(standardLog, 'a');
  const errorFd = openSync(errorLog, 'a');
  let child;
  try {
    child = spawn(paths.nodePath, [paths.serverPath], {
      cwd: paths.releaseRoot,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', standardFd, errorFd],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PM_HOST: '127.0.0.1',
        PM_API_PORT: String(release.launcher.port),
        PM_APP_VERSION: release.application.version,
        PM_DATA_DIR: paths.dataRoot,
        PM_WEB_DIST_DIR: paths.webPath,
        PM_LAUNCH_TOKEN: launchToken
      }
    });
    child.unref();
  } finally {
    closeSync(standardFd);
    closeSync(errorFd);
  }
  await writeLauncherState(paths, {
    version: 1,
    processId: child.pid,
    applicationVersion: release.application.version,
    executablePath: paths.nodePath,
    releaseRoot: paths.releaseRoot,
    launchToken,
    startedAt: new Date().toISOString()
  });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    await delay(250);
    if (child.exitCode !== null) {
      throw new Error(
        `The local service exited before becoming ready. Logs: ${standardLog} and ${errorLog}`
      );
    }
    if (await getDashboardHealth(paths)) {
      openBrowser(paths.baseUrl);
      console.log(`Project Manager Dashboard is ready at ${paths.baseUrl}`);
      return;
    }
  }
  throw new Error(
    `The local service did not become ready within 30 seconds. Logs: ${standardLog} and ${errorLog}`
  );
}

function openBrowser(url) {
  if (process.env.PM_LAUNCHER_NO_BROWSER === '1') return;
  const child = spawn('explorer.exe', [url], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
