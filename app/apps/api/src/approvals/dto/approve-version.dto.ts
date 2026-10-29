import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ApproveVersionDto {
  @ApiProperty({
    description: 'ID of the exact content version being approved',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  public readonly versionId!: string;

  @ApiPropertyOptional({
    description: 'Optional reviewer comment or approval note',
    maxLength: 1000,
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  public readonly comment?: string;
}
