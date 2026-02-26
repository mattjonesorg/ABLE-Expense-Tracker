import { describe, it, expect, beforeAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DataStack } from '../lib/data-stack';

describe('DataStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new DataStack(app, 'TestDataStack');
    template = Template.fromStack(stack);
  });

  describe('DynamoDB Table', () => {
    it('creates a DynamoDB table with partition key PK (string) and sort key SK (string)', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: Match.arrayWith([
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ]),
      });
    });

    it('uses PAY_PER_REQUEST billing mode', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    it('enables point-in-time recovery', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });

    it('creates GSI1 with partition key GSI1PK (string) and sort key GSI1SK (string) with ALL projection', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: 'GSI1',
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          }),
        ]),
      });
    });

    it('creates GSI2 with partition key GSI2PK (string) and sort key GSI2SK (string) with ALL projection', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: 'GSI2',
            KeySchema: [
              { AttributeName: 'GSI2PK', KeyType: 'HASH' },
              { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          }),
        ]),
      });
    });

    it('defines attribute definitions for all GSI keys', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        AttributeDefinitions: Match.arrayWith([
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
          { AttributeName: 'GSI2PK', AttributeType: 'S' },
          { AttributeName: 'GSI2SK', AttributeType: 'S' },
        ]),
      });
    });
  });

  describe('S3 Bucket', () => {
    it('creates an S3 bucket with BlockPublicAccess.BLOCK_ALL', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    it('enables versioning', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    });

    it('uses S3-managed encryption', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        },
      });
    });
  });

  describe('Stack Outputs', () => {
    it('outputs the table name', () => {
      template.hasOutput('TableName', {
        Value: Match.anyValue(),
      });
    });

    it('outputs the table ARN', () => {
      template.hasOutput('TableArn', {
        Value: Match.anyValue(),
      });
    });

    it('outputs the bucket name', () => {
      template.hasOutput('BucketName', {
        Value: Match.anyValue(),
      });
    });

    it('outputs the bucket ARN', () => {
      template.hasOutput('BucketArn', {
        Value: Match.anyValue(),
      });
    });
  });

  describe('Stack Properties', () => {
    it('exposes the table as a public readonly property', () => {
      const app = new cdk.App();
      const stack = new DataStack(app, 'TestPropsStack');
      expect(stack.table).toBeDefined();
      expect(stack.table.tableName).toBeDefined();
    });

    it('exposes the bucket as a public readonly property', () => {
      const app = new cdk.App();
      const stack = new DataStack(app, 'TestPropsStack2');
      expect(stack.bucket).toBeDefined();
      expect(stack.bucket.bucketName).toBeDefined();
    });
  });
});
