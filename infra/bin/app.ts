#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack.js';
import { DataStack } from '../lib/data-stack.js';
import { ApiStack } from '../lib/api-stack.js';
import { HostingStack } from '../lib/hosting-stack.js';

const app = new cdk.App();

const auth = new AuthStack(app, 'AbleTracker-Auth');
const data = new DataStack(app, 'AbleTracker-Data');

// CORS allowed origins can be configured via CDK context:
//   cdk deploy -c allowedOrigins=https://d360ri42g0q6k2.cloudfront.net
// Multiple origins can be comma-separated:
//   cdk deploy -c allowedOrigins=https://prod.example.com,https://staging.example.com
// http://localhost:5173 is always included automatically for local development.
new ApiStack(app, 'AbleTracker-Api', {
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
  table: data.table,
  bucket: data.bucket,
});

new HostingStack(app, 'AbleTracker-Hosting');
