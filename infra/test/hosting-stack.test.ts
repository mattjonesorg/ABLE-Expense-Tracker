import { describe, it, expect, beforeAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { HostingStack } from '../lib/hosting-stack.js';

describe('HostingStack', () => {
  let template: Template;
  let stack: HostingStack;

  beforeAll(() => {
    const app = new cdk.App();
    stack = new HostingStack(app, 'TestHostingStack');
    template = Template.fromStack(stack);
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

    it('has DESTROY removal policy for dev convenience', () => {
      // When removalPolicy is DESTROY, CDK sets DeletionPolicy to Delete
      const buckets = template.findResources('AWS::S3::Bucket');
      const bucketKeys = Object.keys(buckets);
      expect(bucketKeys.length).toBeGreaterThanOrEqual(1);

      // Find the frontend bucket (the one with versioning, not the auto-delete custom resource)
      const frontendBucket = bucketKeys.find(
        (key) => buckets[key].Properties?.VersioningConfiguration?.Status === 'Enabled',
      );
      expect(frontendBucket).toBeDefined();
      expect(buckets[frontendBucket!].DeletionPolicy).toBe('Delete');
    });
  });

  describe('CloudFront Distribution', () => {
    it('creates a CloudFront distribution', () => {
      template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    });

    it('sets default root object to index.html', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultRootObject: 'index.html',
        },
      });
    });

    it('redirects HTTP to HTTPS', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultCacheBehavior: Match.objectLike({
            ViewerProtocolPolicy: 'redirect-to-https',
          }),
        },
      });
    });

    it('uses PriceClass_100 (cheapest — NA and EU only)', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          PriceClass: 'PriceClass_100',
        },
      });
    });

    it('configures custom error response for 403 to redirect to /index.html with 200', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          CustomErrorResponses: Match.arrayWith([
            Match.objectLike({
              ErrorCode: 403,
              ResponseCode: 200,
              ResponsePagePath: '/index.html',
            }),
          ]),
        },
      });
    });

    it('configures custom error response for 404 to redirect to /index.html with 200', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          CustomErrorResponses: Match.arrayWith([
            Match.objectLike({
              ErrorCode: 404,
              ResponseCode: 200,
              ResponsePagePath: '/index.html',
            }),
          ]),
        },
      });
    });

    it('uses the S3 bucket as origin', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          Origins: Match.arrayWith([
            Match.objectLike({
              DomainName: Match.anyValue(),
              S3OriginConfig: Match.objectLike({
                OriginAccessIdentity: '',
              }),
            }),
          ]),
        },
      });
    });

    it('references the OAC in the distribution origin', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          Origins: Match.arrayWith([
            Match.objectLike({
              OriginAccessControlId: Match.anyValue(),
            }),
          ]),
        },
      });
    });
  });

  describe('Origin Access Control (OAC)', () => {
    it('creates a CloudFront Origin Access Control resource', () => {
      template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    });

    it('configures OAC for S3 with sigv4 signing', () => {
      template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
        OriginAccessControlConfig: Match.objectLike({
          OriginAccessControlOriginType: 's3',
          SigningBehavior: 'always',
          SigningProtocol: 'sigv4',
        }),
      });
    });
  });

  describe('Bucket Policy', () => {
    it('creates a bucket policy granting CloudFront access via s3:GetObject', () => {
      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 's3:GetObject',
              Effect: 'Allow',
              Principal: {
                Service: 'cloudfront.amazonaws.com',
              },
            }),
          ]),
        },
      });
    });
  });

  describe('Stack Outputs', () => {
    it('outputs the frontend bucket name', () => {
      template.hasOutput('FrontendBucketName', {
        Value: Match.anyValue(),
      });
    });

    it('outputs the distribution ID', () => {
      template.hasOutput('DistributionId', {
        Value: Match.anyValue(),
      });
    });

    it('outputs the distribution domain name', () => {
      template.hasOutput('DistributionDomainName', {
        Value: Match.anyValue(),
      });
    });
  });

  describe('Stack Properties', () => {
    it('exposes the frontend bucket as a public readonly property', () => {
      expect(stack.frontendBucket).toBeDefined();
      expect(stack.frontendBucket.bucketName).toBeDefined();
    });

    it('exposes the distribution as a public readonly property', () => {
      expect(stack.distribution).toBeDefined();
      expect(stack.distribution.distributionId).toBeDefined();
    });
  });
});
