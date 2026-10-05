import {
  assertContentJobTransition,
  canTransitionContentJob,
  type ContentJobStatus,
} from './content.js';

describe('ContentJob state transitions', () => {
  it('allows valid lifecycle transitions', () => {
    expect(canTransitionContentJob('REQUESTED', 'GENERATING')).toBe(true);
    expect(canTransitionContentJob('GENERATING', 'DRAFT')).toBe(true);
    expect(canTransitionContentJob('GENERATING', 'FAILED')).toBe(true);
    expect(canTransitionContentJob('DRAFT', 'UNDER_REVIEW')).toBe(true);
    expect(canTransitionContentJob('UNDER_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransitionContentJob('UNDER_REVIEW', 'REJECTED')).toBe(true);
    expect(canTransitionContentJob('UNDER_REVIEW', 'REVISION_REQUESTED')).toBe(true);
    expect(canTransitionContentJob('REVISION_REQUESTED', 'GENERATING')).toBe(true);
    expect(canTransitionContentJob('FAILED', 'GENERATING')).toBe(true);
  });

  it('rejects transitions out of terminal states APPROVED and REJECTED', () => {
    const statuses: ContentJobStatus[] = [
      'REQUESTED',
      'GENERATING',
      'DRAFT',
      'UNDER_REVIEW',
      'REVISION_REQUESTED',
      'APPROVED',
      'REJECTED',
      'FAILED',
    ];

    for (const target of statuses) {
      expect(canTransitionContentJob('APPROVED', target)).toBe(false);
      expect(canTransitionContentJob('REJECTED', target)).toBe(false);
      expect(() => assertContentJobTransition('APPROVED', target)).toThrow();
      expect(() => assertContentJobTransition('REJECTED', target)).toThrow();
    }
  });

  it('rejects invalid jumps such as REQUESTED to APPROVED', () => {
    expect(canTransitionContentJob('REQUESTED', 'APPROVED')).toBe(false);
    expect(canTransitionContentJob('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionContentJob('REVISION_REQUESTED', 'APPROVED')).toBe(false);
    expect(() => assertContentJobTransition('REQUESTED', 'APPROVED')).toThrow();
  });
});
