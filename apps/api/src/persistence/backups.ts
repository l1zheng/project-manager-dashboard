import { readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { DataPaths } from './paths.js';

const automaticBackupPrefix = 'pre-migration-';
const automaticBackupSuffix = '.sqlite';

export interface VerifiedBackup {
  databasePath: string;
  manifestPath: string;
  createdAt: string;
}

export async function createVerifiedBackup(
  sqlite: Database.Database,
  paths: DataPaths,
  now = new Date()
): Promise<VerifiedBackup> {
  const createdAt = now.toISOString();
  const filename = `${automaticBackupPrefix}${createdAt.replaceAll(':', '-').replaceAll('.', '-')}${automaticBackupSuffix}`;
  const databasePath = join(paths.backupsDirectory, filename);
  const manifestPath = `${databasePath}.manifest.json`;

  await sqlite.backup(databasePath);

  const backup = new Database(databasePath, { readonly: true });
  try {
    const quickCheck = backup.pragma('quick_check', { simple: true });
    if (quickCheck !== 'ok') {
      throw new Error(`Backup integrity check failed: ${String(quickCheck)}`);
    }
  } finally {
    backup.close();
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify({ createdAt, databaseFilename: filename, kind: 'pre-migration' }, null, 2)}\n`,
    'utf8'
  );

  return { databasePath, manifestPath, createdAt };
}

export async function pruneAutomaticBackups(paths: DataPaths, maximumCount = 10): Promise<void> {
  const entries = await readdir(paths.backupsDirectory, { withFileTypes: true });
  const automaticBackups = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith(automaticBackupPrefix) &&
        entry.name.endsWith(automaticBackupSuffix)
    )
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  await Promise.all(
    automaticBackups
      .slice(maximumCount)
      .flatMap((filename) => [
        unlink(join(paths.backupsDirectory, filename)),
        unlink(join(paths.backupsDirectory, `${filename}.manifest.json`)).catch(() => undefined)
      ])
  );
}
