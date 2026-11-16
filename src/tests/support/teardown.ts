import type { Template } from 'aws-cdk-lib/assertions'
import { expect } from 'vitest'

export function expectNothingRetained(template: Template): void {
  const resources = template.toJSON().Resources as Record<string, { DeletionPolicy?: string }>
  const retained = Object.entries(resources)
    .filter(([, resource]) => resource.DeletionPolicy && resource.DeletionPolicy !== 'Delete')
    .map(([id]) => id)

  expect(retained).toEqual([])
}
