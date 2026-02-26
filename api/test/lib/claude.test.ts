import { describe, it, expect, vi } from 'vitest';
import type { CategoryResult } from '../../src/lib/types.js';
import { createCategorizer, type CategorizationInput } from '../../src/lib/claude.js';

/**
 * Helper to build a mock Anthropic messages client.
 * Returns a mock whose `messages.create` resolves to a message
 * with the given text content.
 */
function mockClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text' as const, text: responseText }],
      }),
    },
  };
}

/**
 * Helper to build a mock client that rejects with an error.
 */
function mockClientError(error: Error) {
  return {
    messages: {
      create: vi.fn().mockRejectedValue(error),
    },
  };
}

describe('createCategorizer', () => {
  const validHighConfidence: CategoryResult = {
    suggestedCategory: 'Housing',
    confidence: 'high',
    reasoning: 'Rent payments are a qualified housing expense under ABLE.',
    followUpQuestion: null,
  };

  const validMediumConfidence: CategoryResult = {
    suggestedCategory: 'Health, prevention & wellness',
    confidence: 'medium',
    reasoning:
      'Gym memberships may qualify if prescribed by a physician for disability-related wellness.',
    followUpQuestion: null,
  };

  const validLowConfidence: CategoryResult = {
    suggestedCategory: 'Assistive technology & personal support',
    confidence: 'low',
    reasoning:
      'This could be assistive technology if used for disability support, but more context is needed.',
    followUpQuestion:
      'Is this device specifically used for disability-related assistance?',
  };

  it('returns CategoryResult with valid high-confidence response from Claude', async () => {
    const client = mockClient(JSON.stringify(validHighConfidence));
    const categorize = createCategorizer(client);

    const input: CategorizationInput = {
      vendor: 'Apartments Inc',
      description: 'Monthly rent payment',
      amount: 150000,
    };

    const result = await categorize(input);

    expect(result).not.toBeNull();
    expect(result).toEqual(validHighConfidence);
    expect(result!.confidence).toBe('high');
    expect(result!.suggestedCategory).toBe('Housing');
    expect(result!.followUpQuestion).toBeNull();
  });

  it('returns CategoryResult with medium confidence and reasoning', async () => {
    const client = mockClient(JSON.stringify(validMediumConfidence));
    const categorize = createCategorizer(client);

    const input: CategorizationInput = {
      vendor: 'Gold Gym',
      description: 'Annual gym membership',
      amount: 4999,
    };

    const result = await categorize(input);

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('medium');
    expect(result!.reasoning).toContain('Gym memberships');
    expect(result!.suggestedCategory).toBe('Health, prevention & wellness');
  });

  it('returns follow-up question when confidence is low', async () => {
    const client = mockClient(JSON.stringify(validLowConfidence));
    const categorize = createCategorizer(client);

    const input: CategorizationInput = {
      vendor: 'Best Buy',
      description: 'Tablet purchase',
      amount: 49999,
    };

    const result = await categorize(input);

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('low');
    expect(result!.followUpQuestion).toBeTruthy();
    expect(typeof result!.followUpQuestion).toBe('string');
  });

  it('validates the returned category is one of 11 ABLE categories — rejects invalid category', async () => {
    const invalidResponse = {
      suggestedCategory: 'Entertainment',
      confidence: 'high',
      reasoning: 'This is for entertainment.',
      followUpQuestion: null,
    };
    const client = mockClient(JSON.stringify(invalidResponse));
    const categorize = createCategorizer(client);

    const input: CategorizationInput = {
      vendor: 'Netflix',
      description: 'Monthly subscription',
      amount: 1599,
    };

    const result = await categorize(input);

    expect(result).toBeNull();
  });

  it('falls back gracefully on API error — returns null, does not throw', async () => {
    const client = mockClientError(new Error('API rate limit exceeded'));
    const categorize = createCategorizer(client);

    const input: CategorizationInput = {
      vendor: 'Some Vendor',
      description: 'Some expense',
      amount: 1000,
    };

    const result = await categorize(input);

    expect(result).toBeNull();
  });

  it('falls back gracefully on malformed JSON from Claude — returns null', async () => {
    const client = mockClient('This is not valid JSON at all {{{');
    const categorize = createCategorizer(client);

    const input: CategorizationInput = {
      vendor: 'Some Vendor',
      description: 'Some expense',
      amount: 1000,
    };

    const result = await categorize(input);

    expect(result).toBeNull();
  });

  it('sends only vendor, description, amount to Claude (no PII fields)', async () => {
    const client = mockClient(JSON.stringify(validHighConfidence));
    const categorize = createCategorizer(client);

    const input: CategorizationInput = {
      vendor: 'Pharmacy Co',
      description: 'Prescription medication',
      amount: 2500,
    };

    await categorize(input);

    // Verify the create call was made
    expect(client.messages.create).toHaveBeenCalledOnce();

    // Extract the arguments passed to the API
    const callArgs = client.messages.create.mock.calls[0][0] as {
      messages: Array<{ content: string }>;
    };

    // Serialize the entire request to check for PII fields
    const serialized = JSON.stringify(callArgs);

    // Verify the prompt contains the expense data
    expect(serialized).toContain('Pharmacy Co');
    expect(serialized).toContain('Prescription medication');
    expect(serialized).toContain('$25.00');

    // Verify no PII-related field names appear
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('userId');
    expect(serialized).not.toContain('accountId');
    expect(serialized).not.toContain('cognitoSub');
    expect(serialized).not.toContain('SSN');
    expect(serialized).not.toContain('accountNumber');
    expect(serialized).not.toContain('beneficiary');
  });

  it('formats amount from cents to dollars in the prompt (e.g., 1500 -> "$15.00")', async () => {
    const client = mockClient(JSON.stringify(validHighConfidence));
    const categorize = createCategorizer(client);

    const input: CategorizationInput = {
      vendor: 'Test Vendor',
      description: 'Test expense',
      amount: 1500,
    };

    await categorize(input);

    const callArgs = client.messages.create.mock.calls[0][0] as {
      messages: Array<{ content: string }>;
    };
    const serialized = JSON.stringify(callArgs);

    // Cents value 1500 should appear as "$15.00" in the prompt
    expect(serialized).toContain('$15.00');
    // Should NOT send the raw cents value in a way that could be confused
    expect(serialized).not.toContain('1500 cents');
  });
});
