import { Body, Controller, Get, Post, UseGuards, Inject } from '@nestjs/common';
import { IsObject, IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ValidationError } from '@parisian-shopper/common';
import { AppConfigService } from '@parisian-shopper/config';
import {
  ProductMarketingEligibilityService,
  FRESHNESS_POLICY_REPOSITORY,
  calculatePolicyVersionHash,
  approveMarketingPolicyInputSchema,
  Permission,
  type FreshnessPolicyRepository,
  type FreshnessPolicy,
  type SanitizedEmployeeDto,
} from '@parisian-shopper/application';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
class CheckDto {
  @IsUUID() snapshotId!: string;
  @IsOptional() @IsObject() creationPlan?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(2000) brief?: string;
  @IsOptional() @IsUUID() campaignId?: string;
}
class PolicyDto {
  @IsObject() data!: Record<string, unknown>;
}
@Controller({ path: 'products/marketing', version: '1' })
@UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
@RequirePermissions(Permission.VIEW_PRODUCTS)
export class ProductMarketingController {
  constructor(
    private readonly products: ProductMarketingEligibilityService,
    @Inject(FRESHNESS_POLICY_REPOSITORY) private readonly policies: FreshnessPolicyRepository,
    private readonly config: AppConfigService,
  ) {}
  @Post('check') check(
    @Body() dto: CheckDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<ProductMarketingEligibilityService['check']> {
    return this.products.check({ ...dto, action: 'DRAFT' }, actor);
  }
  @Get('policy') policy(): ReturnType<FreshnessPolicyRepository['findActivePolicy']> {
    return this.policies.findActivePolicy(this.config.nodeEnvironment);
  }
  @Post('policy')
  @RequirePermissions(Permission.ADMIN)
  async approvePolicy(
    @Body() dto: PolicyDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<FreshnessPolicy> {
    const parsed = approveMarketingPolicyInputSchema.safeParse(dto.data);
    if (!parsed.success)
      throw new ValidationError({
        publicMessage:
          'Enter an explicit policy version, all freshness windows, stock actions and business confirmation.',
        cause: parsed.error,
      });
    const { confirmed: _confirmed, ...value } = parsed.data;
    return this.policies.create({
      ...value,
      environment: this.config.nodeEnvironment,
      lifecycleState: 'APPROVED',
      effectiveAt: new Date(),
      policyHash: calculatePolicyVersionHash(value),
      approvedByUserId: actor.id,
    });
  }
}
