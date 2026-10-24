import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  CodexCliCancelledError,
  CodexCliInvalidOutputError,
  CodexCliNotInstalledError,
  CodexCliProcessFailedError,
  CodexCliTimeoutError,
  CodexCliUsageLimitedError,
} from './codex-cli-errors.js';
import type {
  CodexCliEvent,
  CodexCliExecutionResult,
  CodexCliRunnerOptions,
  CodexCliRunOptions,
  CodexCliSandboxMode,
  CodexCliUsage,
} from './codex-cli-types.js';
import { ConcurrencyLimiter } from './concurrency-limiter.js';
import {
  defaultProcessSpawner,
  gracefullyTerminateProcess,
  type ProcessSpawner,
  type SpawnedProcess,
} from './process-spawner.js';
import { sanitizeOutput } from './sanitize.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10MB
const DEFAULT_GRACE_PERIOD_MS = 500;

export class CodexCliRunner {
  private readonly executable: string;
  private readonly defaultWorkingDirectory: string;
  private readonly defaultTimeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly gracePeriodMs: number;
  private readonly spawner: ProcessSpawner;
  private readonly limiter: ConcurrencyLimiter;

  public constructor(options: CodexCliRunnerOptions = {}) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CodexCliRunner is strictly for local development and is prohibited when NODE_ENV=production',
      );
    }

    const exec = options.executable ?? 'codex';
    this.validateExecutable(exec);
    this.executable = exec;

    this.defaultWorkingDirectory = options.defaultWorkingDirectory ?? process.cwd();
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    this.gracePeriodMs = options.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;
    this.spawner = options.spawner ?? defaultProcessSpawner;
    this.limiter = new ConcurrencyLimiter(options.maxConcurrency ?? 1);
  }

  public async run(options: CodexCliRunOptions): Promise<CodexCliExecutionResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CodexCliRunner is strictly for local development and is prohibited when NODE_ENV=production',
      );
    }

    if (options.signal?.aborted) {
      throw new CodexCliCancelledError(
        'Execution cancelled before starting',
        options.signal.reason,
      );
    }

    const release = await this.limiter.acquire(options.signal);
    try {
      return await this.executeInternal(options);
    } finally {
      release();
    }
  }

  private async executeInternal(options: CodexCliRunOptions): Promise<CodexCliExecutionResult> {
    const workingDirectory = options.workingDirectory ?? this.defaultWorkingDirectory;
    this.validateWorkingDirectory(workingDirectory);

    const sandbox = this.validateSandbox(options.sandbox ?? 'read-only');
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const startTime = Date.now();

    // Create a safe unique temporary directory under os.tmpdir()
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-cli-'));
    const lastMessagePath = path.join(tempDir, 'last-message.txt');

    try {
      let schemaPath: string | undefined;
      if (options.outputSchema !== undefined) {
        if (typeof options.outputSchema === 'string') {
          // If it's an existing file path, use it directly; otherwise write it as json schema
          if (path.isAbsolute(options.outputSchema) && fs.existsSync(options.outputSchema)) {
            schemaPath = options.outputSchema;
          } else {
            schemaPath = path.join(tempDir, 'output-schema.json');
            await fs.promises.writeFile(schemaPath, options.outputSchema, 'utf8');
          }
        } else {
          schemaPath = path.join(tempDir, 'output-schema.json');
          await fs.promises.writeFile(
            schemaPath,
            JSON.stringify(options.outputSchema, null, 2),
            'utf8',
          );
        }
      }

      const args = this.buildArgs({
        sandbox,
        workingDirectory,
        lastMessagePath,
        schemaPath,
        addDirs: options.addDirs,
        model: options.model,
      });

      const sanitizedEnv = this.sanitizeEnvironment(process.env);

      const child = this.spawner(this.executable, args, {
        cwd: workingDirectory,
        env: sanitizedEnv,
        shell: false,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return await this.manageProcessExecution(child, {
        prompt: options.prompt,
        lastMessagePath,
        timeoutMs,
        signal: options.signal,
        startTime,
      });
    } finally {
      // Secure cleanup of temporary directory
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private buildArgs(params: {
    sandbox: CodexCliSandboxMode;
    workingDirectory: string;
    lastMessagePath: string;
    schemaPath?: string | undefined;
    addDirs?: readonly string[] | undefined;
    model?: string | undefined;
  }): string[] {
    const args: string[] = [
      'exec',
      '--ephemeral',
      '--json',
      '-s',
      params.sandbox,
      '-C',
      params.workingDirectory,
      '-o',
      params.lastMessagePath,
    ];

    if (params.schemaPath) {
      args.push('--output-schema', params.schemaPath);
    }

    if (params.addDirs && params.addDirs.length > 0) {
      for (const dir of params.addDirs) {
        if (dir.trim() !== '') {
          args.push('--add-dir', dir);
        }
      }
    }

    if (params.model) {
      args.push('-m', params.model);
    }

    // Pass '-' as the prompt argument so instructions are read from stdin
    args.push('-');

    return args;
  }

  private sanitizeEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const cleaned = { ...env };
    // Strictly disallow passing API keys to local Codex CLI runner
    delete cleaned.OPENAI_API_KEY;
    delete cleaned.CODEX_API_KEY;
    return cleaned;
  }

  private async manageProcessExecution(
    child: SpawnedProcess,
    context: {
      prompt: string;
      lastMessagePath: string;
      timeoutMs: number;
      signal?: AbortSignal | undefined;
      startTime: number;
    },
  ): Promise<CodexCliExecutionResult> {
    return new Promise<CodexCliExecutionResult>((resolve, reject) => {
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let isTimedOut = false;
      let isCancelled = false;
      let timeoutTimer: NodeJS.Timeout | undefined;

      const cleanupResources = (): void => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = undefined;
        }
        if (context.signal && onAbort) {
          context.signal.removeEventListener('abort', onAbort);
        }
      };

      const onAbort = (): void => {
        isCancelled = true;
        void gracefullyTerminateProcess(child, this.gracePeriodMs);
      };

      if (context.signal) {
        if (context.signal.aborted) {
          onAbort();
        } else {
          context.signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      timeoutTimer = setTimeout(() => {
        isTimedOut = true;
        void gracefullyTerminateProcess(child, this.gracePeriodMs);
      }, context.timeoutMs);

      // Bounded capture of stdout and stderr
      child.stdout.on('data', (chunk: Buffer | string) => {
        const text = chunk.toString();
        if (stdoutBuffer.length < this.maxOutputBytes) {
          const available = this.maxOutputBytes - stdoutBuffer.length;
          stdoutBuffer += text.slice(0, available);
        }
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        const text = chunk.toString();
        if (stderrBuffer.length < this.maxOutputBytes) {
          const available = this.maxOutputBytes - stderrBuffer.length;
          stderrBuffer += text.slice(0, available);
        }
      });

      child.on('error', (err: unknown) => {
        cleanupResources();
        const error = err as NodeJS.ErrnoException;
        if (error?.code === 'ENOENT') {
          reject(
            new CodexCliNotInstalledError(`Codex executable not found: "${this.executable}"`, err),
          );
        } else {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });

      // Write prompt to stdin, never interpolated into command
      try {
        child.stdin.write(context.prompt, 'utf8', (err) => {
          if (!err) {
            child.stdin.end();
          }
        });
      } catch {
        // Child might have exited or closed stdin prematurely
      }

      child.on('exit', (exitCode, signal): void => {
        void (async (): Promise<void> => {
          cleanupResources();
          const durationMs = Date.now() - context.startTime;

          if (isCancelled) {
            reject(
              new CodexCliCancelledError(
                'Codex CLI execution was cancelled',
                context.signal?.reason,
              ),
            );
            return;
          }

          if (isTimedOut) {
            reject(
              new CodexCliTimeoutError(
                `Codex CLI execution timed out after ${context.timeoutMs}ms`,
                context.timeoutMs,
              ),
            );
            return;
          }

          const events = this.parseJsonlEvents(stdoutBuffer);
          const usage = this.extractUsage(events);
          const sanitizedStderr = sanitizeOutput(stderrBuffer);

          if (this.isUsageLimitError(sanitizedStderr, stdoutBuffer, events)) {
            reject(
              new CodexCliUsageLimitedError(
                `Codex CLI usage limit or rate limit encountered: ${sanitizedStderr || 'Rate limit exceeded'}`,
                { stderr: sanitizedStderr, exitCode },
              ),
            );
            return;
          }

          if (exitCode !== 0) {
            reject(
              new CodexCliProcessFailedError({
                message: `Codex CLI process failed with exit code ${exitCode}${signal ? ` (${signal})` : ''}: ${sanitizedStderr || 'Process execution failed'}`,
                exitCode,
                signal,
                stdout: stdoutBuffer,
                stderr: sanitizedStderr,
              }),
            );
            return;
          }

          let content = '';
          try {
            if (fs.existsSync(context.lastMessagePath)) {
              content = await fs.promises.readFile(context.lastMessagePath, 'utf8');
            }
          } catch (readErr) {
            reject(
              new CodexCliInvalidOutputError(
                `Failed to read output file: ${readErr instanceof Error ? readErr.message : String(readErr)}`,
              ),
            );
            return;
          }

          if (content.trim() === '') {
            reject(
              new CodexCliInvalidOutputError('Codex CLI produced an empty output file', {
                lastMessagePath: context.lastMessagePath,
              }),
            );
            return;
          }

          resolve({
            content,
            exitCode,
            signal,
            events,
            ...(usage !== undefined ? { usage } : {}),
            stdout: stdoutBuffer,
            stderr: sanitizedStderr,
            durationMs,
          });
        })();
      });
    });
  }

  private parseJsonlEvents(stdout: string): readonly CodexCliEvent[] {
    const events: CodexCliEvent[] = [];
    const lines = stdout.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith('{')) {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (typeof parsed === 'object' && parsed !== null && typeof parsed.type === 'string') {
          events.push(parsed as unknown as CodexCliEvent);
        }
      } catch {
        // Tolerate malformed JSON lines in event stream
      }
    }

    return events;
  }

  private extractUsage(events: readonly CodexCliEvent[]): CodexCliUsage | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]!;
      if (
        event.type === 'turn.completed' &&
        typeof event.usage === 'object' &&
        event.usage !== null
      ) {
        const u = event.usage as Record<string, unknown>;
        const inputTokens =
          typeof u.input_tokens === 'number'
            ? u.input_tokens
            : typeof u.prompt_tokens === 'number'
              ? u.prompt_tokens
              : typeof u.inputTokens === 'number'
                ? u.inputTokens
                : undefined;
        const outputTokens =
          typeof u.output_tokens === 'number'
            ? u.output_tokens
            : typeof u.completion_tokens === 'number'
              ? u.completion_tokens
              : typeof u.outputTokens === 'number'
                ? u.outputTokens
                : undefined;
        const cachedTokens =
          typeof u.cached_tokens === 'number'
            ? u.cached_tokens
            : typeof u.cachedTokens === 'number'
              ? u.cachedTokens
              : undefined;
        const totalTokens =
          typeof u.total_tokens === 'number'
            ? u.total_tokens
            : typeof u.totalTokens === 'number'
              ? u.totalTokens
              : undefined;

        const usageResult: CodexCliUsage = {
          raw: u,
        };
        if (inputTokens !== undefined) usageResult.inputTokens = inputTokens;
        if (outputTokens !== undefined) usageResult.outputTokens = outputTokens;
        if (cachedTokens !== undefined) usageResult.cachedTokens = cachedTokens;
        if (totalTokens !== undefined) usageResult.totalTokens = totalTokens;
        return usageResult;
      }
    }
    return undefined;
  }

  private isUsageLimitError(
    stderr: string,
    stdout: string,
    events: readonly CodexCliEvent[],
  ): boolean {
    const combined = (stderr + '\n' + stdout).toLowerCase();
    const limitTokens = [
      'rate_limit_exceeded',
      'usage_limit',
      'usage limit',
      'rate limit',
      'quota exceeded',
      'insufficient_quota',
      'too many requests',
      'status 429',
      'error 429',
    ];

    if (limitTokens.some((token) => combined.includes(token))) {
      return true;
    }

    for (const event of events) {
      if (event.type === 'error' || event.type === 'turn.failed') {
        const serialized = JSON.stringify(event).toLowerCase();
        if (
          serialized.includes('rate_limit') ||
          serialized.includes('usage_limit') ||
          serialized.includes('quota') ||
          serialized.includes('429')
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private validateExecutable(executable: string): void {
    if (!executable || executable.trim() === '') {
      throw new CodexCliNotInstalledError('Executable path or name cannot be empty');
    }

    if (path.isAbsolute(executable)) {
      if (!fs.existsSync(executable)) {
        throw new CodexCliNotInstalledError(`Codex executable not found at "${executable}"`);
      }
    } else {
      if (executable.includes('/') || executable.includes('\\')) {
        throw new CodexCliNotInstalledError(
          `Invalid executable name "${executable}". Must be a command name (e.g. "codex") or an absolute path.`,
        );
      }
    }
  }

  private validateWorkingDirectory(cwd: string): void {
    if (!cwd || cwd.trim() === '') {
      throw new Error('Working directory must not be empty');
    }
    if (!path.isAbsolute(cwd)) {
      throw new Error(`Working directory must be an absolute path, received: "${cwd}"`);
    }
    if (!fs.existsSync(cwd)) {
      throw new Error(`Working directory does not exist: "${cwd}"`);
    }
  }

  private validateSandbox(sandbox: string): CodexCliSandboxMode {
    if (sandbox !== 'read-only' && sandbox !== 'workspace-write') {
      throw new Error(
        `Invalid sandbox mode: "${sandbox}". Allowed modes: "read-only", "workspace-write"`,
      );
    }
    return sandbox;
  }
}
