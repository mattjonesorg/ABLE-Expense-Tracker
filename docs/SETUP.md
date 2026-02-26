# Self-Hosting Setup Guide

## Prerequisites

- **AWS Account** with admin access (or sufficient IAM permissions for CDK deployments)
- **Node.js 20+** (LTS recommended)
- **pnpm** via corepack (`corepack enable`)
- **AWS CLI v2** configured with credentials (`aws configure`)
- **CDK CLI** (`npm install -g aws-cdk`)

## Environment Variables

| Variable | Description | Storage |
|---|---|---|
| `ANTHROPIC_API_KEY` | API key for Claude AI categorization | AWS Secrets Manager |
| `AWS_REGION` | AWS region for deployment (e.g., `us-east-1`) | Shell / CI environment |
| `AWS_ACCOUNT_ID` | Your 12-digit AWS account ID | Shell / CI environment |

The `ANTHROPIC_API_KEY` is stored in AWS Secrets Manager and referenced by Lambda functions at runtime. You will create the secret during deployment.

## Setup Steps

### 1. Install Dependencies

```bash
corepack enable
pnpm install
```

### 2. Configure AWS Credentials

Ensure your AWS CLI is configured:

```bash
aws configure
# or export AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
```

Verify access:

```bash
aws sts get-caller-identity
```

### 3. Bootstrap CDK

CDK bootstrap provisions resources CDK needs to deploy (S3 bucket, IAM roles). This is a one-time step per account/region:

```bash
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=$(aws configure get region)
cd infra
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION
```

### 4. Store the Anthropic API Key

Create the secret in AWS Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name able-tracker/anthropic-api-key \
  --secret-string "your-anthropic-api-key-here"
```

### 5. Deploy All Stacks

```bash
cd infra
npx cdk deploy --all
```

This deploys four stacks in dependency order:
- **AbleTracker-Auth** — Cognito User Pool and Identity Pool
- **AbleTracker-Data** — DynamoDB tables and S3 buckets
- **AbleTracker-Api** — API Gateway and Lambda functions
- **AbleTracker-Hosting** — S3 static hosting and CloudFront distribution

## Post-Deployment

After deployment completes, note the stack outputs:

- **API URL** — The API Gateway endpoint (from AbleTracker-Api stack outputs)
- **CloudFront URL** — The frontend distribution URL (from AbleTracker-Hosting stack outputs)

### Create the First User

1. Open the AWS Console and navigate to **Cognito** > **User Pools**
2. Find the `AbleTrackerUserPool`
3. Click **Create user**
4. Enter the user's email and set a temporary password
5. The user will be prompted to set a new password on first login

## Teardown

To remove all deployed resources:

```bash
cd infra
npx cdk destroy --all
```

Note: S3 buckets with data and DynamoDB tables may require manual deletion if they contain data and have deletion protection enabled.
