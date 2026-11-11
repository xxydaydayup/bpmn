import { WORKFLOW_NODE_TYPES, type WorkflowNodeType } from './node-types'
import approvalNode from './approval/default'
import conditionNode from './condition/default'
import countersignNode from './countersign/default'
import endNode from './end/default'
import receiveNode from './receive/default'
import serviceNode from './service/default'
import startNode from './start/default'
import subProcessNode from './subprocess/default'
import timerNode from './timer/default'
import type { RegisteredWorkflowNodeDefinition, WorkflowNodeDefinition } from './types'

/** Statically registered built-in nodes. Keep this exhaustive against WorkflowNodeType. */
export const workflowNodeDefinitions = {
  start: startNode,
  approval: approvalNode,
  countersign: countersignNode,
  service: serviceNode,
  receive: receiveNode,
  timer: timerNode,
  condition: conditionNode,
  subProcess: subProcessNode,
  end: endNode,
} satisfies { [Type in WorkflowNodeType]: RegisteredWorkflowNodeDefinition<Type> }

export { WORKFLOW_NODE_TYPES }
export const workflowNodeCatalog = Object.values(workflowNodeDefinitions).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))

export function isWorkflowNodeType(type: string): type is WorkflowNodeType {
  return Object.prototype.hasOwnProperty.call(workflowNodeDefinitions, type)
}

export function getWorkflowNodeDefinition(type: string) {
  return isWorkflowNodeType(type) ? workflowNodeDefinitions[type] as WorkflowNodeDefinition : undefined
}

export type { WorkflowNodeDefinition } from './types'
