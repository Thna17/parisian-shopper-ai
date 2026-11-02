import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class UpdateEmployeeProfileDto {
  @ApiProperty({
    description: 'Updated employee display name',
    example: 'Claire Delacroix-Laurent',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  public displayName!: string;
}
