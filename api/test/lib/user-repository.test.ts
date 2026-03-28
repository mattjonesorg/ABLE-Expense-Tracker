import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { UserRepository } from '../../src/lib/user-repository.js';
import type { User } from '../../src/lib/types.js';

// Mock ulid to return a deterministic value
vi.mock('ulid', () => ({
  ulid: () => 'MOCK_USER_ULID_01',
}));

const TABLE_NAME = 'able-tracker-test';
const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'));
});

function makeStoredUser(overrides: Partial<User> = {}): Record<string, unknown> {
  const user: User = {
    userId: 'MOCK_USER_ULID_01',
    accountId: 'acct-123',
    email: 'alice@example.com',
    displayName: 'Alice Smith',
    role: 'owner',
    cognitoSub: 'cognito-sub-abc',
    ...overrides,
  };
  return {
    PK: `ACCOUNT#${user.accountId}`,
    SK: `USER#${user.userId}`,
    ...user,
  };
}

describe('UserRepository', () => {
  describe('createUser', () => {
    it('stores user with correct PK=ACCOUNT#<accountId> and SK=USER#<userId>', async () => {
      ddbMock.on(PutCommand).resolves({});

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      await repo.createUser({
        accountId: 'acct-123',
        email: 'alice@example.com',
        displayName: 'Alice Smith',
        role: 'owner',
        cognitoSub: 'cognito-sub-abc',
      });

      const putCall = ddbMock.commandCalls(PutCommand)[0];
      const item = putCall.args[0].input.Item;
      expect(item!['PK']).toBe('ACCOUNT#acct-123');
      expect(item!['SK']).toBe('USER#MOCK_USER_ULID_01');
    });

    it('generates a ULID for userId', async () => {
      ddbMock.on(PutCommand).resolves({});

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const user = await repo.createUser({
        accountId: 'acct-123',
        email: 'alice@example.com',
        displayName: 'Alice Smith',
        role: 'owner',
        cognitoSub: 'cognito-sub-abc',
      });

      expect(user.userId).toBe('MOCK_USER_ULID_01');
    });

    it('returns a complete User object', async () => {
      ddbMock.on(PutCommand).resolves({});

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const user = await repo.createUser({
        accountId: 'acct-123',
        email: 'alice@example.com',
        displayName: 'Alice Smith',
        role: 'owner',
        cognitoSub: 'cognito-sub-abc',
      });

      expect(user).toEqual({
        userId: 'MOCK_USER_ULID_01',
        accountId: 'acct-123',
        email: 'alice@example.com',
        displayName: 'Alice Smith',
        role: 'owner',
        cognitoSub: 'cognito-sub-abc',
      });
    });

    it('uses the correct table name', async () => {
      ddbMock.on(PutCommand).resolves({});

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      await repo.createUser({
        accountId: 'acct-123',
        email: 'alice@example.com',
        displayName: 'Alice Smith',
        role: 'owner',
        cognitoSub: 'cognito-sub-abc',
      });

      const putCall = ddbMock.commandCalls(PutCommand)[0];
      expect(putCall.args[0].input.TableName).toBe(TABLE_NAME);
    });
  });

  describe('getUser', () => {
    it('returns user when found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: makeStoredUser() });

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const user = await repo.getUser('acct-123', 'MOCK_USER_ULID_01');

      expect(user).not.toBeNull();
      expect(user!.userId).toBe('MOCK_USER_ULID_01');
      expect(user!.email).toBe('alice@example.com');
    });

    it('returns null when user not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const user = await repo.getUser('acct-123', 'nonexistent');

      expect(user).toBeNull();
    });

    it('queries with correct PK and SK', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      await repo.getUser('acct-456', 'user-789');

      const getCall = ddbMock.commandCalls(GetCommand)[0];
      expect(getCall.args[0].input.Key).toEqual({
        PK: 'ACCOUNT#acct-456',
        SK: 'USER#user-789',
      });
    });

    it('strips key attributes from returned user', async () => {
      ddbMock.on(GetCommand).resolves({ Item: makeStoredUser() });

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const user = await repo.getUser('acct-123', 'MOCK_USER_ULID_01');

      expect((user as Record<string, unknown>)['PK']).toBeUndefined();
      expect((user as Record<string, unknown>)['SK']).toBeUndefined();
    });
  });

  describe('listUsers', () => {
    it('returns all users for an account', async () => {
      const user1 = makeStoredUser({ userId: 'user-1', email: 'alice@example.com' });
      const user2 = makeStoredUser({ userId: 'user-2', email: 'bob@example.com', role: 'authorized_rep' });

      ddbMock.on(QueryCommand).resolves({ Items: [user1, user2] });

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const users = await repo.listUsers('acct-123');

      expect(users).toHaveLength(2);
      expect(users[0].email).toBe('alice@example.com');
      expect(users[1].email).toBe('bob@example.com');
    });

    it('returns empty array for account with no users', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const users = await repo.listUsers('acct-empty');

      expect(users).toEqual([]);
    });

    it('queries with correct PK and SK prefix', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      await repo.listUsers('acct-123');

      const queryCall = ddbMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.KeyConditionExpression).toBe(
        'PK = :pk AND begins_with(SK, :skPrefix)',
      );
      expect(queryCall.args[0].input.ExpressionAttributeValues).toEqual({
        ':pk': 'ACCOUNT#acct-123',
        ':skPrefix': 'USER#',
      });
    });

    it('strips key attributes from returned users', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [makeStoredUser()] });

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      const users = await repo.listUsers('acct-123');

      expect((users[0] as Record<string, unknown>)['PK']).toBeUndefined();
      expect((users[0] as Record<string, unknown>)['SK']).toBeUndefined();
    });
  });

  describe('deleteUser', () => {
    it('deletes user with correct PK and SK', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      await repo.deleteUser('acct-123', 'user-456');

      const deleteCall = ddbMock.commandCalls(DeleteCommand)[0];
      expect(deleteCall.args[0].input.Key).toEqual({
        PK: 'ACCOUNT#acct-123',
        SK: 'USER#user-456',
      });
    });
  });

  describe('deleteAllUsers', () => {
    it('queries all users then batch-deletes them', async () => {
      const user1 = makeStoredUser({ userId: 'user-1' });
      const user2 = makeStoredUser({ userId: 'user-2' });

      ddbMock.on(QueryCommand).resolves({ Items: [user1, user2] });
      ddbMock.on(BatchWriteCommand).resolves({});

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      await repo.deleteAllUsers('acct-123');

      const batchCall = ddbMock.commandCalls(BatchWriteCommand)[0];
      const requests = batchCall.args[0].input.RequestItems![TABLE_NAME];
      expect(requests).toHaveLength(2);
      expect(requests![0].DeleteRequest!.Key).toEqual({
        PK: 'ACCOUNT#acct-123',
        SK: 'USER#user-1',
      });
      expect(requests![1].DeleteRequest!.Key).toEqual({
        PK: 'ACCOUNT#acct-123',
        SK: 'USER#user-2',
      });
    });

    it('does nothing when no users exist', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const repo = new UserRepository(ddbMock as unknown as DynamoDBDocumentClient, TABLE_NAME);
      await repo.deleteAllUsers('acct-empty');

      expect(ddbMock.commandCalls(BatchWriteCommand)).toHaveLength(0);
    });
  });
});
