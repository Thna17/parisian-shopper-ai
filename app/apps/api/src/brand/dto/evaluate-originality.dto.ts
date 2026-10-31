import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class EvaluateOriginalityDto {
  @ApiProperty({
    description: 'Candidate copywriting to check against historical archives',
    example: 'A fresh new fragrance inspired by French gardens.',
  })
  @IsString()
  @IsNotEmpty()
  public candidateText!: string;

  @ApiProperty({
    description: 'Max allowed n-gram overlap (0.0 to 1.0)',
    required: false,
    example: 0.4,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  public maxNgramOverlapThreshold?: number;

  @ApiProperty({
    description: 'Max allowed overall text similarity (0.0 to 1.0)',
    required: false,
    example: 0.45,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  public maxLevenshteinSimilarityThreshold?: number;
}
