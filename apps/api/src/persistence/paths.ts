import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const applicationDirectoryName = 'ProjectManagerDashboard';

export interface DataPaths {
  rootDirectory: string;
  databasePath: string;
  backupsDirectory: string;
  exportsDirectory: string;
  logsDirectory: string;
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
  const override = environment.PM_DATA_DIR?.trim();
  const rootDirectory = override
    ? resolve(override)
    : resolveDefaultDataDirectory({ environment, homeDirectory, platform });

  return {
    rootDirectory,
    databasePath: join(rootDirectory, 'workspace.sqlite'),
    backupsDirectory: join(rootDirectory, 'backups'),
    exportsDirectory: join(rootDirectory, 'exports'),
    logsDirectory: join(rootDirectory, 'logs')
  };
}

export async function ensureDataDirectories(paths: DataPaths): Promise<void> {
  await Promise.all([
    mkdir(paths.rootDirectory, { recursive: true }),
    mkdir(paths.backupsDirectory, { recursive: true }),
    mkdir(paths.exportsDirectory, { recursive: true }),
    mkdir(paths.logsDirectory, { recursive: true })
  ]);
}

function resolveDefaultDataDirectory({
  environment,
  homeDirectory,
  platform
}: Required<ResolveDataPathsOptions>): string {
  if (platform === 'win32') {
    return join(
      environment.LOCALAPPDATA?.trim() || join(homeDirectory, 'AppData', 'Local'),
      applicationDirectoryName
    );
  }

  if (platform === 'darwin') {
    return join(homeDirectory, 'Library', 'Application Support', applicationDirectoryName);
  }

  return join(
    environment.XDG_DATA_HOME?.trim() || join(homeDirectory, '.local', 'share'),
    'project-manager-dashboard'
  );
}
