import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type ContentJobStatus,
  type ContentLanguage,
  type ContentPlatform,
  type ContentType,
} from '@parisian-shopper/application';

export class ContentStructuredOutputDto {
  @ApiProperty({ description: 'Headline copy' })
  public headline!: string;

  @ApiPropertyOptional({ description: 'English caption copy', nullable: true })
  public english_caption?: string | null;

  @ApiPropertyOptional({ description: 'Khmer caption copy', nullable: true })
  public khmer_caption?: string | null;

  @ApiProperty({ description: 'Call to action text' })
  public cta!: string;

  @ApiProperty({ description: 'Hashtags', type: [String] })
  public hashtags!: string[];

  @ApiPropertyOptional({ description: 'Facts used in generation', type: [String] })
  public facts_used?: string[];
}

export class ContentVersionResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ format: 'uuid' })
  public contentJobId!: string;

  @ApiProperty()
  public versionNumber!: number;

  @ApiProperty()
  public provider!: string;

  @ApiProperty()
  public model!: string;

  @ApiProperty()
  public promptVersion!: string;

  @ApiProperty({ type: ContentStructuredOutputDto })
  public structuredOutput!: ContentStructuredOutputDto;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  public revisionRequestId?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;
}

export class GenerationAttemptResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ format: 'uuid' })
  public contentJobId!: string;

  @ApiProperty()
  public attemptNumber!: number;

  @ApiProperty()
  public provider!: string;

  @ApiProperty()
  public model!: string;

  @ApiProperty()
  public promptVersion!: string;

  @ApiProperty({ enum: ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT'] })
  public status!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public startedAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public completedAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  public errorCode?: string | null;
}

export class ValidationFindingResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty()
  public field!: string;

  @ApiProperty({ enum: ['INFO', 'WARNING', 'BLOCKING'] })
  public severity!: string;

  @ApiProperty()
  public code!: string;

  @ApiProperty()
  public message!: string;

  @ApiPropertyOptional()
  public expectedValue?: unknown;

  @ApiPropertyOptional()
  public actualValue?: unknown;
}

export class ValidationResultResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ format: 'uuid' })
  public contentVersionId!: string;

  @ApiProperty()
  public validatorVersion!: string;

  @ApiProperty({ enum: ['PASSED', 'PASSED_WITH_WARNINGS', 'BLOCKED', 'FAILED'] })
  public status!: string;

  @ApiProperty()
  public findingCount!: number;

  @ApiProperty()
  public blockingCount!: number;

  @ApiProperty()
  public warningCount!: number;

  @ApiProperty()
  public infoCount!: number;

  @ApiProperty({ type: [ValidationFindingResponseDto] })
  public findings!: ValidationFindingResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;
}

export class ContentJobResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ format: 'uuid' })
  public productSnapshotId!: string;

  @ApiProperty({ format: 'uuid' })
  public brandRuleVersionId!: string;

  @ApiProperty({ format: 'uuid' })
  public requesterUserId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  public campaignId?: string | null;

  @ApiProperty({
    enum: ['PRODUCT_SPOTLIGHT', 'PROMOTION', 'SCENT_PYRAMID', 'EDUCATIONAL', 'ENGAGEMENT'],
  })
  public contentType!: ContentType;

  @ApiProperty({ enum: ['KM', 'EN', 'BILINGUAL'] })
  public language!: ContentLanguage;

  @ApiProperty({ enum: ['FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'GENERIC'] })
  public platform!: ContentPlatform;

  @ApiPropertyOptional({ nullable: true })
  public campaignContext?: string | null;

  @ApiProperty({
    enum: [
      'REQUESTED',
      'GENERATING',
      'DRAFT',
      'UNDER_REVIEW',
      'REVISION_REQUESTED',
      'APPROVED',
      'REJECTED',
      'FAILED',
    ],
  })
  public status!: ContentJobStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;
}

export class PaginatedContentJobsResponseDto {
  @ApiProperty({ type: [ContentJobResponseDto] })
  public items!: ContentJobResponseDto[];

  @ApiProperty()
  public total!: number;

  @ApiProperty()
  public page!: number;

  @ApiProperty()
  public limit!: number;

  @ApiProperty()
  public totalPages!: number;
}

export class ContentJobDetailResponseDto {
  @ApiProperty({ type: ContentJobResponseDto })
  public job!: ContentJobResponseDto;

  @ApiPropertyOptional()
  public product?: {
    id: string;
    sku: string;
    title: string;
    brand: string;
    priceUsd: number;
    category?: string;
  } | null;

  @ApiPropertyOptional()
  public campaign?: {
    id: string;
    code: string;
    name: string;
    status: string;
  } | null;

  @ApiProperty({ type: [GenerationAttemptResponseDto] })
  public attempts!: GenerationAttemptResponseDto[];

  @ApiProperty({ type: [ContentVersionResponseDto] })
  public versions!: ContentVersionResponseDto[];

  @ApiPropertyOptional({ type: ContentVersionResponseDto, nullable: true })
  public currentVersion?: ContentVersionResponseDto | null;

  @ApiPropertyOptional({ type: ValidationResultResponseDto, nullable: true })
  public latestValidationResult?: ValidationResultResponseDto | null;
}
