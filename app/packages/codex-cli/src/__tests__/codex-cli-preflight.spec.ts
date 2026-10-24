import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { CodexCliNotAuthenticatedError, CodexCliNotInstalledError } from '../codex-cli-errors.js';
import { checkCodexCliPreflight } from '../codex-cli-preflight.js';
import type { ProcessSpawner, SpawnedProcess } from '../process-spawner.js';

class MockChildProcess extends EventEmitter implements SpawnedProcess {
  public pid = 12345;
  public stdin = new PassThrough();
  public stdout = new PassThrough();
  public stderr = new PassThrough();
  public killed = false;

  public kill(): boolean {
    this.killed = true;
    return true;
  }
}

describe('CodexCliPreflight', () => {
  it('succeeds when version and login status indicate valid ChatGPT auth', async () => {
    const spawner: ProcessSpawner = (_cmd, args) => {
      const proc = new MockChildProcess();
      setImmediate(() => {
        if (args.includes('--version')) {
          proc.stdout.end('codex-cli 0.149.1\n');
          proc.emit('exit', 0, null);
        } else if (args.includes('login') && args.includes('status')) {
          proc.stdout.end('Logged in using ChatGPT\n');
          proc.emit('exit', 0, null);
        }
      });
      return proc;
    };

    const result = await checkCodexCliPreflight({ spawner });
    expect(result.ok).toBe(true);
    expect(result.version).toBe('0.149.1');
    expect(result.authStatus).toBe('Logged in using ChatGPT');
  });

  it('fails with CODEX_CLI_NOT_INSTALLED when binary is missing (ENOENT)', async () => {
    const spawner: ProcessSpawner = () => {
      const proc = new MockChildProcess();
      setImmediate(() => {
        const err = Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' });
        proc.emit('error', err);
      });
      return proc;
    };

    await expect(checkCodexCliPreflight({ spawner })).rejects.toThrow(CodexCliNotInstalledError);
  });

  it('fails with CODEX_CLI_NOT_INSTALLED when version check exits non-zero', async () => {
    const spawner: ProcessSpawner = () => {
      const proc = new MockChildProcess();
      setImmediate(() => {
        proc.stderr.end('Command crashed\n');
        proc.emit('exit', 1, null);
      });
      return proc;
    };

    await expect(checkCodexCliPreflight({ spawner })).rejects.toThrow(CodexCliNotInstalledError);
  });

  it('fails with CODEX_CLI_NOT_AUTHENTICATED when login status exits non-zero', async () => {
    const spawner: ProcessSpawner = (_cmd, args) => {
      const proc = new MockChildProcess();
      setImmediate(() => {
        if (args.includes('--version')) {
          proc.stdout.end('codex-cli 0.149.1\n');
          proc.emit('exit', 0, null);
        } else {
          proc.stderr.end('Error: auth token missing\n');
          proc.emit('exit', 1, null);
        }
      });
      return proc;
    };

    await expect(checkCodexCliPreflight({ spawner })).rejects.toThrow(
      CodexCliNotAuthenticatedError,
    );
  });

  it('fails with CODEX_CLI_NOT_AUTHENTICATED when login status reports not logged in', async () => {
    const spawner: ProcessSpawner = (_cmd, args) => {
      const proc = new MockChildProcess();
      setImmediate(() => {
        if (args.includes('--version')) {
          proc.stdout.end('codex-cli 0.149.1\n');
          proc.emit('exit', 0, null);
        } else {
          proc.stdout.end('Not logged in. Run "codex login" to authenticate.\n');
          proc.emit('exit', 0, null);
        }
      });
      return proc;
    };

    await expect(checkCodexCliPreflight({ spawner })).rejects.toThrow(
      CodexCliNotAuthenticatedError,
    );
  });

  it('sanitizes any credentials from stderr without exposing tokens', async () => {
    const spawner: ProcessSpawner = (_cmd, args) => {
      const proc = new MockChildProcess();
      setImmediate(() => {
        if (args.includes('--version')) {
          proc.stdout.end('codex-cli 0.149.1\n');
          proc.emit('exit', 0, null);
        } else {
          proc.stderr.end(
            'Failure with Bearer secret_token_xyz_12345678 and sk-live1234567890abcdef\n',
          );
          proc.emit('exit', 1, null);
        }
      });
      return proc;
    };

    let thrownError: unknown;
    try {
      await checkCodexCliPreflight({ spawner });
    } catch (err: unknown) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(CodexCliNotAuthenticatedError);
    const msg = (thrownError as Error).message;
    expect(msg).toContain('Bearer [REDACTED]');
    expect(msg).toContain('sk-[REDACTED]');
    expect(msg).not.toContain('secret_token_xyz');
    expect(msg).not.toContain('1234567890abcdef');
  });
});
