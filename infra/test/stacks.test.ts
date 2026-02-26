import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { AuthStack } from '../lib/auth-stack.js';
import { DataStack } from '../lib/data-stack.js';
import { ApiStack } from '../lib/api-stack.js';
import { HostingStack } from '../lib/hosting-stack.js';

describe('CDK Stacks', () => {
  it('should instantiate all placeholder stacks without errors', () => {
    const app = new cdk.App();
    expect(() => new AuthStack(app, 'TestAuth')).not.toThrow();
    expect(() => new DataStack(app, 'TestData')).not.toThrow();

    // ApiStack requires cross-stack references
    const depStack = new cdk.Stack(app, 'TestDeps');
    const userPool = new cognito.UserPool(depStack, 'Pool');
    const table = new dynamodb.Table(depStack, 'Table', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    });
    const bucket = new s3.Bucket(depStack, 'Bucket');
    const userPoolClient = userPool.addClient('TestClient');
    expect(() => new ApiStack(app, 'TestApi', { userPool, userPoolClient, table, bucket })).not.toThrow();

    expect(() => new HostingStack(app, 'TestHosting')).not.toThrow();
  });
});
