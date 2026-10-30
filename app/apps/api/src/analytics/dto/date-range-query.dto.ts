import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  public startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  public endDate?: string;

  @ApiPropertyOptional({ description: 'Target timezone (e.g. Asia/Phnom_Penh)' })
  @IsString()
  @IsOptional()
  public timezone?: string;
}
