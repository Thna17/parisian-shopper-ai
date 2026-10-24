import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { PassThrough } from 'node:stream';

import {
  CodexCliCancelledError,
  CodexCliInvalidOutputError,
  CodexCliProcessFailedError,
  CodexCliTimeoutError,
  CodexCliUsageLimitedError,
} from '../codex-cli-errors.js';
import { CodexCliRunner } from '../codex-cli-runner.js';
import type { ProcessSpawnOptions, ProcessSpawner, SpawnedProcess } from '../process-spawner.js';

class FakeChildProcess extends EventEmitter implements SpawnedProcess {
  public pid = 99999;
  public stdin = new PassThrough();
  public stdout = new PassThrough();
  public stderr = new PassThrough();
  public signalsReceived: Array<NodeJS.Signals | number> = [];
  public stdinContent = '';
  public hasExited = false;

  public constructor(
    private readonly behavior: {
      ignoreSigterm?: boolean;
      autoExitOnSignal?: boolean;
    } = {},
  ) {
    super();
    this.stdin.on('data', (chunk: Buffer | string): void => {
      this.stdinContent += chunk.toString();
    });
  }

  public kill(signal: NodeJS.Signals | number = 'SIGTERM'): boolean {
    this.signalsReceived.push(signal);
    if (signal === 'SIGTERM' && this.behavior.ignoreSigterm) {
      return true;
    }
    if (this.behavior.autoExitOnSignal !== false && !this.hasExited) {
      this.emitExit(null, typeof signal === 'string' ? signal : null);
    }
    return true;
  }

  public emitExit(code: number | null, signal: NodeJS.Signals | null = null): void {
    if (!this.hasExited) {
      this.hasExited = true;
      this.emit('exit', code, signal);
    }
  }
}

describe('CodexCliRunner', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const testCwd = os.tmpdir();

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('successfully executes Codex CLI, writes response to output file and parses usage', async () => {
    let capturedArgs: readonly string[] = [];
    let capturedOptions: ProcessSpawnOptions | undefined;
    let fakeProc: FakeChildProcess | undefined;

    const spawner: ProcessSpawner = (_cmd, args, opts) => {
      capturedArgs = args;
      capturedOptions = opts;
      fakeProc = new FakeChildProcess();

      // Find the -o argument to write output
      const oIndex = args.indexOf('-o');
      const outputPath = args[oIndex + 1];

      setImmediate(() => {
        if (outputPath) {
          fs.writeFileSync(outputPath, 'Hello from Codex model response!', 'utf8');
        }
        fakeProc!.stdout.write(
          JSON.stringify({
            type: 'turn.started',
          }) + '\n',
        );
        fakeProc!.stdout.write(
          JSON.stringify({
            type: 'turn.completed',
            usage: {
              input_tokens: 150,
              output_tokens: 42,
              cached_tokens: 10,
              total_tokens: 192,
            },
          }) + '\n',
        );
        fakeProc!.emitExit(0, null);
      });

      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
    });

    const result = await runner.run({
      prompt: 'Draft an elegant description of a vintage silk trench',
      sandbox: 'read-only',
    });

    expect(result.content).toBe('Hello from Codex model response!');
    expect(result.exitCode).toBe(0);
    expect(result.usage).toEqual({
      inputTokens: 150,
      outputTokens: 42,
      cachedTokens: 10,
      totalTokens: 192,
      raw: {
        input_tokens: 150,
        output_tokens: 42,
        cached_tokens: 10,
        total_tokens: 192,
      },
    });
    expect(result.events).toHaveLength(2);
    expect(capturedOptions?.shell).toBe(false);
    expect(capturedArgs).toContain('--ephemeral');
    expect(capturedArgs).toContain('--json');
    expect(capturedArgs).toContain('-s');
    expect(capturedArgs).toContain('read-only');
  });

  it('supplies prompt through stdin and never interpolates it into shell args', async () => {
    let fakeProc: FakeChildProcess | undefined;
    let capturedArgs: readonly string[] = [];

    const spawner: ProcessSpawner = (_cmd, args) => {
      capturedArgs = args;
      fakeProc = new FakeChildProcess();

      const oIndex = args.indexOf('-o');
      const outputPath = args[oIndex + 1];

      setImmediate(() => {
        if (outputPath) {
          fs.writeFileSync(outputPath, 'Model response', 'utf8');
        }
        fakeProc!.emitExit(0, null);
      });

      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
    });

    const secretPrompt = 'SUPER_SECRET_PROMPT_THAT_MUST_NOT_BE_AN_ARG';
    await runner.run({
      prompt: secretPrompt,
    });

    expect(fakeProc!.stdinContent).toBe(secretPrompt);
    expect(capturedArgs).not.toContain(secretPrompt);
    expect(capturedArgs[capturedArgs.length - 1]).toBe('-');
  });

  it('enforces shell: false on process spawn', async () => {
    let capturedOptions: ProcessSpawnOptions | undefined;

    const spawner: ProcessSpawner = (_cmd, _args, opts) => {
      capturedOptions = opts;
      const fakeProc = new FakeChildProcess();
      setImmediate(() => {
        const oIndex = _args.indexOf('-o');
        const outputPath = _args[oIndex + 1];
        if (outputPath) {
          fs.writeFileSync(outputPath, 'Response', 'utf8');
        }
        fakeProc.emitExit(0, null);
      });
      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
    });

    await runner.run({ prompt: 'test' });
    expect(capturedOptions?.shell).toBe(false);
  });

  it('terminates process and throws CODEX_CLI_TIMEOUT on timeout', async () => {
    let fakeProc: FakeChildProcess | undefined;

    const spawner: ProcessSpawner = () => {
      fakeProc = new FakeChildProcess();
      // Does not exit on its own
      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
      defaultTimeoutMs: 50,
      gracePeriodMs: 20,
    });

    await expect(runner.run({ prompt: 'Timeout test', timeoutMs: 50 })).rejects.toThrow(
      CodexCliTimeoutError,
    );

    expect(fakeProc!.signalsReceived).toContain('SIGTERM');
  });

  it('terminates process and throws CODEX_CLI_CANCELLED on AbortSignal cancellation', async () => {
    let fakeProc: FakeChildProcess | undefined;

    const spawner: ProcessSpawner = () => {
      fakeProc = new FakeChildProcess();
      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
      gracePeriodMs: 20,
    });

    const controller = new AbortController();
    const runPromise = runner.run({
      prompt: 'Cancel test',
      signal: controller.signal,
    });

    // Abort shortly after launching
    setTimeout(() => {
      controller.abort();
    }, 25);

    await expect(runPromise).rejects.toThrow(CodexCliCancelledError);
    expect(fakeProc!.signalsReceived).toContain('SIGTERM');
  });

  it('sends SIGTERM followed by SIGKILL when process does not exit during grace period', async () => {
    let fakeProc: FakeChildProcess | undefined;

    const spawner: ProcessSpawner = () => {
      fakeProc = new FakeChildProcess({
        ignoreSigterm: true, // Will not exit on SIGTERM
        autoExitOnSignal: true, // Will exit on SIGKILL
      });
      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
      defaultTimeoutMs: 40,
      gracePeriodMs: 30,
    });

    await expect(runner.run({ prompt: 'Kill escalation test', timeoutMs: 40 })).rejects.toThrow(
      CodexCliTimeoutError,
    );

    expect(fakeProc!.signalsReceived).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('throws CODEX_CLI_PROCESS_FAILED on non-zero exit and sanitizes stderr', async () => {
    const spawner: ProcessSpawner = () => {
      const fakeProc = new FakeChildProcess();
      setImmediate(() => {
        fakeProc.stderr.write(
          'Error: Internal failure with Bearer secret-auth-token and sk-secret123456789\n',
        );
        fakeProc.emitExit(1, null);
      });
      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
    });

    let thrownError: unknown;
    try {
      await runner.run({ prompt: 'Failure test' });
    } catch (err: unknown) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(CodexCliProcessFailedError);
    const error = thrownError as CodexCliProcessFailedError;
    expect(error.exitCode).toBe(1);
    expect(error.stderr).toContain('Bearer [REDACTED]');
    expect(error.stderr).toContain('sk-[REDACTED]');
    expect(error.stderr).not.toContain('secret-auth-token');
    expect(error.stderr).not.toContain('secret123456789');
  });

  it('detects usage limits and throws CODEX_CLI_USAGE_LIMITED', async () => {
    const spawner: ProcessSpawner = () => {
      const fakeProc = new FakeChildProcess();
      setImmediate(() => {
        fakeProc.stderr.write('Rate limit exceeded: status 429 too many requests\n');
        fakeProc.emitExit(1, null);
      });
      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
    });

    await expect(runner.run({ prompt: 'Quota test' })).rejects.toThrow(CodexCliUsageLimitedError);
  });

  it('handles malformed JSONL gracefully without failing', async () => {
    const spawner: ProcessSpawner = (_cmd, args) => {
      const fakeProc = new FakeChildProcess();
      const oIndex = args.indexOf('-o');
      const outputPath = args[oIndex + 1];

      setImmediate(() => {
        if (outputPath) {
          fs.writeFileSync(outputPath, 'Final valid content', 'utf8');
        }
        fakeProc.stdout.write('MALFORMED_LINE_1\n');
        fakeProc.stdout.write('{ incomplete json\n');
        fakeProc.stdout.write(JSON.stringify({ type: 'turn.started' }) + '\n');
        fakeProc.stdout.write('ANOTHER_BAD_LINE\n');
        fakeProc.stdout.write(
          JSON.stringify({
            type: 'turn.completed',
            usage: { total_tokens: 50 },
          }) + '\n',
        );
        fakeProc.emitExit(0, null);
      });

      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
    });

    const result = await runner.run({ prompt: 'Malformed test' });
    expect(result.content).toBe('Final valid content');
    expect(result.events).toHaveLength(2);
    expect(result.usage?.totalTokens).toBe(50);
  });

  it('bounds captured stdout and stderr buffers to maxOutputBytes', async () => {
    const spawner: ProcessSpawner = (_cmd, args) => {
      const fakeProc = new FakeChildProcess();
      const oIndex = args.indexOf('-o');
      const outputPath = args[oIndex + 1];

      setImmediate(() => {
        if (outputPath) {
          fs.writeFileSync(outputPath, 'Bounded content', 'utf8');
        }
        // Emit 500 bytes of data on stdout and stderr
        fakeProc.stdout.write('A'.repeat(500));
        fakeProc.stderr.write('B'.repeat(500));
        fakeProc.emitExit(0, null);
      });

      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
      maxOutputBytes: 100, // Small limit
    });

    const result = await runner.run({ prompt: 'Bounded test' });
    expect(result.stdout.length).toBe(100);
    expect(result.stderr.length).toBe(100);
  });

  it('enforces maximum concurrency limit', async () => {
    let currentlyRunning = 0;
    let maxObservedRunning = 0;

    const spawner: ProcessSpawner = (_cmd, args) => {
      const fakeProc = new FakeChildProcess();
      const oIndex = args.indexOf('-o');
      const outputPath = args[oIndex + 1];

      currentlyRunning++;
      if (currentlyRunning > maxObservedRunning) {
        maxObservedRunning = currentlyRunning;
      }

      setTimeout(() => {
        if (outputPath) {
          fs.writeFileSync(outputPath, 'Concurrent result', 'utf8');
        }
        currentlyRunning--;
        fakeProc.emitExit(0, null);
      }, 50);

      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
      maxConcurrency: 1, // Strict concurrency = 1
    });

    const [r1, r2, r3] = await Promise.all([
      runner.run({ prompt: 'Job 1' }),
      runner.run({ prompt: 'Job 2' }),
      runner.run({ prompt: 'Job 3' }),
    ]);

    expect(r1.content).toBe('Concurrent result');
    expect(r2.content).toBe('Concurrent result');
    expect(r3.content).toBe('Concurrent result');
    expect(maxObservedRunning).toBe(1);
  });

  it('cleans up temporary directory after execution in finally block', async () => {
    let capturedTempDir = '';

    const spawner: ProcessSpawner = (_cmd, args) => {
      const fakeProc = new FakeChildProcess();
      const oIndex = args.indexOf('-o');
      const outputPath = args[oIndex + 1]!;
      capturedTempDir = path.dirname(outputPath);

      setImmediate(() => {
        fs.writeFileSync(outputPath, 'Cleaned up', 'utf8');
        fakeProc.emitExit(0, null);
      });

      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
    });

    await runner.run({ prompt: 'Temp cleanup test' });

    expect(capturedTempDir).toBeTruthy();
    expect(fs.existsSync(capturedTempDir)).toBe(false);
  });

  it('cleans up temporary directory even when execution fails', async () => {
    let capturedTempDir = '';

    const spawner: ProcessSpawner = (_cmd, args) => {
      const fakeProc = new FakeChildProcess();
      const oIndex = args.indexOf('-o');
      const outputPath = args[oIndex + 1]!;
      capturedTempDir = path.dirname(outputPath);

      setImmediate(() => {
        fakeProc.stderr.write('Something broke\n');
        fakeProc.emitExit(1, null);
      });

      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
    });

    await expect(runner.run({ prompt: 'Failure cleanup test' })).rejects.toThrow(
      CodexCliProcessFailedError,
    );

    expect(capturedTempDir).toBeTruthy();
    expect(fs.existsSync(capturedTempDir)).toBe(false);
  });

  it('throws CODEX_CLI_INVALID_OUTPUT when output file is empty', async () => {
    const spawner: ProcessSpawner = (_cmd, args) => {
      const fakeProc = new FakeChildProcess();
      const oIndex = args.indexOf('-o');
      const outputPath = args[oIndex + 1];

      setImmediate(() => {
        if (outputPath) {
          fs.writeFileSync(outputPath, '   \n', 'utf8');
        }
        fakeProc.emitExit(0, null);
      });

      return fakeProc;
    };

    const runner = new CodexCliRunner({
      spawner,
      defaultWorkingDirectory: testCwd,
    });

    await expect(runner.run({ prompt: 'Empty output test' })).rejects.toThrow(
      CodexCliInvalidOutputError,
    );
  });

  it('rejects execution when NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => new CodexCliRunner({ defaultWorkingDirectory: testCwd })).toThrow(
      'prohibited when NODE_ENV=production',
    );
  });
});
