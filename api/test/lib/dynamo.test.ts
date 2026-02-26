import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ExpenseRepository } from '../../src/lib/dynamo.js';
import type { AbleCategory, CreateExpenseInput, Expense } from '../../src/lib/types.js';

// Mock ulid to return a deterministic value
vi.mock('ulid', () => ({
  ulid: () => 'MOCK_ULID_01',
}));

const TABLE_NAME = 'able-tracker-test';
const ddbMock = mockClient(DynamoDBDocumentClient);

function makeCreateInput(overrides: Partial<CreateExpenseInput> = {}): CreateExpenseInput {
  return {
    accountId: 'acct-123',
    date: '2025-03-15',
    vendor: 'Walgreens',
    description: 'Medication co-pay',
    amount: 2499,
    category: 'Health, prevention & wellness',
    categoryConfidence: 'ai_confirmed',
    categoryNotes: 'Over-the-counter medication',
    receiptKey: 'receipts/acct-123/receipt-001.jpg',
    submittedBy: 'user-alice',
    paidBy: 'user-alice',
    ...overrides,
  };
}

function makeSampleExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    expenseId: 'MOCK_ULID_01',
    accountId: 'acct-123',
    date: '2025-03-15',
    vendor: 'Walgreens',
    description: 'Medication co-pay',
    amount: 2499,
    category: 'Health, prevention & wellness',
    categoryConfidence: 'ai_confirmed',
    categoryNotes: 'Over-the-counter medication',
    receiptKey: 'receipts/acct-123/receipt-001.jpg',
    submittedBy: 'user-alice',
    paidBy: 'user-alice',
    reimbursed: false,
    reimbursedAt: null,
    createdAt: '2025-03-15T10:00:00.000Z',
    updatedAt: '2025-03-15T10:00:00.000Z',
    ...overrides,
  };
}

/** Build a DynamoDB item as it would be stored, including key attributes */
function makeDynamoItem(expense: Expense): Record<string, unknown> {
  return {
    PK: `ACCOUNT#${expense.accountId}`,
    SK: `EXP#${expense.date}#${expense.expenseId}`,
    GSI1PK: `ACCOUNT#${expense.accountId}`,
    GSI1SK: `CAT#${expense.category}#${expense.date}`,
    GSI2PK: `ACCOUNT#${expense.accountId}`,
    GSI2SK: `PAID#${expense.paidBy}#${expense.reimbursed ? '1' : '0'}#${expense.date}`,
    expenseId: expense.expenseId,
    accountId: expense.accountId,
    date: expense.date,
    vendor: expense.vendor,
    description: expense.description,
    amount: expense.amount,
    category: expense.category,
    categoryConfidence: expense.categoryConfidence,
    categoryNotes: expense.categoryNotes,
    receiptKey: expense.receiptKey,
    submittedBy: expense.submittedBy,
    paidBy: expense.paidBy,
    reimbursed: expense.reimbursed,
    reimbursedAt: expense.reimbursedAt,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

describe('ExpenseRepository', () => {
  let repo: ExpenseRepository;

  beforeEach(() => {
    ddbMock.reset();
    // Freeze time for deterministic ISO timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'));

    repo = new ExpenseRepository(
      ddbMock as unknown as DynamoDBDocumentClient,
      TABLE_NAME,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createExpense', () => {
    it('sends PutCommand with correct PK, SK, and GSI keys', async () => {
      ddbMock.on(PutCommand).resolves({});

      const input = makeCreateInput();
      await repo.createExpense(input);

      const calls = ddbMock.commandCalls(PutCommand);
      expect(calls).toHaveLength(1);

      const putInput = calls[0].args[0].input;
      expect(putInput.TableName).toBe(TABLE_NAME);
      expect(putInput.Item).toMatchObject({
        PK: 'ACCOUNT#acct-123',
        SK: 'EXP#2025-03-15#MOCK_ULID_01',
        GSI1PK: 'ACCOUNT#acct-123',
        GSI1SK: 'CAT#Health, prevention & wellness#2025-03-15',
        GSI2PK: 'ACCOUNT#acct-123',
        GSI2SK: 'PAID#user-alice#0#2025-03-15',
      });
    });

    it('generates a ULID for the expenseId', async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await repo.createExpense(makeCreateInput());
      expect(result.expenseId).toBe('MOCK_ULID_01');
    });

    it('sets createdAt and updatedAt to current ISO timestamp', async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await repo.createExpense(makeCreateInput());
      expect(result.createdAt).toBe('2025-03-15T10:00:00.000Z');
      expect(result.updatedAt).toBe('2025-03-15T10:00:00.000Z');
    });

    it('sets reimbursed=false and reimbursedAt=null', async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await repo.createExpense(makeCreateInput());
      expect(result.reimbursed).toBe(false);
      expect(result.reimbursedAt).toBeNull();
    });

    it('returns the full Expense object', async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await repo.createExpense(makeCreateInput());
      const expected = makeSampleExpense();

      expect(result).toEqual(expected);
    });

    it('stores amount as integer cents', async () => {
      ddbMock.on(PutCommand).resolves({});

      await repo.createExpense(makeCreateInput({ amount: 15075 }));

      const calls = ddbMock.commandCalls(PutCommand);
      expect(calls[0].args[0].input.Item?.amount).toBe(15075);
    });
  });

  describe('getExpense', () => {
    it('queries with PK, SK begins_with EXP#, and filters by expenseId', async () => {
      const expense = makeSampleExpense();
      ddbMock.on(QueryCommand).resolves({
        Items: [makeDynamoItem(expense)],
      });

      await repo.getExpense('acct-123', 'MOCK_ULID_01');

      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls).toHaveLength(1);

      const queryInput = calls[0].args[0].input;
      expect(queryInput.TableName).toBe(TABLE_NAME);
      expect(queryInput.KeyConditionExpression).toContain('PK = :pk');
      expect(queryInput.KeyConditionExpression).toContain('begins_with(SK, :skPrefix)');
      expect(queryInput.ExpressionAttributeValues).toMatchObject({
        ':pk': 'ACCOUNT#acct-123',
        ':skPrefix': 'EXP#',
        ':expenseId': 'MOCK_ULID_01',
      });
      // Since expenseId is at the end of SK (EXP#date#expenseId), we use a FilterExpression
      expect(queryInput.FilterExpression).toContain('expenseId = :expenseId');
    });

    it('returns the expense when found', async () => {
      const expense = makeSampleExpense();
      ddbMock.on(QueryCommand).resolves({
        Items: [makeDynamoItem(expense)],
      });

      const result = await repo.getExpense('acct-123', 'MOCK_ULID_01');
      expect(result).toEqual(expense);
    });

    it('returns null when not found', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
      });

      const result = await repo.getExpense('acct-123', 'nonexistent-id');
      expect(result).toBeNull();
    });

    it('returns null when Items is undefined', async () => {
      ddbMock.on(QueryCommand).resolves({});

      const result = await repo.getExpense('acct-123', 'nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('listExpenses', () => {
    it('queries PK=ACCOUNT#accountId, SK begins_with EXP#', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await repo.listExpenses('acct-123');

      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls).toHaveLength(1);

      const queryInput = calls[0].args[0].input;
      expect(queryInput.TableName).toBe(TABLE_NAME);
      expect(queryInput.KeyConditionExpression).toContain('PK = :pk');
      expect(queryInput.KeyConditionExpression).toContain('begins_with(SK, :skPrefix)');
      expect(queryInput.ExpressionAttributeValues).toMatchObject({
        ':pk': 'ACCOUNT#acct-123',
        ':skPrefix': 'EXP#',
      });
    });

    it('uses ScanIndexForward: false for reverse chronological order', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await repo.listExpenses('acct-123');

      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.ScanIndexForward).toBe(false);
    });

    it('returns expenses mapped from DynamoDB items', async () => {
      const expense1 = makeSampleExpense({ date: '2025-03-15', expenseId: 'EXP_A' });
      const expense2 = makeSampleExpense({ date: '2025-03-14', expenseId: 'EXP_B' });

      ddbMock.on(QueryCommand).resolves({
        Items: [makeDynamoItem(expense1), makeDynamoItem(expense2)],
      });

      const result = await repo.listExpenses('acct-123');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expense1);
      expect(result[1]).toEqual(expense2);
    });

    it('returns empty array when no expenses exist', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const result = await repo.listExpenses('acct-123');
      expect(result).toEqual([]);
    });
  });

  describe('listExpensesByCategory', () => {
    it('queries GSI1 with correct key conditions', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const category: AbleCategory = 'Education';
      await repo.listExpensesByCategory('acct-123', category);

      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls).toHaveLength(1);

      const queryInput = calls[0].args[0].input;
      expect(queryInput.TableName).toBe(TABLE_NAME);
      expect(queryInput.IndexName).toBe('GSI1');
      expect(queryInput.KeyConditionExpression).toContain('GSI1PK = :gsi1pk');
      expect(queryInput.KeyConditionExpression).toContain('begins_with(GSI1SK, :gsi1skPrefix)');
      expect(queryInput.ExpressionAttributeValues).toMatchObject({
        ':gsi1pk': 'ACCOUNT#acct-123',
        ':gsi1skPrefix': 'CAT#Education#',
      });
    });

    it('returns expenses filtered by category', async () => {
      const expense = makeSampleExpense({ category: 'Education' });
      ddbMock.on(QueryCommand).resolves({
        Items: [makeDynamoItem(expense)],
      });

      const result = await repo.listExpensesByCategory('acct-123', 'Education');
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('Education');
    });

    it('uses ScanIndexForward: false for reverse chronological order', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await repo.listExpensesByCategory('acct-123', 'Housing');

      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.ScanIndexForward).toBe(false);
    });
  });

  describe('listExpensesByReimbursementStatus', () => {
    it('queries GSI2 for unreimbursed expenses', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await repo.listExpensesByReimbursementStatus('acct-123', 'user-alice', false);

      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls).toHaveLength(1);

      const queryInput = calls[0].args[0].input;
      expect(queryInput.TableName).toBe(TABLE_NAME);
      expect(queryInput.IndexName).toBe('GSI2');
      expect(queryInput.KeyConditionExpression).toContain('GSI2PK = :gsi2pk');
      expect(queryInput.KeyConditionExpression).toContain('begins_with(GSI2SK, :gsi2skPrefix)');
      expect(queryInput.ExpressionAttributeValues).toMatchObject({
        ':gsi2pk': 'ACCOUNT#acct-123',
        ':gsi2skPrefix': 'PAID#user-alice#0#',
      });
    });

    it('queries GSI2 for reimbursed expenses', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await repo.listExpensesByReimbursementStatus('acct-123', 'user-alice', true);

      const calls = ddbMock.commandCalls(QueryCommand);
      const queryInput = calls[0].args[0].input;
      expect(queryInput.ExpressionAttributeValues).toMatchObject({
        ':gsi2pk': 'ACCOUNT#acct-123',
        ':gsi2skPrefix': 'PAID#user-alice#1#',
      });
    });

    it('returns matching expenses', async () => {
      const expense = makeSampleExpense({ paidBy: 'user-alice', reimbursed: false });
      ddbMock.on(QueryCommand).resolves({
        Items: [makeDynamoItem(expense)],
      });

      const result = await repo.listExpensesByReimbursementStatus('acct-123', 'user-alice', false);
      expect(result).toHaveLength(1);
      expect(result[0].paidBy).toBe('user-alice');
      expect(result[0].reimbursed).toBe(false);
    });

    it('uses ScanIndexForward: false for reverse chronological order', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await repo.listExpensesByReimbursementStatus('acct-123', 'user-bob', true);

      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls[0].args[0].input.ScanIndexForward).toBe(false);
    });
  });

  describe('markReimbursed', () => {
    it('sends UpdateCommand with correct key and update expression', async () => {
      const updatedExpense = makeSampleExpense({
        reimbursed: true,
        reimbursedAt: '2025-03-15T10:00:00.000Z',
        updatedAt: '2025-03-15T10:00:00.000Z',
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: makeDynamoItem(updatedExpense),
      });

      await repo.markReimbursed('acct-123', 'MOCK_ULID_01', 'EXP#2025-03-15#MOCK_ULID_01');

      const calls = ddbMock.commandCalls(UpdateCommand);
      expect(calls).toHaveLength(1);

      const updateInput = calls[0].args[0].input;
      expect(updateInput.TableName).toBe(TABLE_NAME);
      expect(updateInput.Key).toEqual({
        PK: 'ACCOUNT#acct-123',
        SK: 'EXP#2025-03-15#MOCK_ULID_01',
      });
    });

    it('sets reimbursed=true, reimbursedAt, and updatedAt', async () => {
      const updatedExpense = makeSampleExpense({
        reimbursed: true,
        reimbursedAt: '2025-03-15T10:00:00.000Z',
        updatedAt: '2025-03-15T10:00:00.000Z',
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: makeDynamoItem(updatedExpense),
      });

      await repo.markReimbursed('acct-123', 'MOCK_ULID_01', 'EXP#2025-03-15#MOCK_ULID_01');

      const calls = ddbMock.commandCalls(UpdateCommand);
      const updateInput = calls[0].args[0].input;

      expect(updateInput.UpdateExpression).toContain('reimbursed');
      expect(updateInput.UpdateExpression).toContain('reimbursedAt');
      expect(updateInput.UpdateExpression).toContain('updatedAt');
      expect(updateInput.ExpressionAttributeValues).toMatchObject({
        ':reimbursed': true,
        ':reimbursedAt': '2025-03-15T10:00:00.000Z',
        ':updatedAt': '2025-03-15T10:00:00.000Z',
      });
    });

    it('also updates the GSI2SK to reflect reimbursement status', async () => {
      const updatedExpense = makeSampleExpense({
        reimbursed: true,
        reimbursedAt: '2025-03-15T10:00:00.000Z',
        updatedAt: '2025-03-15T10:00:00.000Z',
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: makeDynamoItem(updatedExpense),
      });

      await repo.markReimbursed('acct-123', 'MOCK_ULID_01', 'EXP#2025-03-15#MOCK_ULID_01');

      const calls = ddbMock.commandCalls(UpdateCommand);
      const updateInput = calls[0].args[0].input;

      // GSI2SK must be updated so the GSI2 index reflects the new reimbursement status
      // We use an expression attribute name (#gsi2sk) since GSI2SK could be reserved
      expect(updateInput.UpdateExpression).toContain('#gsi2sk');
      expect(updateInput.ExpressionAttributeNames?.['#gsi2sk']).toBe('GSI2SK');
    });

    it('returns the updated expense', async () => {
      const updatedExpense = makeSampleExpense({
        reimbursed: true,
        reimbursedAt: '2025-03-15T10:00:00.000Z',
        updatedAt: '2025-03-15T10:00:00.000Z',
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: makeDynamoItem(updatedExpense),
      });

      const result = await repo.markReimbursed('acct-123', 'MOCK_ULID_01', 'EXP#2025-03-15#MOCK_ULID_01');
      expect(result.reimbursed).toBe(true);
      expect(result.reimbursedAt).toBe('2025-03-15T10:00:00.000Z');
    });

    it('uses ReturnValues ALL_NEW', async () => {
      const updatedExpense = makeSampleExpense({
        reimbursed: true,
        reimbursedAt: '2025-03-15T10:00:00.000Z',
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: makeDynamoItem(updatedExpense),
      });

      await repo.markReimbursed('acct-123', 'MOCK_ULID_01', 'EXP#2025-03-15#MOCK_ULID_01');

      const calls = ddbMock.commandCalls(UpdateCommand);
      expect(calls[0].args[0].input.ReturnValues).toBe('ALL_NEW');
    });
  });

  describe('deleteExpense', () => {
    it('sends DeleteCommand with correct PK and SK', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      const sk = 'EXP#2025-03-15#MOCK_ULID_01';
      await repo.deleteExpense('acct-123', sk);

      const calls = ddbMock.commandCalls(DeleteCommand);
      expect(calls).toHaveLength(1);

      const deleteInput = calls[0].args[0].input;
      expect(deleteInput.TableName).toBe(TABLE_NAME);
      expect(deleteInput.Key).toEqual({
        PK: 'ACCOUNT#acct-123',
        SK: 'EXP#2025-03-15#MOCK_ULID_01',
      });
    });

    it('resolves without returning a value', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      const result = await repo.deleteExpense('acct-123', 'EXP#2025-03-15#MOCK_ULID_01');
      expect(result).toBeUndefined();
    });
  });
});
