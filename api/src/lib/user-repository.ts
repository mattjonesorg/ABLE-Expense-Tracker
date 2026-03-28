import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import type { User } from './types.js';
import { stripDynamoKeys } from './dynamo-utils.js';

export interface CreateUserInput {
  accountId: string;
  email: string;
  displayName: string;
  role: 'owner' | 'authorized_rep';
  cognitoSub: string;
}

/**
 * Repository for ABLE Tracker user items stored in a DynamoDB single-table design.
 *
 * Key schema:
 * - PK: ACCOUNT#<accountId>
 * - SK: USER#<userId>
 */
export class UserRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  /**
   * Create a new user. Generates a ULID for the user ID.
   */
  async createUser(input: CreateUserInput): Promise<User> {
    const userId = ulid();

    const user: User = {
      userId,
      accountId: input.accountId,
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      cognitoSub: input.cognitoSub,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `ACCOUNT#${input.accountId}`,
          SK: `USER#${userId}`,
          ...user,
        },
      }),
    );

    return user;
  }

  /**
   * Get a user by accountId and userId. Returns null if not found.
   */
  async getUser(accountId: string, userId: string): Promise<User | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `ACCOUNT#${accountId}`,
          SK: `USER#${userId}`,
        },
      }),
    );

    if (!result.Item) {
      return null;
    }

    return stripDynamoKeys<User>(result.Item as Record<string, unknown>, ['PK', 'SK']);
  }

  /**
   * List all users for an account.
   */
  async listUsers(accountId: string): Promise<User[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `ACCOUNT#${accountId}`,
          ':skPrefix': 'USER#',
        },
      }),
    );

    const items = result.Items ?? [];
    return items.map((item) => stripDynamoKeys<User>(item as Record<string, unknown>, ['PK', 'SK']));
  }

  /**
   * Delete a single user.
   */
  async deleteUser(accountId: string, userId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `ACCOUNT#${accountId}`,
          SK: `USER#${userId}`,
        },
      }),
    );
  }

  /**
   * Delete all users for an account. Queries first, then batch-deletes.
   */
  async deleteAllUsers(accountId: string): Promise<void> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `ACCOUNT#${accountId}`,
          ':skPrefix': 'USER#',
        },
      }),
    );

    const items = result.Items ?? [];
    if (items.length === 0) {
      return;
    }

    await this.client.send(
      new BatchWriteCommand({
        RequestItems: {
          [this.tableName]: items.map((item) => ({
            DeleteRequest: {
              Key: {
                PK: `ACCOUNT#${accountId}`,
                SK: (item as Record<string, unknown>)['SK'] as string,
              },
            },
          })),
        },
      }),
    );
  }
}
