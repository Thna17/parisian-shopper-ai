import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ReviewFeedbackItemDto {
  @ApiProperty({
    description: 'Feedback origin',
    enum: ['REVIEW_DESK', 'BENCHMARK_LAB', 'MANUAL_REVISION'],
    example: 'REVIEW_DESK',
  })
  @IsIn(['REVIEW_DESK', 'BENCHMARK_LAB', 'MANUAL_REVISION'])
  public sourceType!: 'REVIEW_DESK' | 'BENCHMARK_LAB' | 'MANUAL_REVISION';

  @ApiProperty({ description: 'Referenced content job UUID', required: false })
  @IsOptional()
  @IsString()
  public contentJobId?: string;

  @ApiProperty({ description: 'Referenced content version UUID', required: false })
  @IsOptional()
  @IsString()
  public contentVersionId?: string;

  @ApiProperty({ description: 'Original candidate text submitted for review' })
  @IsString()
  @IsNotEmpty()
  public originalText!: string;

  @ApiProperty({ description: 'Revised or corrected text if edited by human', required: false })
  @IsOptional()
  @IsString()
  public revisedText?: string;

  @ApiProperty({
    description: 'Editorial decision',
    enum: ['APPROVED', 'REJECTED', 'REVISED'],
    example: 'APPROVED',
  })
  @IsIn(['APPROVED', 'REJECTED', 'REVISED'])
  public decision!: 'APPROVED' | 'REJECTED' | 'REVISED';

  @ApiProperty({ description: 'Critique or notes from reviewer', required: false })
  @IsOptional()
  @IsString()
  public critiqueNotes?: string;

  @ApiProperty({
    description: 'Tone and stylistic violation flags',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public toneFlags?: string[];

  @ApiProperty({ description: 'Reviewer user ID', required: false })
  @IsOptional()
  @IsString()
  public reviewerUserId?: string;
}

export class IngestFeedbackDto {
  @ApiProperty({
    description: 'Batch of human review feedback items',
    type: [ReviewFeedbackItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewFeedbackItemDto)
  public feedbackBatch!: ReviewFeedbackItemDto[];

  @ApiProperty({
    description: 'Target dataset version to associate feedback with',
    required: false,
  })
  @IsOptional()
  @IsString()
  public targetDatasetVersionId?: string;
}
