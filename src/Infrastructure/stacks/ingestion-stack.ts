import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { Alarm, ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch'
import { BlockPublicAccess, Bucket, EventType } from 'aws-cdk-lib/aws-s3'
import { SqsDestination } from 'aws-cdk-lib/aws-s3-notifications'
import { Queue } from 'aws-cdk-lib/aws-sqs'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'
import { PARAMETER_NAMES } from '@config/parameter-names'

// Six times the ingest Lambda's 5 min timeout, as AWS recommends for SQS consumers.
const QUEUE_VISIBILITY_TIMEOUT = Duration.minutes(30)
const MAX_RECEIVE_COUNT = 3
const ALARM_PERIOD = Duration.minutes(5)

export class IngestionStack extends Stack {
  readonly queue: Queue

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const bucket = this.createReportsBucket()
    const deadLetterQueue = new Queue(this, 'IngestDeadLetterQueue', {
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    })
    this.queue = new Queue(this, 'IngestQueue', {
      enforceSSL: true,
      visibilityTimeout: QUEUE_VISIBILITY_TIMEOUT,
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: MAX_RECEIVE_COUNT },
    })

    bucket.addEventNotification(EventType.OBJECT_CREATED, new SqsDestination(this.queue), {
      prefix: 'reports/',
      suffix: '.csv',
    })

    this.alarmWhenDeadLettersArrive(deadLetterQueue)
    this.publish(bucket)
  }

  private createReportsBucket(): Bucket {
    return new Bucket(this, 'ReportsBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })
  }

  private alarmWhenDeadLettersArrive(deadLetterQueue: Queue): void {
    new Alarm(this, 'DeadLetterQueueAlarm', {
      metric: deadLetterQueue.metricApproximateNumberOfMessagesVisible({ period: ALARM_PERIOD }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
  }

  private publish(bucket: Bucket): void {
    new StringParameter(this, 'ReportsBucketNameParameter', {
      parameterName: PARAMETER_NAMES.reportsBucketName,
      stringValue: bucket.bucketName,
    })
    new CfnOutput(this, 'IngestQueueUrl', { value: this.queue.queueUrl })
  }
}
