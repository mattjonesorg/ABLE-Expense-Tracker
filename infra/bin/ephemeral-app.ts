#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack.js';
import { DataStack } from '../lib/data-stack.js';
import { ApiStack } from '../lib/api-stack.js';
import { EphemeralHostingStack } from '../lib/ephemeral-hosting-stack.js';

const app = new cdk.App();

const envPrefix = app.node.tryGetContext('envPrefix') as string;
if (!envPrefix) {
  throw new Error(
    'CDK context "envPrefix" is required for ephemeral deployments (e.g. -c envPrefix=PR-42)',
  );
}

const stackPrefix = `AbleTracker-${envPrefix}`;

const auth = new AuthStack(app, `${stackPrefix}-Auth`, { ephemeral: true });
const data = new DataStack(app, `${stackPrefix}-Data`, { ephemeral: true });

new ApiStack(app, `${stackPrefix}-Api`, {
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
  table: data.table,
  bucket: data.bucket,
  envPrefix,
});

new EphemeralHostingStack(app, `${stackPrefix}-Hosting`, { envPrefix });
