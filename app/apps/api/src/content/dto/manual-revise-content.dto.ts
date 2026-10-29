import { ApiProperty } from '@nestjs/swagger';
import { type CopyEditableField } from '@parisian-shopper/application';
import { IsEnum, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class ManualReviseContentDto {
  @ApiProperty({ description: 'ID of the version being revised', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  public readonly currentVersionId!: string;

  @ApiProperty({
    description: 'Copy field to revise',
    enum: ['headline', 'englishCaption', 'khmerCaption', 'cta'],
  })
  @IsEnum(['headline', 'englishCaption', 'khmerCaption', 'cta'])
  public readonly field!: CopyEditableField;

  @ApiProperty({ description: 'New value for the field', maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  public readonly newValue!: string;
}
