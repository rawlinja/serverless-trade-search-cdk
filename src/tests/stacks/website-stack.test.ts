import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { PARAMETER_NAMES } from '@config/parameter-names'
import { WebsiteStack } from '@stacks/website-stack'
import { expectNoCrossStackWiring } from '../support/cross-stack'
import { expectNothingRetained } from '../support/teardown'

const template = Template.fromStack(new WebsiteStack(new App(), 'TestWebsite'))

const onlyLogicalId = (resources: Record<string, unknown>) => {
  const ids = Object.keys(resources)
  expect(ids).toHaveLength(1)
  return ids[0]
}

const distributionId = () => onlyLogicalId(template.findResources('AWS::CloudFront::Distribution'))

const siteBucketId = () => onlyLogicalId(template.findResources('AWS::S3::Bucket'))

const ssmParameterId = (name: string) =>
  onlyLogicalId(
    template.findParameters('*', { Type: 'AWS::SSM::Parameter::Value<String>', Default: name }),
  )

describe('WebsiteStack', () => {
  it('serves the page through CloudFront over HTTPS', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
        DefaultCacheBehavior: { ViewerProtocolPolicy: 'redirect-to-https' },
      },
    })
  })

  it('keeps the site bucket private and readable only by the distribution', () => {
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1)
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    })
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 's3:GetObject',
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Condition: {
              StringEquals: {
                'AWS:SourceArn': {
                  'Fn::Join': [
                    '',
                    [
                      'arn:',
                      { Ref: 'AWS::Partition' },
                      ':cloudfront::',
                      { Ref: 'AWS::AccountId' },
                      ':distribution/',
                      { Ref: distributionId() },
                    ],
                  ],
                },
              },
            },
          }),
        ]),
      },
    })
  })

  it('refuses site bucket requests that are not over HTTPS', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      Bucket: { Ref: siteBucketId() },
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 's3:*',
            Effect: 'Deny',
            Principal: { AWS: '*' },
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    })
  })

  it('empties the site bucket on teardown so it can be deleted', () => {
    template.resourceCountIs('Custom::S3AutoDeleteObjects', 1)
    template.hasResourceProperties('Custom::S3AutoDeleteObjects', {
      BucketName: { Ref: siteBucketId() },
    })
  })

  it('deploys the page with a config.json holding the API URL read from SSM', () => {
    template.resourceCountIs('Custom::CDKBucketDeployment', 1)
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      SourceMarkers: [
        {},
        {
          '<<marker:0xbaba:0>>': {
            'Fn::Join': ['', ['"', { Ref: ssmParameterId(PARAMETER_NAMES.searchApiUrl) }, '"']],
          },
        },
      ],
      DistributionId: { Ref: distributionId() },
      DistributionPaths: ['/*'],
    })
  })

  it('sends the deployment Lambda logs to a log group deleted with the stack', () => {
    const logGroupId = onlyLogicalId(template.findResources('AWS::Logs::LogGroup'))

    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: Match.stringLikeRegexp('^python'),
      LoggingConfig: { LogGroup: { Ref: logGroupId } },
    })
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 })
  })

  it('outputs the site URL', () => {
    template.hasOutput('SiteUrl', {
      Value: { 'Fn::Join': ['', ['https://', { 'Fn::GetAtt': [distributionId(), 'DomainName'] }]] },
    })
  })

  it('creates no cross-stack exports', () => {
    expectNoCrossStackWiring(template)
  })

  it('leaves nothing behind on teardown', () => {
    expectNothingRetained(template)
  })
})
