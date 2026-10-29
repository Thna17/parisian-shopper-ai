import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListReviewQueueQueryDto {
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
    description: 'Filter by review status',
    enum: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'HISTORY'],
  })
  @IsEnum(['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'HISTORY'])
  @IsOptional()
  public readonly status?: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'HISTORY';

  @ApiPropertyOptional({ description: 'Filter by product snapshot ID', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  public readonly productSnapshotId?: string;

  @ApiPropertyOptional({ description: 'Filter by campaign ID', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  public readonly campaignId?: string;

  @ApiPropertyOptional({ description: 'Search term for SKU, product name, or campaign' })
  @IsString()
  @IsOptional()
  public readonly search?: string;
}
