import * as path from 'node:path'
import { Architecture, Runtime, RuntimeFamily, Tracing } from 'aws-cdk-lib/aws-lambda'
import type { NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs'

const LAMBDA_DIR = path.join(__dirname, '../../lambda')

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
