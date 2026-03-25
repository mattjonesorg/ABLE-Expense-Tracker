import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import type { Account, AccountType } from './types.js';

/** Key attributes stored on DynamoDB items but not part of the Account domain model. */
const KEY_ATTRIBUTES = ['PK', 'SK'] as const;

/**
 * Strip DynamoDB key attributes from a raw item and return a clean Account object.
 */
function itemToAccount(item: Record<string, unknown>): Account {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (!(KEY_ATTRIBUTES as readonly string[]).includes(key)) {
      clean[key] = value;
    }
  }
  return clean as unknown as Account;
}

export interface CreateAccountInput {
  beneficiaryName: string;
  createdBy: string;
  accountType?: AccountType;
}

/**
 * Repository for ABLE Tracker account metadata stored in a DynamoDB single-table design.
 *
 * Key schema:
 * - PK: ACCOUNT#<accountId>
 * - SK: META
 */
export class AccountRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  /**
   * Create a new account. Generates a ULID for the account ID.
   * Defaults accountType to 'live' if not specified.
   */
  async createAccount(input: CreateAccountInput): Promise<Account> {
    const id = ulid();
    const now = new Date().toISOString();
    const accountType: AccountType = input.accountType ?? 'live';

    const account: Account = {
      id,
      beneficiaryName: input.beneficiaryName,
      accountType,
      createdAt: now,
      createdBy: input.createdBy,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `ACCOUNT#${id}`,
          SK: 'META',
          ...account,
        },
      }),
    );

    return account;
  }

  /**
   * Get an account by ID. Returns null if not found.
   */
  async getAccount(accountId: string): Promise<Account | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `ACCOUNT#${accountId}`,
          SK: 'META',
        },
      }),
    );

    if (!result.Item) {
      return null;
    }

    return itemToAccount(result.Item as Record<string, unknown>);
  }

  /**
   * Delete an account's META item.
   */
  async deleteAccount(accountId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `ACCOUNT#${accountId}`,
          SK: 'META',
        },
      }),
    );
  }
}
