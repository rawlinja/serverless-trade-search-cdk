import { Duration } from 'aws-cdk-lib'
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
  type IMetric,
} from 'aws-cdk-lib/aws-cloudwatch'
import type { Construct } from 'constructs'

export const ALARM_PERIOD = Duration.minutes(5)

export function alarmWhenPositive(scope: Construct, id: string, metric: IMetric): Alarm {
  return new Alarm(scope, id, {
    metric,
    threshold: 1,
    evaluationPeriods: 1,
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  })
}
