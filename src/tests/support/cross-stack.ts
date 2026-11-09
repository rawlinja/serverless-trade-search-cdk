import type { Template } from 'aws-cdk-lib/assertions'
import { expect } from 'vitest'

export function expectNoCrossStackWiring(template: Template): void {
  const json = template.toJSON() as { Outputs?: Record<string, { Export?: unknown }> }

  expect(JSON.stringify(json)).not.toContain('Fn::ImportValue')
  expect(Object.values(json.Outputs ?? {}).filter((output) => output.Export)).toEqual([])
}
