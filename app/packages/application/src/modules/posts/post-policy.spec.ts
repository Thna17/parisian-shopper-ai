import { describe, expect, it } from '@jest/globals';
import {
  assertPostDecision,
  assertPostLinks,
  assertPostOwner,
  assertPostTransition,
  canReadPost,
} from './post-policy.js';
const creator = {
  id: 'creator',
  permissions: [
    'CREATE_CONTENT',
    'EDIT_CONTENT',
    'VIEW_OWN_CONTENT',
    'APPROVE_CONTENT',
    'APPROVE_CREATIVE',
  ],
};
const reviewer = { ...creator, id: 'reviewer' };
describe('persistent Post policy', () => {
  it('restricts edits to the creator even if another user is an administrator', () => {
    expect(() => assertPostOwner(reviewer, creator.id)).toThrow('Only the creator');
    expect(() => assertPostOwner(creator, creator.id)).not.toThrow();
    expect(canReadPost({ id: 'other', permissions: ['VIEW_OWN_CONTENT'] }, creator.id)).toBe(false);
    expect(canReadPost(reviewer, creator.id)).toBe(true);
  });
  it('blocks creators and revision authors from approving, including administrators', () => {
    expect(() => assertPostDecision(creator, 'UNDER_REVIEW', ['creator'])).toThrow();
    expect(() =>
      assertPostDecision(
        { ...creator, permissions: [...creator.permissions, 'ADMIN'] },
        'UNDER_REVIEW',
        ['creator'],
      ),
    ).toThrow();
    expect(() => assertPostDecision(reviewer, 'UNDER_REVIEW', ['creator', 'reviewer'])).toThrow();
    expect(() => assertPostDecision(reviewer, 'UNDER_REVIEW', ['creator'])).not.toThrow();
  });
  it('rejects cross-product captions and mismatched poster/caption and image/version associations', () => {
    expect(() =>
      assertPostLinks({ productId: 'p', captionProductId: 'other', hasAsset: false }),
    ).toThrow('selected product');
    expect(() =>
      assertPostLinks({
        productId: 'p',
        captionId: 'c',
        posterVersionId: 'v',
        posterCaptionId: 'other',
        hasAsset: false,
      }),
    ).toThrow('exact selected caption');
    expect(() =>
      assertPostLinks({
        productId: 'p',
        captionId: 'c',
        posterVersionId: 'v',
        posterCaptionId: 'c',
        hasAsset: true,
        assetSceneVersionId: 'old',
      }),
    ).toThrow('exact selected poster');
    expect(() =>
      assertPostLinks({
        productId: 'p',
        captionId: 'c',
        posterVersionId: 'v',
        posterCaptionId: 'c',
        hasAsset: true,
        assetSceneVersionId: 'v',
      }),
    ).not.toThrow();
  });
  it('requires submission before a decision and returns approved edits to draft', () => {
    expect(assertPostTransition('DRAFT', 'SUBMIT')).toBe('UNDER_REVIEW');
    expect(assertPostTransition('UNDER_REVIEW', 'APPROVE')).toBe('APPROVED');
    expect(assertPostTransition('APPROVED', 'EDIT')).toBe('DRAFT');
    expect(assertPostTransition('UNDER_REVIEW', 'REQUEST_CHANGES')).toBe('CHANGES_REQUESTED');
    expect(() => assertPostTransition('DRAFT', 'APPROVE')).toThrow();
    expect(() => assertPostTransition('UNDER_REVIEW', 'EDIT')).toThrow();
  });
});

describe('rejected complete post revisions', () => {
  it('keeps rejection terminal for the submitted revision until a new editable draft is saved', () => {
    expect(assertPostTransition('UNDER_REVIEW', 'REJECT')).toBe('REJECTED');
    expect(() => assertPostTransition('REJECTED', 'SUBMIT')).toThrow();
    expect(assertPostTransition('REJECTED', 'EDIT')).toBe('DRAFT');
    expect(() => assertPostDecision(creator, 'UNDER_REVIEW', ['creator'])).toThrow(
      'different authorized colleague',
    );
  });
});
