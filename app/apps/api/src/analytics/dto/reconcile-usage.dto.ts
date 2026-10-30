import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class ReconcileUsageDto {
  @ApiProperty({
    description: 'Resolution action',
    enum: ['SETTLE_CONFIRMED', 'RELEASE_UNBILLED', 'MANUAL_ADJUSTMENT'],
  })
  @IsEnum(['SETTLE_CONFIRMED', 'RELEASE_UNBILLED', 'MANUAL_ADJUSTMENT'])
  public resolution!: 'SETTLE_CONFIRMED' | 'RELEASE_UNBILLED' | 'MANUAL_ADJUSTMENT';

  @ApiPropertyOptional({ description: 'Confirmed billed cost in USD' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @IsOptional()
  public confirmedCost?: number;

  @ApiProperty({ description: 'Reconciliation notes/reason' })
  @IsString()
  public notes!: string;
}
