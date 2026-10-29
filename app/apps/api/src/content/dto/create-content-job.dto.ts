import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type ContentLanguage,
  type ContentPlatform,
  type ContentType,
} from '@parisian-shopper/application';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateContentJobDto {
  @ApiProperty({ description: 'ID of the verified product snapshot', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  public readonly productSnapshotId!: string;

  @ApiPropertyOptional({
    description: 'Optional campaign ID to associate with this content generation',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  public readonly campaignId?: string;

  @ApiProperty({
    description: 'Content generation strategy',
    enum: ['PRODUCT_SPOTLIGHT', 'PROMOTION', 'SCENT_PYRAMID', 'EDUCATIONAL', 'ENGAGEMENT'],
  })
  @IsEnum(['PRODUCT_SPOTLIGHT', 'PROMOTION', 'SCENT_PYRAMID', 'EDUCATIONAL', 'ENGAGEMENT'])
  public readonly contentType!: ContentType;

  @ApiProperty({ description: 'Content language', enum: ['KM', 'EN', 'BILINGUAL'] })
  @IsEnum(['KM', 'EN', 'BILINGUAL'])
  public readonly language!: ContentLanguage;

  @ApiProperty({
    description: 'Target platform',
    enum: ['FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'GENERIC'],
  })
  @IsEnum(['FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'GENERIC'])
  public readonly platform!: ContentPlatform;

  @ApiPropertyOptional({
    description: 'Optional freeform campaign context or instructions',
    maxLength: 2000,
  })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  public readonly campaignContext?: string;
}
