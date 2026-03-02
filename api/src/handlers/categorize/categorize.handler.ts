/**
 * Lambda entry point for POST /expenses/categorize.
 * Wires up the Anthropic client and exports the handler.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createCategorizer } from '../../lib/claude.js';
import { extractAuthContext } from '../../middleware/auth.js';
import { createCategorizeHandler } from './categorize.js';

// Anthropic SDK reads ANTHROPIC_API_KEY from the environment automatically
const anthropic = new Anthropic();
const categorize = createCategorizer(anthropic);

export const handler = createCategorizeHandler({
  categorize,
  authenticate: async (event) => extractAuthContext(event),
});
