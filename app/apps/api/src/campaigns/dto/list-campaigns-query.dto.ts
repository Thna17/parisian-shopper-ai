import { ApiPropertyOptional } from '@nestjs/swagger';
import { CampaignStatus } from '@parisian-shopper/application';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCampaignsQueryDto {
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

  @ApiPropertyOptional({ description: 'Free-text search across name, code, objective' })
  @IsString()
  @IsOptional()
  public search?: string;

  @ApiPropertyOptional({ description: 'Filter by lifecycle status', enum: CampaignStatus })
  @IsEnum(CampaignStatus)
  @IsOptional()
  public status?: CampaignStatus;
}
