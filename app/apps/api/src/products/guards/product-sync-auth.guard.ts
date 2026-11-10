import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '@parisian-shopper/config';
import {
  GetCurrentEmployeeUseCase,
  Permission,
  type SanitizedEmployeeDto,
} from '@parisian-shopper/application';
import { ApplicationError } from '@parisian-shopper/common';
import { extractSessionToken } from '../../auth/auth-cookie.util.js';

export interface ProductSyncRequest {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
  user?: SanitizedEmployeeDto;
  sessionToken?: string;
}

@Injectable()
export class ProductSyncAuthGuard implements CanActivate {
  public constructor(
    private readonly config: AppConfigService,
    @Inject(GetCurrentEmployeeUseCase)
    private readonly getCurrentEmployeeUseCase: GetCurrentEmployeeUseCase,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ProductSyncRequest>();

    // 1. Check for Webhook API Secret Header
    const webhookHeader = this.extractWebhookSecret(request);
    const expectedSecret =
      this.config.productApi?.syncWebhookKey ??
      this.config.productApi?.token ??
      process.env.PRODUCT_SYNC_WEBHOOK_KEY ??
      process.env.CATALOG_SYNC_API_KEY;

    if (webhookHeader && expectedSecret && secretsEqual(webhookHeader, expectedSecret)) {
      request.user = {
        id: '00000000-0000-0000-0000-000000000001',
        displayName: 'Automated Catalog Webhook',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: [Permission.MANAGE_PRODUCTS, Permission.ADMIN],
      };
      return true;
    }

    // 2. Fall back to Employee Session Cookie
    const sessionToken = extractSessionToken(
      request as unknown as Parameters<typeof extractSessionToken>[0],
    );
    if (!sessionToken) {
      throw new UnauthorizedException(
        'Authentication required: provide valid session cookie or Webhook API key',
      );
    }

    try {
      const user = await this.getCurrentEmployeeUseCase.execute({ rawSessionToken: sessionToken });
      request.user = user;
      request.sessionToken = sessionToken;

      const hasPermission =
        user.permissions.includes(Permission.MANAGE_PRODUCTS) ||
        user.permissions.includes(Permission.ADMIN);

      if (!hasPermission) {
        throw new ForbiddenException(
          'Missing MANAGE_PRODUCTS permission required to trigger catalog synchronization',
        );
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      if (error instanceof ApplicationError) {
        throw new UnauthorizedException(error.message);
      }
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  private extractWebhookSecret(request: ProductSyncRequest): string | undefined {
    const directHeader =
      request.headers['x-webhook-key'] ??
      request.headers['x-sync-api-key'] ??
      request.headers['x-api-key'];
    if (typeof directHeader === 'string' && directHeader.trim().length > 0) {
      return directHeader.trim();
    }
    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    return undefined;
  }
}

export function secretsEqual(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false;
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
