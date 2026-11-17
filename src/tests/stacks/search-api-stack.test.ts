import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { PARAMETER_NAMES } from '@config/parameter-names'
import { SearchApiStack } from '@stacks/search-api-stack'
import { expectNoCrossStackWiring } from '../support/cross-stack'
import { expectNothingRetained } from '../support/teardown'

const template = Template.fromStack(new SearchApiStack(new App(), 'TestSearchApi'))

const onlyLogicalId = (resources: Record<string, unknown>) => {
  const ids = Object.keys(resources)
  expect(ids).toHaveLength(1)
  return ids[0]
}

const apiId = () => onlyLogicalId(template.findResources('AWS::ApiGatewayV2::Api'))

const searchFunctionId = () =>
  onlyLogicalId(
    template.findResources('AWS::Lambda::Function', { Properties: { Runtime: 'nodejs26.x' } }),
  )

const ssmParameterId = (name: string) =>
  onlyLogicalId(
    template.findParameters('*', { Type: 'AWS::SSM::Parameter::Value<String>', Default: name }),
  )

describe('SearchApiStack', () => {
  it('exposes GET /search as the only route', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 1)
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /search',
      AuthorizationType: 'NONE',
    })
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      IntegrationType: 'AWS_PROXY',
      PayloadFormatVersion: '2.0',
      IntegrationUri: { 'Fn::GetAtt': [searchFunctionId(), 'Arn'] },
    })
  })

  it('throttles every route to 10 requests per second with bursts of 20', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Stage', 1)
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      ApiId: { Ref: apiId() },
      StageName: '$default',
      AutoDeploy: true,
      DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
    })
  })

  it('allows GET from any origin and exposes Retry-After', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
      CorsConfiguration: {
        AllowOrigins: ['*'],
        AllowMethods: ['GET'],
        ExposeHeaders: ['retry-after'],
      },
    })
  })

  it('runs the search Lambda on Node 26 ARM with a 25 second timeout', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs26.x',
      Architectures: ['arm64'],
      TracingConfig: { Mode: 'Active' },
      Timeout: 25,
      MemorySize: 512,
    })
  })

  it('hands the search Lambda database access read from SSM at deploy time', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs26.x',
      Environment: {
        Variables: Match.objectLike({
          DB_CLUSTER_ARN: { Ref: ssmParameterId(PARAMETER_NAMES.clusterArn) },
          DB_SECRET_ARN: { Ref: ssmParameterId(PARAMETER_NAMES.secretArn) },
          DB_NAME: { Ref: ssmParameterId(PARAMETER_NAMES.databaseName) },
        }),
      },
    })
  })

  it('lets the search Lambda use the Data API', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'rds-data:ExecuteStatement',
            Effect: 'Allow',
            Resource: { Ref: ssmParameterId(PARAMETER_NAMES.clusterArn) },
          }),
          Match.objectLike({
            Action: 'secretsmanager:GetSecretValue',
            Effect: 'Allow',
            Resource: { Ref: ssmParameterId(PARAMETER_NAMES.secretArn) },
          }),
        ]),
      },
    })
  })

  it('sends the search Lambda logs to a log group deleted with the stack', () => {
    const logGroupId = onlyLogicalId(template.findResources('AWS::Logs::LogGroup'))

    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs26.x',
      LoggingConfig: { LogGroup: { Ref: logGroupId } },
    })
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 })
  })

  it('alarms when the search Lambda reports errors', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 1)
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
      Statistic: 'Sum',
      Threshold: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      Period: 300,
      TreatMissingData: 'notBreaching',
      Dimensions: [{ Name: 'FunctionName', Value: { Ref: searchFunctionId() } }],
    })
  })

  it('publishes the API URL to SSM', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: PARAMETER_NAMES.searchApiUrl,
      Type: 'String',
      Value: { 'Fn::GetAtt': [apiId(), 'ApiEndpoint'] },
    })
  })

  it('creates no cross-stack exports', () => {
    expectNoCrossStackWiring(template)
  })

  it('leaves nothing behind on teardown', () => {
    expectNothingRetained(template)
  })
})
