import { z } from 'zod';

export const workspaceBackupFormat = 'project-manager-workspace-backup';
export const workspaceBackupVersion = 1;

export const workspaceBackupManifestSchema = z
  .object({
    format: z.literal(workspaceBackupFormat),
    version: z.literal(workspaceBackupVersion),
    createdAt: z.iso.datetime(),
    applicationVersion: z.string().trim().min(1).max(80),
    database: z
      .object({
        filename: z.literal('workspace.sqlite'),
        bytes: z
          .number()
          .int()
          .positive()
          .max(512 * 1024 * 1024),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        migrations: z
          .object({
            appliedCount: z.number().int().nonnegative(),
            totalCount: z.number().int().nonnegative()
          })
          .strict()
      })
      .strict(),
    workspace: z
      .object({
        id: z.string().trim().min(1).max(120),
        name: z.string().trim().min(1).max(200)
      })
      .strict()
      .nullable()
  })
  .strict();

export type WorkspaceBackupManifest = z.infer<typeof workspaceBackupManifestSchema>;
