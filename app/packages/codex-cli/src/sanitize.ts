const SENSITIVE_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  // Bearer tokens
  { pattern: /bearer\s+[a-z0-9_.-]+/gi, replacement: 'Bearer [REDACTED]' },
  // OpenAI / standard API keys
  { pattern: /sk-[a-z0-9_-]{8,}/gi, replacement: 'sk-[REDACTED]' },
  // JWT tokens
  {
    pattern: /ey[a-z0-9_-]+\.ey[a-z0-9_-]+\.[a-z0-9_-]+/gi,
    replacement: '[REDACTED_JWT]',
  },
  // Key-value pairs for secrets, passwords, tokens
  {
    pattern:
      /(["']?(?:token|secret|password|api[_-]?key|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*["']?)[^"',\s;)]+(["']?)/gi,
    replacement: '$1[REDACTED]$2',
  },
  // Authorization headers
  {
    pattern: /(authorization\s*:\s*)([^\r\n]+)/gi,
    replacement: '$1[REDACTED]',
  },
  // Auth json references with potential details
  {
    pattern: /(auth\.json[^\r\n]*[:=]\s*)[^\r\n]+/gi,
    replacement: '$1[REDACTED]',
  },
];

export function sanitizeOutput(text: string | null | undefined): string {
  if (text === null || text === undefined || text === '') {
    return '';
  }

  let sanitized = String(text);
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized;
}
