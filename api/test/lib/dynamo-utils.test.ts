import { describe, it, expect } from 'vitest';
import { stripDynamoKeys } from '../../src/lib/dynamo-utils.js';

interface TestDomain {
  id: string;
  name: string;
  value: number;
}

describe('stripDynamoKeys', () => {
  it('strips PK and SK from an item', () => {
    const item = { PK: 'ACCOUNT#123', SK: 'META', id: '123', name: 'Test' };
    const result = stripDynamoKeys<TestDomain>(item, ['PK', 'SK']);
    expect(result).toEqual({ id: '123', name: 'Test' });
  });

  it('strips GSI key attributes', () => {
    const item = {
      PK: 'ACCOUNT#123',
      SK: 'EXP#2025-01-01#abc',
      GSI1PK: 'ACCOUNT#123',
      GSI1SK: 'CAT#Housing#2025-01-01',
      GSI2PK: 'ACCOUNT#123',
      GSI2SK: 'PAID#user1#0#2025-01-01',
      id: '123',
      name: 'Test',
      value: 42,
    };
    const keysToStrip = ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK'];
    const result = stripDynamoKeys<TestDomain>(item, keysToStrip);
    expect(result).toEqual({ id: '123', name: 'Test', value: 42 });
  });

  it('preserves all non-key attributes', () => {
    const item = { PK: 'X', SK: 'Y', a: 1, b: 'two', c: true, d: null };
    const result = stripDynamoKeys<Record<string, unknown>>(item, ['PK', 'SK']);
    expect(result).toEqual({ a: 1, b: 'two', c: true, d: null });
  });

  it('returns empty object when all attributes are keys', () => {
    const item = { PK: 'ACCOUNT#123', SK: 'META' };
    const result = stripDynamoKeys<Record<string, unknown>>(item, ['PK', 'SK']);
    expect(result).toEqual({});
  });

  it('returns item unchanged when no keys match', () => {
    const item = { id: '123', name: 'Test', value: 42 };
    const result = stripDynamoKeys<TestDomain>(item, ['PK', 'SK']);
    expect(result).toEqual({ id: '123', name: 'Test', value: 42 });
  });
});
