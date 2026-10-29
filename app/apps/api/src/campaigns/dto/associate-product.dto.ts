import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class AssociateProductDto {
  @ApiProperty({
    description: 'UUID of verified ProductSnapshot',
    example: '4b68e914-7e04-4ec5-b6d8-f860189d2d01',
  })
  @IsUUID('4')
  @IsNotEmpty()
  public productSnapshotId!: string;

  @ApiPropertyOptional({ description: 'Display sort order', example: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  public sortOrder?: number;

  @ApiPropertyOptional({
    description: 'Whether this product is the hero featured item',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  public isHero?: boolean;

  @ApiPropertyOptional({
    description: 'Draft marketing notes for this product in the campaign',
    example: 'Focus on floral notes',
  })
  @IsString()
  @IsOptional()
  @Length(0, 1000)
  public notes?: string;

  @ApiPropertyOptional({
    description: 'Proposed promotional price (MSRP remains immutable)',
    example: 195.0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  public targetPromoPrice?: number;

  @ApiPropertyOptional({
    description: 'Proposed promotional discount percentage (0-100)',
    example: 15.0,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  public targetDiscountPercent?: number;
}
