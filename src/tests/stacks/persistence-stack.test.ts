import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { PARAMETER_NAMES } from '@config/parameter-names'
import { PersistenceStack } from '@stacks/persistence-stack'
import { expectNoCrossStackWiring } from '../support/cross-stack'
import { expectNothingRetained } from '../support/teardown'

const template = Template.fromStack(new PersistenceStack(new App(), 'TestPersistence'))

const logicalIdsOf = (type: string) => Object.keys(template.findResources(type))

describe('PersistenceStack', () => {
  it('creates an Aurora Serverless v2 cluster that pauses at zero capacity', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      DatabaseName: 'trades',
      EnableHttpEndpoint: true,
      ServerlessV2ScalingConfiguration: {
        MinCapacity: 0,
        MaxCapacity: 4,
        SecondsUntilAutoPause: 300,
      },
    })
  })

  it('keeps the database in a VPC without a NAT or internet gateway', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 0)
    template.resourceCountIs('AWS::EC2::InternetGateway', 0)
  })

  it.each([PARAMETER_NAMES.clusterArn, PARAMETER_NAMES.secretArn, PARAMETER_NAMES.databaseName])(
    'publishes %s to SSM',
    (name) => {
      template.hasResourceProperties('AWS::SSM::Parameter', { Name: name, Type: 'String' })
    },
  )

  it('runs migrations with a Node 26 ARM Lambda behind a custom resource', () => {
    template.resourceCountIs('AWS::CloudFormation::CustomResource', 1)
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs26.x',
      Architectures: ['arm64'],
      TracingConfig: { Mode: 'Active' },
      Environment: {
        Variables: Match.objectLike({
          DB_CLUSTER_ARN: Match.anyValue(),
          DB_SECRET_ARN: Match.anyValue(),
          DB_NAME: 'trades',
        }),
      },
    })
  })

  it('lets the migration Lambda use the Data API and read the database secret', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'rds-data:ExecuteStatement', Effect: 'Allow' }),
          Match.objectLike({ Action: 'secretsmanager:GetSecretValue', Effect: 'Allow' }),
        ]),
      },
    })
  })

  it('migrates only after the writer instance exists', () => {
    const [writerId] = logicalIdsOf('AWS::RDS::DBInstance')
    const migrations = Object.values(template.findResources('AWS::CloudFormation::CustomResource'))

    expect(migrations[0].DependsOn).toEqual(expect.arrayContaining([writerId]))
  })

  it('leaves nothing behind on teardown', () => {
    expectNothingRetained(template)
  })

  it('creates no cross-stack exports', () => {
    expectNoCrossStackWiring(template)
  })
})
