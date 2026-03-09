import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface DataStackProps extends cdk.StackProps {
  /** When true, sets DESTROY removal policy and autoDeleteObjects for ephemeral environments. */
  readonly ephemeral?: boolean;
}

/**
 * DataStack provisions the core data layer for ABLE Tracker:
 * - A DynamoDB single-table with PK/SK and two GSIs for flexible access patterns
 * - An S3 bucket for receipt storage with security best practices
 */
export class DataStack extends cdk.Stack {
  /** The single-table DynamoDB table for all ABLE Tracker data. */
  public readonly table: dynamodb.Table;

  /** The S3 bucket for receipt/document storage. */
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: DataStackProps) {
    super(scope, id, props);

    const isEphemeral = props?.ephemeral === true;
    const removalPolicy = isEphemeral
      ? cdk.RemovalPolicy.DESTROY
      : cdk.RemovalPolicy.RETAIN;

    // --- DynamoDB Single-Table ---
    this.table = new dynamodb.Table(this, 'AbleTrackerTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy,
    });

    // GSI1 — supports access patterns like "all expenses for a user"
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2 — supports access patterns like "expenses by category"
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // --- S3 Receipt Bucket ---
    this.bucket = new s3.Bucket(this, 'ReceiptBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy,
      enforceSSL: true,
      ...(isEphemeral ? { autoDeleteObjects: true } : {}),
    });

    // --- Stack Outputs ---
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB table name for ABLE Tracker',
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'DynamoDB table ARN for ABLE Tracker',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket name for receipt storage',
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      value: this.bucket.bucketArn,
      description: 'S3 bucket ARN for receipt storage',
    });
  }
}
