import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import {
  HttpApi,
  HttpMethod,
  CorsHttpMethod,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';

/**
 * Props for the ApiStack. Accepts cross-stack references from AuthStack and DataStack.
 */
export interface ApiStackProps extends cdk.StackProps {
  /** Cognito User Pool for authentication */
  readonly userPool: cognito.IUserPool;
  /** Cognito User Pool Client for JWT audience validation */
  readonly userPoolClient: cognito.IUserPoolClient;
  /** DynamoDB table for expense data */
  readonly table: dynamodb.ITable;
  /** S3 bucket for receipt storage */
  readonly bucket: s3.IBucket;
}

/**
 * Route definition for an API endpoint.
 */
interface RouteDefinition {
  /** Unique identifier for the Lambda function construct */
  readonly id: string;
  /** HTTP method for the route */
  readonly method: HttpMethod;
  /** URL path for the route */
  readonly path: string;
  /** Description for the Lambda function */
  readonly description: string;
  /** Whether this Lambda needs S3 read/write access */
  readonly needsS3Write?: boolean;
}

/**
 * ApiStack provisions the API layer for ABLE Tracker:
 * - An HTTP API (API Gateway v2) with CORS
 * - Lambda functions for each endpoint
 * - IAM grants for DynamoDB and S3 access
 */
export class ApiStack extends cdk.Stack {
  /** The HTTP API (API Gateway v2) for ABLE Tracker. */
  public readonly httpApi: HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { userPool, userPoolClient, table, bucket } = props;

    // --- JWT Authorizer ---
    const authorizer = new HttpUserPoolAuthorizer(
      'CognitoAuthorizer',
      userPool,
      {
        userPoolClients: [userPoolClient],
      },
    );

    // --- HTTP API ---
    this.httpApi = new HttpApi(this, 'AbleTrackerApi', {
      apiName: 'AbleTrackerApi',
      corsPreflight: {
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      defaultAuthorizer: authorizer,
    });

    // --- Route Definitions ---
    const routes: readonly RouteDefinition[] = [
      {
        id: 'CreateExpense',
        method: HttpMethod.POST,
        path: '/expenses',
        description: 'Create a new expense',
      },
      {
        id: 'ListExpenses',
        method: HttpMethod.GET,
        path: '/expenses',
        description: 'List all expenses',
      },
      {
        id: 'GetExpense',
        method: HttpMethod.GET,
        path: '/expenses/{id}',
        description: 'Get a single expense by ID',
      },
      {
        id: 'CategorizeExpense',
        method: HttpMethod.POST,
        path: '/expenses/categorize',
        description: 'AI-assisted expense categorization',
      },
      {
        id: 'ReimburseExpense',
        method: HttpMethod.PUT,
        path: '/expenses/{id}/reimburse',
        description: 'Mark an expense as reimbursed',
      },
      {
        id: 'DashboardReimbursements',
        method: HttpMethod.GET,
        path: '/dashboard/reimbursements',
        description: 'Reimbursement summary dashboard',
      },
      {
        id: 'RequestUploadUrl',
        method: HttpMethod.POST,
        path: '/uploads/request-url',
        description: 'Request a presigned URL for receipt upload',
        needsS3Write: true,
      },
    ] as const;

    // --- Shared environment variables ---
    const sharedEnvironment: Record<string, string> = {
      TABLE_NAME: table.tableName,
      BUCKET_NAME: bucket.bucketName,
      USER_POOL_ID: userPool.userPoolId,
      NODE_OPTIONS: '--enable-source-maps',
    };

    // --- Create Lambda functions and wire routes ---
    for (const route of routes) {
      const fn = new lambda.Function(this, `${route.id}Function`, {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
        description: route.description,
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        environment: sharedEnvironment,
      });

      // Grant DynamoDB read/write to all Lambda functions
      table.grantReadWriteData(fn);

      // Grant S3 read/write to the upload handler
      if (route.needsS3Write === true) {
        bucket.grantReadWrite(fn);
      }

      // Create the integration and add the route
      const integration = new HttpLambdaIntegration(
        `${route.id}Integration`,
        fn,
      );

      this.httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration,
      });
    }

    // --- Stack Outputs ---
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.httpApi.apiEndpoint,
      description: 'HTTP API endpoint URL',
    });
  }
}
