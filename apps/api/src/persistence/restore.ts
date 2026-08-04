import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import Database from 'better-sqlite3';
import * as yauzl from 'yauzl';
import { z } from 'zod';
import { workspaceBackupManifestSchema, type WorkspaceBackupManifest } from './backup-format.js';
import { createVerifiedBackup, pruneAutomaticBackups } from './backups.js';
import {
  assertDatabaseHealthy,
  assertForeignKeysHealthy,
  assertMigrationHistoryCompatible,
  hasWorkspaceSchema,
  type MigrationState
} from './migrations.js';
import type { DataPaths } from './paths.js';

export const maximumRestoreArchiveBytes = 128 * 1024 * 1024;
const maximumRestoreDatabaseBytes = 512 * 1024 * 1024;
const maximumRestoreManifestBytes = 64 * 1024;
const restoreMarkerVersion = 1;
let restoreConfirmationInProgress = false;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const restoreIdSchema = z.uuid();
const stagedRestoreSchema = z
  .object({
    version: z.literal(1),
    restoreId: restoreIdSchema,
    inspectedAt: z.iso.datetime(),
    archiveSha256: sha256Schema,
    candidateSha256: sha256Schema,
    manifest: workspaceBackupManifestSchema,
    migrationState: z
      .object({
        appliedCount: z.number().int().nonnegative(),
        pendingCount: z.number().int().nonnegative(),
        totalCount: z.number().int().nonnegative()
      })
      .strict()
  })
  .strict();

const pendingRestoreMarkerSchema = z
  .object({
    version: z.literal(restoreMarkerVersion),
    restoreId: restoreIdSchema,
    state: z.enum(['prepared', 'applying', 'rolling_back']),
    createdAt: z.iso.datetime(),
    candidateSha256: sha256Schema,
    preRestoreBackupFilename: z
      .string()
      .regex(/^pre-restore-[A-Za-z0-9.-]+\.sqlite$/)
      .refine((value) => basename(value) === value)
  })
  .strict();

type StagedRestore = z.infer<typeof stagedRestoreSchema>;
type PendingRestoreMarker = z.infer<typeof pendingRestoreMarkerSchema>;

export interface RestoreInspection {
  restoreId: string;
  inspectedAt: string;
  manifest: WorkspaceBackupManifest;
  migration: MigrationState;
}

export interface PendingRestoreReceipt {
  status: 'restart_required';
  restoreId: string;
  preRestoreBackupPath: string;
  restartRequired: true;
}

export interface RestoreStartupResult {
  status: 'restored' | 'rolled_back';
  restoreId: string;
  message?: string;
  preRestoreBackupPath: string;
}

export interface ActivatedRestore {
  marker: PendingRestoreMarker;
  stageDirectory: string;
  preRestoreBackupPath: string;
}

export type RestoreActivation =
  | { kind: 'none' }
  | { kind: 'activated'; restore: ActivatedRestore }
  | { kind: 'rolled_back'; result: RestoreStartupResult };

export class RestoreValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'RestoreValidationError';
    this.code = code;
    this.cause = cause;
  }
}

export async function isWorkspaceRestorePending(paths: DataPaths): Promise<boolean> {
  return fileExists(paths.pendingRestorePath);
}

export async function inspectWorkspaceBackup(
  archive: Buffer,
  paths: DataPaths,
  migrationsFolder: string,
  now = new Date()
): Promise<RestoreInspection> {
  if (archive.byteLength === 0 || archive.byteLength > maximumRestoreArchiveBytes) {
    throw new RestoreValidationError(
      'archive_size_invalid',
      `备份文件必须大于 0 且不超过 ${maximumRestoreArchiveBytes / 1024 / 1024} MB。`
    );
  }

  const restoreId = randomUUID();
  const stageDirectory = restoreStageDirectory(paths, restoreId);
  await mkdir(stageDirectory, { recursive: false });

  try {
    const archivePath = join(stageDirectory, 'archive.pmdbackup');
    const candidatePath = join(stageDirectory, 'candidate.sqlite');
    await writeFile(archivePath, archive, { flag: 'wx' });
    const { manifest, databaseBytes } = await extractExpectedEntries(archive, candidatePath);
    const candidateStats = await stat(candidatePath);
    if (candidateStats.size !== databaseBytes || candidateStats.size !== manifest.database.bytes) {
      throw new RestoreValidationError(
        'database_size_mismatch',
        '备份中的数据库大小与清单不一致。'
      );
    }

    const candidateSha256 = await sha256File(candidatePath);
    if (!digestsEqual(candidateSha256, manifest.database.sha256)) {
      throw new RestoreValidationError('checksum_mismatch', '备份数据库的 SHA-256 校验失败。');
    }

    const migrationState = verifyRestoreCandidate(candidatePath, migrationsFolder, manifest);
    const staged: StagedRestore = {
      version: 1,
      restoreId,
      inspectedAt: now.toISOString(),
      archiveSha256: createHash('sha256').update(archive).digest('hex'),
      candidateSha256,
      manifest,
      migrationState
    };
    await atomicWriteJson(join(stageDirectory, 'inspection.json'), staged);

    return {
      restoreId,
      inspectedAt: staged.inspectedAt,
      manifest,
      migration: migrationState
    };
  } catch (error) {
    await rm(stageDirectory, { recursive: true, force: true });
    if (error instanceof RestoreValidationError) throw error;
    throw new RestoreValidationError('archive_invalid', '无法读取或验证该工作区备份。', error);
  }
}

export async function confirmWorkspaceRestore(
  restoreIdInput: string,
  sqlite: Database.Database,
  paths: DataPaths,
  migrationsFolder: string,
  now = new Date()
): Promise<PendingRestoreReceipt> {
  if (restoreConfirmationInProgress) {
    throw new RestoreValidationError(
      'restore_confirmation_in_progress',
      '另一个工作区恢复任务正在确认，请稍候。'
    );
  }
  restoreConfirmationInProgress = true;
  try {
    return await prepareWorkspaceRestore(restoreIdInput, sqlite, paths, migrationsFolder, now);
  } finally {
    restoreConfirmationInProgress = false;
  }
}

async function prepareWorkspaceRestore(
  restoreIdInput: string,
  sqlite: Database.Database,
  paths: DataPaths,
  migrationsFolder: string,
  now: Date
): Promise<PendingRestoreReceipt> {
  const restoreId = restoreIdSchema.parse(restoreIdInput);
  if (await fileExists(paths.pendingRestorePath)) {
    throw new RestoreValidationError(
      'restore_already_pending',
      '已有一个待重启的工作区恢复任务。请先重启应用。'
    );
  }

  const staged = await loadStagedRestore(paths, restoreId);
  const candidatePath = join(restoreStageDirectory(paths, restoreId), 'candidate.sqlite');
  const candidateSha256 = await sha256File(candidatePath);
  if (!digestsEqual(candidateSha256, staged.candidateSha256)) {
    throw new RestoreValidationError('staged_candidate_changed', '暂存的恢复数据库已发生变化。');
  }
  verifyRestoreCandidate(candidatePath, migrationsFolder, staged.manifest);

  const preRestoreBackup = await createVerifiedBackup(sqlite, paths, now, 'pre-restore');
  await pruneAutomaticBackups(paths);
  const marker: PendingRestoreMarker = {
    version: restoreMarkerVersion,
    restoreId,
    state: 'prepared',
    createdAt: now.toISOString(),
    candidateSha256,
    preRestoreBackupFilename: basename(preRestoreBackup.databasePath)
  };
  await atomicWriteJson(paths.pendingRestorePath, marker);

  return {
    status: 'restart_required',
    restoreId,
    preRestoreBackupPath: preRestoreBackup.databasePath,
    restartRequired: true
  };
}

export async function discardStagedRestore(
  paths: DataPaths,
  restoreIdInput: string
): Promise<void> {
  const restoreId = restoreIdSchema.parse(restoreIdInput);
  if (await fileExists(paths.pendingRestorePath)) {
    let pendingRestoreId: string | undefined;
    let markerIsValid = false;
    try {
      const marker = pendingRestoreMarkerSchema.safeParse(
        JSON.parse(await readFile(paths.pendingRestorePath, 'utf8'))
      );
      markerIsValid = marker.success;
      pendingRestoreId = marker.success ? marker.data.restoreId : undefined;
    } catch {
      markerIsValid = false;
    }
    if (!markerIsValid || pendingRestoreId === restoreId) {
      throw new RestoreValidationError(
        'restore_already_pending',
        '该恢复任务已经确认，必须通过重启完成或回滚。'
      );
    }
  }
  await rm(restoreStageDirectory(paths, restoreId), { recursive: true, force: true });
}

export async function activatePendingRestore(
  paths: DataPaths,
  migrationsFolder: string
): Promise<RestoreActivation> {
  if (!(await fileExists(paths.pendingRestorePath))) return { kind: 'none' };

  let marker: PendingRestoreMarker;
  try {
    marker = pendingRestoreMarkerSchema.parse(
      JSON.parse(await readFile(paths.pendingRestorePath, 'utf8'))
    );
  } catch (error) {
    await quarantineInvalidMarker(paths, error);
    return {
      kind: 'rolled_back',
      result: {
        status: 'rolled_back',
        restoreId: 'unknown',
        message: '待恢复标记无效，未修改当前工作区。',
        preRestoreBackupPath: ''
      }
    };
  }

  const restore = activatedRestore(paths, marker);
  if (marker.state === 'rolling_back') {
    await completeRestoreRollback(restore, '上一次恢复在回滚过程中被中断。');
    return { kind: 'rolled_back', result: rolledBackResult(restore, '已完成中断的回滚。') };
  }

  let switchStarted = marker.state === 'applying';
  try {
    const staged = await loadStagedRestore(paths, marker.restoreId);
    const candidatePath = join(restore.stageDirectory, 'candidate.sqlite');
    const candidateSha256 = await sha256File(candidatePath);
    if (
      !digestsEqual(candidateSha256, marker.candidateSha256) ||
      !digestsEqual(candidateSha256, staged.candidateSha256)
    ) {
      throw new RestoreValidationError('staged_candidate_changed', '待恢复数据库校验失败。');
    }
    verifyRestoreCandidate(candidatePath, migrationsFolder, staged.manifest);
    await assertVerifiedRollbackBackup(restore.preRestoreBackupPath);

    marker = { ...marker, state: 'applying' };
    await atomicWriteJson(paths.pendingRestorePath, marker);
    restore.marker = marker;
    switchStarted = true;
    await installCandidateDatabase(paths, restore, candidatePath);
    return { kind: 'activated', restore };
  } catch (error) {
    if (switchStarted) await rollbackPendingRestore(restore, error);
    else await rejectPendingRestoreWithoutSwap(restore, paths, error);
    return {
      kind: 'rolled_back',
      result: rolledBackResult(restore, restoreFailureMessage(error))
    };
  }
}

export async function finalizePendingRestore(
  restore: ActivatedRestore,
  paths: DataPaths
): Promise<void> {
  await unlink(paths.pendingRestorePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
  await rm(restore.stageDirectory, { recursive: true, force: true });
}

export async function rollbackPendingRestore(
  restore: ActivatedRestore,
  error: unknown
): Promise<void> {
  restore.marker = { ...restore.marker, state: 'rolling_back' };
  await atomicWriteJson(join(restore.stageDirectory, 'failure-pending.json'), {
    failedAt: new Date().toISOString(),
    message: restoreFailureMessage(error)
  });
  await atomicWriteJson(join(restore.stageDirectory, 'marker.json'), restore.marker);
  await atomicWriteJson(join(restore.stageDirectory, 'rollback-started.json'), {
    startedAt: new Date().toISOString()
  });
  await atomicWriteJson(restoreMarkerPath(restore), restore.marker);
  await completeRestoreRollback(restore, restoreFailureMessage(error));
}

function restoreMarkerPath(restore: ActivatedRestore): string {
  return join(restore.stageDirectory, '..', '..', 'pending-restore.json');
}

async function completeRestoreRollback(restore: ActivatedRestore, message: string): Promise<void> {
  const pathsRoot = join(restore.stageDirectory, '..', '..');
  const databasePath = join(pathsRoot, 'workspace.sqlite');
  const originalPath = join(restore.stageDirectory, 'original.sqlite');
  const rollbackSource = (await fileExists(restore.preRestoreBackupPath))
    ? restore.preRestoreBackupPath
    : originalPath;
  await assertVerifiedRollbackBackup(rollbackSource);
  await removeSqliteSidecars(databasePath);

  if (await fileExists(databasePath)) {
    const failedPath = join(restore.stageDirectory, `failed-workspace-${randomUUID()}.sqlite`);
    await rename(databasePath, failedPath);
  }

  const rollbackInstallingPath = join(pathsRoot, 'workspace.sqlite.rollback-installing');
  await rm(rollbackInstallingPath, { force: true });
  await copyFile(rollbackSource, rollbackInstallingPath);
  await assertVerifiedRollbackBackup(rollbackInstallingPath);
  await rename(rollbackInstallingPath, databasePath);
  await atomicWriteJson(join(restore.stageDirectory, 'restore-failed.json'), {
    failedAt: new Date().toISOString(),
    message,
    preRestoreBackupPath: restore.preRestoreBackupPath
  });
  await unlink(join(pathsRoot, 'pending-restore.json')).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

async function rejectPendingRestoreWithoutSwap(
  restore: ActivatedRestore,
  paths: DataPaths,
  error: unknown
): Promise<void> {
  await atomicWriteJson(join(restore.stageDirectory, 'restore-failed.json'), {
    failedAt: new Date().toISOString(),
    message: restoreFailureMessage(error),
    currentWorkspaceChanged: false
  });
  await unlink(paths.pendingRestorePath).catch((unlinkError: NodeJS.ErrnoException) => {
    if (unlinkError.code !== 'ENOENT') throw unlinkError;
  });
}

async function installCandidateDatabase(
  paths: DataPaths,
  restore: ActivatedRestore,
  candidatePath: string
): Promise<void> {
  const originalPath = join(restore.stageDirectory, 'original.sqlite');
  const installingPath = join(paths.rootDirectory, 'workspace.sqlite.restore-installing');
  await removeSqliteSidecars(paths.databasePath);
  await rm(installingPath, { force: true });

  if (await fileExists(paths.databasePath)) {
    const liveSha256 = await sha256File(paths.databasePath);
    if (digestsEqual(liveSha256, restore.marker.candidateSha256)) return;
    if (await fileExists(originalPath)) {
      throw new RestoreValidationError(
        'restore_state_ambiguous',
        '恢复过程中同时发现未知工作区和原工作区，已进入安全回滚。'
      );
    }
    await rename(paths.databasePath, originalPath);
  }

  await copyFile(candidatePath, installingPath);
  if (!digestsEqual(await sha256File(installingPath), restore.marker.candidateSha256)) {
    throw new RestoreValidationError('install_checksum_mismatch', '恢复数据库复制校验失败。');
  }
  await rename(installingPath, paths.databasePath);
}

function verifyRestoreCandidate(
  candidatePath: string,
  migrationsFolder: string,
  manifest: WorkspaceBackupManifest
): MigrationState {
  const candidate = new Database(candidatePath, { readonly: true, fileMustExist: true });
  try {
    assertDatabaseHealthy(candidate);
    assertForeignKeysHealthy(candidate);
    if (!hasWorkspaceSchema(candidate)) {
      throw new RestoreValidationError('workspace_schema_missing', '备份缺少工作区数据库结构。');
    }
    let migrationState: MigrationState;
    try {
      migrationState = assertMigrationHistoryCompatible(candidate, migrationsFolder);
    } catch (error) {
      throw new RestoreValidationError(
        'migration_incompatible',
        '备份的数据库迁移记录与当前应用版本不兼容。',
        error
      );
    }
    if (
      migrationState.appliedCount !== manifest.database.migrations.appliedCount ||
      manifest.database.migrations.totalCount < manifest.database.migrations.appliedCount
    ) {
      throw new RestoreValidationError(
        'migration_manifest_mismatch',
        '备份清单与数据库迁移记录不一致。'
      );
    }

    if (manifest.workspace) {
      const workspace = candidate
        .prepare('SELECT id, name FROM workspaces WHERE id = ?')
        .get(manifest.workspace.id) as { id: string; name: string } | undefined;
      if (!workspace || workspace.name !== manifest.workspace.name) {
        throw new RestoreValidationError(
          'workspace_manifest_mismatch',
          '备份清单中的工作区信息与数据库不一致。'
        );
      }
    }
    return migrationState;
  } finally {
    candidate.close();
  }
}

async function extractExpectedEntries(
  archive: Buffer,
  candidatePath: string
): Promise<{ manifest: WorkspaceBackupManifest; databaseBytes: number }> {
  const zip = await yauzl.fromBufferPromise(archive, {
    autoClose: false,
    lazyEntries: true,
    strictFileNames: true,
    validateEntrySizes: true
  });
  const seen = new Set<string>();
  let manifestBuffer: Buffer | undefined;
  let databaseBytes = 0;

  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName !== 'manifest.json' && entry.fileName !== 'workspace.sqlite') {
        throw new RestoreValidationError('unexpected_archive_entry', '备份中包含非预期文件。');
      }
      if (seen.has(entry.fileName)) {
        throw new RestoreValidationError('duplicate_archive_entry', '备份中包含重复文件。');
      }
      seen.add(entry.fileName);
      assertRegularZipEntry(entry);

      if (entry.fileName === 'manifest.json') {
        if (entry.uncompressedSize > maximumRestoreManifestBytes) {
          throw new RestoreValidationError('manifest_too_large', '备份清单过大。');
        }
        manifestBuffer = await readZipEntry(zip, entry, maximumRestoreManifestBytes);
      } else {
        if (entry.uncompressedSize <= 0 || entry.uncompressedSize > maximumRestoreDatabaseBytes) {
          throw new RestoreValidationError('database_size_invalid', '备份数据库大小不受支持。');
        }
        const stream = await zip.openReadStreamPromise(entry);
        await pipeline(stream, createWriteStream(candidatePath, { flags: 'wx' }));
        databaseBytes = entry.uncompressedSize;
      }
    }
  } finally {
    zip.close();
  }

  if (seen.size !== 2 || !manifestBuffer || databaseBytes === 0) {
    throw new RestoreValidationError(
      'archive_entries_invalid',
      '备份必须且只能包含 manifest.json 和 workspace.sqlite。'
    );
  }

  try {
    return {
      manifest: workspaceBackupManifestSchema.parse(JSON.parse(manifestBuffer.toString('utf8'))),
      databaseBytes
    };
  } catch (error) {
    throw new RestoreValidationError('manifest_invalid', '备份清单格式无效或版本不受支持。', error);
  }
}

function assertRegularZipEntry(entry: yauzl.Entry): void {
  if (entry.isEncrypted() || !entry.canDecodeFileData()) {
    throw new RestoreValidationError('archive_entry_unsupported', '备份包含加密或不支持的文件。');
  }
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    throw new RestoreValidationError('compression_unsupported', '备份使用了不支持的压缩方式。');
  }
  const madeBy = entry.versionMadeBy >> 8;
  if (madeBy === 3) {
    const fileType = (entry.externalFileAttributes >>> 16) & 0o170000;
    if (fileType !== 0 && fileType !== 0o100000) {
      throw new RestoreValidationError('archive_link_rejected', '备份不得包含链接或特殊文件。');
    }
  }
  if ((entry.externalFileAttributes & 0x10) !== 0 || entry.fileName.includes('/')) {
    throw new RestoreValidationError('archive_path_rejected', '备份不得包含目录或嵌套路径。');
  }
}

async function readZipEntry(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  maximumBytes: number
): Promise<Buffer> {
  const stream = await zip.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maximumBytes) {
      throw new RestoreValidationError('archive_entry_too_large', '备份文件解压后超过限制。');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function loadStagedRestore(paths: DataPaths, restoreId: string): Promise<StagedRestore> {
  const inspectionPath = join(restoreStageDirectory(paths, restoreId), 'inspection.json');
  try {
    const staged = stagedRestoreSchema.parse(JSON.parse(await readFile(inspectionPath, 'utf8')));
    if (staged.restoreId !== restoreId) throw new Error('Restore ID mismatch.');
    return staged;
  } catch (error) {
    throw new RestoreValidationError('restore_not_found', '找不到已检查的恢复任务。', error);
  }
}

function activatedRestore(paths: DataPaths, marker: PendingRestoreMarker): ActivatedRestore {
  return {
    marker,
    stageDirectory: restoreStageDirectory(paths, marker.restoreId),
    preRestoreBackupPath: join(paths.backupsDirectory, marker.preRestoreBackupFilename)
  };
}

function restoreStageDirectory(paths: DataPaths, restoreId: string): string {
  return join(paths.restoreStagingDirectory, restoreIdSchema.parse(restoreId));
}

async function assertVerifiedRollbackBackup(databasePath: string): Promise<void> {
  const backup = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    assertDatabaseHealthy(backup);
    assertForeignKeysHealthy(backup);
  } finally {
    backup.close();
  }
}

async function removeSqliteSidecars(databasePath: string): Promise<void> {
  await Promise.all(
    [`${databasePath}-wal`, `${databasePath}-shm`].map((path) =>
      unlink(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      })
    )
  );
}

async function quarantineInvalidMarker(paths: DataPaths, error: unknown): Promise<void> {
  const quarantinePath = join(
    paths.restoreStagingDirectory,
    `invalid-pending-restore-${Date.now()}-${randomUUID()}.json`
  );
  await rename(paths.pendingRestorePath, quarantinePath);
  await writeFile(
    `${quarantinePath}.error.txt`,
    `${restoreFailureMessage(error).slice(0, 1000)}\n`,
    'utf8'
  );
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx'
  });
  await rename(temporaryPath, path);
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function digestsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return (
    leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function rolledBackResult(restore: ActivatedRestore, message: string): RestoreStartupResult {
  return {
    status: 'rolled_back',
    restoreId: restore.marker.restoreId,
    message,
    preRestoreBackupPath: restore.preRestoreBackupPath
  };
}

export function restoreFailureMessage(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current.message && !messages.includes(current.message)) messages.push(current.message);
    current = current.cause;
  }
  return (messages.join(' → ') || '工作区恢复失败。').slice(0, 1000);
}
