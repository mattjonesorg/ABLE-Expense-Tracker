import { describe, it, expect, beforeAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { EphemeralHostingStack } from '../lib/ephemeral-hosting-stack.js';

describe('EphemeralHostingStack', () => {
  let template: Template;
  let stack: EphemeralHostingStack;

  beforeAll(() => {
    const app = new cdk.App();
    stack = new EphemeralHostingStack(app, 'TestEphemeralHosting', {
      envPrefix: 'PR-42',
    });
    template = Template.fromStack(stack);
  });

  describe('S3 Bucket', () => {
    it('creates an S3 bucket configured for static website hosting', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        WebsiteConfiguration: {
          IndexDocument: 'index.html',
          ErrorDocument: 'index.html',
        },
      });
    });

    it('has DESTROY removal policy', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      const bucketKeys = Object.keys(buckets);
      expect(bucketKeys.length).toBeGreaterThanOrEqual(1);

      const websiteBucket = bucketKeys.find(
        (key) => buckets[key].Properties?.WebsiteConfiguration,
      );
      expect(websiteBucket).toBeDefined();
      expect(buckets[websiteBucket!].DeletionPolicy).toBe('Delete');
    });

    it('enables autoDeleteObjects for clean teardown', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        WebsiteConfiguration: Match.objectLike({
          IndexDocument: 'index.html',
        }),
      });
      template.resourceCountIs('Custom::S3AutoDeleteObjects', 1);
    });
  });

  describe('Bucket Policy', () => {
    it('allows public read access for website hosting', () => {
      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 's3:GetObject',
              Effect: 'Allow',
              Principal: { AWS: '*' },
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

    it('outputs the website URL', () => {
      template.hasOutput('WebsiteUrl', {
        Value: Match.anyValue(),
      });
    });
  });

  describe('Stack Properties', () => {
    it('exposes the frontend bucket as a public readonly property', () => {
      expect(stack.frontendBucket).toBeDefined();
      expect(stack.frontendBucket.bucketName).toBeDefined();
    });
  });
});
