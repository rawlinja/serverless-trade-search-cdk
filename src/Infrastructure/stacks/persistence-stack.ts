import { CustomResource, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import {
  AuroraPostgresEngineVersion,
  ClusterInstance,
  Credentials,
  DatabaseCluster,
  DatabaseClusterEngine,
} from 'aws-cdk-lib/aws-rds'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import { Provider } from 'aws-cdk-lib/custom-resources'
import type { Construct } from 'constructs'
import { MIGRATIONS } from '@lib/migrate/migrations'
import { connectToDatabase, type DatabaseAccess } from '@config/database-access'
import { LAMBDA_DEFAULTS, lambdaEntry, lambdaLogGroup } from '@config/lambda-defaults'
import { PARAMETER_NAMES } from '@config/parameter-names'

export const DATABASE_NAME = 'trades'
const MIGRATE_TIMEOUT = Duration.minutes(5)

export class PersistenceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const cluster = this.createCluster()
    const access: DatabaseAccess = {
      clusterArn: cluster.clusterArn,
      secretArn: cluster.secret!.secretArn,
      databaseName: DATABASE_NAME,
    }

    this.applyMigrations(cluster, access)
    this.publish(access)
  }

  private createCluster(): DatabaseCluster {
    const vpc = new Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'database', subnetType: SubnetType.PRIVATE_ISOLATED }],
    })

    return new DatabaseCluster(this, 'Database', {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_16_13,
      }),
      writer: ClusterInstance.serverlessV2('writer'),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 4,
      serverlessV2AutoPauseDuration: Duration.minutes(5),
      enableDataApi: true,
      defaultDatabaseName: DATABASE_NAME,
      credentials: Credentials.fromGeneratedSecret('postgres'),
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      removalPolicy: RemovalPolicy.DESTROY,
    })
  }

  private applyMigrations(cluster: DatabaseCluster, access: DatabaseAccess): void {
    const migrate = new NodejsFunction(this, 'MigrateFunction', {
      ...LAMBDA_DEFAULTS,
      entry: lambdaEntry('custom-resources/migrate.ts'),
      timeout: MIGRATE_TIMEOUT,
      logGroup: lambdaLogGroup(this, 'MigrateFunctionLogs'),
    })
    connectToDatabase(migrate, access)

    const provider = new Provider(this, 'MigrationProvider', {
      onEventHandler: migrate,
      logGroup: lambdaLogGroup(this, 'MigrationProviderLogs'),
    })
    const resource = new CustomResource(this, 'Migrations', {
      serviceToken: provider.serviceToken,
      // Changes whenever a migration is added, so CloudFormation sends an Update.
      properties: { migrationIds: MIGRATIONS.map((migration) => migration.id).join(',') },
    })
    // The writer instance must be available before the Data API can run statements.
    resource.node.addDependency(cluster)
  }

  private publish(access: DatabaseAccess): void {
    new StringParameter(this, 'ClusterArnParameter', {
      parameterName: PARAMETER_NAMES.clusterArn,
      stringValue: access.clusterArn,
    })
    new StringParameter(this, 'SecretArnParameter', {
      parameterName: PARAMETER_NAMES.secretArn,
      stringValue: access.secretArn,
    })
    new StringParameter(this, 'DatabaseNameParameter', {
      parameterName: PARAMETER_NAMES.databaseName,
      stringValue: access.databaseName,
    })
  }
}
