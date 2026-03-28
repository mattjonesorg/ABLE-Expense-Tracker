import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { AccountRepository } from '../../src/lib/account-repository.js';
import type { Account, AccountType } from '../../src/lib/types.js';

// Mock ulid to return a deterministic value
vi.mock('ulid', () => ({
  ulid: () => 'MOCK_ACCT_ULID_01',
}));

const TABLE_NAME = 'able-tracker-test';
const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'));
});

describe('AccountRepository', () => {
  describe('createAccount', () => {
    it('stores account with correct PK=ACCOUNT#<id> and SK=META', async () => {
      ddbMock.on(PutCommand).resolves({});

      const repo = new AccountRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      await repo.createAccount({
        beneficiaryName: 'Jane Doe',
        createdBy: 'user-admin',
      });

      const putCall = ddbMock.commandCalls(PutCommand)[0];
      const item = putCall.args[0].input.Item;
      expect(item).toBeDefined();
      expect(item!['PK']).toBe('ACCOUNT#MOCK_ACCT_ULID_01');
      expect(item!['SK']).toBe('META');
    });

    it('defaults accountType to "live" when not specified', async () => {
      ddbMock.on(PutCommand).resolves({});

      const repo = new AccountRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const account = await repo.createAccount({
        beneficiaryName: 'Jane Doe',
        createdBy: 'user-admin',
      });

      expect(account.accountType).toBe('live');

      const putCall = ddbMock.commandCalls(PutCommand)[0];
      const item = putCall.args[0].input.Item;
      expect(item!['accountType']).toBe('live');
    });

    it('stores accountType as "test" when specified', async () => {
      ddbMock.on(PutCommand).resolves({});

      const repo = new AccountRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const account = await repo.createAccount({
        beneficiaryName: 'Test Beneficiary',
        createdBy: 'user-admin',
        accountType: 'test',
      });

      expect(account.accountType).toBe('test');

      const putCall = ddbMock.commandCalls(PutCommand)[0];
      const item = putCall.args[0].input.Item;
      expect(item!['accountType']).toBe('test');
    });

    it('generates a ULID for the account id', async () => {
      ddbMock.on(PutCommand).resolves({});

      const repo = new AccountRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const account = await repo.createAccount({
        beneficiaryName: 'Jane Doe',
        createdBy: 'user-admin',
      });

      expect(account.id).toBe('MOCK_ACCT_ULID_01');
    });

    it('sets createdAt to current ISO timestamp', async () => {
      ddbMock.on(PutCommand).resolves({});

      const repo = new AccountRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const account = await repo.createAccount({
        beneficiaryName: 'Jane Doe',
        createdBy: 'user-admin',
      });

      expect(account.createdAt).toBe('2025-03-15T10:00:00.000Z');
    });

    it('returns a complete Account object', async () => {
      ddbMock.on(PutCommand).resolves({});

      const repo = new AccountRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const account = await repo.createAccount({
        beneficiaryName: 'Jane Doe',
        createdBy: 'user-admin',
        accountType: 'test',
      });

      expect(account).toEqual({
        id: 'MOCK_ACCT_ULID_01',
        beneficiaryName: 'Jane Doe',
        accountType: 'test',
        createdAt: '2025-03-15T10:00:00.000Z',
        createdBy: 'user-admin',
      });
    });

    it('uses the correct table name', async () => {
      ddbMock.on(PutCommand).resolves({});

      const repo = new AccountRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      await repo.createAccount({
        beneficiaryName: 'Jane Doe',
        createdBy: 'user-admin',
      });

      const putCall = ddbMock.commandCalls(PutCommand)[0];
      expect(putCall.args[0].input.TableName).toBe(TABLE_NAME);
    });
  });

  describe('getAccount', () => {
    it('returns account when found', async () => {
      const storedItem = {
        PK: 'ACCOUNT#acct-123',
        SK: 'META',
        id: 'acct-123',
        beneficiaryName: 'Jane Doe',
        accountType: 'live' as AccountType,
        createdAt: '2025-03-15T10:00:00.000Z',
        createdBy: 'user-admin',
      };

      ddbMock.on(GetCommand).resolves({ Item: storedItem });

      const repo = new AccountRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const account = await repo.getAccount('acct-123');

      expect(account).not.toBeNull();
      expect(account!.id).toBe('acct-123');
      expect(account!.beneficiaryName).toBe('Jane Doe');
      expect(account!.accountType).toBe('live');
      expect(account!.createdBy).toBe('user-admin');
    });

    it('returns null when account not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const repo = new AccountRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const account = await repo.getAccount('nonexistent');

      expect(account).toBeNull();
    });

    it('queries with correct PK and SK', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const repo = new AccountRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      await repo.getAccount('acct-456');

      const getCall = ddbMock.commandCalls(GetCommand)[0];
      expect(getCall.args[0].input.Key).toEqual({
        PK: 'ACCOUNT#acct-456',
        SK: 'META',
      });
    });

    it('strips key attributes from returned account', async () => {
      const storedItem = {
        PK: 'ACCOUNT#acct-123',
        SK: 'META',
        id: 'acct-123',
        beneficiaryName: 'Jane Doe',
        accountType: 'test' as AccountType,
        createdAt: '2025-03-15T10:00:00.000Z',
        createdBy: 'user-admin',
      };

      ddbMock.on(GetCommand).resolves({ Item: storedItem });

      const repo = new AccountRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const account = await repo.getAccount('acct-123');

      expect(account).not.toBeNull();
      // Should not have PK/SK keys
      expect((account as Record<string, unknown>)['PK']).toBeUndefined();
      expect((account as Record<string, unknown>)['SK']).toBeUndefined();
    });

    it('returns accountType field', async () => {
      const storedItem = {
        PK: 'ACCOUNT#acct-123',
        SK: 'META',
        id: 'acct-123',
        beneficiaryName: 'Test Account',
        accountType: 'test' as AccountType,
        createdAt: '2025-03-15T10:00:00.000Z',
        createdBy: 'user-admin',
      };

      ddbMock.on(GetCommand).resolves({ Item: storedItem });

      const repo = new AccountRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const account = await repo.getAccount('acct-123');

      expect(account!.accountType).toBe('test');
    });
  });

  describe('deleteAccount', () => {
    it('deletes account with correct PK and SK', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      const repo = new AccountRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      await repo.deleteAccount('acct-789');

      const deleteCall = ddbMock.commandCalls(DeleteCommand)[0];
      expect(deleteCall.args[0].input.Key).toEqual({
        PK: 'ACCOUNT#acct-789',
        SK: 'META',
      });
      expect(deleteCall.args[0].input.TableName).toBe(TABLE_NAME);
    });
  });
});
