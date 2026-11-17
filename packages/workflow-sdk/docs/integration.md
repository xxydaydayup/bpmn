# 业务工作流模型接入指南

## 接入责任

接入方保留自己的设计器，解析其任务节点、审批人、表单和连线，包括放在 XML documentation 中的业务数据，在自己的项目中转换为标准业务模型。SDK 不能从通用 task 自动推断人工审批、会签或服务语义。平台不为每个接入系统长期维护专属适配器，也不要求嵌入平台页面。

接入链路：自有 XML / JSON → 接入方转换 → 标准业务模型 → SDK 校验/导出 → 后端编译 XML → 模板发布 → 读取参数规则 → 业务实例运行。其他语言可以按 Schema 和示例直接生成请求，使用 SDK 是可选的。

## 生成模型并处理诊断

参考包内 [serial.json](../examples/serial.json)、[boolean-branches.json](../examples/boolean-branches.json)、[state-branches.json](../examples/state-branches.json)、[parallel.json](../examples/parallel.json)、[countersign.json](../examples/countersign.json)、[service.json](../examples/service.json)、[service-countersign.json](../examples/service-countersign.json)、[waits.json](../examples/waits.json)、[timeouts.json](../examples/timeouts.json)、[nested.json](../examples/nested.json)。`invalid-vote.json` 与 `invalid-cross-scope.json` 分别展示投票缺失和跨层引用错误。

顶层必需 processId、非空 nodes；节点必需 id/type；连线必需 source/target。流程名、节点名、整数布局坐标、flows 可省略。嵌入式 process 不要求 processId，但必须有非空 nodes，局部 ID 只需本层唯一。业务字段必须按协议命名和类型传递，不把自有展示字段混入标准模型。

```ts
import { validateWorkflowModel, toBpmnCompilerJson, WorkflowModelError } from '@workflow/sdk'

export function prepareModel(partnerOutput: unknown) {
  const model = convertPartnerModel(partnerOutput) // 由接入方实现
  const result = validateWorkflowModel(model)
  showModelIssues(result.issues) // 由接入方按 path / scope 定位
  if (!result.valid) return
  try {
    return toBpmnCompilerJson(model)
  } catch (error) {
    if (error instanceof WorkflowModelError) showModelIssues(error.issues)
    else throw error
  }
}
```

校验覆盖结构、同层 ID / 引用、跨层连接、会签比例、操作开关、分支、等待和超时组合。Schema 通过只代表结构正确，还需语义校验。表达式保留原文，不在 SDK 中运行。未知业务数据报错且保留，接入方应修正映射或与平台协商协议升级。

## 编译与发布

| 服务 | 路径 | 用途 |
| --- | --- | --- |
| Java 编译服务 | `GET /bpmn/spec` | 后端业务 JSON 规范 |
| Java 编译服务 | `POST /bpmn/json2xml` | 直接联调编译服务 |
| 对外 Go 网关 | `POST /api/v1/bpmn/json2xml` | 业务系统提交标准模型 |
| 对外 Go 网关 | `POST /api/v1/template` | XML multipart 发布任务模板 |

API 地址、租户、会话、权限、请求取消和错误处理由宿主提供。仓库 request 的 baseURL 已是 `/api`，所以宿主代码写 `/v1/...`；独立接入按实际网关完整路径配置。以下 `hostRequest` 是接入方的已鉴权请求函数，返回响应体，HTTP 失败时抛错。它不属于 SDK。

```ts
import { toBpmnCompilerJson, type WorkflowModel } from '@workflow/sdk'

async function compileAndPublish(model: WorkflowModel, hostRequest: (path: string, init: RequestInit) => Promise<any>) {
  const payload = toBpmnCompilerJson(model)
  const compiled = await hostRequest('/api/v1/bpmn/json2xml', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (compiled.code !== 'OK' || !compiled.data?.bpmnXml) {
    throw new Error(compiled.message || '编译失败')
  }
  const form = new FormData()
  form.append('deployment-name', model.processName || model.processId)
  form.append('template-key', model.processId)
  form.append('template-name', model.processName || model.processId)
  form.append('startable', 'true')
  form.append('display-json', JSON.stringify(payload))
  form.append('file', new Blob([compiled.data.bpmnXml], { type: 'application/xml' }), 'workflow.bpmn')
  // 不手动设置 multipart Content-Type，浏览器负责 boundary。
  return hostRequest('/api/v1/template', { method: 'POST', body: form })
}
```

先由业务系统安排发布权限和用户确认，再执行发布。`display-json` 保存标准模型，接入方自己的设计稿另外持久化。后端生成 XML、层级前缀、监听器、超时派生节点及参数规则；SDK 不复制这些逻辑。请求超时后先查询模板和版本确认是否已发布，再决定重试，避免重复部署。

## 启动实例与办理任务

发布后通过模板详情 `GET /api/v1/template/{templateKey}` 读取全局变量和 `params_rules`；按当前部署实际返回结构解析规则。`source: start` 的必需且未固化配置在启动时提供；`source: complete` 在相应人工任务完成时提供；`source: engine` 由后端负责。规则中的 nodeId、nodeName、nodeType 是元数据，不是需要原样提交的变量。

宿主负责保存 businessKey 与返回的流程实例/业务实例标识关联、任务权限、表单数据和状态同步。启动与任务完成是后端能力，SDK 第一版无运行时 API。

```ts
// 示例模型的审批节点 id 为 review，办理人留空；由后端规则要求启动时提供。
const started = await hostRequest('/api/v1/task/instances/start', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    templateKey: 'expense_review', businessKey: 'expense-2026-001',
    variables: { review_assignee: 'user-42' },
  }),
})
// 记录 started 中的实例标识。查询条件使用实际网关 Swagger 的字段。
const tasks = await hostRequest('/api/v1/tasks?businessKey=expense-2026-001', { method: 'GET' })
const taskId = selectCurrentTaskId(tasks)
await hostRequest('/api/v1/tasks/' + encodeURIComponent(taskId) + '/complete', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ variables: { review_approved: true } }),
})
```

以上为宿主集成片段，返回结构应按部署版本 Swagger 核对。业务网关使用普通变量值，不套用 Camunda REST 的变量包装。也可以使用按节点传参的 `start_biz` / `complete_biz`：`nodes: [{ nodeId, nodeType, fields }]` 交由后端拼接变量名。新启动接口同时有 nodes 与 variables 时，同名配置以 nodes 为准；完成时只传当前任务节点。不要重复给字段加前缀。

| 执行配置 | 使用约定 |
| --- | --- |
| 单人审批 | 分支结果为 `{activityId}_approved`，Boolean；不要写成 passed |
| 多人审批 | 个人提交 `vote: 'agree'` 或 `vote: 'reject'`（当前后端公共字段，不加节点前缀）；汇总 `{activityId}_passed` 由后端计算 |
| 服务 / 服务会签 | 按后端规范读取 passed 汇总；服务会签 passed 是只读汇总，不落流程变量，不由调用者写入 |
| 服务会签清单 | 启动传 `{activityId}_serviceList`，Object(application/json) 对象数组，每项 `{ serviceName, serviceUrl }`；模板不固化清单 |
| 会签模式 | ALL / ANY / VOTE；模板 VOTE 必须有字符串 passRate，范围 (0,1] |
| 业务表单 | `bizFormKey` / `{activityId}_bizFormKey` 是表单引用；节点优先于流程全局。表单字段 key 直接作为变量名 |
| Camunda 表单 | 节点 `form` 写入 camunda:formKey，与业务表单引用独立 |
| 业务标识 | bizType 是节点元数据，不自动成为变量或 params_rules 项 |
| 转办与加签 | 只使用 Boolean；allowTransfer 支持 approval/countersign；allowAddSigner 只支持 countersign，串行不可 true |

assignee、approveMode、reminder.duration、timerValue、bizFormKey 等未填写时保持缺省；模板固定配置与启动变量同时存在时，按后端规则以模板为准。SDK 不把空配置补成模板默认值，不把字符串 false 转为布尔值。

condition 支持 pass/reject、唯一 default、状态值或显式 EL。布尔推导需唯一直接上游审批/会签/服务；状态分支不能混用 pass/reject，状态值须全部唯一或全部省略由后端生成。显式 conditionExpression 优先，default 不允许表达式。parallel 的出边不可有分支或表达式。状态变量的阶段及名称以参数规则为准。

子流程内部保持局部 ID、相对坐标和同层 reminder.target，编译器逐层展开为 `{容器ID}_{内部ID}`。运行时使用后端返回的 activityId 和参数规则，不自行在模型里前缀化，不给业务表单字段 key 擅自加前缀。

receive 不创建人工待办，messageName 模板优先，其次启动变量，最终默认节点 ID；业务方调用 `POST /api/v1/messages` 关联消息。timer 不创建人工待办，timerType 在模板确定，timerValue 未固定则必须在启动时提供，无兜底值。reminder 可配在 approval/countersign/subProcess，notify 提醒并继续等待，return 中断后退回同层目标，end 终止整个实例；派生节点与监听器都由后端生成。

ALL 按所有人同意、ANY 按任一人同意、VOTE 按通过比例表达审批规则；多人任务名单与多个活动的并行网关是两种不同模型，不把候选人池或最先完成者自动视为这些规则。SDK 只校验配置，具体结算时机、未完成实例取消等由后端执行。服务会签每个实例写 `{activityId}_result_{序号}`，序号从 0 开始，汇总按后端规则读取。

普通子流程内部的 end 只结束容器内部路径，不能当作根流程已经结束；超时 action=end 由后端生成终止整个实例的事件，语义另行处理。SDK 不生成这些执行结构。

任务拒绝/退回待重派接口不等同于提交 approved=false；业务系统应根据参数规则完成任务以走 BPMN 分支。查询任务、业务实例和引擎状态，或接收业务回调后再更新本地业务状态，不凭 HTTP 成功猜测整个流程已完成。

## 显式联调与验证范围

PowerShell 中指定完整编译接口地址，然后从仓库运行：

```powershell
$env:WORKFLOW_COMPILER_URL = 'https://your-gateway.example/api/v1/bpmn/json2xml'
# 如需鉴权，由操作者配置 WORKFLOW_AUTHORIZATION，不写入源文件或日志。
pnpm --filter @workflow/sdk test:backend
```

该脚本逐个校验包内合法示例并请求编译，输出 HTTP 状态和 XML 长度；不发布模板或启动实例。直接编译服务也可用完整 `/bpmn/json2xml` URL。日常 test、build、安装和 SDK 导入均不访问这些地址。

本地公开接口测试证明模型校验、Schema 和导出行为；后端编译检查只证明模型能产生 XML；真实 Camunda 流转需测试租户、临时模板、启动/完成任务、实例终态与清理记录。没有这些条件时单独记录未验证，不能把编译成功当作引擎执行完成。
