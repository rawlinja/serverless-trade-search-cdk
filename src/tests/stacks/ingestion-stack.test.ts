import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { IngestionStack } from '@stacks/ingestion-stack'
import { PARAMETER_NAMES } from '@config/parameter-names'
import { expectNoCrossStackWiring } from '../support/cross-stack'

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

  it('alarms when the dead-letter queue has messages', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 1)
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

  it('publishes the reports bucket name to SSM', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: PARAMETER_NAMES.reportsBucketName,
      Type: 'String',
    })
  })

  it('outputs the queue URL for the deploy check', () => {
    template.hasOutput('IngestQueueUrl', {})
  })

  it('creates no cross-stack exports', () => {
    expectNoCrossStackWiring(template)
  })
})
