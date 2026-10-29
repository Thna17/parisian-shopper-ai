import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class RejectVersionDto {
  @ApiProperty({
    description: 'ID of the exact content version being rejected',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  public readonly versionId!: string;

  @ApiProperty({
    description: 'Mandatory reason for rejection (3 to 1000 characters)',
    minLength: 3,
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  public readonly reason!: string;
}
