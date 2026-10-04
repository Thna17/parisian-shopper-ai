import { ConflictError } from './error-types.js';

describe('application errors', () => {
  it('exposes a stable code and safe public message', () => {
    const error = new ConflictError({
      publicMessage: 'The operation conflicts with current state',
    });

    expect(error.code).toBe('CONFLICT');
    expect(error.publicMessage).toBe('The operation conflicts with current state');
    expect(error.name).toBe('ConflictError');
  });
});
