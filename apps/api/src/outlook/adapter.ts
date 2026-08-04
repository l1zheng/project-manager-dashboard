import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const MAX_REQUEST_BYTES = 5 * 1024 * 1024;
const BRIDGE_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

export type MailDraftInput = { subject: string; htmlFragment: string };
export type OutlookProbeResult =
  { available: true } | { available: false; reason: OutlookFailureCode };
export type OutlookFailureCode =
  | 'platform_unsupported'
  | 'powershell_unavailable'
  | 'outlook_unavailable'
  | 'automation_failed'
  | 'timeout';

export class OutlookDraftError extends Error {
  constructor(
    readonly code: OutlookFailureCode,
    message = outlookFailureMessage(code)
  ) {
    super(message);
    this.name = 'OutlookDraftError';
  }
}

export interface MailDraftAdapter {
  probe(): Promise<OutlookProbeResult>;
  createDraft(input: MailDraftInput): Promise<{ status: 'displayed' }>;
}

export type BridgeInvocation = {
  executable: string;
  args: string[];
  timeoutMs: number;
};

export type BridgeResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError?: NodeJS.ErrnoException;
};

export type WindowsClassicOutlookAdapterOptions = {
  platform?: NodeJS.Platform;
  systemRoot?: string;
  scriptPath?: string;
  tempDirectory?: string;
  processRunner?: (invocation: BridgeInvocation) => Promise<BridgeResult>;
};

export class WindowsClassicOutlookAdapter implements MailDraftAdapter {
  private readonly platform: NodeJS.Platform;
  private readonly systemRoot: string;
  private readonly scriptPath: string;
  private readonly tempDirectory: string;
  private readonly processRunner: (invocation: BridgeInvocation) => Promise<BridgeResult>;

  constructor(options: WindowsClassicOutlookAdapterOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.systemRoot = options.systemRoot ?? process.env.SystemRoot ?? 'C:\\Windows';
    this.scriptPath =
      options.scriptPath ?? fileURLToPath(new URL('./outlook-draft.ps1', import.meta.url));
    this.tempDirectory = options.tempDirectory ?? tmpdir();
    this.processRunner = options.processRunner ?? runPowerShell;
  }

  async probe(): Promise<OutlookProbeResult> {
    if (this.platform !== 'win32') return { available: false, reason: 'platform_unsupported' };
    const result = await this.run('Probe');
    if (result.exitCode === 0) return { available: true };
    return { available: false, reason: failureCodeFromResult(result) };
  }

  async createDraft(input: MailDraftInput): Promise<{ status: 'displayed' }> {
    if (this.platform !== 'win32') throw new OutlookDraftError('platform_unsupported');
    validateDraftInput(input);
    const requestDirectory = await mkdtemp(join(this.tempDirectory, 'project-manager-outlook-'));
    try {
      const requestPath = join(requestDirectory, 'draft-request.json');
      await writeFile(requestPath, JSON.stringify(input), 'utf8');
      const result = await this.run('CreateDraft', requestPath);
      if (result.exitCode !== 0) throw new OutlookDraftError(failureCodeFromResult(result));
      return { status: 'displayed' };
    } finally {
      await rm(requestDirectory, { recursive: true, force: true });
    }
  }

  private async run(mode: 'Probe' | 'CreateDraft', requestPath?: string): Promise<BridgeResult> {
    const executable = join(
      this.systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    try {
      await access(this.scriptPath);
    } catch {
      throw new OutlookDraftError('automation_failed', 'Outlook 自动化脚本不可用。');
    }
    const args = ['-NoLogo', '-NoProfile', '-STA', '-File', this.scriptPath, '-Mode', mode];
    if (requestPath) args.push('-InputPath', requestPath);
    return this.processRunner({ executable, args, timeoutMs: BRIDGE_TIMEOUT_MS });
  }
}

export function createDefaultMailDraftAdapter(): MailDraftAdapter {
  return new WindowsClassicOutlookAdapter();
}

export function outlookFailureMessage(code: OutlookFailureCode): string {
  return {
    platform_unsupported:
      '当前系统不是 Windows，无法创建经典 Outlook 草稿。请复制富文本或下载 HTML 报告。',
    powershell_unavailable:
      '未找到 Windows PowerShell，无法创建 Outlook 草稿。请复制富文本或下载 HTML 报告。',
    outlook_unavailable: '未检测到 Windows 经典 Outlook。请复制富文本或下载 HTML 报告。',
    automation_failed:
      '经典 Outlook 未能创建草稿，可能受到配置或公司策略限制。请复制富文本或下载 HTML 报告。',
    timeout: '创建 Outlook 草稿超时。请检查 Outlook 是否正在响应，或改用复制/HTML 下载。'
  }[code];
}

function validateDraftInput(input: MailDraftInput): void {
  if (
    !input.subject.trim() ||
    Array.from(input.subject).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    throw new OutlookDraftError('automation_failed', '邮件主题包含不支持的控制字符。');
  }
  if (!input.htmlFragment.trim()) {
    throw new OutlookDraftError('automation_failed', '报告内容为空，无法创建 Outlook 草稿。');
  }
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_REQUEST_BYTES) {
    throw new OutlookDraftError(
      'automation_failed',
      '报告过大，无法安全地创建 Outlook 草稿。请缩小导出范围。'
    );
  }
}

function failureCodeFromResult(result: BridgeResult): OutlookFailureCode {
  if (result.timedOut) return 'timeout';
  if (result.spawnError?.code === 'ENOENT') return 'powershell_unavailable';
  if (result.exitCode === 10) return 'outlook_unavailable';
  return 'automation_failed';
}

async function runPowerShell(invocation: BridgeInvocation): Promise<BridgeResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const state: { timeout?: ReturnType<typeof setTimeout> } = {};
    const child = spawn(invocation.executable, invocation.args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const finish = (result: BridgeResult) => {
      if (settled) return;
      settled = true;
      if (state.timeout) clearTimeout(state.timeout);
      resolve(result);
    };
    const append = (current: string, chunk: Buffer) =>
      (current + chunk.toString('utf8')).slice(0, MAX_OUTPUT_BYTES);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.once('error', (spawnError: NodeJS.ErrnoException) =>
      finish({ exitCode: null, stdout, stderr, timedOut, spawnError })
    );
    child.once('close', (exitCode) => finish({ exitCode, stdout, stderr, timedOut }));
    state.timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, invocation.timeoutMs);
  });
}
