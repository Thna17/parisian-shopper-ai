import { CodexCliNotAuthenticatedError, CodexCliNotInstalledError } from './codex-cli-errors.js';
import type { CodexCliPreflightResult } from './codex-cli-types.js';
import { defaultProcessSpawner, type ProcessSpawner } from './process-spawner.js';
import { sanitizeOutput } from './sanitize.js';

export interface CodexCliPreflightOptions {
  executable?: string;
  cwd?: string;
  timeoutMs?: number;
  spawner?: ProcessSpawner;
}

interface CommandExecutionResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

async function runSimpleCommand(
  spawner: ProcessSpawner,
  executable: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<CommandExecutionResult> {
  return new Promise<CommandExecutionResult>((resolve, reject) => {
    let stdoutData = '';
    let stderrData = '';
    let timedOut = false;

    let child;
    try {
      child = spawner(executable, args, {
        cwd,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error?.code === 'ENOENT') {
        reject(
          new CodexCliNotInstalledError(`Codex CLI executable not found: "${executable}"`, err),
        );
        return;
      }
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrData += chunk.toString();
    });

    child.on('error', (err: unknown) => {
      clearTimeout(timer);
      const error = err as NodeJS.ErrnoException;
      if (error?.code === 'ENOENT') {
        reject(
          new CodexCliNotInstalledError(`Codex CLI executable not found: "${executable}"`, err),
        );
      } else {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new CodexCliNotInstalledError(
            `Codex command "${executable} ${args.join(' ')}" timed out after ${timeoutMs}ms`,
          ),
        );
        return;
      }
      resolve({
        code,
        signal,
        stdout: stdoutData,
        stderr: stderrData,
      });
    });
  });
}

export async function checkCodexCliPreflight(
  options: CodexCliPreflightOptions = {},
): Promise<CodexCliPreflightResult> {
  const executable = options.executable ?? 'codex';
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? 10_000;
  const spawner = options.spawner ?? defaultProcessSpawner;

  // 1. Check version
  let versionResult: CommandExecutionResult;
  try {
    versionResult = await runSimpleCommand(spawner, executable, ['--version'], cwd, timeoutMs);
  } catch (err) {
    if (err instanceof CodexCliNotInstalledError) {
      throw err;
    }
    throw new CodexCliNotInstalledError(
      `Failed to execute Codex CLI version check: ${sanitizeOutput(
        err instanceof Error ? err.message : String(err),
      )}`,
      err,
    );
  }

  if (versionResult.code !== 0) {
    throw new CodexCliNotInstalledError(
      `Codex CLI version check exited with code ${versionResult.code}: ${sanitizeOutput(
        versionResult.stderr || versionResult.stdout,
      )}`,
    );
  }

  const rawVersion = versionResult.stdout.trim();
  const versionMatch = /codex(?:-cli)?\s+([0-9.]+)/i.exec(rawVersion);
  const version = versionMatch ? versionMatch[1]! : rawVersion;

  // 2. Check login status
  let authResult: CommandExecutionResult;
  try {
    authResult = await runSimpleCommand(spawner, executable, ['login', 'status'], cwd, timeoutMs);
  } catch (err) {
    throw new CodexCliNotAuthenticatedError(
      `Failed to verify Codex CLI authentication status: ${sanitizeOutput(
        err instanceof Error ? err.message : String(err),
      )}`,
    );
  }

  const authOutput = (authResult.stdout + '\n' + authResult.stderr).trim();

  if (authResult.code !== 0) {
    throw new CodexCliNotAuthenticatedError(
      `Codex CLI authentication check failed with exit code ${authResult.code}: ${sanitizeOutput(
        authOutput,
      )}`,
      { exitCode: authResult.code },
    );
  }

  if (!/logged in/i.test(authOutput) || /not logged in|logged out/i.test(authOutput)) {
    throw new CodexCliNotAuthenticatedError(
      `Codex CLI is not authenticated for local execution: ${sanitizeOutput(authOutput)}`,
      { output: sanitizeOutput(authOutput) },
    );
  }

  return {
    ok: true,
    version,
    authStatus: sanitizeOutput(authResult.stdout.trim()),
  };
}
