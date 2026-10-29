import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListCreativeProjectsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by associated Campaign UUID' })
  @IsOptional()
  @IsUUID('4')
  public campaignId?: string;

  @ApiPropertyOptional({ description: 'Search query for project title' })
  @IsOptional()
  @IsString()
  public search?: string;

  @ApiPropertyOptional({ description: 'Page number (default 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public page?: number = 1;

  @ApiPropertyOptional({ description: 'Page limit (default 20, max 50)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  public limit?: number = 20;
}
