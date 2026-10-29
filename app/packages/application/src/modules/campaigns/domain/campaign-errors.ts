import { ApplicationError } from '@parisian-shopper/common';

export class CampaignNotFoundError extends ApplicationError {
  public constructor(identifier: string) {
    super({
      code: 'CAMPAIGN_NOT_FOUND',
      publicMessage: `Campaign "${identifier}" was not found.`,
    });
  }
}

export class DuplicateCampaignCodeError extends ApplicationError {
  public constructor(code: string) {
    super({
      code: 'DUPLICATE_CAMPAIGN_CODE',
      publicMessage: `Campaign code "${code}" already exists.`,
    });
  }
}

export class InvalidCampaignStatusTransitionError extends ApplicationError {
  public constructor(from: string, to: string, reason?: string) {
    super({
      code: 'INVALID_CAMPAIGN_STATUS_TRANSITION',
      publicMessage: `Cannot transition campaign status from ${from} to ${to}${reason ? `: ${reason}` : '.'}`,
    });
  }
}

export class InvalidCampaignDateRangeError extends ApplicationError {
  public constructor(message = 'Campaign end date must be on or after the start date.') {
    super({
      code: 'INVALID_CAMPAIGN_DATE_RANGE',
      publicMessage: message,
    });
  }
}

export class DuplicateCampaignProductError extends ApplicationError {
  public constructor(productSnapshotId: string) {
    super({
      code: 'DUPLICATE_CAMPAIGN_PRODUCT',
      publicMessage: `Product snapshot "${productSnapshotId}" is already associated with this campaign.`,
    });
  }
}

export class CampaignForbiddenError extends ApplicationError {
  public constructor(message = 'You do not have permission to access or modify this campaign.') {
    super({
      code: 'CAMPAIGN_FORBIDDEN',
      publicMessage: message,
    });
  }
}
