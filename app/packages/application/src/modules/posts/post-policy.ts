import { ConflictError, ForbiddenError, ValidationError } from '@parisian-shopper/common';

export interface PostActor {
  id: string;
  permissions: readonly string[];
}
export type StaffPostStatus =
  'DRAFT' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED';
export function canReadPost(actor: PostActor, creatorId: string): boolean {
  return (
    actor.id === creatorId ||
    actor.permissions.includes('VIEW_ALL_CONTENT') ||
    actor.permissions.includes('APPROVE_CONTENT')
  );
}
export function assertPostOwner(actor: PostActor, creatorId: string): void {
  if (actor.id !== creatorId || !actor.permissions.includes('EDIT_CONTENT'))
    throw new ForbiddenError({ publicMessage: 'Only the creator can edit or submit this post.' });
}
export function assertPostDecision(
  actor: PostActor,
  status: StaffPostStatus,
  contributors: readonly string[],
): void {
  if (
    !actor.permissions.includes('APPROVE_CONTENT') ||
    !actor.permissions.includes('APPROVE_CREATIVE')
  )
    throw new ForbiddenError({ publicMessage: 'An authorized post reviewer is required.' });
  if (contributors.includes(actor.id))
    throw new ForbiddenError({
      publicMessage:
        'You created, requested, or edited this post. Ask a different authorized colleague to review it.',
    });
  if (status !== 'UNDER_REVIEW')
    throw new ConflictError({
      publicMessage: 'This post is not waiting for review. Refresh to see its current state.',
    });
}
export function assertPostLinks(input: {
  productId: string;
  captionProductId?: string;
  posterProductId?: string;
  captionId?: string;
  posterCaptionId?: string;
  posterVersionId?: string;
  assetSceneVersionId?: string | null;
  hasAsset: boolean;
}): void {
  if (
    (input.captionProductId && input.captionProductId !== input.productId) ||
    (input.posterProductId && input.posterProductId !== input.productId)
  )
    throw new ValidationError({
      publicMessage: 'The caption and poster must belong to the selected product.',
    });
  if (input.posterVersionId && (!input.captionId || input.posterCaptionId !== input.captionId))
    throw new ValidationError({
      publicMessage: 'The poster must use the exact selected caption version.',
    });
  if (
    input.hasAsset &&
    (!input.posterVersionId || input.assetSceneVersionId !== input.posterVersionId)
  )
    throw new ValidationError({
      publicMessage:
        'The saved image must be a verified render of the exact selected poster version. Render that version again if it is an older image.',
    });
}
export function assertPostTransition(
  status: StaffPostStatus,
  action: 'EDIT' | 'SUBMIT' | 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT',
): StaffPostStatus {
  if (action === 'EDIT') {
    if (status === 'UNDER_REVIEW')
      throw new ConflictError({
        publicMessage: 'Ask the reviewer to request changes before editing a submitted post.',
      });
    return 'DRAFT';
  }
  if (action === 'SUBMIT' && (status === 'DRAFT' || status === 'CHANGES_REQUESTED'))
    return 'UNDER_REVIEW';
  if (status === 'UNDER_REVIEW' && action === 'REJECT') return 'REJECTED';
  if (status === 'UNDER_REVIEW' && action === 'APPROVE') return 'APPROVED';
  if (status === 'UNDER_REVIEW' && action === 'REQUEST_CHANGES') return 'CHANGES_REQUESTED';
  throw new ConflictError({
    publicMessage: 'This action is unavailable in the current post state.',
  });
}
