import * as path from 'node:path'
import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { Distribution, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront'
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins'
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3'
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'
import { lambdaLogGroup } from '@config/lambda-defaults'
import { PARAMETER_NAMES } from '@config/parameter-names'

const WEB_DIR = path.join(__dirname, '../../../web')
const SITE_CONFIG_KEY = 'config.json'

export class WebsiteStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const bucket = this.createSiteBucket()
    const distribution = this.createDistribution(bucket)
    this.deploySite(bucket, distribution)

    new CfnOutput(this, 'SiteUrl', { value: `https://${distribution.distributionDomainName}` })
  }

  private createSiteBucket(): Bucket {
    return new Bucket(this, 'SiteBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })
  }

  private createDistribution(bucket: Bucket): Distribution {
    return new Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
    })
  }

  private deploySite(bucket: Bucket, distribution: Distribution): void {
    const apiUrl = StringParameter.valueForStringParameter(this, PARAMETER_NAMES.searchApiUrl)

    new BucketDeployment(this, 'SiteDeployment', {
      destinationBucket: bucket,
      sources: [Source.asset(WEB_DIR), Source.jsonData(SITE_CONFIG_KEY, { apiUrl })],
      distribution,
      distributionPaths: ['/*'],
      logGroup: lambdaLogGroup(this, 'SiteDeploymentLogs'),
    })
  }
}
