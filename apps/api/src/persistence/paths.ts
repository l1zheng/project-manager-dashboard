import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

const applicationDirectoryName = 'ProjectManagerDashboard';

export interface DataPaths {
  rootDirectory: string;
  databasePath: string;
  backupsDirectory: string;
  exportsDirectory: string;
  logsDirectory: string;
  restoreStagingDirectory: string;
  pendingRestorePath: string;
}

export interface ResolveDataPathsOptions {
  environment?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
}

export function resolveDataPaths({
  environment = process.env,
  homeDirectory = homedir(),
  platform = process.platform
}: ResolveDataPathsOptions = {}): DataPaths {
  const path = platform === 'win32' ? win32 : posix;
  const override = environment.PM_DATA_DIR?.trim();
  const rootDirectory = override
    ? path.resolve(override)
    : resolveDefaultDataDirectory({ environment, homeDirectory, platform });

  return {
    rootDirectory,
    databasePath: path.join(rootDirectory, 'workspace.sqlite'),
    backupsDirectory: path.join(rootDirectory, 'backups'),
    exportsDirectory: path.join(rootDirectory, 'exports'),
    logsDirectory: path.join(rootDirectory, 'logs'),
    restoreStagingDirectory: path.join(rootDirectory, 'restore-staging'),
    pendingRestorePath: path.join(rootDirectory, 'pending-restore.json')
  };
}

export async function ensureDataDirectories(paths: DataPaths): Promise<void> {
  await Promise.all([
    mkdir(paths.rootDirectory, { recursive: true }),
    mkdir(paths.backupsDirectory, { recursive: true }),
    mkdir(paths.exportsDirectory, { recursive: true }),
    mkdir(paths.logsDirectory, { recursive: true }),
    mkdir(paths.restoreStagingDirectory, { recursive: true })
  ]);
}

function resolveDefaultDataDirectory({
  environment,
  homeDirectory,
  platform
}: Required<ResolveDataPathsOptions>): string {
  const path = platform === 'win32' ? win32 : posix;
  if (platform === 'win32') {
    return path.join(
      environment.LOCALAPPDATA?.trim() || path.join(homeDirectory, 'AppData', 'Local'),
      applicationDirectoryName
    );
  }

  if (platform === 'darwin') {
    return path.join(homeDirectory, 'Library', 'Application Support', applicationDirectoryName);
  }

  return path.join(
    environment.XDG_DATA_HOME?.trim() || path.join(homeDirectory, '.local', 'share'),
    'project-manager-dashboard'
  );
}
