import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Employee identifier: internal UUID, displayName, or Telegram username',
    example: 'Golden Editor',
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  public loginIdentifier!: string;

  @ApiProperty({
    description: 'Employee password',
    example: 'super-secret-passphrase',
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  public password!: string;
}
