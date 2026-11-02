import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBrandDatasetDto {
  @ApiProperty({
    description: 'Name of the curated dataset partition',
    example: 'Parisian Autumn 2026 Golden',
  })
  @IsString()
  @IsNotEmpty()
  public name!: string;

  @ApiProperty({ description: 'Unique dataset version string', example: 'v2026.11.01-gold' })
  @IsString()
  @IsNotEmpty()
  public versionString!: string;

  @ApiProperty({
    description: 'Initial dataset lifecycle status',
    enum: ['CURATING', 'ACTIVE', 'ARCHIVED'],
    required: false,
    example: 'CURATING',
  })
  @IsOptional()
  @IsIn(['CURATING', 'ACTIVE', 'ARCHIVED'])
  public status?: 'CURATING' | 'ACTIVE' | 'ARCHIVED';

  @ApiProperty({ description: 'Git commit hash for dataset snapshot provenance', required: false })
  @IsOptional()
  @IsString()
  public gitCommitHash?: string;

  @ApiProperty({
    description: 'List of initial review feedback record IDs to bind to this dataset',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public initialFeedbackIds?: string[];
}
