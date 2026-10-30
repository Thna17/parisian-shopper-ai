import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetPolicyStatus, BudgetScope } from '@parisian-shopper/application';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class CreateBudgetPolicyDto {
  @ApiPropertyOptional({ enum: BudgetScope, default: 'MONTHLY' })
  @IsEnum(BudgetScope)
  @IsOptional()
  public scope?: 'GLOBAL' | 'MONTHLY' | 'CAMPAIGN';

  @ApiPropertyOptional({ default: 'USD' })
  @IsString()
  @IsOptional()
  public currency?: string;

  @ApiProperty({ description: 'Monthly budget ceiling in USD', example: 20.0 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  public monthlyCeiling!: number;

  @ApiPropertyOptional({ description: 'Per-request max cost ceiling in USD', example: 2.0 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @IsOptional()
  public perRequestCeiling?: number;

  @ApiPropertyOptional({ description: 'Soft alert threshold percent', example: 80.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  public softAlertThreshold?: number;

  @ApiPropertyOptional({ description: 'Effective start date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  public effectiveFrom?: string;

  @ApiPropertyOptional({ description: 'Effective end date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  public effectiveTo?: string;
}

export class UpdateBudgetPolicyDto {
  @ApiPropertyOptional({ description: 'Monthly budget ceiling in USD', example: 25.0 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @IsOptional()
  public monthlyCeiling?: number;

  @ApiPropertyOptional({ description: 'Per-request max cost ceiling in USD', example: 2.5 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @IsOptional()
  public perRequestCeiling?: number;

  @ApiPropertyOptional({ description: 'Soft alert threshold percent', example: 85.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  public softAlertThreshold?: number;

  @ApiPropertyOptional({ enum: BudgetPolicyStatus })
  @IsEnum(BudgetPolicyStatus)
  @IsOptional()
  public status?: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';

  @ApiPropertyOptional({ description: 'Effective end date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  public effectiveTo?: string;
}
