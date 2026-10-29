import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';

export const EXPORT_DOWNLOAD_TOKEN_SERVICE = Symbol('EXPORT_DOWNLOAD_TOKEN_SERVICE');
export const EXPORT_DOWNLOAD_TOKEN_CONFIG = Symbol('EXPORT_DOWNLOAD_TOKEN_CONFIG');

export interface ExportDownloadTokenConfig {
  readonly secret?: string;
  readonly ttlSeconds?: number;
}

export interface GenerateDownloadTokenInput {
  readonly exportId: string;
  readonly userId: string;
  readonly expiresInSeconds?: number;
}

export type DownloadTokenRejectionReason =
  'EXPIRED' | 'INVALID_SIGNATURE' | 'MALFORMED' | 'EXPORT_MISMATCH';

export interface VerifyDownloadTokenResult {
  readonly isValid: boolean;
  readonly exportId?: string;
  readonly userId?: string;
  readonly expiresAt?: Date;
  readonly reason?: DownloadTokenRejectionReason;
}

interface InternalTokenPayload {
  readonly e: string;
  readonly u: string;
  readonly exp: number;
  readonly sig: string;
}

const DEFAULT_SECRET = 'parisian-shopper-export-secret-key-development';
const DEFAULT_TTL_SECONDS = 3600; // 1 hour

@Injectable()
export class ExportDownloadTokenService {
  private readonly secret: string;
  private readonly defaultTtlSeconds: number;

  public constructor(
    @Optional()
    @Inject(EXPORT_DOWNLOAD_TOKEN_CONFIG)
    config?: ExportDownloadTokenConfig,
  ) {
    this.secret = config?.secret ?? DEFAULT_SECRET;
    this.defaultTtlSeconds = config?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  public generateToken(input: GenerateDownloadTokenInput): string {
    const ttl = input.expiresInSeconds ?? this.defaultTtlSeconds;
    const exp = Date.now() + ttl * 1000;
    const signature = this.computeSignature(input.exportId, input.userId, exp);

    const payload: InternalTokenPayload = {
      e: input.exportId,
      u: input.userId,
      exp,
      sig: signature,
    };

    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  public verifyToken(token: string, expectedExportId?: string): VerifyDownloadTokenResult {
    let parsed: unknown;
    try {
      const json = Buffer.from(token, 'base64url').toString('utf8');
      parsed = JSON.parse(json);
    } catch {
      return { isValid: false, reason: 'MALFORMED' };
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Partial<InternalTokenPayload>).e !== 'string' ||
      typeof (parsed as Partial<InternalTokenPayload>).u !== 'string' ||
      typeof (parsed as Partial<InternalTokenPayload>).exp !== 'number' ||
      typeof (parsed as Partial<InternalTokenPayload>).sig !== 'string'
    ) {
      return { isValid: false, reason: 'MALFORMED' };
    }

    const { e: exportId, u: userId, exp, sig } = parsed as InternalTokenPayload;
    const expiresAt = new Date(exp);

    if (Date.now() > exp) {
      return {
        isValid: false,
        exportId,
        userId,
        expiresAt,
        reason: 'EXPIRED',
      };
    }

    if (expectedExportId !== undefined && exportId !== expectedExportId) {
      return {
        isValid: false,
        exportId,
        userId,
        expiresAt,
        reason: 'EXPORT_MISMATCH',
      };
    }

    const expectedSignature = this.computeSignature(exportId, userId, exp);
    const sigBuffer = Buffer.from(sig, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      return {
        isValid: false,
        exportId,
        userId,
        expiresAt,
        reason: 'INVALID_SIGNATURE',
      };
    }

    return {
      isValid: true,
      exportId,
      userId,
      expiresAt,
    };
  }

  private computeSignature(exportId: string, userId: string, exp: number): string {
    return createHmac('sha256', this.secret)
      .update(`${exportId}:${userId}:${exp}`, 'utf8')
      .digest('hex');
  }
}
