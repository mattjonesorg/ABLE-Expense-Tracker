/**
 * Lambda entry point for GET /dashboard/reimbursements.
 * Wires up real AWS dependencies and exports the handler.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ExpenseRepository } from '../../lib/dynamo.js';
import { extractAuthContext } from '../../middleware/auth.js';
import { createDashboardReimbursementsHandler } from './reimbursements.js';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const repo = new ExpenseRepository(docClient, process.env['TABLE_NAME']!);

export const handler = createDashboardReimbursementsHandler({
  repo,
  authenticate: async (event) => extractAuthContext(event),
});
