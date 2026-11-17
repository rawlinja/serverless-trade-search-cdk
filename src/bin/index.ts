#!/usr/bin/env node
import { App } from 'aws-cdk-lib'
import { IngestionStack } from '@stacks/ingestion-stack'
import { PersistenceStack } from '@stacks/persistence-stack'
import { SearchApiStack } from '@stacks/search-api-stack'
import { WebsiteStack } from '@stacks/website-stack'

const app = new App()
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }

const persistence = new PersistenceStack(app, 'TradeSearchPersistence', { env })
const ingestion = new IngestionStack(app, 'TradeSearchIngestion', { env })
const searchApi = new SearchApiStack(app, 'TradeSearchSearchApi', { env })
const website = new WebsiteStack(app, 'TradeSearchWebsite', { env })

ingestion.addDependency(persistence)
searchApi.addDependency(persistence)
website.addDependency(searchApi)
