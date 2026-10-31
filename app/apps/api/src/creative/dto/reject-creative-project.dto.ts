import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectCreativeProjectDto {
  @ApiProperty({
    description: 'Mandatory reason explaining why the creative scene version was rejected',
    example: 'CTA button font size too small and contrast insufficient for readability',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  public reason!: string;

  @ApiPropertyOptional({
    description: 'Specific version number of the creative scene being rejected',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  public versionNumber?: number;

  @ApiPropertyOptional({
    description: 'UUID of the exact scene version being rejected',
  })
  @IsOptional()
  @IsString()
  public sceneVersionId?: string;

  @ApiPropertyOptional({
    description: 'UUID of the exact visual asset being rejected',
  })
  @IsOptional()
  @IsString()
  public visualAssetId?: string;
}
