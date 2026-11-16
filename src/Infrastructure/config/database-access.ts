import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import type { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'
import { PARAMETER_NAMES } from './parameter-names'

export type DatabaseAccess = { clusterArn: string; secretArn: string; databaseName: string }

export function readDatabaseAccess(scope: Construct): DatabaseAccess {
  return {
    clusterArn: StringParameter.valueForStringParameter(scope, PARAMETER_NAMES.clusterArn),
    secretArn: StringParameter.valueForStringParameter(scope, PARAMETER_NAMES.secretArn),
    databaseName: StringParameter.valueForStringParameter(scope, PARAMETER_NAMES.databaseName),
  }
}

export function connectToDatabase(fn: LambdaFunction, access: DatabaseAccess): void {
  fn.addEnvironment('DB_CLUSTER_ARN', access.clusterArn)
  fn.addEnvironment('DB_SECRET_ARN', access.secretArn)
  fn.addEnvironment('DB_NAME', access.databaseName)

  fn.addToRolePolicy(
    new PolicyStatement({ actions: ['rds-data:ExecuteStatement'], resources: [access.clusterArn] }),
  )
  fn.addToRolePolicy(
    new PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [access.secretArn],
    }),
  )
}
