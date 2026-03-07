import { describe, it, expect, beforeAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Template, Match, Capture } from 'aws-cdk-lib/assertions';
import { ApiStack, ApiStackProps } from '../lib/api-stack.js';

/** Helper to create dependency resources for ApiStack tests */
function createTestDependencies(app: cdk.App, suffix = '') {
  const authStack = new cdk.Stack(app, `TestAuthStack${suffix}`);
  const userPool = new cognito.UserPool(authStack, 'UserPool');
  const userPoolClient = userPool.addClient('TestClient');

  const dataStack = new cdk.Stack(app, `TestDataStack${suffix}`);
  const table = new dynamodb.Table(dataStack, 'Table', {
    partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
    sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  });
  const bucket = new s3.Bucket(dataStack, 'Bucket');

  return { userPool, userPoolClient, table, bucket };
}

describe('ApiStack', () => {
  let template: Template;
  let stack: ApiStack;

  beforeAll(() => {
    const app = new cdk.App();
    const deps = createTestDependencies(app);

    const props: ApiStackProps = {
      ...deps,
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

  describe('CORS Configuration', () => {
    it('does not allow wildcard (*) CORS origins', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        CorsConfiguration: {
          AllowOrigins: Match.not(Match.arrayWith(['*'])),
        },
      });
    });

    it('includes localhost:5173 for local development by default', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        CorsConfiguration: {
          AllowOrigins: Match.arrayWith(['http://localhost:5173']),
        },
      });
    });

    it('allows GET, POST, PUT, DELETE, OPTIONS methods', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        CorsConfiguration: {
          AllowMethods: Match.arrayWith([
            'GET',
            'POST',
            'PUT',
            'DELETE',
            'OPTIONS',
          ]),
        },
      });
    });

    it('allows Content-Type and Authorization headers', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        CorsConfiguration: {
          AllowHeaders: Match.arrayWith([
            'Content-Type',
            'Authorization',
          ]),
        },
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

    it('does not use placeholder inline code for any Lambda function (#74)', () => {
      const functions = template.findResources('AWS::Lambda::Function');
      const functionKeys = Object.keys(functions);

      for (const key of functionKeys) {
        const code = functions[key].Properties.Code;
        // NodejsFunction uses S3Bucket/S3Key (asset-based code), not ZipFile (inline code)
        expect(code).not.toHaveProperty('ZipFile');
        expect(code).toHaveProperty('S3Bucket');
        expect(code).toHaveProperty('S3Key');
      }
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

  describe('IAM Permissions — Least Privilege (#40)', () => {
    /**
     * Helper: find the IAM policy logical IDs attached to the role of a Lambda
     * identified by its Description property.
     */
    function getPolicyStatementsForFunction(
      tpl: Template,
      description: string,
    ): Record<string, unknown>[] {
      // 1. Find the Lambda function by description
      const functions = tpl.findResources('AWS::Lambda::Function', {
        Properties: { Description: description },
      });
      const fnLogicalIds = Object.keys(functions);
      expect(fnLogicalIds.length).toBe(1);

      // 2. The function's Role property is a Fn::GetAtt ref to the IAM Role
      const roleRef = functions[fnLogicalIds[0]].Properties.Role;
      // roleRef is { 'Fn::GetAtt': ['RoleLogicalId', 'Arn'] }
      const roleLogicalId = roleRef['Fn::GetAtt'][0];

      // 3. Find all IAM policies that reference this role
      const allPolicies = tpl.findResources('AWS::IAM::Policy');
      const statements: Record<string, unknown>[] = [];
      for (const [_policyId, policyResource] of Object.entries(allPolicies)) {
        const roles = (policyResource as Record<string, unknown> & { Properties: { Roles: Array<{ Ref: string }> } }).Properties.Roles;
        const refsThisRole = roles?.some(
          (r: { Ref: string }) => r.Ref === roleLogicalId,
        );
        if (refsThisRole) {
          const stmts = (policyResource as Record<string, unknown> & { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }).Properties.PolicyDocument.Statement;
          statements.push(...stmts);
        }
      }
      return statements;
    }

    function statementsHaveDynamoWrite(
      statements: Record<string, unknown>[],
    ): boolean {
      return statements.some((s) => {
        const actions = s.Action;
        if (!Array.isArray(actions)) return false;
        return actions.includes('dynamodb:PutItem');
      });
    }

    function statementsHaveDynamoRead(
      statements: Record<string, unknown>[],
    ): boolean {
      return statements.some((s) => {
        const actions = s.Action;
        if (!Array.isArray(actions)) return false;
        return actions.includes('dynamodb:GetItem');
      });
    }

    function statementsHaveAnyDynamo(
      statements: Record<string, unknown>[],
    ): boolean {
      return statements.some((s) => {
        const actions = s.Action;
        if (!Array.isArray(actions)) return false;
        return actions.some(
          (a: string) => typeof a === 'string' && a.startsWith('dynamodb:'),
        );
      });
    }

    // --- Read/Write functions ---

    it('CreateExpense gets DynamoDB read/write access', () => {
      const stmts = getPolicyStatementsForFunction(template, 'Create a new expense');
      expect(statementsHaveDynamoRead(stmts)).toBe(true);
      expect(statementsHaveDynamoWrite(stmts)).toBe(true);
    });

    it('ReimburseExpense gets DynamoDB read/write access', () => {
      const stmts = getPolicyStatementsForFunction(template, 'Mark an expense as reimbursed');
      expect(statementsHaveDynamoRead(stmts)).toBe(true);
      expect(statementsHaveDynamoWrite(stmts)).toBe(true);
    });

    // --- Read-only functions ---

    it('ListExpenses gets DynamoDB read-only access (no write)', () => {
      const stmts = getPolicyStatementsForFunction(template, 'List all expenses');
      expect(statementsHaveDynamoRead(stmts)).toBe(true);
      expect(statementsHaveDynamoWrite(stmts)).toBe(false);
    });

    it('GetExpense gets DynamoDB read-only access (no write)', () => {
      const stmts = getPolicyStatementsForFunction(template, 'Get a single expense by ID');
      expect(statementsHaveDynamoRead(stmts)).toBe(true);
      expect(statementsHaveDynamoWrite(stmts)).toBe(false);
    });

    it('DashboardReimbursements gets DynamoDB read-only access (no write)', () => {
      const stmts = getPolicyStatementsForFunction(template, 'Reimbursement summary dashboard');
      expect(statementsHaveDynamoRead(stmts)).toBe(true);
      expect(statementsHaveDynamoWrite(stmts)).toBe(false);
    });

    // --- No DynamoDB access ---

    it('CategorizeExpense gets NO DynamoDB access', () => {
      const stmts = getPolicyStatementsForFunction(template, 'AI-assisted expense categorization');
      expect(statementsHaveAnyDynamo(stmts)).toBe(false);
    });

    it('RequestUploadUrl gets NO DynamoDB access', () => {
      const stmts = getPolicyStatementsForFunction(template, 'Request a presigned URL for receipt upload');
      expect(statementsHaveAnyDynamo(stmts)).toBe(false);
    });

    // --- S3 access ---

    it('RequestUploadUrl gets S3 read/write access', () => {
      const stmts = getPolicyStatementsForFunction(template, 'Request a presigned URL for receipt upload');
      const hasS3 = stmts.some((s) => {
        const actions = s.Action;
        if (!Array.isArray(actions)) return false;
        return actions.some((a: string) => typeof a === 'string' && a.startsWith('s3:'));
      });
      expect(hasS3).toBe(true);
    });

    it('CreateExpense does NOT get S3 access', () => {
      const stmts = getPolicyStatementsForFunction(template, 'Create a new expense');
      const hasS3 = stmts.some((s) => {
        const actions = s.Action;
        if (!Array.isArray(actions)) return false;
        return actions.some((a: string) => typeof a === 'string' && a.startsWith('s3:'));
      });
      expect(hasS3).toBe(false);
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

describe('ApiStack — API Gateway Throttling (#47)', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const deps = createTestDependencies(app, 'Throttle');

    const props: ApiStackProps = {
      ...deps,
    };

    const stack = new ApiStack(app, 'TestApiStackThrottle', props);
    template = Template.fromStack(stack);
  });

  describe('Default route throttling', () => {
    it('configures default throttling rate limit of 100 requests/second', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
        DefaultRouteSettings: Match.objectLike({
          ThrottlingRateLimit: 100,
        }),
      });
    });

    it('configures default throttling burst limit of 200', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
        DefaultRouteSettings: Match.objectLike({
          ThrottlingBurstLimit: 200,
        }),
      });
    });
  });

  describe('Categorize endpoint throttling', () => {
    it('configures stricter rate limit of 10 requests/second for POST /expenses/categorize', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
        RouteSettings: Match.objectLike({
          'POST /expenses/categorize': Match.objectLike({
            ThrottlingRateLimit: 10,
          }),
        }),
      });
    });

    it('configures stricter burst limit of 20 for POST /expenses/categorize', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
        RouteSettings: Match.objectLike({
          'POST /expenses/categorize': Match.objectLike({
            ThrottlingBurstLimit: 20,
          }),
        }),
      });
    });
  });
});

describe('ApiStack CORS — custom origins', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const deps = createTestDependencies(app, 'Custom');

    const props: ApiStackProps = {
      ...deps,
      allowedOrigins: ['https://my-app.example.com', 'https://staging.example.com'],
    };

    const stack = new ApiStack(app, 'TestApiStackCustom', props);
    template = Template.fromStack(stack);
  });

  it('includes the custom origins in CORS configuration', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: {
        AllowOrigins: Match.arrayWith([
          'https://my-app.example.com',
          'https://staging.example.com',
        ]),
      },
    });
  });

  it('always includes localhost for development', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: {
        AllowOrigins: Match.arrayWith(['http://localhost:5173']),
      },
    });
  });

  it('does not allow wildcard (*) origins', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: {
        AllowOrigins: Match.not(Match.arrayWith(['*'])),
      },
    });
  });
});

describe('ApiStack CORS — context-based origins', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App({
      context: {
        allowedOrigins: 'https://context-app.example.com,https://other.example.com',
      },
    });
    const deps = createTestDependencies(app, 'Context');

    const props: ApiStackProps = {
      ...deps,
    };

    const stack = new ApiStack(app, 'TestApiStackContext', props);
    template = Template.fromStack(stack);
  });

  it('reads allowed origins from CDK context', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: {
        AllowOrigins: Match.arrayWith([
          'https://context-app.example.com',
          'https://other.example.com',
        ]),
      },
    });
  });

  it('always includes localhost for development', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: {
        AllowOrigins: Match.arrayWith(['http://localhost:5173']),
      },
    });
  });
});

describe('ApiStack — API Gateway Access Logging (#48)', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const deps = createTestDependencies(app, 'Logging');

    const props: ApiStackProps = {
      ...deps,
    };

    const stack = new ApiStack(app, 'TestApiStackLogging', props);
    template = Template.fromStack(stack);
  });

  describe('CloudWatch Log Group for Access Logs', () => {
    it('creates a CloudWatch Log Group for API Gateway access logs', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        RetentionInDays: 30,
      });
    });

    it('sets a log group name containing "AbleTrackerApi"', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: Match.stringLikeRegexp('AbleTrackerApi'),
      });
    });
  });

  describe('API Gateway Stage Access Log Settings', () => {
    it('configures access logging on the default stage', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
        AccessLogSettings: Match.objectLike({
          DestinationArn: Match.anyValue(),
          Format: Match.anyValue(),
        }),
      });
    });

    it('uses a JSON format for access logs', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
        AccessLogSettings: Match.objectLike({
          Format: Match.stringLikeRegexp('requestId'),
        }),
      });
    });
  });
});

describe('ApiStack — CloudWatch Alarms (#48)', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const deps = createTestDependencies(app, 'Alarms');

    const props: ApiStackProps = {
      ...deps,
    };

    const stack = new ApiStack(app, 'TestApiStackAlarms', props);
    template = Template.fromStack(stack);
  });

  describe('5xx Error Rate Alarm', () => {
    it('creates a CloudWatch alarm for 5xx errors', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: '5xx',
        Namespace: 'AWS/ApiGateway',
        Statistic: 'Sum',
        Period: 300,
        EvaluationPeriods: 1,
        Threshold: 5,
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });
  });

  describe('High Latency Alarm', () => {
    it('creates a CloudWatch alarm for p99 latency on the categorize endpoint', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: 'Latency',
        Namespace: 'AWS/ApiGateway',
        ExtendedStatistic: 'p99',
        Period: 300,
        EvaluationPeriods: 1,
        Threshold: 10000,
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });
  });
});
