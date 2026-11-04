import type { WorkflowModel, WorkflowNodeRecord, WorkflowFlowRecord } from './types'

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  model: WorkflowModel
}

function nodes(records: WorkflowNodeRecord[]): WorkflowNodeRecord[] {
  return records
}

function flows(records: WorkflowFlowRecord[]): WorkflowFlowRecord[] {
  return records
}

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: 'serial-approval',
    name: '串行审批',
    description: '申请人提交后依次由部门负责人和财务审批。',
    model: {
      processId: 'serial-approval', processName: '串行审批',
      nodes: nodes([
        { id: 'start', type: 'start', name: '开始', x: 320, y: 40 },
        { id: 'apply', type: 'approval', name: '提交申请', x: 320, y: 170, form: 'application' },
        { id: 'manager', type: 'approval', name: '部门负责人审批', x: 320, y: 300 },
        { id: 'finance', type: 'approval', name: '财务审批', x: 320, y: 430 },
        { id: 'end', type: 'end', name: '结束', x: 320, y: 560 },
      ]),
      flows: flows([
        { source: 'start', target: 'apply' }, { source: 'apply', target: 'manager' },
        { source: 'manager', target: 'finance' }, { source: 'finance', target: 'end' },
      ]),
    },
  },
  {
    id: 'countersign',
    name: '多人会签',
    description: '多人并行会签，全部通过后结束，驳回时返回申请步骤。',
    model: {
      processId: 'countersign-approval', processName: '多人会签审批',
      nodes: nodes([
        { id: 'start', type: 'start', name: '开始', x: 320, y: 40 },
        { id: 'apply', type: 'approval', name: '提交申请', x: 320, y: 170 },
        { id: 'reviewers', type: 'countersign', name: '评审组会签', x: 320, y: 300, approveMode: 'ALL', sequential: false },
        { id: 'result', type: 'condition', name: '会签结果', x: 320, y: 430 },
        { id: 'end', type: 'end', name: '结束', x: 320, y: 560 },
      ]),
      flows: flows([
        { source: 'start', target: 'apply' }, { source: 'apply', target: 'reviewers' },
        { source: 'reviewers', target: 'result' }, { source: 'result', target: 'end', branch: 'pass' },
        { source: 'result', target: 'apply', branch: 'reject' },
      ]),
    },
  },
  {
    id: 'vote-approval',
    name: '比例投票',
    description: '多人按顺序投票，至少 70% 同意后通过。',
    model: {
      processId: 'vote-approval', processName: '比例投票审批',
      nodes: nodes([
        { id: 'start', type: 'start', name: '开始', x: 320, y: 40 },
        { id: 'apply', type: 'approval', name: '提交提案', x: 320, y: 170 },
        { id: 'voters', type: 'countersign', name: '成员投票', x: 320, y: 300, approveMode: 'VOTE', passRate: '0.7', sequential: true },
        { id: 'result', type: 'condition', name: '投票结果', x: 320, y: 430 },
        { id: 'end', type: 'end', name: '结束', x: 320, y: 560 },
      ]),
      flows: flows([
        { source: 'start', target: 'apply' }, { source: 'apply', target: 'voters' },
        { source: 'voters', target: 'result' }, { source: 'result', target: 'end', branch: 'pass' },
        { source: 'result', target: 'apply', branch: 'reject' },
      ]),
    },
  },
  {
    id: 'amount-branch',
    name: '金额分支审批',
    description: '提交报销后按金额分流，高额和普通申请进入不同审批步骤。',
    model: {
      processId: 'amount-approval', processName: '金额分支审批',
      nodes: nodes([
        { id: 'start', type: 'start', name: '开始', x: 320, y: 40 },
        { id: 'apply', type: 'approval', name: '提交报销', x: 320, y: 170, form: 'expense' },
        { id: 'amount', type: 'condition', name: '判断申请金额', x: 320, y: 300 },
        { id: 'manager', type: 'approval', name: '高额审批', x: 120, y: 450 },
        { id: 'standard', type: 'approval', name: '普通审批', x: 520, y: 450 },
        { id: 'end', type: 'end', name: '结束', x: 320, y: 600 },
      ]),
      flows: flows([
        { source: 'start', target: 'apply' }, { source: 'apply', target: 'amount' },
        { source: 'amount', target: 'manager', branch: 'pass', conditionExpression: 'amount > 5000' },
        { source: 'amount', target: 'standard', conditionExpression: 'amount <= 5000' },
        { source: 'manager', target: 'end' }, { source: 'standard', target: 'end' },
      ]),
    },
  },
  {
    id: 'service-approval',
    name: '人工与服务调用',
    description: '人工审批通过后调用外部服务，再结束流程。',
    model: {
      processId: 'service-approval', processName: '人工与服务调用',
      nodes: nodes([
        { id: 'start', type: 'start', name: '开始', x: 320, y: 40 },
        { id: 'approve', type: 'approval', name: '人工审核', x: 320, y: 170 },
        { id: 'service', type: 'service', name: '同步业务数据', x: 320, y: 300, serviceName: 'sync-record' },
        { id: 'end', type: 'end', name: '结束', x: 320, y: 430 },
      ]),
      flows: flows([
        { source: 'start', target: 'approve' }, { source: 'approve', target: 'service' },
        { source: 'service', target: 'end' },
      ]),
    },
  },
]
