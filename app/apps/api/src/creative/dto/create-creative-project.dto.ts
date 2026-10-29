import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type {
  PosterAspectRatio,
  SceneLanguage,
  SceneTemplateId,
} from '@parisian-shopper/application';

export class CreateCreativeProjectDto {
  @ApiProperty({ description: 'Creative project title', example: 'Rose Impériale Summer Launch' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  public title!: string;

  @ApiProperty({ description: 'Associated ProductSnapshot UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  public productSnapshotId!: string;

  @ApiProperty({ description: 'Associated Source ContentVersion UUID' })
  @IsUUID('4')
  @IsNotEmpty()
  public sourceContentVersionId!: string;

  @ApiProperty({
    description: 'Poster template identity',
    enum: [
      'EDITORIAL_SPLIT',
      'CENTERED_HERO',
      'KHMER_SEASONAL',
      'SCENT_STORY',
      'PROMOTION_PRICE_CTA',
    ],
    example: 'EDITORIAL_SPLIT',
  })
  @IsString()
  @IsIn([
    'EDITORIAL_SPLIT',
    'CENTERED_HERO',
    'KHMER_SEASONAL',
    'SCENT_STORY',
    'PROMOTION_PRICE_CTA',
  ])
  public templateId!: SceneTemplateId;

  @ApiProperty({
    description: 'Target poster canvas aspect ratio',
    enum: ['1:1', '4:5', '9:16'],
    example: '1:1',
  })
  @IsString()
  @IsIn(['1:1', '4:5', '9:16'])
  public aspectRatio!: PosterAspectRatio;

  @ApiProperty({
    description: 'Target language',
    enum: ['EN', 'KM', 'BILINGUAL'],
    default: 'EN',
  })
  @IsString()
  @IsIn(['EN', 'KM', 'BILINGUAL'])
  public language: SceneLanguage = 'EN';

  @ApiPropertyOptional({ description: 'Optional associated Campaign UUID' })
  @IsOptional()
  @IsUUID('4')
  public campaignId?: string;

  @ApiPropertyOptional({ description: 'Optional explicit ProductAsset UUID for hero cutout' })
  @IsOptional()
  @IsUUID('4')
  public productAssetId?: string;
}
