import { LEGACY_WORKFLOW_NODE_TYPES, WORKFLOW_NODE_TYPES } from './types.js'

// This limited vocabulary also drives the offline structural validator. The
// emitted JSON is an ordinary draft 2020-12 schema, usable by other languages.
export interface ModelSchema {
  $ref?: string
  type?: 'object' | 'array' | 'string' | 'integer' | 'boolean'
  properties?: Record<string, ModelSchema>
  required?: string[]
  additionalProperties?: boolean
  items?: ModelSchema
  enum?: readonly string[]
  minLength?: number
  minItems?: number
  allOf?: { if: ModelSchema; then: ModelSchema }[]
  const?: string
}
const string: ModelSchema = { type: 'string' }
const boolean: ModelSchema = { type: 'boolean' }
const identifier: ModelSchema = { type: 'string', minLength: 1 }
const processProperties: Record<string, ModelSchema> = {
  processId: string, processName: string, bizFormKey: string,
  nodes: { type: 'array', minItems: 1, items: { $ref: '#/$defs/node' } },
  flows: { type: 'array', items: { $ref: '#/$defs/flow' } },
}
export const workflowModelSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:workflow:sdk:workflow-model:v1',
  title: 'Business Workflow Model v1',
  description: 'SDK compatibility copy of backend /bpmn/spec version 1. Semantic checks and backend validation are also required. Unknown fields are rejected to protect data.',
  type: 'object', additionalProperties: false, required: ['processId', 'nodes'],
  properties: { ...processProperties, processId: identifier },
  $defs: {
    process: { type: 'object', additionalProperties: false, required: ['nodes'], properties: { nodes: processProperties.nodes!, flows: processProperties.flows!, bizFormKey: string } },
    node: {
      type: 'object', additionalProperties: false, required: ['id', 'type'],
      properties: {
        id: identifier, type: { enum: [...WORKFLOW_NODE_TYPES, ...LEGACY_WORKFLOW_NODE_TYPES] },
        name: string, x: { type: 'integer' }, y: { type: 'integer' }, width: { type: 'integer' }, height: { type: 'integer' },
        bizType: string, bizJson: string, form: string, bizFormKey: string, assignee: string, statusVariable: string, result: string,
        messageName: string, timerType: { enum: ['duration', 'date', 'cycle'] }, timerValue: string,
        serviceName: string, serviceUrl: string, countersign: boolean,
        approveMode: { enum: ['ALL', 'ANY', 'VOTE'] }, passRate: string, sequential: boolean,
        allowTransfer: boolean, allowAddSigner: boolean,
        reminder: { $ref: '#/$defs/reminder' }, process: { $ref: '#/$defs/process' },
      },
      allOf: [{ if: { properties: { type: { const: 'subProcess' } }, required: ['type'] }, then: { properties: { process: { $ref: '#/$defs/process' } }, required: ['process'] } }],
    },
    flow: {
      type: 'object', additionalProperties: false, required: ['source', 'target'],
      properties: { id: identifier, source: identifier, target: identifier, branch: string, conditionExpression: string },
    },
    reminder: {
      type: 'object', additionalProperties: false,
      properties: { duration: string, action: { enum: ['notify', 'return', 'end'] }, target: string, name: string },
    },
  },
} satisfies ModelSchema & { $schema: string; $id: string; title: string; description: string; $defs: Record<string, ModelSchema> }
