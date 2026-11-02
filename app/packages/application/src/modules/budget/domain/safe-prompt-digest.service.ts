import { createHmac } from 'node:crypto';

export interface PromptCanonicalPayload {
  readonly promptText: string;
  readonly modelParameters?: Record<string, unknown> | undefined;
  readonly provider: string;
  readonly model: string;
  readonly templateVersion?: string | undefined;
  readonly policyVersion?: string | undefined;
}

export interface ManagedSecretStore {
  resolveKey(keyVersion: string): string;
}

export class DefaultSecretStore implements ManagedSecretStore {
  private readonly keys: Record<string, string>;

  public constructor(customKeys?: Record<string, string>) {
    this.keys = customKeys ?? {
      '2026-v1': process.env['HMAC_PROMPT_SECRET_KEY'] ?? 'parisian-shopper-hmac-secret-v1-key',
      '2026-v2': process.env['HMAC_PROMPT_SECRET_KEY_V2'] ?? 'parisian-shopper-hmac-secret-v2-key',
    };
  }

  public resolveKey(keyVersion: string): string {
    const key = this.keys[keyVersion];
    if (!key) {
      throw new Error(
        `ManagedSecretStore: Secret key version '${keyVersion}' is not recognized or not available.`,
      );
    }
    return key;
  }
}

export class SafePromptDigestService {
  public constructor(private readonly secretStore: ManagedSecretStore = new DefaultSecretStore()) {}

  /**
   * Deterministically canonically serializes an object with stable lexicographical key order.
   * Crucially, values (including prompt whitespace) are NEVER modified, collapsed, or trimmed.
   */
  public canonicalSerialize(obj: unknown): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
      const items = obj.map((item) => this.canonicalSerialize(item));
      return `[${items.join(',')}]`;
    }

    const record = obj as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const entries = sortedKeys
      .filter((k) => record[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${this.canonicalSerialize(record[k])}`);

    return `{${entries.join(',')}}`;
  }

  /**
   * Generates a keyed HMAC-SHA256 digest of the canonical prompt representation.
   * Returns a 64-character lowercase hex string and the non-secret key version used.
   */
  public computeDigest(
    payload: PromptCanonicalPayload,
    keyVersion = '2026-v1',
  ): { safePromptDigest: string; digestAlgorithm: string; digestKeyVersion: string } {
    const secretKey = this.secretStore.resolveKey(keyVersion);
    const canonicalString = this.canonicalSerialize(payload);

    const hmac = createHmac('sha256', secretKey);
    hmac.update(canonicalString, 'utf8');
    const safePromptDigest = hmac.digest('hex');

    return {
      safePromptDigest,
      digestAlgorithm: 'HMAC-SHA256',
      digestKeyVersion: keyVersion,
    };
  }

  /**
   * Verifies that a given prompt payload matches a historical digest using its recorded key version.
   */
  public verifyDigest(
    payload: PromptCanonicalPayload,
    expectedDigest: string,
    keyVersion: string,
  ): boolean {
    const { safePromptDigest } = this.computeDigest(payload, keyVersion);
    return safePromptDigest === expectedDigest;
  }
}
