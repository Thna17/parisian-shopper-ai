const SENSITIVE_KEY =
  /(authorization|cookie|database.?url|password|secret|token$|api.?key|private.?key)/i;
const REDACTED = '[REDACTED]';

export function sanitizeForLogging(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack === undefined ? {} : { stack: value.stack }),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      sanitized[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitizeForLogging(item, seen);
    }
    return sanitized;
  }

  return `[${typeof value}]`;
}
