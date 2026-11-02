import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';
import { RoleCode } from '@parisian-shopper/application';

export class UpdateEmployeeRolesDto {
  @ApiProperty({
    description: 'Updated complete list of active roles for the employee',
    enum: RoleCode,
    isArray: true,
    example: ['MARKETING_EDITOR', 'MARKETING_APPROVER'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(RoleCode, { each: true })
  public roles!: RoleCode[];
}
