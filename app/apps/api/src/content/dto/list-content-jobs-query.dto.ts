import { ApiPropertyOptional } from '@nestjs/swagger';
import { type ContentJobStatus } from '@parisian-shopper/application';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListContentJobsQueryDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  public readonly page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size', minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  public readonly limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by job status',
    enum: [
      'REQUESTED',
      'GENERATING',
      'DRAFT',
      'UNDER_REVIEW',
      'REVISION_REQUESTED',
      'APPROVED',
      'REJECTED',
      'FAILED',
    ],
  })
  @IsEnum([
    'REQUESTED',
    'GENERATING',
    'DRAFT',
    'UNDER_REVIEW',
    'REVISION_REQUESTED',
    'APPROVED',
    'REJECTED',
    'FAILED',
  ])
  @IsOptional()
  public readonly status?: ContentJobStatus;

  @ApiPropertyOptional({ description: 'Filter by product snapshot ID', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  public readonly productSnapshotId?: string;

  @ApiPropertyOptional({ description: 'Filter by campaign ID', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  public readonly campaignId?: string;
}
