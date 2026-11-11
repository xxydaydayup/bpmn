/** Public node type tuple; keep this list stable for consumers of the package. */
export const WORKFLOW_NODE_TYPES = ['start', 'approval', 'countersign', 'service', 'receive', 'timer', 'condition', 'subProcess', 'end'] as const

export type WorkflowNodeType = typeof WORKFLOW_NODE_TYPES[number]
