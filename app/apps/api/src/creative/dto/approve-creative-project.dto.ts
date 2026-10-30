import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveCreativeProjectDto {
  @ApiPropertyOptional({
    description: 'Specific version number of the creative scene being approved',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  public versionNumber?: number;

  @ApiPropertyOptional({
    description: 'UUID of the exact scene version being approved',
  })
  @IsOptional()
  @IsString()
  public sceneVersionId?: string;

  @ApiPropertyOptional({
    description: 'UUID of the exact visual asset being approved',
  })
  @IsOptional()
  @IsString()
  public visualAssetId?: string;

  @ApiPropertyOptional({
    description: 'Optional governance sign-off comment or notes',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  public comment?: string;
}
