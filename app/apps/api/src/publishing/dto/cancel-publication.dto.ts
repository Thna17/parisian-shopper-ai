import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CancelPublicationDto {
  @ApiProperty({
    description: 'Reason for cancelling the publication request',
    example: 'Content revision required before distribution',
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 500)
  public reason!: string;
}
