import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class SubmitForReviewDto {
  @ApiProperty({
    description: 'ID of the exact content version to submit for human review',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  public readonly contentVersionId!: string;
}
