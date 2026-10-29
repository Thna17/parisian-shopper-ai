import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class UpdateCampaignDto {
  @ApiPropertyOptional({ description: 'Campaign title' })
  @IsString()
  @IsOptional()
  @Length(2, 200)
  public name?: string;

  @ApiPropertyOptional({ description: 'Strategic objective' })
  @IsString()
  @IsOptional()
  @Length(2, 500)
  public objective?: string;

  @ApiPropertyOptional({ description: 'Detailed description or brief' })
  @IsString()
  @IsOptional()
  @Length(0, 2000)
  public description?: string;

  @ApiPropertyOptional({ description: 'Start date in ISO format' })
  @IsDateString()
  @IsOptional()
  public startDate?: string;

  @ApiPropertyOptional({ description: 'End date in ISO format' })
  @IsDateString()
  @IsOptional()
  public endDate?: string;
}
