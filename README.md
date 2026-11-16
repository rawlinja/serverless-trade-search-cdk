# Trade Search

Search trade activity reports dropped into S3. Reports are loaded into Aurora Serverless v2 PostgreSQL as they arrive.

## Prerequisites

- Node.js 26+ and pnpm
- AWS credentials for deploying
- Docker (local Postgres for integration tests)

## Develop

```bash
pnpm install
pnpm test              # unit + infra tests
pnpm db:up             # local Postgres on port 54329
pnpm test:integration
pnpm typecheck && pnpm lint && pnpm format:check
pnpm synth
```

## Deploy

```bash
pnpm cdk bootstrap     # once per account/region
pnpm cdk deploy --all
```

The first deploy of TradeSearchPersistence takes 10–15 minutes while Aurora is created.

## Check the database

```bash
CLUSTER_ARN=$(aws ssm get-parameter --name /trade-search/persistence/cluster-arn \
  --query Parameter.Value --output text)
SECRET_ARN=$(aws ssm get-parameter --name /trade-search/persistence/secret-arn \
  --query Parameter.Value --output text)

aws rds-data execute-statement --resource-arn "$CLUSTER_ARN" --secret-arn "$SECRET_ARN" \
  --database trades --format-records-as JSON --sql 'select id from schema_migrations'
```

`formattedRecords` lists `001_create_trade_search_schema`. Aurora pauses after 5 idle minutes; if the call fails with `DatabaseResumingException`, wait 30 seconds and run it again.

## Load a report

Reports are CSV files without a header, one trade per line:

```
account, advisor, symbol, HH:MM:SS(.mmm), B|S, qty, price, "notes"
```

Times are New York local time on the date in the key; `notes` may be empty or left out. Drop reports under `reports/YYYY-MM-DD/`:

```bash
BUCKET=$(aws ssm get-parameter --name /trade-search/ingestion/reports-bucket-name \
  --query Parameter.Value --output text)

pnpm generate-csv 1000 > /tmp/trades.csv
aws s3 cp /tmp/trades.csv "s3://$BUCKET/reports/$(TZ=America/New_York date +%F)/trades.csv"
```

## Check ingestion

With `CLUSTER_ARN` and `SECRET_ARN` set as in **Check the database**:

```bash
aws rds-data execute-statement --resource-arn "$CLUSTER_ARN" --secret-arn "$SECRET_ARN" \
  --database trades --format-records-as JSON \
  --sql 'select source_key, status, rows_ingested, rows_rejected, errors::text as errors
         from ingestion_runs order by id desc limit 5'

aws rds-data execute-statement --resource-arn "$CLUSTER_ARN" --secret-arn "$SECRET_ARN" \
  --database trades --format-records-as JSON \
  --sql 'select count(*) as trades from trading_activity_reports'
```

Within a minute or two the newest run shows `"status":"succeeded"`, `"rows_ingested":1000` and `"rows_rejected":0`. Uploading the same file again under the same key is skipped; uploading different content under a key that already loaded trades is recorded as `failed` with `object overwritten` and needs a human.

If no run appears, read the ingest Lambda's logs:

```bash
LOG_GROUP=$(aws cloudformation describe-stack-resources --stack-name TradeSearchIngestion \
  --query "StackResources[?ResourceType=='AWS::Logs::LogGroup'].PhysicalResourceId" --output text)
aws logs tail "$LOG_GROUP" --since 15m
```

A report that keeps failing moves to the dead-letter queue after 3 attempts, and its alarm fires. The ingest Lambda's error alarm fires only when the Lambda itself crashes or times out; a report that fails on its own shows up through the dead-letter queue alarm instead.

## Tear down

```bash
pnpm cdk destroy --all
```
