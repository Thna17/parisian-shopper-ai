import { spawn as nodeSpawn } from 'node:child_process';
import process from 'node:process';

export interface SpawnedProcess {
  pid?: number;
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: string, listener: (...args: readonly unknown[]) => void): this;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface ProcessSpawnOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  detached?: boolean;
  stdio?: Array<'pipe' | 'ignore' | 'inherit'>;
}

export type ProcessSpawner = (
  command: string,
  args: readonly string[],
  options: ProcessSpawnOptions,
) => SpawnedProcess;

export const defaultProcessSpawner: ProcessSpawner = (command, args, options) => {
  return nodeSpawn(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    shell: options.shell ?? false,
    detached: options.detached ?? false,
    stdio: options.stdio ?? ['pipe', 'pipe', 'pipe'],
  }) as unknown as SpawnedProcess;
};

export function terminateProcessTree(
  child: SpawnedProcess,
  signal: NodeJS.Signals = 'SIGTERM',
): void {
  const pid = child.pid;
  if (!pid) {
    try {
      child.kill(signal);
    } catch {
      // Process already terminated
    }
    return;
  }

  let killedGroup = false;
  if (process.platform !== 'win32') {
    try {
      // Negative PID signals the entire process group
      process.kill(-pid, signal);
      killedGroup = true;
    } catch {
      // Process group might not exist or process already dead
    }
  }

  if (!killedGroup) {
    try {
      child.kill(signal);
    } catch {
      try {
        process.kill(pid, signal);
      } catch {
        // Process already terminated
      }
    }
  }
}

export async function gracefullyTerminateProcess(
  child: SpawnedProcess,
  gracePeriodMs = 500,
): Promise<void> {
  let exited = false;
  const onExit = (): void => {
    exited = true;
  };

  child.on('exit', onExit);

  // 1. Send SIGTERM first
  terminateProcessTree(child, 'SIGTERM');

  // Short delay or poll until exited
  const pollIntervalMs = 25;
  const maxPolls = Math.max(1, Math.floor(gracePeriodMs / pollIntervalMs));

  for (let i = 0; i < maxPolls; i++) {
    if (exited) {
      return;
    }
    await new Promise<void>((resolve): void => {
      setTimeout(resolve, pollIntervalMs);
    });
  }

  // 2. If still not exited, escalate to SIGKILL
  if (!exited) {
    terminateProcessTree(child, 'SIGKILL');
  }
}
