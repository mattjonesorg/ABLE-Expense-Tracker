import { describe, it, expect, beforeEach } from 'vitest';
import { getIdToken, setIdToken, clearIdToken } from '../../src/lib/auth';

describe('Auth Token Management', () => {
  beforeEach(() => {
    clearIdToken();
  });

  it('getIdToken returns null when no token is set', () => {
    expect(getIdToken()).toBeNull();
  });

  it('getIdToken returns the token after setIdToken is called', () => {
    setIdToken('test-token-123');
    expect(getIdToken()).toBe('test-token-123');
  });

  it('clearIdToken removes the stored token', () => {
    setIdToken('test-token-123');
    clearIdToken();
    expect(getIdToken()).toBeNull();
  });

  it('setIdToken replaces an existing token', () => {
    setIdToken('first-token');
    setIdToken('second-token');
    expect(getIdToken()).toBe('second-token');
  });
});
