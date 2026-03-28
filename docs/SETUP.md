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
- **AbleTracker-Auth** — Cognito User Pool (and optional Google Identity Provider)
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

## GitHub Secrets for CI/CD

GitHub Actions workflows require secrets configured in your repository. Go to **Settings > Environments > dev > Environment secrets** to set them.

### Required for All Deployments

| Secret | Description |
|--------|-------------|
| `AWS_DEPLOY_ROLE_ARN` | IAM role ARN for OIDC-based AWS authentication (e.g., `arn:aws:iam::123456789012:role/GitHubActionsDeployRole`) |

### Required for E2E / Ephemeral Environments

| Secret | Description |
|--------|-------------|
| `E2E_TEST_PASSWORD` | Password for the E2E test user created in Cognito during ephemeral deploys |

### Required for Smoke Tests

| Secret | Description |
|--------|-------------|
| `SMOKE_TEST_EMAIL` | Email of an existing Cognito user for smoke tests |
| `SMOKE_TEST_PASSWORD` | Password for the smoke test user |

### Required for Security Review

| Secret | Description |
|--------|-------------|
| `ANTHROPIC_API_KEY` | API key for Claude-powered automated security review on PRs |

### Repository Variables (Settings > Environments > dev > Variables)

| Variable | Description |
|----------|-------------|
| `AWS_REGION` | AWS region for deployments (e.g., `us-east-1`) |

## Google OAuth (Optional)

ABLE Tracker supports "Sign in with Google" as an alternative to username/password authentication. This is entirely optional — the app works without it.

> **Note:** Google OAuth is automatically skipped in ephemeral/CI environments. It only applies to production deployments.

### Prerequisites

- Base ABLE Tracker deployment already complete (steps 1-5 above)
- A Google Cloud account
- AWS CLI configured with access to your deployment account

### Step 1: Create Google Cloud OAuth Credentials

1. Go to the [Google Cloud Console Credentials page](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services > OAuth consent screen**
   - Choose **External** user type
   - Fill in the app name (e.g., "ABLE Tracker"), support email, and developer contact email
   - Add the scopes: `openid`, `email`, `profile`
   - Save
4. Navigate to **APIs & Services > Credentials**
   - Click **Create Credentials > OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: e.g., "ABLE Tracker"
   - Under **Authorized redirect URIs**, add:
     ```
     https://able-tracker.auth.<your-region>.amazoncognito.com/oauth2/idpresponse
     ```
     Replace `<your-region>` with your AWS region (e.g., `us-east-1`).
   - Click **Create**
5. Copy the **Client ID** and **Client Secret** — you will need them in the next step

### Step 2: Store Credentials in AWS SSM Parameter Store

Store the Google OAuth credentials so CDK can reference them during deployment:

```bash
aws ssm put-parameter \
  --name "/able-tracker/google-oauth-client-id" \
  --type "String" \
  --value "YOUR_GOOGLE_CLIENT_ID"

aws ssm put-parameter \
  --name "/able-tracker/google-oauth-client-secret" \
  --type "SecureString" \
  --value "YOUR_GOOGLE_CLIENT_SECRET"
```

Replace `YOUR_GOOGLE_CLIENT_ID` and `YOUR_GOOGLE_CLIENT_SECRET` with the values from Step 1.

### Step 3: Configure Frontend Environment Variables

Add these variables to your frontend environment (e.g., `web/.env.local` for local development, or your CI/deployment configuration):

```bash
VITE_COGNITO_DOMAIN=https://able-tracker.auth.us-east-1.amazoncognito.com
VITE_GOOGLE_IDP_ENABLED=true
```

Replace the domain with your actual Cognito domain URL. After deploying (Step 4), you can find this value in the CDK stack output `UserPoolDomainOutput`.

### Step 4: Deploy

Re-deploy the infrastructure to create the Cognito domain and Google Identity Provider:

```bash
pnpm --filter infra run cdk deploy --all
```

Then rebuild and deploy the frontend so the Google sign-in button appears:

```bash
pnpm --filter web run build
```

Deploy the built frontend to your S3 hosting bucket (see your deployment workflow for the exact command).

### Step 5: Verify

1. Visit the login page
2. A **Sign in with Google** button should appear below the email/password form
3. Click it — you should be redirected to the Google consent screen
4. After granting consent, you should be redirected back and logged in

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `redirect_mismatch` error from Google | The authorized redirect URI in Google Cloud Console must match exactly: `https://able-tracker.auth.<region>.amazoncognito.com/oauth2/idpresponse` |
| Google button not showing on login page | Verify `VITE_GOOGLE_IDP_ENABLED=true` is set in the frontend environment and the app was rebuilt |
| Token exchange fails after Google consent | Verify both SSM parameters exist (`aws ssm get-parameter --name /able-tracker/google-oauth-client-id`) and that CDK deployed successfully |
| "State mismatch" error on callback | Try clearing browser session storage and signing in again — this can happen if the sign-in flow was interrupted |

## Teardown

To remove all deployed resources:

```bash
cd infra
npx cdk destroy --all
```

Note: S3 buckets with data and DynamoDB tables may require manual deletion if they contain data and have deletion protection enabled.
