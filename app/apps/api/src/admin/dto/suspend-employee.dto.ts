import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SuspendEmployeeDto {
  @ApiPropertyOptional({
    description: 'Administrative reason for account suspension',
    example: 'Security audit flag pending investigation',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public reason?: string;
}
