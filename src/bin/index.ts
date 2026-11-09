#!/usr/bin/env node
import { App } from 'aws-cdk-lib'
import { IngestionStack } from '@stacks/ingestion-stack'

const app = new App()
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }

new IngestionStack(app, 'TradeSearchIngestion', { env })
