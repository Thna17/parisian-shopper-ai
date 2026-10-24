export type CodexCliErrorCode =
  | 'CODEX_CLI_NOT_INSTALLED'
  | 'CODEX_CLI_NOT_AUTHENTICATED'
  | 'CODEX_CLI_TIMEOUT'
  | 'CODEX_CLI_CANCELLED'
  | 'CODEX_CLI_PROCESS_FAILED'
  | 'CODEX_CLI_INVALID_OUTPUT'
  | 'CODEX_CLI_USAGE_LIMITED';

export interface CodexCliErrorOptions {
  code: CodexCliErrorCode;
  message: string;
  cause?: unknown;
  exitCode?: number | null | undefined;
  signal?: NodeJS.Signals | null | undefined;
  stdout?: string | undefined;
  stderr?: string | undefined;
  details?: Readonly<Record<string, unknown>> | undefined;
}

export class CodexCliError extends Error {
  public readonly code: CodexCliErrorCode;
  public readonly exitCode?: number | null | undefined;
  public readonly signal?: NodeJS.Signals | null | undefined;
  public readonly stdout?: string | undefined;
  public readonly stderr?: string | undefined;
  public readonly details?: Readonly<Record<string, unknown>> | undefined;

  public constructor(options: CodexCliErrorOptions) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'CodexCliError';
    this.code = options.code;
    if (options.exitCode !== undefined) {
      this.exitCode = options.exitCode;
    }
    if (options.signal !== undefined) {
      this.signal = options.signal;
    }
    if (options.stdout !== undefined) {
      this.stdout = options.stdout;
    }
    if (options.stderr !== undefined) {
      this.stderr = options.stderr;
    }
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

export class CodexCliNotInstalledError extends CodexCliError {
  public constructor(message: string, cause?: unknown) {
    super({
      code: 'CODEX_CLI_NOT_INSTALLED',
      message,
      ...(cause !== undefined ? { cause } : {}),
    });
    this.name = 'CodexCliNotInstalledError';
  }
}

export class CodexCliNotAuthenticatedError extends CodexCliError {
  public constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'CODEX_CLI_NOT_AUTHENTICATED',
      message,
      ...(details !== undefined ? { details } : {}),
    });
    this.name = 'CodexCliNotAuthenticatedError';
  }
}

export class CodexCliTimeoutError extends CodexCliError {
  public constructor(
    message: string,
    timeoutMs: number,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super({
      code: 'CODEX_CLI_TIMEOUT',
      message,
      details: { ...details, timeoutMs },
    });
    this.name = 'CodexCliTimeoutError';
  }
}

export class CodexCliCancelledError extends CodexCliError {
  public constructor(message = 'Codex CLI execution cancelled', cause?: unknown) {
    super({
      code: 'CODEX_CLI_CANCELLED',
      message,
      ...(cause !== undefined ? { cause } : {}),
    });
    this.name = 'CodexCliCancelledError';
  }
}

export class CodexCliProcessFailedError extends CodexCliError {
  public constructor(options: {
    message: string;
    exitCode?: number | null | undefined;
    signal?: NodeJS.Signals | null | undefined;
    stdout?: string | undefined;
    stderr?: string | undefined;
    details?: Readonly<Record<string, unknown>> | undefined;
  }) {
    super({
      code: 'CODEX_CLI_PROCESS_FAILED',
      message: options.message,
      ...(options.exitCode !== undefined ? { exitCode: options.exitCode } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
      ...(options.stdout !== undefined ? { stdout: options.stdout } : {}),
      ...(options.stderr !== undefined ? { stderr: options.stderr } : {}),
      ...(options.details !== undefined ? { details: options.details } : {}),
    });
    this.name = 'CodexCliProcessFailedError';
  }
}

export class CodexCliInvalidOutputError extends CodexCliError {
  public constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'CODEX_CLI_INVALID_OUTPUT',
      message,
      ...(details !== undefined ? { details } : {}),
    });
    this.name = 'CodexCliInvalidOutputError';
  }
}

export class CodexCliUsageLimitedError extends CodexCliError {
  public constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super({
      code: 'CODEX_CLI_USAGE_LIMITED',
      message,
      ...(details !== undefined ? { details } : {}),
    });
    this.name = 'CodexCliUsageLimitedError';
  }
}

export function isCodexCliError(error: unknown): error is CodexCliError {
  return error instanceof CodexCliError;
}
