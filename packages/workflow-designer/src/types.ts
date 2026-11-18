import type { Component, CSSProperties } from 'vue'
import type { WorkflowNodeType } from './nodes/node-types'
import type { WorkflowNode as StandardNode, WorkflowFlow as StandardFlow, WorkflowModel as StandardModel, WorkflowSubProcessModel as StandardProcess } from '@workflow/sdk'

export type { WorkflowNodeType } from './nodes/node-types'
export type WorkflowBranch = string
export type WorkflowNodeRecord = Omit<StandardNode, 'type' | 'name' | 'x' | 'y' | 'process' | 'reminder' | 'approveMode'> & Record<string, unknown> & {
  id: string
  type: string
  name: string
  x: number
  y: number
  bizType?: string
  bizJson?: string
  form?: string
  messageName?: string
  timerType?: 'duration' | 'date' | 'cycle'
  timerValue?: string
  sequential?: boolean
  reminder?: { duration?: string; action?: 'notify' | 'return' | 'end'; target?: string; terminate?: boolean; name?: string }
  serviceName?: string
  serviceUrl?: string
  countersign?: boolean
  approveMode?: string
  passRate?: string
  process?: WorkflowSubProcessModel
  subProcessKey?: string
  subProcessName?: string
  statusVariable?: string
  allowTransfer?: boolean
  allowAddSigner?: boolean
  bizFormKey?: string
  assignee?: string
  width?: number
  height?: number
}
export type WorkflowFlowRecord = StandardFlow & Record<string, unknown> & {
  id?: string
  source: string
  target: string
  branch?: WorkflowBranch
  conditionExpression?: string
}
export interface WorkflowModel extends Omit<StandardModel, 'nodes' | 'flows'>, Record<string, unknown> {
  processId: string
  processName: string
  nodes: WorkflowNodeRecord[]
  flows: WorkflowFlowRecord[]
  width?: number
  height?: number
  bizFormKey?: string
}
export interface WorkflowSubProcessModel extends Omit<StandardProcess, 'nodes' | 'flows'>, Record<string, unknown> {
  nodes: WorkflowNodeRecord[]
  processId?: string
  processName?: string
  flows?: WorkflowFlowRecord[]
}
export interface WorkflowSubProcessDisplayJson extends WorkflowSubProcessModel {
  width?: number
  height?: number
}
export interface WorkflowSubProcessFragment {
  key: string
  name: string
  description?: string
  updatedAt?: string
  displayJson: WorkflowSubProcessDisplayJson
}
export interface WorkflowSubProcessQuery { name?: string; key?: string }
export interface WorkflowSubProcessDataSource {
  list: (query?: WorkflowSubProcessQuery) => Promise<WorkflowSubProcessFragment[]>
  get: (key: string) => Promise<WorkflowSubProcessFragment>
}
export type WorkflowDesignerMode = 'workflow' | 'subprocess-fragment'
export interface WorkflowSubProcessFragmentEditorValue { key?: string; name: string; description?: string; displayJson: WorkflowSubProcessDisplayJson }
export interface WorkflowViewport { x: number; y: number; zoom: number }
export type WorkflowTheme = Record<string, string>
export interface WorkflowEditorState extends Record<string, unknown> {
  viewport?: WorkflowViewport
  theme?: WorkflowTheme
  routes?: Record<string, { x: number; y: number }[]>
  extensions?: Record<string, unknown>
}
export interface WorkflowDesignDocument extends Record<string, unknown> {
  format: 'workflow-designer'
  version: 1
  model: WorkflowModel
  editor: WorkflowEditorState
}
export type WorkflowInput = WorkflowDesignDocument | WorkflowModel | Record<string, unknown>
export interface WorkflowValidationIssue {
  code: string
  message: string
  nodeId?: string
  edgeId?: string
  locationLabel?: string
  severity?: 'error' | 'warning'
  path?: string
  scope?: string[]
}
export type WorkflowCompile = (model: WorkflowModel) => Promise<unknown>
export interface WorkflowFormOption { key: string; name: string; version: number; status: string }
export interface WorkflowFormDataSource {
  list: (query: { nameLike?: string; firstResult: number; maxResults: number }) => Promise<WorkflowFormOption[]>
  get: (key: string) => Promise<WorkflowFormOption>
}
export type WorkflowDeploy = (model: WorkflowModel) => Promise<unknown>
export type WorkflowVerifyDeployment = (model: WorkflowModel) => Promise<unknown | undefined>
export interface WorkflowDesignerExtensions {
  nodeTypes?: readonly WorkflowNodeType[]
  nodeDefaults?: Partial<Record<WorkflowNodeType, Partial<WorkflowNodeRecord>>>
  nodeComponent?: Component
  nodePropertyEditors?: Partial<Record<WorkflowNodeType, Component>>
  canConnect?: (source: WorkflowNodeRecord, target: WorkflowNodeRecord, model: WorkflowModel) => boolean
  validate?: (model: WorkflowModel) => WorkflowValidationIssue[]
  theme?: WorkflowTheme
  subprocessFragments?: WorkflowSubProcessDataSource
  businessForms?: WorkflowFormDataSource
}
export interface WorkflowDesignerProps {
  modelValue?: WorkflowInput
  compile?: WorkflowCompile
  deploy?: WorkflowDeploy
  readonly?: boolean
  autoLayoutOnInit?: boolean
  mode?: WorkflowDesignerMode
  fragment?: WorkflowSubProcessFragmentEditorValue
  extensions?: WorkflowDesignerExtensions
}
export interface WorkflowDesignerExpose {
  compile: () => Promise<unknown | undefined>
  exportDesign: () => WorkflowDesignDocument | Record<string, unknown>
}
export type WorkflowNodeStyle = CSSProperties
