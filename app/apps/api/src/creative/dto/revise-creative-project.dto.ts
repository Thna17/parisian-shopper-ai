import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type {
  SafeMargins,
  SceneLayerDraft,
  SceneOperationCode,
} from '@parisian-shopper/application';

export class ReviseCreativeProjectDto {
  @ApiProperty({
    description: 'Expected current version number for optimistic locking and serialization',
    example: 1,
  })
  @IsInt()
  @Min(1)
  public expectedVersionNumber!: number;

  @ApiProperty({
    description: 'Human-readable justification for this revision',
    example: 'Adjust headline font size and reposition hero cutout',
  })
  @IsString()
  @IsNotEmpty()
  public changeReason!: string;

  @ApiProperty({
    description: 'Structured operation code',
    enum: [
      'INITIAL_DRAFT',
      'REPLACE_HERO',
      'REPLACE_BACKGROUND',
      'EDIT_TYPOGRAPHY',
      'EDIT_LAYOUT',
      'APPLY_PRESET',
      'UPDATE_COPY',
      'TRANSLATE',
      'RELAYOUT_ASPECT',
    ],
    default: 'EDIT_LAYOUT',
  })
  @IsString()
  @IsIn([
    'INITIAL_DRAFT',
    'REPLACE_HERO',
    'REPLACE_BACKGROUND',
    'EDIT_TYPOGRAPHY',
    'EDIT_LAYOUT',
    'APPLY_PRESET',
    'UPDATE_COPY',
    'TRANSLATE',
    'RELAYOUT_ASPECT',
  ])
  public operationCode: SceneOperationCode = 'EDIT_LAYOUT';

  @ApiProperty({
    description: 'Updated scene layer definitions',
    type: 'array',
  })
  @IsArray()
  public layers!: readonly SceneLayerDraft[];

  @ApiPropertyOptional({
    description: 'Optional updated safe margins configuration',
  })
  @IsOptional()
  @IsObject()
  public safeMargins?: SafeMargins;
}
