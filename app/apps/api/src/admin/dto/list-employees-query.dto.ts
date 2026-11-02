import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { RoleCode } from '@parisian-shopper/application';

export class ListEmployeesQueryDto {
  @ApiPropertyOptional({
    description: 'Free text search on display name, UUID, or telegram username',
    example: 'Golden',
  })
  @IsOptional()
  @IsString()
  public search?: string;

  @ApiPropertyOptional({
    description: 'Filter by assigned role code',
    enum: RoleCode,
    example: 'MARKETING_EDITOR',
  })
  @IsOptional()
  @IsEnum(RoleCode)
  public role?: RoleCode;

  @ApiPropertyOptional({
    description: 'Filter by account status',
    enum: ['ACTIVE', 'DISABLED'],
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'DISABLED'])
  public status?: 'ACTIVE' | 'DISABLED';

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
