import { ABLE_CATEGORIES, type AbleCategory, type CategoryResult } from './types.js';

/**
 * Input for expense categorization.
 * Only contains non-PII fields safe to send to Claude.
 */
export interface CategorizationInput {
  vendor: string;
  description: string;
  amount: number; // cents
}

/**
 * Minimal interface for the Anthropic messages client.
 * Uses dependency injection so tests can provide a mock.
 */
interface AnthropicMessagesClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: string; content: string }>;
    }): Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

/**
 * Format cents to dollar string (e.g., 1500 -> "$15.00").
 */
function formatCents(cents: number): string {
  const dollars = (cents / 100).toFixed(2);
  return `$${dollars}`;
}

/**
 * System prompt that explains the 11 ABLE categories to Claude.
 * Instructs Claude to respond with structured JSON only.
 */
const SYSTEM_PROMPT = `You are an expert on ABLE (Achieving a Better Life Experience) account qualified disability expenses under IRS Code §529A.

Your task is to categorize an expense into one of the 11 qualified ABLE expense categories. You must respond with valid JSON only — no additional text.

The 11 qualified ABLE expense categories are:
1. Education — Tuition, books, supplies, tutoring, special education programs
2. Housing — Rent, mortgage, utilities, property taxes, home accessibility modifications
3. Transportation — Vehicle purchase/lease/modification, rideshare, public transit, paratransit
4. Employment training & support — Job coaching, vocational rehab, career counseling, workplace accommodations
5. Assistive technology & personal support — Adaptive equipment, personal care attendant, service animals, smart-home devices
6. Health, prevention & wellness — Medical/dental/vision care, mental health, prescriptions, gym memberships
7. Financial management & administrative — ABLE account fees, tax preparation, financial planning, bookkeeping
8. Legal fees — Guardianship proceedings, estate planning, disability-related legal advocacy
9. Oversight & monitoring — Professional monitoring, care coordination, case management
10. Funeral & burial — Pre-paid funeral, burial/cremation, cemetery plot, memorial service
11. Basic living expenses — Food, groceries, clothing, personal hygiene, household supplies

Respond with a JSON object in this exact format:
{
  "suggestedCategory": "<one of the 11 categories exactly as listed above>",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<brief explanation of why this category fits>",
  "followUpQuestion": "<question to ask the user if confidence is low, or null if not needed>"
}

Rules:
- "suggestedCategory" MUST be exactly one of the 11 category names listed above (case-sensitive).
- Set "confidence" to "high" if the expense clearly fits one category, "medium" if it likely fits but could be ambiguous, "low" if more context is needed.
- If confidence is "low", provide a helpful "followUpQuestion" to clarify. Otherwise, set it to null.
- Respond with the JSON object only. No markdown, no code fences, no extra text.`;

/**
 * Build the user prompt from expense input.
 * Only includes vendor, description, and formatted amount — no PII.
 */
function buildUserPrompt(input: CategorizationInput): string {
  return `Please categorize the following expense:

Vendor: ${input.vendor}
Description: ${input.description}
Amount: ${formatCents(input.amount)}`;
}

/**
 * Validate that a parsed response is a valid CategoryResult.
 * Returns the validated result or null if invalid.
 */
function validateCategoryResult(parsed: unknown): CategoryResult | null {
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Validate suggestedCategory is one of the 11 ABLE categories
  if (
    typeof obj['suggestedCategory'] !== 'string' ||
    !ABLE_CATEGORIES.includes(obj['suggestedCategory'] as AbleCategory)
  ) {
    return null;
  }

  // Validate confidence
  if (
    typeof obj['confidence'] !== 'string' ||
    !['high', 'medium', 'low'].includes(obj['confidence'])
  ) {
    return null;
  }

  // Validate reasoning
  if (typeof obj['reasoning'] !== 'string') {
    return null;
  }

  // Validate followUpQuestion (string or null)
  if (obj['followUpQuestion'] !== null && typeof obj['followUpQuestion'] !== 'string') {
    return null;
  }

  return {
    suggestedCategory: obj['suggestedCategory'] as AbleCategory,
    confidence: obj['confidence'] as 'high' | 'medium' | 'low',
    reasoning: obj['reasoning'] as string,
    followUpQuestion: (obj['followUpQuestion'] as string) ?? null,
  };
}

/**
 * Creates a categorizer function that uses the Anthropic API to categorize
 * ABLE account expenses.
 *
 * Uses dependency injection for the Anthropic client to enable testing
 * without real API calls.
 *
 * @param client - An object with a `messages.create` method (Anthropic client or mock)
 * @returns An async function that categorizes an expense, returning CategoryResult or null
 */
export function createCategorizer(
  client: AnthropicMessagesClient,
): (input: CategorizationInput) => Promise<CategoryResult | null> {
  return async (input: CategorizationInput): Promise<CategoryResult | null> => {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildUserPrompt(input),
          },
        ],
      });

      // Extract text from the first content block
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || typeof textBlock.text !== 'string') {
        return null;
      }

      // Parse the JSON response
      const parsed: unknown = JSON.parse(textBlock.text);

      // Validate and return
      return validateCategoryResult(parsed);
    } catch {
      // Graceful degradation: return null on any error (API, parse, etc.)
      return null;
    }
  };
}
