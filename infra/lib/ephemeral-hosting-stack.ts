import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface EphemeralHostingStackProps extends cdk.StackProps {
  readonly envPrefix: string;
}

/**
 * Lightweight S3 static website hosting for ephemeral PR environments.
 * No CloudFront — saves 15-20 min deploy time.
 */
export class EphemeralHostingStack extends cdk.Stack {
  public readonly frontendBucket: s3.Bucket;

  constructor(
    scope: Construct,
    id: string,
    props: EphemeralHostingStackProps,
  ) {
    super(scope, id, props);

    const bucketName = `abletracker-${props.envPrefix.toLowerCase()}-frontend`;

    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
    });

    this.frontendBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [this.frontendBucket.arnForObjects('*')],
        principals: [new iam.AnyPrincipal()],
      }),
    );

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.frontendBucket.bucketName,
      description: 'S3 bucket name for ephemeral frontend',
    });

    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: this.frontendBucket.bucketWebsiteUrl,
      description: 'S3 static website URL',
    });
  }
}
