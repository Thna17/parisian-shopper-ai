import type { ProcessSpawner } from './process-spawner.js';

export type CodexCliSandboxMode = 'read-only' | 'workspace-write';

export interface CodexCliUsage {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  cachedTokens?: number | undefined;
  totalTokens?: number | undefined;
  raw?: Record<string, unknown> | undefined;
}

export interface CodexCliEvent {
  type: string;
  [key: string]: unknown;
}

export interface CodexCliRunOptions {
  prompt: string;
  workingDirectory?: string | undefined;
  sandbox?: CodexCliSandboxMode | undefined;
  outputSchema?: Record<string, unknown> | string | undefined;
  addDirs?: readonly string[] | undefined;
  model?: string | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface CodexCliExecutionResult {
  content: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  events: readonly CodexCliEvent[];
  usage?: CodexCliUsage | undefined;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface CodexCliRunnerOptions {
  executable?: string | undefined;
  defaultWorkingDirectory?: string | undefined;
  defaultTimeoutMs?: number | undefined;
  maxConcurrency?: number | undefined;
  maxOutputBytes?: number | undefined;
  gracePeriodMs?: number | undefined;
  spawner?: ProcessSpawner | undefined;
}

export interface CodexCliPreflightResult {
  ok: boolean;
  version: string;
  authStatus: string;
}
