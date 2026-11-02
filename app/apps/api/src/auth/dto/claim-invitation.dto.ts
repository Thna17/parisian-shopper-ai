import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ClaimInvitationDto {
  @ApiProperty({
    description: 'Cryptographic onboarding token provided in onboarding invitation',
    example: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
    minLength: 16,
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(16)
  @MaxLength(128)
  public token!: string;

  @ApiProperty({
    description: 'Initial employee password (must meet complexity requirements)',
    example: 'SecurePassphrase#2026',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  public password!: string;
}
