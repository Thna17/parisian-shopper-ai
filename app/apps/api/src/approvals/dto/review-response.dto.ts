import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { type ApprovalDecision, type ContentJobStatus } from '@parisian-shopper/application';

export class ReviewQueueItemResponseDto {
  @ApiProperty({ description: 'Content job ID', format: 'uuid' })
  public readonly jobId!: string;

  @ApiProperty({ description: 'Job status', enum: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'] })
  public readonly jobStatus!: ContentJobStatus;

  @ApiProperty({ description: 'Product snapshot ID', format: 'uuid' })
  public readonly productSnapshotId!: string;

  @ApiProperty({ description: 'Product SKU' })
  public readonly sku!: string;

  @ApiProperty({ description: 'Product name' })
  public readonly productName!: string;

  @ApiProperty({ description: 'Product brand' })
  public readonly brand!: string;

  @ApiProperty({ description: 'Product catalog MSRP in USD' })
  public readonly priceUsd!: number;

  @ApiPropertyOptional({ description: 'Product thumbnail URL' })
  public readonly imageUrl?: string;

  @ApiPropertyOptional({ description: 'Campaign ID', format: 'uuid' })
  public readonly campaignId?: string;

  @ApiPropertyOptional({ description: 'Campaign code' })
  public readonly campaignCode?: string;

  @ApiPropertyOptional({ description: 'Campaign name' })
  public readonly campaignName?: string;

  @ApiProperty({ description: 'User ID of the employee who requested the content job' })
  public readonly requesterUserId!: string;

  @ApiPropertyOptional({ description: 'Display name of requester' })
  public readonly requesterDisplayName?: string;

  @ApiProperty({ description: 'Current maximum version number' })
  public readonly currentVersionNumber!: number;

  @ApiProperty({ description: 'ID of the version under review', format: 'uuid' })
  public readonly targetVersionId!: string;

  @ApiProperty({ description: 'Version number under review' })
  public readonly targetVersionNumber!: number;

  @ApiPropertyOptional({ description: 'User ID who authored the revision' })
  public readonly targetVersionAuthorUserId?: string;

  @ApiProperty({ description: 'Version headline' })
  public readonly headline!: string;

  @ApiPropertyOptional({ description: 'English caption' })
  public readonly englishCaption?: string;

  @ApiProperty({ description: 'Validation status' })
  public readonly validationStatus!: string;

  @ApiProperty({ description: 'Blocking errors count' })
  public readonly blockingCount!: number;

  @ApiProperty({ description: 'Validation warnings count' })
  public readonly warningCount!: number;

  @ApiProperty({ description: 'When the version was submitted for review' })
  public readonly submittedAt!: string;

  @ApiPropertyOptional({ description: 'Latest approval or rejection decision record' })
  public readonly latestApproval?: {
    decision: ApprovalDecision;
    approverUserId: string;
    approverDisplayName?: string;
    comment?: string;
    decidedAt: string;
  };

  @ApiProperty({ description: 'Whether the current authenticated actor is eligible to approve' })
  public readonly isEligibleToApprove!: boolean;

  @ApiProperty({ description: 'Whether the current authenticated actor is eligible to reject' })
  public readonly isEligibleToReject!: boolean;

  @ApiProperty({
    description: 'List of reasons if actor is ineligible to approve',
    type: [String],
  })
  public readonly ineligibilityReasons!: readonly string[];
}

export class PaginatedReviewQueueResponseDto {
  @ApiProperty({ type: [ReviewQueueItemResponseDto] })
  public readonly items!: readonly ReviewQueueItemResponseDto[];

  @ApiProperty({ description: 'Total review queue items count' })
  public readonly total!: number;

  @ApiProperty({ description: 'Current page number' })
  public readonly page!: number;

  @ApiProperty({ description: 'Page size' })
  public readonly limit!: number;

  @ApiProperty({ description: 'Total pages count' })
  public readonly totalPages!: number;
}

export class ApprovalDecisionResponseDto {
  @ApiProperty({ description: 'Approval event ID', format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ description: 'Content job ID', format: 'uuid' })
  public readonly contentJobId!: string;

  @ApiProperty({ description: 'Content version ID', format: 'uuid' })
  public readonly contentVersionId!: string;

  @ApiProperty({ description: 'Approver user ID', format: 'uuid' })
  public readonly approverUserId!: string;

  @ApiPropertyOptional({ description: 'Approver display name' })
  public readonly approverDisplayName?: string;

  @ApiProperty({ description: 'Decision made', enum: ['APPROVED', 'REJECTED'] })
  public readonly decision!: ApprovalDecision;

  @ApiPropertyOptional({ description: 'Comment or rejection reason' })
  public readonly comment?: string;

  @ApiProperty({ description: 'Timestamp when decision was recorded' })
  public readonly createdAt!: string;
}

export class ReviewDeskDetailResponseDto {
  @ApiProperty()
  public readonly job!: {
    id: string;
    contentType: string;
    language: string;
    platform: string;
    campaignContext?: string;
    status: ContentJobStatus;
    requesterUserId: string;
    createdAt: string;
    updatedAt: string;
  };

  @ApiProperty()
  public readonly productSnapshot!: {
    id: string;
    sku: string;
    productName: string;
    brand: string;
    priceUsd: number;
    category?: string;
    description?: string;
    imageUrl?: string;
    fragranceNotes?: {
      top: readonly string[];
      heart: readonly string[];
      base: readonly string[];
    };
    stockStatus?: string;
    productUrl?: string;
  };

  @ApiPropertyOptional()
  public readonly campaign?: {
    id: string;
    code: string;
    name: string;
    status: string;
    objective?: string;
    targetAudience?: string;
  };

  @ApiProperty()
  public readonly versions!: readonly {
    id: string;
    versionNumber: number;
    authorUserId?: string;
    headline: string;
    englishCaption?: string;
    khmerCaption?: string;
    cta?: string;
    hashtags?: readonly string[];
    creativeBrief?: string;
    factsUsed?: readonly string[];
    createdAt: string;
    validationStatus?: string;
    blockingCount?: number;
    warningCount?: number;
  }[];

  @ApiProperty()
  public readonly targetVersion!: {
    id: string;
    versionNumber: number;
    authorUserId?: string;
    headline: string;
    englishCaption?: string;
    khmerCaption?: string;
    cta?: string;
    hashtags?: readonly string[];
    creativeBrief?: string;
    factsUsed?: readonly string[];
    createdAt: string;
    structuredOutput: Record<string, unknown>;
  };

  @ApiPropertyOptional()
  public readonly validationResult?: {
    id: string;
    status: string;
    blockingCount: number;
    warningCount: number;
    findings: readonly {
      severity: string;
      field?: string;
      code?: string;
      message: string;
    }[];
  };

  @ApiProperty()
  public readonly approvalEvents!: readonly ApprovalDecisionResponseDto[];

  @ApiProperty()
  public readonly eligibility!: {
    canApprove: boolean;
    canReject: boolean;
    ineligibilityReasons: readonly string[];
    selfRequested: boolean;
    selfAuthored: boolean;
    missingPermission: boolean;
    hasBlockingFindings: boolean;
    notUnderReview: boolean;
    isStaleVersion: boolean;
  };
}
