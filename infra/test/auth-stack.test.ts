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
});
