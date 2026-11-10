import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SyncProductsDto {
  @ApiPropertyOptional({
    description: 'Bypass hash comparison and force snapshot refresh and cutout regeneration',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  public force?: boolean;

  @ApiPropertyOptional({
    description: 'Specific list of SKUs to restrict synchronization to',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public skus?: string[];

  @ApiPropertyOptional({
    description: 'Maximum number of upstream catalog pages to scan',
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  public maxPages?: number;

  @ApiPropertyOptional({
    description: 'Items per page limit',
    default: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(250)
  public limit?: number;

  @ApiPropertyOptional({
    description:
      'Execute synchronously and wait for complete result instead of enqueuing background BullMQ job',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  public sync?: boolean;
}

export interface SyncProductsResponseDto {
  readonly status: 'QUEUED' | 'COMPLETED' | 'NOOP' | 'FAILED';
  readonly message: string;
  readonly jobId?: string | undefined;
  readonly synced?: number | undefined;
  readonly skipped?: number | undefined;
  readonly totalDiscovered?: number | undefined;
  readonly cutoutsProcessed?: number | undefined;
  readonly durationMs?: number | undefined;
  readonly syncedSkus?: readonly string[] | undefined;
  readonly skippedSkus?: readonly string[] | undefined;
  readonly errors?: readonly { sku: string; error: string }[] | undefined;
}
