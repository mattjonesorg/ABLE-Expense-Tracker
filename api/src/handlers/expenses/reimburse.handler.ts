/**
 * Lambda entry point for PUT /expenses/{id}/reimburse.
 * Wires up real AWS dependencies and exports the handler.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ExpenseRepository } from '../../lib/dynamo.js';
import { extractAuthContext } from '../../middleware/auth.js';
import { createReimburseExpenseHandler } from './reimburse.js';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const repo = new ExpenseRepository(docClient, process.env['TABLE_NAME']!);

export const handler = createReimburseExpenseHandler({
  repo,
  authenticate: async (event) => extractAuthContext(event),
});
