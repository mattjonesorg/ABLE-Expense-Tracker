/**
 * Lambda entry point for POST /expenses.
 * Wires up real AWS dependencies and exports the handler.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ExpenseRepository } from '../../lib/dynamo.js';
import { extractAuthContext } from '../../middleware/auth.js';
import { createCreateExpenseHandler } from './create.js';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const repo = new ExpenseRepository(docClient, process.env['TABLE_NAME']!);

export const handler = createCreateExpenseHandler({
  repo,
  authenticate: async (event) => extractAuthContext(event),
});
