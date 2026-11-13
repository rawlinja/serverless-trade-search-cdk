# Trade Search

Search trade activity reports dropped into S3.

## Prerequisites

- Node.js 26+ and pnpm
- AWS credentials for deploying

## Develop

```bash
pnpm install
pnpm test              # infra tests
pnpm typecheck && pnpm lint && pnpm format:check
pnpm synth
```

## Deploy

```bash
pnpm cdk bootstrap     # once per account/region
pnpm cdk deploy --all
```

## Check that reports reach the queue

```bash
BUCKET=$(aws ssm get-parameter --name /trade-search/ingestion/reports-bucket-name \
  --query Parameter.Value --output text)
QUEUE_URL=$(aws cloudformation describe-stacks --stack-name TradeSearchIngestion \
  --query "Stacks[0].Outputs[?OutputKey=='IngestQueueUrl'].OutputValue" --output text)

echo '1234, JD1, AAPL, 09:30:05.100, B, 10, 134.30, "pipeline check"' > /tmp/check.csv
aws s3 cp /tmp/check.csv "s3://$BUCKET/reports/$(date +%F)/check.csv"
aws sqs receive-message --queue-url "$QUEUE_URL" --wait-time-seconds 20 --max-number-of-messages 10
```

The message body names the bucket, the key `reports/<date>/check.csv` and `"eventName":"ObjectCreated:Put"`. S3 may first send one `s3:TestEvent` message when the notification is created; receive again to get the real one.

Uploads outside `reports/` or without a `.csv` suffix produce no message:

```bash
aws s3 cp /tmp/check.csv "s3://$BUCKET/check.csv"
aws s3 cp /tmp/check.csv "s3://$BUCKET/reports/$(date +%F)/check.txt"
aws sqs receive-message --queue-url "$QUEUE_URL" --wait-time-seconds 20 --max-number-of-messages 10   # no new message
```

Then clear the queue:

```bash
aws sqs purge-queue --queue-url "$QUEUE_URL"
```

Every receive of a message counts toward the 3 receives that send it to the dead-letter queue and fire its alarm, and a received message stays hidden for 30 minutes, so re-running the check soon after only shows new messages. Purge after checking. If you skip the purge, check messages left in the queue (kept 4 days) are ingested once the ingest Lambda is deployed.

## Tear down

```bash
pnpm cdk destroy --all
```
