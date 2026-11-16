import * as path from 'node:path'
import { RemovalPolicy } from 'aws-cdk-lib'
import { Architecture, Runtime, RuntimeFamily, Tracing } from 'aws-cdk-lib/aws-lambda'
import type { NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import type { Construct } from 'constructs'

const LAMBDA_DIR = path.join(__dirname, '../../lambda')
const LOG_RETENTION = RetentionDays.ONE_MONTH

// CDK has no NODEJS_26_X yet; the identifier stays the same when the preview reaches GA.
const NODEJS_26_RUNTIME = new Runtime('nodejs26.x', RuntimeFamily.NODEJS)

export const LAMBDA_DEFAULTS = {
  runtime: NODEJS_26_RUNTIME,
  architecture: Architecture.ARM_64,
  tracing: Tracing.ACTIVE,
  // Bundle the AWS SDK rather than rely on the copy included in the preview runtime.
  bundling: { minify: true, externalModules: [] },
} satisfies NodejsFunctionProps

export function lambdaEntry(relativePath: string): string {
  return path.join(LAMBDA_DIR, relativePath)
}

// Without one, Lambda creates /aws/lambda/<name> outside CloudFormation and it survives a destroy.
export function lambdaLogGroup(scope: Construct, id: string): LogGroup {
  return new LogGroup(scope, id, { retention: LOG_RETENTION, removalPolicy: RemovalPolicy.DESTROY })
}
