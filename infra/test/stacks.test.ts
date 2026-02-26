import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack.js';
import { DataStack } from '../lib/data-stack.js';
import { ApiStack } from '../lib/api-stack.js';
import { HostingStack } from '../lib/hosting-stack.js';

describe('CDK Stacks', () => {
  it('should instantiate all placeholder stacks without errors', () => {
    const app = new cdk.App();
    expect(() => new AuthStack(app, 'TestAuth')).not.toThrow();
    expect(() => new DataStack(app, 'TestData')).not.toThrow();
    expect(() => new ApiStack(app, 'TestApi')).not.toThrow();
    expect(() => new HostingStack(app, 'TestHosting')).not.toThrow();
  });
});
