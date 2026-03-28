import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, expect, beforeAll } from 'vitest';
import { AuthStack } from '../lib/auth-stack.js';

describe('AuthStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new AuthStack(app, 'TestAuthStack');
    template = Template.fromStack(stack);
  });

  describe('Cognito User Pool', () => {
    it('creates a User Pool with email as username alias', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UsernameAttributes: Match.arrayWith(['email']),
      });
    });

    it('has password policy requiring min 8 chars, symbols, numbers, uppercase, and lowercase', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Policies: {
          PasswordPolicy: {
            MinimumLength: 8,
            RequireLowercase: true,
            RequireNumbers: true,
            RequireSymbols: true,
            RequireUppercase: true,
          },
        },
      });
    });

    it('disables self-signup (admin-created users only)', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: {
          AllowAdminCreateUserOnly: true,
        },
      });
    });

    it('defines custom:role string attribute in schema', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Schema: Match.arrayWith([
          Match.objectLike({
            Name: 'role',
            AttributeDataType: 'String',
            Mutable: true,
          }),
        ]),
      });
    });

    it('defines custom:accountId string attribute in schema', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Schema: Match.arrayWith([
          Match.objectLike({
            Name: 'accountId',
            AttributeDataType: 'String',
            Mutable: true,
          }),
        ]),
      });
    });
  });

  describe('App Client', () => {
    it('creates an App Client with USER_PASSWORD_AUTH and USER_SRP_AUTH flows', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ExplicitAuthFlows: Match.arrayWith([
          'ALLOW_USER_PASSWORD_AUTH',
          'ALLOW_USER_SRP_AUTH',
          'ALLOW_REFRESH_TOKEN_AUTH',
        ]),
      });
    });

    it('has no client secret (for SPA usage)', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        GenerateSecret: false,
      });
    });

    it('does not allow clients to write custom:role attribute', () => {
      // WriteAttributes should NOT include custom:role
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        WriteAttributes: Match.not(
          Match.arrayWith(['custom:role']),
        ),
      });
    });

    it('does not allow clients to write custom:accountId attribute', () => {
      // WriteAttributes should NOT include custom:accountId
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        WriteAttributes: Match.not(
          Match.arrayWith(['custom:accountId']),
        ),
      });
    });

    it('allows clients to read custom:role attribute', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ReadAttributes: Match.arrayWith(['custom:role']),
      });
    });

    it('allows clients to read custom:accountId attribute', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ReadAttributes: Match.arrayWith(['custom:accountId']),
      });
    });
  });

  describe('Stack Outputs', () => {
    it('outputs the User Pool ID', () => {
      template.hasOutput('UserPoolId', {
        Value: Match.anyValue(),
      });
    });

    it('outputs the App Client ID', () => {
      template.hasOutput('UserPoolClientId', {
        Value: Match.anyValue(),
      });
    });
  });

  describe('Google Identity Provider', () => {
    it('creates a Google identity provider with openid, email, profile scopes', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
        ProviderType: 'Google',
        ProviderDetails: Match.objectLike({
          authorize_scopes: 'openid email profile',
        }),
      });
    });

    it('maps Google email and name attributes', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
        ProviderType: 'Google',
        AttributeMapping: Match.objectLike({
          email: 'email',
          name: 'name',
        }),
      });
    });
  });

  describe('Cognito Domain', () => {
    it('creates a UserPoolDomain with a cognito domain prefix', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
        Domain: Match.anyValue(),
      });
    });

    it('outputs the Cognito domain URL', () => {
      template.hasOutput('UserPoolDomainOutput', {
        Value: Match.anyValue(),
      });
    });
  });

  describe('OAuth Configuration', () => {
    it('configures authorization code grant flow on the client', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        AllowedOAuthFlows: Match.arrayWith(['code']),
      });
    });

    it('includes openid, email, and profile in allowed OAuth scopes', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        AllowedOAuthScopes: Match.arrayWith(['openid', 'email', 'profile']),
      });
    });

    it('supports both COGNITO and Google identity providers', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        SupportedIdentityProviders: Match.arrayWith(['COGNITO', 'Google']),
      });
    });

    it('includes production and localhost callback URLs', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        CallbackURLs: Match.arrayWith([
          'https://d360ri42g0q6k2.cloudfront.net/auth/callback',
          'http://localhost:5173/auth/callback',
        ]),
      });
    });

    it('includes production and localhost logout URLs', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        LogoutURLs: Match.arrayWith([
          'https://d360ri42g0q6k2.cloudfront.net/login',
          'http://localhost:5173/login',
        ]),
      });
    });

    it('enables AllowedOAuthFlowsUserPoolClient', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        AllowedOAuthFlowsUserPoolClient: true,
      });
    });
  });
});
