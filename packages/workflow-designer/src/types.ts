import type { Component, CSSProperties } from 'vue'

export type WorkflowNodeType = 'start' | 'approval' | 'countersign' | 'service' | 'condition' | 'end'
export type WorkflowBranch = 'pass' | 'reject'
export type WorkflowNodeRecord = Record<string, unknown> & {
  id: string
  type: string
  name: string
  x: number
  y: number
  form?: string
  sequential?: boolean
  reminder?: { duration?: string; action?: 'notify' | 'return' | 'end'; target?: string; name?: string }
  serviceName?: string
  serviceUrl?: string
  countersign?: boolean
  approveMode?: string
  passRate?: string
}
export type WorkflowFlowRecord = Record<string, unknown> & {
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
}
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
  nodeTypes?: WorkflowNodeType[]
  nodeDefaults?: Partial<Record<WorkflowNodeType, Partial<WorkflowNodeRecord>>>
  nodeComponent?: Component
  nodePropertyEditors?: Partial<Record<WorkflowNodeType, Component>>
  canConnect?: (source: WorkflowNodeRecord, target: WorkflowNodeRecord, model: WorkflowModel) => boolean
  validate?: (model: WorkflowModel) => WorkflowValidationIssue[]
  theme?: WorkflowTheme
}
export interface WorkflowDesignerProps {
  modelValue?: WorkflowInput
  compile?: WorkflowCompile
  deploy?: WorkflowDeploy
  readonly?: boolean
  autoLayoutOnInit?: boolean
  extensions?: WorkflowDesignerExtensions
}
export interface WorkflowDesignerExpose {
  compile: () => Promise<unknown | undefined>
  exportDesign: () => WorkflowDesignDocument | Record<string, unknown>
}
export type WorkflowNodeStyle = CSSProperties
