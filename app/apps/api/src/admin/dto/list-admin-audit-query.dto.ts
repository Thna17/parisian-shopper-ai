import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListAdminAuditQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by actor employee UUID',
  })
  @IsOptional()
  @IsUUID()
  public actorUserId?: string;

  @ApiPropertyOptional({
    description: 'Filter by action code substring',
    example: 'EMPLOYEE',
  })
  @IsOptional()
  @IsString()
  public action?: string;

  @ApiPropertyOptional({
    description: 'Filter by resource type',
    example: 'USER',
  })
  @IsOptional()
  @IsString()
  public resourceType?: string;

  @ApiPropertyOptional({
    description: 'Filter events from ISO timestamp',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  public fromDate?: Date;

  @ApiPropertyOptional({
    description: 'Filter events to ISO timestamp',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  public toDate?: Date;

  @ApiPropertyOptional({
    description: 'Page number',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public page: number = 1;

  @ApiPropertyOptional({
    description: 'Results per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public limit: number = 20;
}
