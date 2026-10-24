import { type ClaimedOutboxEvent } from '@parisian-shopper/common';

export const VISUAL_REVIEW_NOTIFICATION_DISPATCHER = Symbol(
  'VISUAL_REVIEW_NOTIFICATION_DISPATCHER',
);

export interface VisualReviewNotificationDispatcher {
  dispatchVisualReview(event: ClaimedOutboxEvent): Promise<void>;
}
