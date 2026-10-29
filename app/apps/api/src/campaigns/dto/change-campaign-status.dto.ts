import { ApiProperty } from '@nestjs/swagger';
import { CampaignStatus } from '@parisian-shopper/application';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class ChangeCampaignStatusDto {
  @ApiProperty({
    description: 'Target lifecycle status',
    enum: CampaignStatus,
    example: CampaignStatus.PLANNED,
  })
  @IsEnum(CampaignStatus)
  @IsNotEmpty()
  public status!: CampaignStatus;
}
