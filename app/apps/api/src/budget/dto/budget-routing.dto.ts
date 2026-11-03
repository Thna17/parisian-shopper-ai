import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type AiModality,
  type BudgetScopeType,
  type CostKnowledgeState,
} from '@parisian-shopper/application';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateW50BudgetPolicyDto {
  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  public readonly version?: string | undefined;

  @ApiPropertyOptional({ enum: ['GLOBAL', 'TENANT', 'CAMPAIGN', 'USER'], default: 'GLOBAL' })
  @IsOptional()
  @IsString()
  public readonly scopeType?: BudgetScopeType | undefined;

  @ApiPropertyOptional({ example: 'GLOBAL', default: 'GLOBAL' })
  @IsOptional()
  @IsString()
  public readonly scopeId?: string | undefined;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  public readonly currency?: string | undefined;

  @ApiProperty({ example: 20.0, description: 'Monthly spending cap in currency' })
  @IsNumber()
  @IsPositive()
  public readonly monthlyCeiling!: number;

  @ApiPropertyOptional({ example: 10.0, description: 'Daily spending cap in currency' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  public readonly dailyCeiling?: number | undefined;

  @ApiPropertyOptional({ example: 2.0, description: 'Per-operation max limit' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  public readonly perOperationMax?: number | undefined;

  @ApiPropertyOptional({ example: 0.8, description: 'Soft alert threshold 0.50 to 0.99' })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(0.99)
  public readonly softAlertThreshold?: number | undefined;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  public readonly enforceHardCap?: boolean | undefined;

  @ApiPropertyOptional({ example: 3, default: 3 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  public readonly maxDailyRetries?: number | undefined;

  @ApiPropertyOptional({ example: 300, default: 300 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  public readonly reservationTtlSeconds?: number | undefined;

  @ApiPropertyOptional({ example: ['openai', 'codex_cli', 'fake'] })
  @IsOptional()
  @IsArray()
  public readonly allowedProviders?: readonly string[] | undefined;

  @ApiPropertyOptional({ example: ['codex_cli', 'fake'] })
  @IsOptional()
  @IsArray()
  public readonly allowedFallbacks?: readonly string[] | undefined;
}

export class UpdateW50BudgetPolicyDto {
  @ApiPropertyOptional({ example: 25.0 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  public readonly monthlyCeiling?: number | undefined;

  @ApiPropertyOptional({ example: 12.0 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  public readonly dailyCeiling?: number | undefined;

  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  public readonly perOperationMax?: number | undefined;

  @ApiPropertyOptional({ example: 0.85 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(0.99)
  public readonly softAlertThreshold?: number | undefined;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly enforceHardCap?: boolean | undefined;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  public readonly maxDailyRetries?: number | undefined;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  public readonly reservationTtlSeconds?: number | undefined;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  public readonly allowedProviders?: readonly string[] | undefined;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  public readonly allowedFallbacks?: readonly string[] | undefined;
}

export class ReserveW50BudgetDto {
  @ApiProperty({ example: 'idemp-req-001' })
  @IsString()
  public readonly idempotencyKey!: string;

  @ApiProperty({ example: 0.05, description: 'Estimated max cost in USD' })
  @IsNumber()
  @IsPositive()
  public readonly estimatedCost!: number;

  @ApiProperty({ example: 'openai' })
  @IsString()
  public readonly providerId!: string;

  @ApiProperty({ example: 'gpt-4o' })
  @IsString()
  public readonly modelId!: string;

  @ApiPropertyOptional({ enum: ['GLOBAL', 'TENANT', 'CAMPAIGN', 'USER'] })
  @IsOptional()
  @IsString()
  public readonly scopeType?: BudgetScopeType | undefined;

  @ApiPropertyOptional({ example: 'GLOBAL' })
  @IsOptional()
  @IsString()
  public readonly scopeId?: string | undefined;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsUUID()
  public readonly creativeJobId?: string | undefined;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsUUID()
  public readonly contentJobId?: string | undefined;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsUUID()
  public readonly campaignId?: string | undefined;

  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  public readonly ttlSeconds?: number | undefined;
}

export class ReleaseW50ReservationDto {
  @ApiProperty({ example: 'Client cancelled request before dispatch' })
  @IsString()
  public readonly reason!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  public readonly isConfirmedZeroCharge?: boolean | undefined;
}

export class SettleW50ReservationDto {
  @ApiProperty({ example: 'settle-req-001' })
  @IsString()
  public readonly settlementKey!: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID()
  public readonly attemptId!: string;

  @ApiProperty({
    enum: ['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED_AFTER_DISPATCH', 'UNKNOWN_OUTCOME'],
  })
  @IsString()
  public readonly outcome!:
    'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'CANCELLED_AFTER_DISPATCH' | 'UNKNOWN_OUTCOME';

  @ApiPropertyOptional({ example: 0.045 })
  @IsOptional()
  @IsNumber()
  public readonly actualCost?: number | undefined;

  @ApiPropertyOptional({ enum: ['EXACT', 'ESTIMATED', 'ZERO_CONFIRMED', 'UNKNOWN'] })
  @IsOptional()
  @IsString()
  public readonly costKnowledge?: CostKnowledgeState | undefined;

  @ApiPropertyOptional({ example: 'pricing-openai-v1' })
  @IsOptional()
  @IsString()
  public readonly pricingVersionId?: string | undefined;

  @ApiPropertyOptional({ example: 1250 })
  @IsOptional()
  @IsNumber()
  public readonly inputTokens?: number | undefined;

  @ApiPropertyOptional({ example: 350 })
  @IsOptional()
  @IsNumber()
  public readonly outputTokens?: number | undefined;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  public readonly imageCount?: number | undefined;

  @ApiPropertyOptional({ example: 1250 })
  @IsOptional()
  @IsNumber()
  public readonly durationMs?: number | undefined;

  @ApiPropertyOptional({ example: 'HTTP_500' })
  @IsOptional()
  @IsString()
  public readonly errorCode?: string | undefined;

  @ApiPropertyOptional({ example: 'Internal server error' })
  @IsOptional()
  @IsString()
  public readonly errorMessage?: string | undefined;
}

export class ReconcileW50HeldReservationDto {
  @ApiProperty({ example: 'rec-key-001' })
  @IsString()
  public readonly settlementKey!: string;

  @ApiProperty({ example: 0.05 })
  @IsNumber()
  public readonly confirmedAmount!: number;

  @ApiProperty({
    example: true,
    description: 'Whether the upstream provider verified the charge was billed',
  })
  @IsBoolean()
  public readonly isCharged!: boolean;

  @ApiProperty({ example: 'INV-2026-10-99882' })
  @IsString()
  public readonly reconciliationRef!: string;

  @ApiProperty({ enum: ['EXACT', 'ESTIMATED', 'ZERO_CONFIRMED', 'UNKNOWN'] })
  @IsString()
  public readonly costKnowledge!: CostKnowledgeState;

  @ApiPropertyOptional({ example: 'Confirmed via provider invoice portal' })
  @IsOptional()
  @IsString()
  public readonly notes?: string | undefined;
}

export class RouteCapabilityQueryDto {
  @ApiProperty({ enum: ['TEXT', 'IMAGE', 'VIDEO'] })
  @IsEnum(['TEXT', 'IMAGE', 'VIDEO'])
  public readonly modality!: AiModality;

  @ApiProperty({ example: 'IMAGE_GENERATION_1024' })
  @IsString()
  public readonly capability!: string;

  @ApiPropertyOptional({ example: 'openai' })
  @IsOptional()
  @IsString()
  public readonly preferredProviderId?: string | undefined;
}
