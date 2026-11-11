import type { Component } from 'vue'
import type { WorkflowNodeRecord, WorkflowNodeType, WorkflowSubProcessDataSource, WorkflowValidationIssue } from '../types'

export interface WorkflowNodePropertyEditorProps {
  model: Readonly<WorkflowNodeRecord>
  readonly: boolean
  reminderTargets: readonly Pick<WorkflowNodeRecord, 'id' | 'name'>[]
  beginEdit: () => void
  update: (key: string, value: unknown) => void
  subprocessFragments?: WorkflowSubProcessDataSource
}

/**
 * 节点定义契约（对齐 Dify 的 NodeDefault）
 * 每种节点一个目录，default.ts 是唯一登记入口：
 * 元数据、默认值、节点级校验、连接规则全部收敛在此文件。
 */
export interface WorkflowNodeDefinition {
  type: WorkflowNodeType
  /** 节点标题：节点库、画布、属性面板共用 */
  title: string
  /** 节点库中展示的用途说明 */
  description: string
  /** 节点库、画布节点和属性面板共用的图标 */
  icon: Component
  /** 节点库排序，小者优先 */
  sort?: number
  /** 节点库分组名 */
  category?: string
  /** 新建节点时合并进 record 的默认字段 */
  defaultValue?: Partial<WorkflowNodeRecord>
  /** 该节点专属的属性编辑 UI；模型更新仍由设计器统一提交 */
  propertyEditor?: Component<WorkflowNodePropertyEditorProps>
  /** 该节点是否允许配置提醒；流程级校验据此拒绝其他节点携带的提醒 */
  supportsReminder?: boolean
  /** 节点自身字段校验；跨节点和流程结构规则由全局校验负责 */
  checkValid?: (node: WorkflowNodeRecord) => WorkflowValidationIssue[]
  /** 允许的后继节点类型；不声明则不限制（对应 Dify 的 availableNextBlocks） */
  availableNextTypes?: WorkflowNodeType[]
  /** 允许的前驱节点类型；不声明则不限制 */
  availablePrevTypes?: WorkflowNodeType[]
}

export type RegisteredWorkflowNodeDefinition<Type extends WorkflowNodeType> = WorkflowNodeDefinition & { type: Type }
