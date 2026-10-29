import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { ExportEncoding, ExportFormat } from '@parisian-shopper/application';

export class ExportCreativeProjectDto {
  @ApiProperty({
    description: 'Target export dimension preset',
    enum: ['SQUARE_1080', 'PORTRAIT_1080_1350', 'STORY_1080_1920'],
    example: 'SQUARE_1080',
  })
  @IsString()
  @IsIn(['SQUARE_1080', 'PORTRAIT_1080_1350', 'STORY_1080_1920'])
  public format!: ExportFormat;

  @ApiProperty({
    description: 'Output raster image encoding',
    enum: ['PNG', 'JPEG'],
    default: 'PNG',
  })
  @IsString()
  @IsIn(['PNG', 'JPEG'])
  public encoding: ExportEncoding = 'PNG';

  @ApiPropertyOptional({
    description: 'Compression quality for JPEG encoding (1-100)',
    default: 90,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  public quality?: number = 90;
}
