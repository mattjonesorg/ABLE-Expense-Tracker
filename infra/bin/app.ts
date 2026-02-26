#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack.js';
import { DataStack } from '../lib/data-stack.js';
import { ApiStack } from '../lib/api-stack.js';
import { HostingStack } from '../lib/hosting-stack.js';

const app = new cdk.App();

const auth = new AuthStack(app, 'AbleTracker-Auth');
const data = new DataStack(app, 'AbleTracker-Data');

new ApiStack(app, 'AbleTracker-Api', {
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
  table: data.table,
  bucket: data.bucket,
});

new HostingStack(app, 'AbleTracker-Hosting');
