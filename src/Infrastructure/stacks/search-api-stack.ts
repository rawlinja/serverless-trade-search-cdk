import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib'
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'
import { ALARM_PERIOD, alarmWhenPositive } from '@config/alarms'
import { connectToDatabase, readDatabaseAccess } from '@config/database-access'
import { LAMBDA_DEFAULTS, lambdaEntry, lambdaLogGroup } from '@config/lambda-defaults'
import { PARAMETER_NAMES } from '@config/parameter-names'

const SEARCH_TIMEOUT = Duration.seconds(25)
const SEARCH_MEMORY_MB = 512
const THROTTLE = { rateLimit: 10, burstLimit: 20 }

export class SearchApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const search = this.createSearchFunction()
    const api = this.createApi(search)

    alarmWhenPositive(this, 'SearchErrorsAlarm', search.metricErrors({ period: ALARM_PERIOD }))
    this.publish(api)
  }

  private createSearchFunction(): NodejsFunction {
    const search = new NodejsFunction(this, 'SearchFunction', {
      ...LAMBDA_DEFAULTS,
      entry: lambdaEntry('api/search.ts'),
      timeout: SEARCH_TIMEOUT,
      memorySize: SEARCH_MEMORY_MB,
      logGroup: lambdaLogGroup(this, 'SearchFunctionLogs'),
    })
    connectToDatabase(search, readDatabaseAccess(this))

    return search
  }

  private createApi(search: NodejsFunction): HttpApi {
    const api = new HttpApi(this, 'SearchApi', {
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [CorsHttpMethod.GET],
        exposeHeaders: ['retry-after'],
      },
    })
    api.addStage('DefaultStage', { stageName: '$default', autoDeploy: true, throttle: THROTTLE })
    api.addRoutes({
      path: '/search',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('SearchIntegration', search),
    })

    return api
  }

  private publish(api: HttpApi): void {
    new StringParameter(this, 'SearchApiUrlParameter', {
      parameterName: PARAMETER_NAMES.searchApiUrl,
      stringValue: api.apiEndpoint,
    })
    new CfnOutput(this, 'SearchApiUrl', { value: api.apiEndpoint })
  }
}
