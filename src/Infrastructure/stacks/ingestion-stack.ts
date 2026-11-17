import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { BlockPublicAccess, Bucket, EventType } from 'aws-cdk-lib/aws-s3'
import { SqsDestination } from 'aws-cdk-lib/aws-s3-notifications'
import { Queue } from 'aws-cdk-lib/aws-sqs'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'
import { ALARM_PERIOD, alarmWhenPositive } from '@config/alarms'
import { connectToDatabase, readDatabaseAccess } from '@config/database-access'
import { LAMBDA_DEFAULTS, lambdaEntry, lambdaLogGroup } from '@config/lambda-defaults'
import { PARAMETER_NAMES } from '@config/parameter-names'

const INGEST_TIMEOUT = Duration.minutes(5)
const INGEST_MEMORY_MB = 1024
const QUEUE_VISIBILITY_TIMEOUT = Duration.minutes(INGEST_TIMEOUT.toMinutes() * 6)
const MAX_RECEIVE_COUNT = 3

export class IngestionStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const bucket = this.createReportsBucket()
    const deadLetterQueue = new Queue(this, 'IngestDeadLetterQueue', {
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    })
    const queue = new Queue(this, 'IngestQueue', {
      enforceSSL: true,
      visibilityTimeout: QUEUE_VISIBILITY_TIMEOUT,
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: MAX_RECEIVE_COUNT },
    })

    bucket.addEventNotification(EventType.OBJECT_CREATED, new SqsDestination(queue), {
      prefix: 'reports/',
      suffix: '.csv',
    })

    const ingest = this.createIngestFunction(bucket, queue)

    alarmWhenPositive(
      this,
      'DeadLetterQueueAlarm',
      deadLetterQueue.metricApproximateNumberOfMessagesVisible({ period: ALARM_PERIOD }),
    )
    alarmWhenPositive(this, 'IngestErrorsAlarm', ingest.metricErrors({ period: ALARM_PERIOD }))
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

  private createIngestFunction(bucket: Bucket, queue: Queue): NodejsFunction {
    const ingest = new NodejsFunction(this, 'IngestFunction', {
      ...LAMBDA_DEFAULTS,
      entry: lambdaEntry('sqs/ingest.ts'),
      timeout: INGEST_TIMEOUT,
      memorySize: INGEST_MEMORY_MB,
      logGroup: lambdaLogGroup(this, 'IngestFunctionLogs'),
    })

    ingest.addEventSource(
      new SqsEventSource(queue, { batchSize: 1, reportBatchItemFailures: true }),
    )
    bucket.grantRead(ingest)
    connectToDatabase(ingest, readDatabaseAccess(this))

    return ingest
  }

  private publish(bucket: Bucket): void {
    new StringParameter(this, 'ReportsBucketNameParameter', {
      parameterName: PARAMETER_NAMES.reportsBucketName,
      stringValue: bucket.bucketName,
    })
  }
}
