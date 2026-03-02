/**
 * Lambda entry point for GET /expenses.
 * Wires up real AWS dependencies and exports the handler.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ExpenseRepository } from '../../lib/dynamo.js';
import { extractAuthContext } from '../../middleware/auth.js';
import { createListExpensesHandler } from './list.js';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const repo = new ExpenseRepository(docClient, process.env['TABLE_NAME']!);

export const handler = createListExpensesHandler({
  repo,
  authenticate: async (event) => extractAuthContext(event),
});
