# 外部采购系统接入示例

采购系统保留自己的页面、登录和订单数据，通过 [purchase-system.mjs](./purchase-system.mjs) 调用工作流后端。流程为“经理审批 → 同意后采购登记 / 驳回后结束”。各操作分别由配置发布、提交采购、经理审批和采购登记请求触发。导入文件及创建工厂均不发请求。

以下使用 Node.js 22.12+、pnpm 和已交付的 0.2.0 包；新示例未回填进原交付包，复制本地文件到外部项目即可。PowerShell：

```powershell
$demoPath = Join-Path $env:TEMP 'purchase-sdk-demo'
New-Item -ItemType Directory -Force $demoPath | Out-Null
Set-Location $demoPath
pnpm init
pnpm add 'C:/Users/ht/Desktop/work/软件工厂/software_product/poc/bpmn/.scratch/workflow-function-sdk/artifacts/final-2026-11-19/workflow-sdk-0.2.0.tgz'
Copy-Item -LiteralPath 'C:/Users/ht/Desktop/work/软件工厂/software_product/poc/bpmn/packages/workflow-sdk/examples/purchase-system.mjs' -Destination './purchase-system.mjs'
```

先将以下代码保存为 `connection.mjs`，将环境变量 `WORKFLOW_API_BASE_URL` 配置为业务网关的绝对版本根地址（包含 `/api/v1`），`WORKFLOW_API_TOKEN` 配置为该环境授权令牌。鉴权头按业务系统实际协议调整。SDK 不绑定鉴权方式。这里用本地文件演示跨进程保存；接入业务服务时换成数据库，并由服务校验采购单、当前用户及办理权限。

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createFetchRequest } from '@workflow/sdk/examples/fetch-request.mjs'
import { createPurchaseWorkflow } from './purchase-system.mjs'
const baseUrl = process.env.WORKFLOW_API_BASE_URL
if (!baseUrl) throw new Error('请配置 WORKFLOW_API_BASE_URL')
const token = process.env.WORKFLOW_API_TOKEN
export const workflow = createPurchaseWorkflow({
  request: createFetchRequest(baseUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }),
})
await mkdir('./data', { recursive: true })
export const save = (key, value) => writeFile(`./data/${key}.json`, JSON.stringify(value, null, 2))
export const load = async key => JSON.parse(await readFile(`./data/${key}.json`, 'utf8'))
```

1. 配置时发布一次，保存为 `01-publish.mjs`，运行 `node 01-publish.mjs`。每次发布都会产生版本，不要放入每笔采购的提交逻辑。

```js
import { workflow, save } from './connection.mjs'
const template = await workflow.publish()
// 保存完整快照，含 templateVersion、processDefinitionId、deploymentId。
await save('published-template', template)
console.log(template.templateKey, template.templateVersion, template.processDefinitionId)
```

2. 员工提交采购时运行 `02-start.mjs`。实际系统在提交前保存采购单与预定业务键 `purchase:PO-2026-001`；同一采购不重复发起。

```js
import { workflow, load, save } from './connection.mjs'
const template = await load('published-template')
const instance = await workflow.start({ purchaseId: 'PO-2026-001', amount: 1200, managerId: 'manager-001' })
const matched = instance.processDefinitionId === template.processDefinitionId
await save('purchase-instance', {
  templateKey: instance.templateKey, templateVersion: matched ? template.templateVersion : null,
  processDefinitionId: instance.processDefinitionId, processInstanceId: instance.processInstanceId,
  businessKey: instance.businessKey, diagnostics: instance.diagnostics,
})
if (!matched || instance.diagnostics.some(item => item.code === 'START_VERSION_CHANGED')) {
  throw new Error('实例已创建；先核对实际定义及版本并更新绑定，不要再次启动')
}
console.log(instance.businessKey, instance.processInstanceId)
```

启动按 key 使用后端当时的当前版本。若发布记录已过期，上述代码保留已创建实例并停止后续示例。通过宿主有权限的模板版本记录确认实际 `processDefinitionId` 对应的 `templateVersion`，更新该实例绑定后继续；不能用 latest 快照解释旧任务。

3. 经理打开待办并提交意见时运行 `03-review.mjs`。通过实例、节点和当前用户选择真实任务；SDK 完成时也校验快照定义。

```js
import { workflow, load, save } from './connection.mjs'
const binding = await load('purchase-instance')
if (!Number.isInteger(binding.templateVersion)) throw new Error('请先核对实际模板版本')
const template = await workflow.client.getTemplateVersion(binding.templateKey, binding.templateVersion)
if (template.processDefinitionId !== binding.processDefinitionId) throw new Error('版本绑定不一致')
const page = await workflow.client.listTasks({
  processInstanceId: binding.processInstanceId, taskDefinitionKey: 'review', assignee: 'manager-001', limit: 20,
})
if (page.items.length !== 1) throw new Error('未找到唯一的经理审批任务，请核对待办')
const task = page.items[0]
const decision = 'agree' // 实际值来自经理提交；reject 时无需 buyerId。
const result = await workflow.review({
  task, template, decision, comment: '同意采购', ...(decision === 'agree' ? { buyerId: 'buyer-001' } : {}),
})
await save('review-receipt', { taskId: task.id, decision, result })
```

4. 同意后，由采购员稍后的登记请求运行 `04-register.mjs`；拒绝后跳过登记，直接查询状态。末尾登记任务只传原 key 字段，不制造 decision/passed。

```js
import { workflow, load, save } from './connection.mjs'
const binding = await load('purchase-instance')
const receipt = await load('review-receipt')
if (receipt.decision === 'agree') {
  if (!Number.isInteger(binding.templateVersion)) throw new Error('请先核对实际模板版本')
  const template = await workflow.client.getTemplateVersion(binding.templateKey, binding.templateVersion)
  if (template.processDefinitionId !== binding.processDefinitionId) throw new Error('版本绑定不一致')
  const page = await workflow.client.listTasks({
    processInstanceId: binding.processInstanceId, taskDefinitionKey: 'register', assignee: 'buyer-001', limit: 20,
  })
  if (page.items.length !== 1) throw new Error('未找到唯一的采购登记任务，请核对待办')
  await workflow.register({ task: page.items[0], template, purchaseOrderNo: 'ERP-2026-001' })
  await save('registration', { purchaseOrderNo: 'ERP-2026-001' })
}
const progress = await workflow.client.getProgress(binding.processInstanceId)
console.log(progress.state, progress.activeNodes)
// 引擎仍可能在执行结束 worker；后续状态查询请求继续调用 getProgress。
```

`COMPLETED` 只表示流程结束，通过和驳回都可能得到该状态。采购系统分别保存审批决定与登记单号，并结合历史/实际路径核对业务结果；没有待办也不能推断完成。

写请求报错时保留 `WorkflowClientError` 的 `operation`、`resources`、`effect`。`effect=unknown` 表示写入可能已生效；`effect=confirmed` 表示写入已确认，后续处理或响应检查仍可能报错。这两种情况都先核对：完成失败按已保存实例查询 `listTasks`、`getProgress`、`listHistory` 核对原 taskId；启动失败通过宿主授权的实例查询按业务键对账；发布失败核对版本/定义。不要盲重试，也不能把查不到某页任务当作启动失败。可参考 [write-recovery.mjs](./write-recovery.mjs)。

此新增示例按公开 API 编写并做离线验证，未新增真实后端运行记录。已有真实验收与本期边界见 [验证记录](../docs/function-sdk-verification.md)。
