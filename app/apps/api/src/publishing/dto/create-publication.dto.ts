import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PublicationChannel } from '@parisian-shopper/application';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreatePublicationDto {
  @ApiProperty({
    description: 'Approved content version ID',
    example: '00000000-0000-4000-8000-000000000001',
  })
  @IsUUID()
  @IsNotEmpty()
  public contentVersionId!: string;

  @ApiPropertyOptional({
    description: 'Optional approved creative export ID to distribute with the content',
    example: '00000000-0000-4000-8000-000000000002',
  })
  @IsUUID()
  @IsOptional()
  public creativeExportId?: string;

  @ApiProperty({
    description: 'Target publishing channel',
    enum: PublicationChannel,
    example: PublicationChannel.MANUAL_EXPORT,
  })
  @IsEnum(PublicationChannel)
  @IsNotEmpty()
  public destinationChannel!: PublicationChannel;

  @ApiPropertyOptional({
    description: 'Target channel account or chat identifier',
    example: '@parisian_atelier',
  })
  @IsString()
  @IsOptional()
  @Length(1, 120)
  public destinationAccountId?: string;

  @ApiProperty({
    description: 'Unique client-generated idempotency key preventing duplicate dispatches',
    example: 'pub_req_1730198400000_a1b2c3',
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 200)
  public idempotencyKey!: string;

  @ApiPropertyOptional({
    description: 'Associated campaign ID if part of an active campaign',
    example: '00000000-0000-4000-8000-000000000003',
  })
  @IsUUID()
  @IsOptional()
  public campaignId?: string;
}
