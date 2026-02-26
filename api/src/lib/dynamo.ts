import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import type { AbleCategory, CreateExpenseInput, Expense } from './types.js';

/** Key attributes stored on every DynamoDB item but not part of the Expense domain model. */
const KEY_ATTRIBUTES = ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK'] as const;

/**
 * Strip DynamoDB key attributes from a raw item and return a clean Expense object.
 */
function itemToExpense(item: Record<string, unknown>): Expense {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (!(KEY_ATTRIBUTES as readonly string[]).includes(key)) {
      clean[key] = value;
    }
  }
  return clean as unknown as Expense;
}

/**
 * Repository for ABLE Tracker expense items stored in a DynamoDB single-table design.
 *
 * Key schema:
 * - PK: ACCOUNT#<accountId>
 * - SK: EXP#<date>#<expenseId>
 * - GSI1PK: ACCOUNT#<accountId>, GSI1SK: CAT#<category>#<date>
 * - GSI2PK: ACCOUNT#<accountId>, GSI2SK: PAID#<paidBy>#<0|1>#<date>
 */
export class ExpenseRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  /**
   * Create a new expense item.
   * Generates a ULID for the expenseId and sets audit timestamps.
   */
  async createExpense(input: CreateExpenseInput): Promise<Expense> {
    const expenseId = ulid();
    const now = new Date().toISOString();

    const expense: Expense = {
      ...input,
      expenseId,
      reimbursed: false,
      reimbursedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const item: Record<string, unknown> = {
      // Key attributes
      PK: `ACCOUNT#${input.accountId}`,
      SK: `EXP#${input.date}#${expenseId}`,
      GSI1PK: `ACCOUNT#${input.accountId}`,
      GSI1SK: `CAT#${input.category}#${input.date}`,
      GSI2PK: `ACCOUNT#${input.accountId}`,
      GSI2SK: `PAID#${input.paidBy}#0#${input.date}`,
      // Domain attributes
      ...expense,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      }),
    );

    return expense;
  }

  /**
   * Get a single expense by accountId and expenseId.
   * Uses Query with begins_with on SK to locate the item regardless of date.
   * Returns null if not found.
   */
  async getExpense(accountId: string, expenseId: string): Promise<Expense | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        FilterExpression: 'expenseId = :expenseId',
        ExpressionAttributeValues: {
          ':pk': `ACCOUNT#${accountId}`,
          ':skPrefix': 'EXP#',
          ':expenseId': expenseId,
        },
      }),
    );

    const items = result.Items;
    if (!items || items.length === 0) {
      return null;
    }

    return itemToExpense(items[0] as Record<string, unknown>);
  }

  /**
   * List all expenses for an account in reverse chronological order.
   */
  async listExpenses(accountId: string): Promise<Expense[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `ACCOUNT#${accountId}`,
          ':skPrefix': 'EXP#',
        },
        ScanIndexForward: false,
      }),
    );

    const items = result.Items ?? [];
    return items.map((item) => itemToExpense(item as Record<string, unknown>));
  }

  /**
   * List expenses for an account filtered by ABLE category, using GSI1.
   */
  async listExpensesByCategory(accountId: string, category: AbleCategory): Promise<Expense[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk AND begins_with(GSI1SK, :gsi1skPrefix)',
        ExpressionAttributeValues: {
          ':gsi1pk': `ACCOUNT#${accountId}`,
          ':gsi1skPrefix': `CAT#${category}#`,
        },
        ScanIndexForward: false,
      }),
    );

    const items = result.Items ?? [];
    return items.map((item) => itemToExpense(item as Record<string, unknown>));
  }

  /**
   * List expenses for an account filtered by who paid and reimbursement status, using GSI2.
   */
  async listExpensesByReimbursementStatus(
    accountId: string,
    paidBy: string,
    reimbursed: boolean,
  ): Promise<Expense[]> {
    const reimbursedFlag = reimbursed ? '1' : '0';

    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2skPrefix)',
        ExpressionAttributeValues: {
          ':gsi2pk': `ACCOUNT#${accountId}`,
          ':gsi2skPrefix': `PAID#${paidBy}#${reimbursedFlag}#`,
        },
        ScanIndexForward: false,
      }),
    );

    const items = result.Items ?? [];
    return items.map((item) => itemToExpense(item as Record<string, unknown>));
  }

  /**
   * Mark an expense as reimbursed.
   * Updates reimbursed, reimbursedAt, updatedAt, and GSI2SK (to reflect the new status in the index).
   */
  async markReimbursed(accountId: string, expenseId: string, sk: string, paidBy: string): Promise<Expense> {
    const now = new Date().toISOString();

    // Extract date from the SK to reconstruct GSI2SK
    // SK format: EXP#<date>#<expenseId>
    const skParts = sk.split('#');
    const date = skParts[1];

    const result = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `ACCOUNT#${accountId}`,
          SK: sk,
        },
        UpdateExpression: 'SET reimbursed = :reimbursed, reimbursedAt = :reimbursedAt, updatedAt = :updatedAt, #gsi2sk = :gsi2sk',
        ExpressionAttributeNames: {
          '#gsi2sk': 'GSI2SK',
        },
        ExpressionAttributeValues: {
          ':reimbursed': true,
          ':reimbursedAt': now,
          ':updatedAt': now,
          ':gsi2sk': `PAID#${paidBy}#1#${date}`,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );

    return itemToExpense(result.Attributes as Record<string, unknown>);
  }

  /**
   * Delete an expense by accountId and full sort key.
   */
  async deleteExpense(accountId: string, sk: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `ACCOUNT#${accountId}`,
          SK: sk,
        },
      }),
    );
  }
}
