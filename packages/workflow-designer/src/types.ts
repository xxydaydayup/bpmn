import type { Component, CSSProperties } from 'vue'
import type { WorkflowNodeType } from './nodes/node-types'

export type { WorkflowNodeType } from './nodes/node-types'
export type WorkflowBranch = string
export type WorkflowNodeRecord = Record<string, unknown> & {
  id: string
  type: string
  name: string
  x: number
  y: number
  bizType?: string
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
export type WorkflowFlowRecord = Record<string, unknown> & {
  id?: string
  source: string
  target: string
  branch?: WorkflowBranch
  conditionExpression?: string
}
export interface WorkflowModel extends Record<string, unknown> {
  processId: string
  processName: string
  nodes: WorkflowNodeRecord[]
  flows: WorkflowFlowRecord[]
  width?: number
  height?: number
  bizFormKey?: string
}
export interface WorkflowSubProcessModel extends Record<string, unknown> {
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
}
export type WorkflowCompile = (model: WorkflowModel) => Promise<unknown>
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
