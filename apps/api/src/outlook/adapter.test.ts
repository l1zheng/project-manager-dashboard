import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OutlookDraftError,
  WindowsClassicOutlookAdapter,
  type BridgeInvocation
} from './adapter.js';

const scriptPath = fileURLToPath(new URL('./outlook-draft.ps1', import.meta.url));

describe('Windows classic Outlook adapter', () => {
  it('uses a JSON request file instead of putting report content in PowerShell arguments', async () => {
    let invocation: BridgeInvocation | undefined;
    let request: Record<string, unknown> | undefined;
    const adapter = new WindowsClassicOutlookAdapter({
      platform: 'win32',
      scriptPath,
      processRunner: async (nextInvocation) => {
        invocation = nextInvocation;
        const requestPath = nextInvocation.args[nextInvocation.args.indexOf('-InputPath') + 1]!;
        request = JSON.parse(await readFile(requestPath, 'utf8')) as Record<string, unknown>;
        return { exitCode: 0, stdout: '{"status":"displayed"}', stderr: '', timedOut: false };
      }
    });

    await expect(
      adapter.createDraft({ subject: '第32周周报', htmlFragment: '<main>支持单点登录</main>' })
    ).resolves.toEqual({ status: 'displayed' });
    expect(request).toEqual({ subject: '第32周周报', htmlFragment: '<main>支持单点登录</main>' });
    expect(invocation?.args).toContain('-NoProfile');
    expect(invocation?.args).toContain('-File');
    expect(invocation?.args.join(' ')).not.toContain('支持单点登录');
    expect(invocation?.args).not.toContain('-Command');
  });

  it('returns a safe fallback result on macOS and maps Outlook absence', async () => {
    const macAdapter = new WindowsClassicOutlookAdapter({ platform: 'darwin', scriptPath });
    await expect(macAdapter.probe()).resolves.toEqual({
      available: false,
      reason: 'platform_unsupported'
    });
    await expect(
      macAdapter.createDraft({ subject: '周报', htmlFragment: '<main>内容</main>' })
    ).rejects.toMatchObject({
      code: 'platform_unsupported'
    } satisfies Partial<OutlookDraftError>);

    const unavailableAdapter = new WindowsClassicOutlookAdapter({
      platform: 'win32',
      scriptPath,
      processRunner: async () => ({ exitCode: 10, stdout: '', stderr: '', timedOut: false })
    });
    await expect(unavailableAdapter.probe()).resolves.toEqual({
      available: false,
      reason: 'outlook_unavailable'
    });
  });

  it('ships a bridge script without send, recipient, save, or dynamic-command operations', async () => {
    const script = await readFile(scriptPath, 'utf8');
    expect(script).toContain('$mail.Display($false)');
    expect(script).toContain('New-Object -ComObject Outlook.Application');
    expect(script).not.toMatch(/\.(?:Send|Save|Recipients|To|CC|BCC)\b/i);
    expect(script).not.toMatch(/Invoke-Expression|\s-Command\s/i);
  });
});
