import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateWorkflowModel as validateStandardWorkflowModel } from '@workflow/sdk'
import { cloneWorkflowModelWithFreshNodeIds } from '../src/adapter'
import { parseWorkflowInput } from '../src/contract'
import { validateWorkflowModel } from '../src/validation'
import { toWorkflowCompilerJson } from '../src/compiler-model'
import type { WorkflowSubProcessModel } from '../src/types'

const examples = resolve(dirname(fileURLToPath(import.meta.url)), '../../workflow-sdk/examples')
const filenames = readdirSync(examples).filter(name => name.endsWith('.json') && !name.startsWith('invalid-'))

describe('SDK examples imported for task template publication', () => {
  it.each(filenames)('%s passes the designer publication checks when copied as a new workflow', filename => {
    const input = JSON.parse(readFileSync(join(examples, filename), 'utf8'))
    const before = structuredClone(input)
    const parsed = parseWorkflowInput(input)
    expect(parsed.readonly).toBe(false)
    expect(parsed.unknownPaths).toEqual([])
    const copy = cloneWorkflowModelWithFreshNodeIds(parsed.model)
    expect(validateWorkflowModel(copy)).toEqual([])
    expect(() => toWorkflowCompilerJson(copy)).not.toThrow()
    expect(copy.processId).toBe(input.processId)
    const ids: string[] = []
    const checkIds = (process: WorkflowSubProcessModel) => {
      for (const node of process.nodes) {
        ids.push(node.id)
        if (node.type === 'subProcess' && node.process) checkIds(node.process)
      }
      for (const flow of process.flows ?? []) {
        expect(flow.id).toEqual(expect.any(String))
        ids.push(flow.id!)
      }
    }
    checkIds(copy)
    expect(new Set(ids).size).toBe(ids.length)
    const checkNames = (nodes: typeof parsed.model.nodes) => {
      for (const node of nodes) {
        expect(node.name?.trim(), `${filename}: ${node.id}`).toBeTruthy()
        if (node.type === 'subProcess' && node.process) checkNames(node.process.nodes)
      }
    }
    checkNames(input.nodes)
    expect(input).toEqual(before)
  })

  it('rejects an older model with repeated nested IDs in both SDK and designer until copied with fresh IDs', () => {
    const input = JSON.parse(readFileSync(join(examples, 'nested.json'), 'utf8'))
    const nestedNode = input.nodes.find((node: { type: string }) => node.type === 'subProcess')
    nestedNode.process.nodes = [{ id: nestedNode.id, type: 'approval', name: '旧稿重复节点' }]
    nestedNode.process.flows = []
    const before = structuredClone(input)
    expect(validateStandardWorkflowModel(input).valid).toBe(false)
    const imported = parseWorkflowInput(input).model
    expect(validateWorkflowModel(imported)).toContainEqual(expect.objectContaining({
      code: 'duplicate-definition-id', nodeId: nestedNode.id, scope: [nestedNode.id], path: '/nodes/1/process/nodes/0/id',
    }))
    expect(() => toWorkflowCompilerJson(imported)).toThrow()
    const copy = cloneWorkflowModelWithFreshNodeIds(imported)
    expect(validateWorkflowModel(copy)).toEqual([])
    expect(() => toWorkflowCompilerJson(copy)).not.toThrow()
    expect(input).toEqual(before)
  })
})
