import type { WorkflowModel, WorkflowNodeRecord, WorkflowFlowRecord } from './types'

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  sourceProcessDefinitionId?: string
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
  {
    id: 'msg-wait',
    name: '消息等待（msg-wait）',
    description: '申请人审批后等待 msg_wait_name 消息，再进入审批节点。',
    sourceProcessDefinitionId: 'msg-wait:1:31189f2a-d9ae-11f1-b314-00155d21c8ae',
    model: {
      processId: 'msg-wait', processName: '第一个消息等待流程',
      nodes: nodes([
        { id: 'start', type: 'start', name: '发起', x: 320, y: 40 },
        { id: 'approval_2dd48f093b4742969a7a5356bcff3302', type: 'approval', name: '申请人', x: 320, y: 170 },
        { id: 'receive_c29619a580da4ede8ced0b2807c42e26', type: 'receive', name: '消息等待', messageName: 'msg_wait_name', x: 320, y: 300 },
        { id: 'approval_294d81ce5e0343bba8418f7149a5e17e', type: 'approval', name: '审批', x: 320, y: 430 },
        { id: 'end', type: 'end', name: '结束', x: 320, y: 560 },
      ]),
      flows: flows([
        { source: 'start', target: 'approval_2dd48f093b4742969a7a5356bcff3302' },
        { source: 'approval_2dd48f093b4742969a7a5356bcff3302', target: 'receive_c29619a580da4ede8ced0b2807c42e26' },
        { source: 'receive_c29619a580da4ede8ced0b2807c42e26', target: 'approval_294d81ce5e0343bba8418f7149a5e17e' },
        { source: 'approval_294d81ce5e0343bba8418f7149a5e17e', target: 'end' },
      ]),
    },
  },
  {
    id: 'timer01',
    name: '定时等待 1 分钟（timer01）',
    description: '审批后固定等待 PT1M，再进入第二个审批节点。',
    sourceProcessDefinitionId: 'timer01:1:32ead321-d9a4-11f1-b314-00155d21c8ae',
    model: {
      processId: 'timer01', processName: '定时器1分钟',
      nodes: nodes([
        { id: 'start_1', type: 'start', name: '开始', x: 320, y: 40 },
        { id: 'approval_1', type: 'approval', name: '审批', x: 320, y: 170 },
        { id: 'timer_1', type: 'timer', name: '定时等待', timerType: 'duration', timerValue: 'PT1M', x: 320, y: 300 },
        { id: 'approval_2', type: 'approval', name: '审批', x: 320, y: 430 },
        { id: 'end', type: 'end', name: '结束', x: 320, y: 560 },
      ]),
      flows: flows([
        { source: 'start_1', target: 'approval_1' },
        { source: 'approval_1', target: 'timer_1' },
        { source: 'timer_1', target: 'approval_2' },
        { source: 'approval_2', target: 'end' },
      ]),
    },
  },
]
