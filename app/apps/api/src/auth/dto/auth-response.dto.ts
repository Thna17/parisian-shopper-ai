import { ApiProperty } from '@nestjs/swagger';
import {
  type Permission,
  type RoleCode,
  type SanitizedEmployeeDto,
} from '@parisian-shopper/application';

export class EmployeeUserDto implements SanitizedEmployeeDto {
  @ApiProperty({ example: '867b1406-3fe6-4fa2-bcad-bc748aa0c363' })
  public id!: string;

  @ApiProperty({ example: 'Golden Editor' })
  public displayName!: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'DISABLED'] })
  public status!: 'ACTIVE' | 'DISABLED';

  @ApiProperty({ example: ['MARKETING_EDITOR'], isArray: true })
  public roles!: readonly RoleCode[];

  @ApiProperty({ example: ['CREATE_CONTENT', 'VIEW_PRODUCTS'], isArray: true })
  public permissions!: readonly Permission[];
}

export class AuthResponseDto {
  @ApiProperty({ type: EmployeeUserDto })
  public user!: EmployeeUserDto;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  public ok!: boolean;

  @ApiProperty({ example: 'Logged out successfully' })
  public message!: string;
}
