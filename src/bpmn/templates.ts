import serialXML from './templates/serial-approval.bpmn?raw'
import amountXML from './templates/amount-approval.bpmn?raw'
import parallelXML from './templates/parallel-approval.bpmn?raw'
import countersignXML from './templates/countersign-approval.bpmn?raw'
import anySignXML from './templates/any-sign-approval.bpmn?raw'
import reworkXML from './templates/rework-approval.bpmn?raw'

export const workflowTemplates = [
  { id: 'serial', name: '串行审批', description: '提交申请 → 主管审批 → 财务审批', xml: serialXML },
  { id: 'amount', name: '金额分支审批', description: '超过 5000 进入高额审批，其他金额走默认分支', xml: amountXML },
  { id: 'parallel', name: '并行审批', description: '财务、法务并行；全部分支结束后汇总，支持退回重提', xml: parallelXML },
  { id: 'countersign', name: '会签审批', description: '固定名单，全员同意才通过；可切换为顺序办理', xml: countersignXML },
  { id: 'any-sign', name: '或签审批', description: '固定名单，任一同意即通过；全员拒绝才不通过', xml: anySignXML },
  { id: 'rework', name: '退回重提', description: '主管、总监依次审批；退回修改后从主管重新审批', xml: reworkXML },
] as const
