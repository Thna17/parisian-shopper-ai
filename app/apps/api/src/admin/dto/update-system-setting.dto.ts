import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSystemSettingDto {
  @ApiProperty({
    description: 'Unique configuration key identifier',
    example: 'ORGANIZATION_PROFILE',
    maxLength: 120,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  public key!: string;

  @ApiProperty({
    description: 'Structured configuration JSON payload',
    example: { companyName: 'Maison Parisienne', defaultCurrency: 'EUR' },
  })
  @IsObject()
  public value!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Grouping category code',
    example: 'ORGANIZATION',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  public category?: string;

  @ApiPropertyOptional({
    description: 'Human-readable explanation of this setting',
    example: 'Core company profile and brand guidelines defaults',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public description?: string;
}
