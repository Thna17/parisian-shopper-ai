import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { BrandSourceSystem } from '@parisian-shopper/application';

export class IngestBrandSourceDto {
  @ApiProperty({
    description: 'Source system of the historical collateral',
    enum: BrandSourceSystem,
    example: BrandSourceSystem.FACEBOOK,
  })
  @IsEnum(BrandSourceSystem)
  public sourceSystem!: BrandSourceSystem;

  @ApiProperty({
    description: 'External post or document ID',
    required: false,
    example: 'fb-post-98471234',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  public externalPostId?: string;

  @ApiProperty({
    description: 'Raw caption text or copy from collateral',
    example: 'Discover the artisanal elegance of Parisian Shopper.',
  })
  @IsString()
  @IsNotEmpty()
  public captionText!: string;

  @ApiProperty({
    description: 'Mandatory copyright declaration confirmation (W03-DEC-008)',
    example: true,
  })
  @IsBoolean()
  public copyrightDeclared!: boolean;

  @ApiProperty({
    description: 'Legal owner of the copyrighted copy/images',
    example: 'Parisian Shopper SARL',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  public copyrightOwner!: string;

  @ApiProperty({
    description: 'License reference or agreement code',
    example: 'LIC-PARISIAN-ARCHIVE-2026-001',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  public licenseReference!: string;

  @ApiProperty({
    description: 'CAS storage keys for associated images/media',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  public mediaCasKeys?: string[];

  @ApiProperty({
    description: 'Classification tags (e.g. season, product category)',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  public tags?: string[];
}
