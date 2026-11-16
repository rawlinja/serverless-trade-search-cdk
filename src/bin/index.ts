#!/usr/bin/env node
import { App } from 'aws-cdk-lib'
import { IngestionStack } from '@stacks/ingestion-stack'
import { PersistenceStack } from '@stacks/persistence-stack'

const app = new App()
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }

const persistence = new PersistenceStack(app, 'TradeSearchPersistence', { env })
const ingestion = new IngestionStack(app, 'TradeSearchIngestion', { env })

ingestion.addDependency(persistence)
