import { describe, expect, it } from 'vitest';
import { resolveDataPaths } from './paths.js';

describe('data-path resolution', () => {
  it('uses the Windows local application-data directory', () => {
    const paths = resolveDataPaths({
      platform: 'win32',
      homeDirectory: 'C:\\Users\\Alice',
      environment: { LOCALAPPDATA: 'C:\\Users\\Alice\\AppData\\Local' }
    });

    expect(paths.rootDirectory).toContain('ProjectManagerDashboard');
    expect(paths.databasePath).toContain('workspace.sqlite');
  });

  it('honors the explicit data-directory override for tests and diagnostics', () => {
    const paths = resolveDataPaths({
      platform: 'darwin',
      homeDirectory: '/Users/alice',
      environment: { PM_DATA_DIR: '/tmp/project-manager-test' }
    });

    expect(paths.rootDirectory).toBe('/tmp/project-manager-test');
    expect(paths.backupsDirectory).toBe('/tmp/project-manager-test/backups');
  });
});
