import * as path from 'node:path'
import { RemovalPolicy } from 'aws-cdk-lib'
import { Architecture, Runtime, RuntimeFamily, Tracing } from 'aws-cdk-lib/aws-lambda'
import type { NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import type { Construct } from 'constructs'

const LAMBDA_DIR = path.join(__dirname, '../../lambda')
const LOG_RETENTION = RetentionDays.ONE_MONTH

const NODEJS_26_RUNTIME = new Runtime('nodejs26.x', RuntimeFamily.NODEJS)

export const LAMBDA_DEFAULTS = {
  runtime: NODEJS_26_RUNTIME,
  architecture: Architecture.ARM_64,
  tracing: Tracing.ACTIVE,
  bundling: { minify: true, externalModules: [] },
} satisfies NodejsFunctionProps

export function lambdaEntry(relativePath: string): string {
  return path.join(LAMBDA_DIR, relativePath)
}

export function lambdaLogGroup(scope: Construct, id: string): LogGroup {
  return new LogGroup(scope, id, { retention: LOG_RETENTION, removalPolicy: RemovalPolicy.DESTROY })
}
