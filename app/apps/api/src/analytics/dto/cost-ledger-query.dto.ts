import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CostLedgerQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  public page?: number = 1;

  @ApiPropertyOptional({ description: 'Results per page', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  public limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by provider' })
  @IsString()
  @IsOptional()
  public provider?: string;

  @ApiPropertyOptional({ description: 'Filter by model' })
  @IsString()
  @IsOptional()
  public model?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  public startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  public endDate?: string;
}
