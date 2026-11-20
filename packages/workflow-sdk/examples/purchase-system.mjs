import { defineWorkflow, sequence, approval, choice, end } from '@workflow/sdk/definition'
import { createWorkflowClient } from '@workflow/sdk/client'

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} 必须是非空字符串`)
}

/** 外部采购系统适配；导入和创建工厂均不请求网络，写操作只由调用方显式触发。 */
export function createPurchaseWorkflow({ request, templateKey = 'purchase_approval' }) {
  requireText(templateKey, 'templateKey')
  const client = createWorkflowClient({ request, timeoutMs: 15000 })
  const definition = defineWorkflow({ key: templateKey, name: '采购审批' }, sequence(
    approval('review', { name: '经理审批' }),
    choice('review_result', { name: '审批结果', branches: [
      { branch: 'pass', body: approval('register', { name: '采购登记' }) },
      { branch: 'reject', body: end('rejected', { name: '采购驳回' }) },
    ] }),
  ))

  function completionOptions(task, template, nodeId) {
    if (task?.taskDefinitionKey !== nodeId) throw new TypeError(`请选择 ${nodeId} 节点的实际任务`)
    if (template?.templateKey !== templateKey || template.processDefinitionId !== task.processDefinitionId) {
      throw new TypeError('模板快照必须属于该任务实际执行的流程定义版本')
    }
    return { templateSnapshot: template }
  }

  return Object.freeze({
    // 公开原始客户端，用于按实例/办理人查任务、读实际版本、查进度与历史。
    client,

    // 配置阶段调用。保存返回的 templateVersion、processDefinitionId 和部署标识。
    publish() {
      return client.publish(definition)
    },

    // 每笔采购调用一次。后端按 key 启动当前版本，不保证等于最近一次 publish 的版本。
    start({ purchaseId, amount, managerId }) {
      requireText(purchaseId, 'purchaseId')
      requireText(managerId, 'managerId')
      if (!Number.isFinite(amount) || amount < 0) throw new TypeError('amount 必须是非负有限数')
      return client.start(templateKey, {
        businessKey: `purchase:${purchaseId}`,
        variables: { purchaseId, amount },
        nodes: { review: { assignee: managerId } },
      })
    },

    // 由经理的一次业务请求调用；拒绝路径不需要采购登记办理人。
    review({ task, template, decision, comment, buyerId }) {
      const options = completionOptions(task, template, 'review')
      if (!['agree', 'reject'].includes(decision)) throw new TypeError('decision 必须是 agree 或 reject')
      if (typeof comment !== 'string') throw new TypeError('comment 必须是字符串')
      if (decision === 'agree') requireText(buyerId, 'buyerId')
      return client.complete(task, {
        decision,
        fields: { comment },
        ...(decision === 'agree' ? { nodes: { register: { assignee: buyerId } } } : {}),
      }, options)
    },

    // 由采购员稍后的请求调用。末尾是普通登记任务，仅提交原 key 字段。
    register({ task, template, purchaseOrderNo }) {
      const options = completionOptions(task, template, 'register')
      requireText(purchaseOrderNo, 'purchaseOrderNo')
      return client.complete(task, { fields: { purchaseOrderNo } }, options)
    },
  })
}
