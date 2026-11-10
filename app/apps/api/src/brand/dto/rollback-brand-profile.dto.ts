import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RollbackBrandProfileDto {
  @ApiProperty({
    description: 'Target previously approved BrandProfileVersion ID to restore',
    example: 'd3b07384-d113-46fb-a09c-9c716503c51a',
    required: false,
  })
  @IsOptional()
  @IsUUID('4')
  public targetVersionId?: string;

  @ApiProperty({
    description: 'Governance rationale for emergency rollback',
    example: 'Rollback due to factual drift in V2 vocabulary',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public reason?: string;
}
