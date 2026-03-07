import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Template } from 'aws-cdk-lib/assertions';
import { AuthStack } from '../lib/auth-stack.js';
import { DataStack } from '../lib/data-stack.js';
import { ApiStack } from '../lib/api-stack.js';
import { EphemeralHostingStack } from '../lib/ephemeral-hosting-stack.js';

describe('Ephemeral App (parameterized stacks)', () => {
  const ENV_PREFIX = 'PR-42';

  describe('Stack IDs include prefix', () => {
    it('creates stacks with prefixed IDs', () => {
      const app = new cdk.App({
        context: { envPrefix: ENV_PREFIX, ephemeral: 'true' },
      });

      const auth = new AuthStack(app, `AbleTracker-${ENV_PREFIX}-Auth`, {
        ephemeral: true,
      });
      const data = new DataStack(app, `AbleTracker-${ENV_PREFIX}-Data`, {
        ephemeral: true,
      });
      const api = new ApiStack(app, `AbleTracker-${ENV_PREFIX}-Api`, {
        userPool: auth.userPool,
        userPoolClient: auth.userPoolClient,
        table: data.table,
        bucket: data.bucket,
        envPrefix: ENV_PREFIX,
      });
      const hosting = new EphemeralHostingStack(
        app,
        `AbleTracker-${ENV_PREFIX}-Hosting`,
        { envPrefix: ENV_PREFIX },
      );

      expect(auth.stackName).toContain(ENV_PREFIX);
      expect(data.stackName).toContain(ENV_PREFIX);
      expect(api.stackName).toContain(ENV_PREFIX);
      expect(hosting.stackName).toContain(ENV_PREFIX);
    });
  });

  describe('Ephemeral AuthStack', () => {
    it('sets DESTROY removal policy on UserPool when ephemeral', () => {
      const app = new cdk.App();
      const stack = new AuthStack(app, 'TestEphAuth', { ephemeral: true });
      const template = Template.fromStack(stack);

      const pools = template.findResources('AWS::Cognito::UserPool');
      const poolKeys = Object.keys(pools);
      expect(poolKeys.length).toBe(1);
      expect(pools[poolKeys[0]].DeletionPolicy).toBe('Delete');
    });

    it('keeps RETAIN removal policy on UserPool when not ephemeral', () => {
      const app = new cdk.App();
      const stack = new AuthStack(app, 'TestProdAuth');
      const template = Template.fromStack(stack);

      const pools = template.findResources('AWS::Cognito::UserPool');
      const poolKeys = Object.keys(pools);
      expect(poolKeys.length).toBe(1);
      expect(pools[poolKeys[0]].DeletionPolicy).toBe('Retain');
    });
  });

  describe('Ephemeral DataStack', () => {
    it('sets DESTROY removal policy on DynamoDB table when ephemeral', () => {
      const app = new cdk.App();
      const stack = new DataStack(app, 'TestEphData', { ephemeral: true });
      const template = Template.fromStack(stack);

      const tables = template.findResources('AWS::DynamoDB::Table');
      const tableKeys = Object.keys(tables);
      expect(tableKeys.length).toBe(1);
      expect(tables[tableKeys[0]].DeletionPolicy).toBe('Delete');
    });

    it('sets DESTROY removal policy on S3 bucket and enables autoDeleteObjects when ephemeral', () => {
      const app = new cdk.App();
      const stack = new DataStack(app, 'TestEphData2', { ephemeral: true });
      const template = Template.fromStack(stack);

      const buckets = template.findResources('AWS::S3::Bucket');
      const bucketKeys = Object.keys(buckets);
      expect(bucketKeys.length).toBeGreaterThanOrEqual(1);

      const receiptBucket = bucketKeys.find(
        (key) =>
          buckets[key].Properties?.VersioningConfiguration?.Status ===
          'Enabled',
      );
      expect(receiptBucket).toBeDefined();
      expect(buckets[receiptBucket!].DeletionPolicy).toBe('Delete');

      template.resourceCountIs('Custom::S3AutoDeleteObjects', 1);
    });

    it('keeps RETAIN removal policy on table and bucket when not ephemeral', () => {
      const app = new cdk.App();
      const stack = new DataStack(app, 'TestProdData');
      const template = Template.fromStack(stack);

      const tables = template.findResources('AWS::DynamoDB::Table');
      const tableKeys = Object.keys(tables);
      expect(tables[tableKeys[0]].DeletionPolicy).toBe('Retain');

      const buckets = template.findResources('AWS::S3::Bucket');
      const bucketKeys = Object.keys(buckets);
      const receiptBucket = bucketKeys.find(
        (key) =>
          buckets[key].Properties?.VersioningConfiguration?.Status ===
          'Enabled',
      );
      expect(receiptBucket).toBeDefined();
      expect(buckets[receiptBucket!].DeletionPolicy).toBe('Retain');
    });
  });

  describe('Ephemeral ApiStack', () => {
    it('prefixes API name and log group when envPrefix is provided', () => {
      const app = new cdk.App();
      const depStack = new cdk.Stack(app, 'Deps');
      const deps = createApiDeps(depStack);

      const stack = new ApiStack(app, 'TestEphApi', {
        ...deps,
        envPrefix: ENV_PREFIX,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        Name: `AbleTrackerApi-${ENV_PREFIX}`,
      });

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: `/aws/apigateway/AbleTrackerApi-${ENV_PREFIX}-access-logs`,
      });
    });

    it('uses default names when envPrefix is not provided', () => {
      const app = new cdk.App();
      const depStack = new cdk.Stack(app, 'Deps2');
      const deps = createApiDeps(depStack);

      const stack = new ApiStack(app, 'TestProdApi', deps);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        Name: 'AbleTrackerApi',
      });

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/apigateway/AbleTrackerApi-access-logs',
      });
    });

    it('prefixes alarm names when envPrefix is provided', () => {
      const app = new cdk.App();
      const depStack = new cdk.Stack(app, 'Deps3');
      const deps = createApiDeps(depStack);

      const stack = new ApiStack(app, 'TestEphApi2', {
        ...deps,
        envPrefix: ENV_PREFIX,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: `AbleTrackerApi-${ENV_PREFIX}-5xx-errors`,
      });

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: `AbleTrackerApi-${ENV_PREFIX}-categorize-p99-latency`,
      });
    });
  });

  describe('Regression: existing stacks without envPrefix', () => {
    it('AuthStack, DataStack, ApiStack still work without ephemeral props', () => {
      const app = new cdk.App();
      expect(() => new AuthStack(app, 'RegAuth')).not.toThrow();
      expect(() => new DataStack(app, 'RegData')).not.toThrow();

      const depStack = new cdk.Stack(app, 'RegDeps');
      const deps = createApiDeps(depStack);
      expect(
        () => new ApiStack(app, 'RegApi', deps),
      ).not.toThrow();
    });
  });
});

function createApiDeps(stack: cdk.Stack) {
  const userPool = new cognito.UserPool(stack, 'Pool');
  const userPoolClient = userPool.addClient('Client');
  const table = new dynamodb.Table(stack, 'Table', {
    partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
    sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  });
  const bucket = new s3.Bucket(stack, 'Bucket');
  return { userPool, userPoolClient, table, bucket };
}
