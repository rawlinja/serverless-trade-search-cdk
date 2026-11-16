import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import type { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda'

export type DatabaseAccess = { clusterArn: string; secretArn: string; databaseName: string }

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
