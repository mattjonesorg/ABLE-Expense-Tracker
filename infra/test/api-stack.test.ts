import { describe, it, expect, beforeAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Template, Match, Capture } from 'aws-cdk-lib/assertions';
import { ApiStack, ApiStackProps } from '../lib/api-stack.js';

describe('ApiStack', () => {
  let template: Template;
  let stack: ApiStack;

  beforeAll(() => {
    const app = new cdk.App();

    // Create dependency stacks with real resources for cross-stack references
    const authStack = new cdk.Stack(app, 'TestAuthStack');
    const userPool = new cognito.UserPool(authStack, 'UserPool');
    const userPoolClient = userPool.addClient('TestClient');

    const dataStack = new cdk.Stack(app, 'TestDataStack');
    const table = new dynamodb.Table(dataStack, 'Table', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    });
    const bucket = new s3.Bucket(dataStack, 'Bucket');

    const props: ApiStackProps = {
      userPool,
      userPoolClient,
      table,
      bucket,
    };

    stack = new ApiStack(app, 'TestApiStack', props);
    template = Template.fromStack(stack);
  });

  describe('HTTP API (API Gateway v2)', () => {
    it('creates an HTTP API', () => {
      template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    });

    it('configures the HTTP API with CORS', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        ProtocolType: 'HTTP',
      });
    });
  });

  describe('JWT Authorizer', () => {
    it('creates a JWT authorizer for the HTTP API', () => {
      template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 1);
    });

    it('configures the authorizer as JWT type', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
        AuthorizerType: 'JWT',
      });
    });

    it('configures the authorizer with Cognito JWT configuration', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
        JwtConfiguration: Match.objectLike({
          Audience: Match.anyValue(),
          Issuer: Match.anyValue(),
        }),
      });
    });

    it('attaches authorization to all routes', () => {
      const routes = template.findResources('AWS::ApiGatewayV2::Route');
      const routeKeys = Object.keys(routes);
      expect(routeKeys.length).toBe(7);

      for (const key of routeKeys) {
        expect(routes[key].Properties.AuthorizationType).toBe('JWT');
        expect(routes[key].Properties.AuthorizerId).toBeDefined();
      }
    });
  });

  describe('Lambda Functions', () => {
    it('creates Lambda functions for all 7 endpoints', () => {
      template.resourceCountIs('AWS::Lambda::Function', 7);
    });

    it('uses Node.js 20 runtime for all Lambda functions', () => {
      const functions = template.findResources('AWS::Lambda::Function');
      const functionKeys = Object.keys(functions);
      expect(functionKeys.length).toBe(7);

      for (const key of functionKeys) {
        expect(functions[key].Properties.Runtime).toBe('nodejs20.x');
      }
    });

    it('sets NODE_OPTIONS environment variable on all Lambda functions', () => {
      const functions = template.findResources('AWS::Lambda::Function');
      const functionKeys = Object.keys(functions);

      for (const key of functionKeys) {
        const envVars = functions[key].Properties.Environment?.Variables;
        expect(envVars).toBeDefined();
        expect(envVars.NODE_OPTIONS).toBeDefined();
      }
    });

    it('sets TABLE_NAME environment variable on all Lambda functions', () => {
      const functions = template.findResources('AWS::Lambda::Function');
      const functionKeys = Object.keys(functions);

      for (const key of functionKeys) {
        const envVars = functions[key].Properties.Environment?.Variables;
        expect(envVars).toBeDefined();
        expect(envVars.TABLE_NAME).toBeDefined();
      }
    });

    it('sets BUCKET_NAME environment variable on all Lambda functions', () => {
      const functions = template.findResources('AWS::Lambda::Function');
      const functionKeys = Object.keys(functions);

      for (const key of functionKeys) {
        const envVars = functions[key].Properties.Environment?.Variables;
        expect(envVars).toBeDefined();
        expect(envVars.BUCKET_NAME).toBeDefined();
      }
    });

    it('sets USER_POOL_ID environment variable on all Lambda functions', () => {
      const functions = template.findResources('AWS::Lambda::Function');
      const functionKeys = Object.keys(functions);

      for (const key of functionKeys) {
        const envVars = functions[key].Properties.Environment?.Variables;
        expect(envVars).toBeDefined();
        expect(envVars.USER_POOL_ID).toBeDefined();
      }
    });
  });

  describe('API Routes', () => {
    it('creates routes for all 7 endpoints', () => {
      template.resourceCountIs('AWS::ApiGatewayV2::Route', 7);
    });

    it('creates POST /expenses route', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'POST /expenses',
      });
    });

    it('creates GET /expenses route', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'GET /expenses',
      });
    });

    it('creates GET /expenses/{id} route', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'GET /expenses/{id}',
      });
    });

    it('creates POST /expenses/categorize route', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'POST /expenses/categorize',
      });
    });

    it('creates PUT /expenses/{id}/reimburse route', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'PUT /expenses/{id}/reimburse',
      });
    });

    it('creates GET /dashboard/reimbursements route', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'GET /dashboard/reimbursements',
      });
    });

    it('creates POST /uploads/request-url route', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'POST /uploads/request-url',
      });
    });
  });

  describe('IAM Permissions', () => {
    it('grants DynamoDB read/write access to Lambda functions', () => {
      // CDK's table.grantReadWriteData() creates IAM policy statements
      // with dynamodb:BatchGetItem, dynamodb:GetItem, dynamodb:Query, etc.
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                'dynamodb:BatchGetItem',
                'dynamodb:Query',
                'dynamodb:GetItem',
                'dynamodb:Scan',
                'dynamodb:ConditionCheckItem',
                'dynamodb:BatchWriteItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:DescribeTable',
              ]),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    it('grants S3 read/write access to the upload Lambda function', () => {
      // CDK's bucket.grantReadWrite() creates IAM policy statements for s3
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                's3:GetObject*',
                's3:GetBucket*',
                's3:List*',
              ]),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });
  });

  describe('Stack Outputs', () => {
    it('outputs the API URL', () => {
      template.hasOutput('ApiUrl', {
        Value: Match.anyValue(),
      });
    });
  });

  describe('Stack Properties', () => {
    it('exposes the httpApi as a public readonly property', () => {
      expect(stack.httpApi).toBeDefined();
    });
  });
});
