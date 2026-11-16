import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { IngestionStack } from '@stacks/ingestion-stack'
import { PARAMETER_NAMES } from '@config/parameter-names'
import { expectNoCrossStackWiring } from '../support/cross-stack'
import { expectNothingRetained } from '../support/teardown'

const template = Template.fromStack(new IngestionStack(new App(), 'TestIngestion'))

const onlyLogicalId = (resources: Record<string, unknown>) => {
  const ids = Object.keys(resources)
  expect(ids).toHaveLength(1)
  return ids[0]
}

const bucketId = () => onlyLogicalId(template.findResources('AWS::S3::Bucket'))

const ingestQueueId = () =>
  onlyLogicalId(
    template.findResources('AWS::SQS::Queue', { Properties: { RedrivePolicy: Match.anyValue() } }),
  )

const deadLetterQueueId = () =>
  onlyLogicalId(
    template.findResources('AWS::SQS::Queue', {
      Properties: { MessageRetentionPeriod: 1_209_600 },
    }),
  )

const ingestFunctionId = () =>
  onlyLogicalId(
    template.findResources('AWS::Lambda::Function', { Properties: { Runtime: 'nodejs26.x' } }),
  )

const ssmParameterId = (name: string) =>
  onlyLogicalId(
    template.findParameters('*', { Type: 'AWS::SSM::Parameter::Value<String>', Default: name }),
  )

const expectNotificationFilterRule = (name: string, value: string) =>
  template.hasResourceProperties('Custom::S3BucketNotifications', {
    NotificationConfiguration: {
      QueueConfigurations: [
        Match.objectLike({
          Events: ['s3:ObjectCreated:*'],
          Filter: { Key: { FilterRules: Match.arrayWith([{ Name: name, Value: value }]) } },
        }),
      ],
    },
  })

describe('IngestionStack', () => {
  it('notifies the queue only for CSV reports under reports/', () => {
    expectNotificationFilterRule('prefix', 'reports/')
    expectNotificationFilterRule('suffix', '.csv')
    template.hasResourceProperties('Custom::S3BucketNotifications', {
      NotificationConfiguration: {
        QueueConfigurations: [
          Match.objectLike({ QueueArn: { 'Fn::GetAtt': [ingestQueueId(), 'Arn'] } }),
        ],
      },
    })
  })

  it('keeps the reports bucket private and encrypted in transit', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    })
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    })
  })

  it('lets only the reports bucket send to the queue', () => {
    template.hasResourceProperties('AWS::SQS::QueuePolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 's3.amazonaws.com' },
            Condition: {
              ArnLike: { 'aws:SourceArn': { 'Fn::GetAtt': [bucketId(), 'Arn'] } },
            },
          }),
        ]),
      },
    })
  })

  it('moves a message to the dead-letter queue after three failed receives', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      VisibilityTimeout: 1800,
      RedrivePolicy: {
        maxReceiveCount: 3,
        deadLetterTargetArn: { 'Fn::GetAtt': [deadLetterQueueId(), 'Arn'] },
      },
    })
    template.hasResourceProperties('AWS::SQS::Queue', { MessageRetentionPeriod: 1_209_600 })
  })

  it('runs the ingest Lambda on Node 26 ARM with a 5 minute timeout', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs26.x',
      Architectures: ['arm64'],
      TracingConfig: { Mode: 'Active' },
      Timeout: 300,
      MemorySize: 1024,
    })
  })

  it('invokes the ingest Lambda with one report per batch and partial batch failures', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      FunctionName: { Ref: ingestFunctionId() },
      EventSourceArn: { 'Fn::GetAtt': [ingestQueueId(), 'Arn'] },
      BatchSize: 1,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    })
  })

  it('hands the ingest Lambda database access read from SSM at deploy time', () => {
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

  it('lets the ingest Lambda read reports and use the Data API', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: Match.arrayWith(['s3:GetObject*']), Effect: 'Allow' }),
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

  it('sends the ingest Lambda logs to a log group deleted with the stack', () => {
    const logGroupId = onlyLogicalId(template.findResources('AWS::Logs::LogGroup'))

    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs26.x',
      LoggingConfig: { LogGroup: { Ref: logGroupId } },
    })
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 })
  })

  it('alarms when the dead-letter queue has messages', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'ApproximateNumberOfMessagesVisible',
      Threshold: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      Period: 300,
      Dimensions: [
        { Name: 'QueueName', Value: { 'Fn::GetAtt': [deadLetterQueueId(), 'QueueName'] } },
      ],
    })
  })

  it('alarms when the ingest Lambda reports errors', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 2)
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
      Statistic: 'Sum',
      Threshold: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      Period: 300,
      TreatMissingData: 'notBreaching',
      Dimensions: [{ Name: 'FunctionName', Value: { Ref: ingestFunctionId() } }],
    })
  })

  it('publishes the reports bucket name to SSM', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: PARAMETER_NAMES.reportsBucketName,
      Type: 'String',
    })
  })

  it('creates no cross-stack exports', () => {
    expectNoCrossStackWiring(template)
  })

  it('leaves nothing behind on teardown', () => {
    expectNothingRetained(template)
  })
})
