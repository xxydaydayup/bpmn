import serialXML from './templates/serial-approval.bpmn?raw'
import amountXML from './templates/amount-approval.bpmn?raw'
import parallelXML from './templates/parallel-approval.bpmn?raw'
import countersignXML from './templates/countersign-approval.bpmn?raw'
import anySignXML from './templates/any-sign-approval.bpmn?raw'
import reworkXML from './templates/rework-approval.bpmn?raw'

export const workflowTemplates = [
  { id: 'serial', name: '串行审批', description: '提交申请 → 主管审批 → 财务审批', xml: serialXML },
  { id: 'amount', name: '金额分支审批', description: '超过 5000 进入高额审批，其他金额走默认分支', xml: amountXML },
  { id: 'parallel', name: '并行审批', description: '标准并行网关设计样本；业务结果变量需运行时提供', xml: parallelXML },
  { id: 'countersign', name: '会签审批', description: 'Camunda 集合多实例设计样本；业务结果变量需运行时提供', xml: countersignXML },
  { id: 'any-sign', name: '或签审批', description: 'Camunda 集合多实例设计样本；业务结果变量需运行时提供', xml: anySignXML },
  { id: 'rework', name: '退回重提', description: '标准 BPMN 返回路径设计样本；需要业务侧定义结果变量', xml: reworkXML },
] as const
