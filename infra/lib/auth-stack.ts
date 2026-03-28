import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  /** When true, sets DESTROY removal policy for ephemeral environments. */
  readonly ephemeral?: boolean;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: AuthStackProps) {
    super(scope, id, props);

    const removalPolicy = props?.ephemeral
      ? cdk.RemovalPolicy.DESTROY
      : cdk.RemovalPolicy.RETAIN;

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      customAttributes: {
        role: new cognito.StringAttribute({ mutable: true }),
        accountId: new cognito.StringAttribute({ mutable: true }),
      },
      removalPolicy,
    });

    // Google OAuth — skip for ephemeral stacks (no SSM params available)
    if (!props?.ephemeral) {
      const googleIdp = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleIdP', {
        userPool: this.userPool,
        clientId: ssm.StringParameter.valueForStringParameter(this, '/able-tracker/google-oauth-client-id'),
        clientSecretValue: cdk.SecretValue.ssmSecure('/able-tracker/google-oauth-client-secret'),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      });

      const domain = this.userPool.addDomain('CognitoDomain', {
        cognitoDomain: {
          domainPrefix: 'able-tracker',
        },
      });

      this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
        userPool: this.userPool,
        generateSecret: false,
        authFlows: {
          userPassword: true,
          userSrp: true,
        },
        oAuth: {
          flows: { authorizationCodeGrant: true },
          scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
          callbackUrls: [
            'https://d360ri42g0q6k2.cloudfront.net/auth/callback',
            'http://localhost:5173/auth/callback',
          ],
          logoutUrls: [
            'https://d360ri42g0q6k2.cloudfront.net/login',
            'http://localhost:5173/login',
          ],
        },
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.COGNITO,
          cognito.UserPoolClientIdentityProvider.GOOGLE,
        ],
        readAttributes: new cognito.ClientAttributes()
          .withStandardAttributes({
            email: true,
            emailVerified: true,
          })
          .withCustomAttributes('role', 'accountId'),
        writeAttributes: new cognito.ClientAttributes()
          .withStandardAttributes({
            email: true,
          }),
      });

      this.userPoolClient.node.addDependency(googleIdp);

      new cdk.CfnOutput(this, 'UserPoolDomainOutput', {
        value: `https://${domain.domainName}.auth.${this.region}.amazoncognito.com`,
        description: 'Cognito User Pool domain for OAuth endpoints',
      });
    } else {
      // Ephemeral: username/password only, no Google OAuth
      this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
        userPool: this.userPool,
        generateSecret: false,
        authFlows: {
          userPassword: true,
          userSrp: true,
        },
        readAttributes: new cognito.ClientAttributes()
          .withStandardAttributes({
            email: true,
            emailVerified: true,
          })
          .withCustomAttributes('role', 'accountId'),
        writeAttributes: new cognito.ClientAttributes()
          .withStandardAttributes({
            email: true,
          }),
      });
    }

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });
  }
}
