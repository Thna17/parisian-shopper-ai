import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateCampaignDto {
  @ApiProperty({
    description: 'Unique alphanumeric campaign identifier',
    example: 'CAMP-ROSE-2026',
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 64)
  @Matches(/^[A-Za-z0-9-_]+$/, {
    message: 'Code must contain only letters, numbers, hyphens, or underscores',
  })
  public code!: string;

  @ApiProperty({ description: 'Campaign title', example: 'Rose Impériale Spring Campaign' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 200)
  public name!: string;

  @ApiProperty({
    description: 'Strategic objective',
    example: "Luxury fragrance promotion for Mother's Day",
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 500)
  public objective!: string;

  @ApiPropertyOptional({ description: 'Optional detailed description or brief' })
  @IsString()
  @IsOptional()
  @Length(0, 2000)
  public description?: string;

  @ApiPropertyOptional({
    description: 'Start date in ISO format',
    example: '2026-05-01T00:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  public startDate?: string;

  @ApiPropertyOptional({
    description: 'End date in ISO format',
    example: '2026-05-15T00:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  public endDate?: string;
}
