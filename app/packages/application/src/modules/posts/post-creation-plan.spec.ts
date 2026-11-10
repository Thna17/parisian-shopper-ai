import { postBackgroundDirection, readPostCreationPlan } from './post-creation-plan.js';
describe('saved post creative direction', () => {
  it('uses compatible defaults for historical revisions without changing them', () => {
    expect(readPostCreationPlan(null)).toEqual({
      format: 'POSTER',
      purpose: 'PRODUCT_SPOTLIGHT',
      style: 'LUXURY',
      feedback: '',
      intent: 'INITIAL',
    });
  });
  it('rejects unsupported provider settings and unbounded feedback', () => {
    expect(() => readPostCreationPlan({ format: 'AUDIO' })).toThrow();
    expect(() => readPostCreationPlan({ count: 30 })).toThrow();
    expect(() => readPostCreationPlan({ feedback: 'x'.repeat(1001) })).toThrow();
  });
  it('pins style and feedback into the actual background direction without asserting a discount', () => {
    const direction = postBackgroundDirection({
      purpose: 'PROMOTION',
      style: 'MINIMAL',
      feedback: 'More space around the bottle',
    });
    expect(direction).toContain('minimal composition');
    expect(direction).toContain('More space around the bottle');
    expect(direction).not.toContain('50%');
  });
});
