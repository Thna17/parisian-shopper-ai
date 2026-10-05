import { describe, expect, it } from '@jest/globals';

import { assertTelegramUserId, parseTelegramCommand } from './telegram.js';

describe('Telegram command parsing', () => {
  it('parses supported commands, bot mentions, and trimmed arguments', () => {
    expect(parseTelegramCommand(' /create@ParisianBot   FIC-PERF-001 ')).toEqual({
      name: 'create',
      argument: 'FIC-PERF-001',
    });
    expect(parseTelegramCommand('/search Moonlit River')).toEqual({
      name: 'search',
      argument: 'Moonlit River',
    });
  });

  it('does not route unknown commands or ordinary messages', () => {
    expect(parseTelegramCommand('/approve 1').name).toBe('unknown');
    expect(parseTelegramCommand('hello').name).toBe('unknown');
  });

  it('accepts bounded positive numeric Telegram IDs only', () => {
    expect(assertTelegramUserId('123456789')).toBe('123456789');
    for (const value of ['0', '-1', 'abc', '1.5', '1'.repeat(21)]) {
      expect(() => assertTelegramUserId(value)).toThrow();
    }
  });
});
