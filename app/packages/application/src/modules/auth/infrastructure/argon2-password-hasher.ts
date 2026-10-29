import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { argon2id } from 'hash-wasm';
import { type PasswordHasher, type PasswordHasherOptions } from '../domain/password-hasher.port.js';

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private readonly defaultMemorySize: number;
  private readonly defaultIterations: number;
  private readonly defaultParallelism: number;
  private readonly defaultHashLength: number;

  public constructor(@Optional() options?: PasswordHasherOptions) {
    this.defaultMemorySize = options?.memorySize ?? 65536; // 64 MB
    this.defaultIterations = options?.iterations ?? 3;
    this.defaultParallelism = options?.parallelism ?? 4;
    this.defaultHashLength = options?.hashLength ?? 32;
  }

  public async hash(password: string, options?: PasswordHasherOptions): Promise<string> {
    const salt = randomBytes(16);
    return argon2id({
      password,
      salt,
      iterations: options?.iterations ?? this.defaultIterations,
      memorySize: options?.memorySize ?? this.defaultMemorySize,
      parallelism: options?.parallelism ?? this.defaultParallelism,
      hashLength: options?.hashLength ?? this.defaultHashLength,
      outputType: 'encoded',
    });
  }

  public async verify(password: string, encodedHash: string): Promise<boolean> {
    try {
      if (!encodedHash || typeof encodedHash !== 'string') return false;
      const parts = encodedHash.split('$');
      // Format: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
      if (parts.length !== 6 || parts[1] !== 'argon2id') return false;

      const paramsStr = parts[3];
      if (!paramsStr) return false;
      const params: Record<string, string> = {};
      for (const pair of paramsStr.split(',')) {
        const [k, v] = pair.split('=');
        if (k && v) params[k] = v;
      }
      const m = parseInt(params['m'] ?? '', 10);
      const t = parseInt(params['t'] ?? '', 10);
      const p = parseInt(params['p'] ?? '', 10);
      if (isNaN(m) || isNaN(t) || isNaN(p)) return false;

      const saltBase64 = parts[4];
      if (!saltBase64) return false;
      const salt = Buffer.from(saltBase64, 'base64');

      const computedHash = await argon2id({
        password,
        salt,
        iterations: t,
        memorySize: m,
        parallelism: p,
        hashLength: this.defaultHashLength,
        outputType: 'encoded',
      });

      const computedBuffer = Buffer.from(computedHash, 'utf8');
      const expectedBuffer = Buffer.from(encodedHash, 'utf8');
      if (computedBuffer.length !== expectedBuffer.length) {
        return false;
      }
      return timingSafeEqual(computedBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }
}
