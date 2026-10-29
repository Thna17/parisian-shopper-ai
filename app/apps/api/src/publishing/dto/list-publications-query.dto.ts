import { ApiPropertyOptional } from '@nestjs/swagger';
import { PublicationChannel, PublicationStatus } from '@parisian-shopper/application';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListPublicationsQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by publication status', enum: PublicationStatus })
  @IsEnum(PublicationStatus)
  @IsOptional()
  public status?: PublicationStatus;

  @ApiPropertyOptional({ description: 'Filter by destination channel', enum: PublicationChannel })
  @IsEnum(PublicationChannel)
  @IsOptional()
  public channel?: PublicationChannel;
}
