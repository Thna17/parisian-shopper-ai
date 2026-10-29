import { describe, expect, it } from '@jest/globals';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';

describe('Argon2PasswordHasher', () => {
  // Use lower memory in test for speed
  const hasher = new Argon2PasswordHasher({
    memorySize: 1024,
    iterations: 2,
    parallelism: 1,
    hashLength: 32,
  });

  it('produces a standard PHC-formatted Argon2id hash', async () => {
    const password = 'CorrectHorseBatteryStaple123!';
    const hash = await hasher.hash(password);

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it('verifies correct password against generated hash', async () => {
    const password = 'SuperSecretEmployeePassphrase';
    const hash = await hasher.hash(password);

    const isValid = await hasher.verify(password, hash);
    expect(isValid).toBe(true);
  });

  it('rejects incorrect password against generated hash', async () => {
    const password = 'RealPassword123';
    const hash = await hasher.hash(password);

    const isValid = await hasher.verify('WrongPassword456', hash);
    expect(isValid).toBe(false);
  });

  it('safely returns false for malformed or corrupted hashes without throwing', async () => {
    expect(await hasher.verify('password', 'not-a-hash')).toBe(false);
    expect(await hasher.verify('password', '$bcrypt$v=19$foo')).toBe(false);
    expect(await hasher.verify('password', '')).toBe(false);
  });
});
