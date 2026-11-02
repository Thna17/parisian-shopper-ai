import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEnum, IsNotEmpty, IsString, Length } from 'class-validator';
import { RoleCode } from '@parisian-shopper/application';

export class CreateEmployeeDto {
  @ApiProperty({
    description: 'Human-readable full name or callsign of the employee',
    example: 'Claire Delacroix',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  public displayName!: string;

  @ApiProperty({
    description: 'Roles assigned to the new employee',
    enum: RoleCode,
    isArray: true,
    example: ['MARKETING_EDITOR'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(RoleCode, { each: true })
  public roles!: RoleCode[];
}
