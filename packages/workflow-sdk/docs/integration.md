# 业务工作流模型接入指南

## 接入责任

接入方保留自己的设计器，解析其任务节点、审批人、表单和连线，包括放在 XML documentation 中的业务数据，在自己的项目中转换为标准业务模型。SDK 不能从通用 task 自动推断人工审批、会签或服务语义。平台不为每个接入系统长期维护专属适配器，也不要求嵌入平台页面。

接入链路：自有 XML / JSON → 接入方转换 → 标准业务模型 → SDK 校验/导出 → 后端编译 XML → 模板发布 → 读取参数规则 → 业务实例运行。其他语言可以按 Schema 和示例直接生成请求，使用 SDK 是可选的。

## 生成模型并处理诊断

参考包内 [serial.json](../examples/serial.json)、[boolean-branches.json](../examples/boolean-branches.json)、[state-branches.json](../examples/state-branches.json)、[parallel.json](../examples/parallel.json)、[countersign.json](../examples/countersign.json)、[service.json](../examples/service.json)、[service-countersign.json](../examples/service-countersign.json)、[waits.json](../examples/waits.json)、[timeouts.json](../examples/timeouts.json)、[nested.json](../examples/nested.json)。`invalid-vote.json` 与 `invalid-cross-scope.json` 分别展示投票缺失和跨层引用错误。

顶层必需 processId、非空 nodes；节点必需 id/type；连线必需 source/target。流程名、节点名、整数布局坐标、flows 可省略。嵌入式 process 支持 nodes、可选 flows 和可选业务表单引用 bizFormKey，其中 nodes 必须非空，不接受 processId、processName。所有层级的节点和连线定义 ID 共用一个唯一命名空间，根 processId 不参与该命名空间，其唯一性由后端校验。业务字段必须按协议命名和类型传递，不把自有展示字段混入标准模型。

连线 id 仍可省略，后端缺省生成 `flow_{source}_{target}`，冲突时追加序号。SDK 只检查显式节点和连线定义 ID 在整个模型中的冲突，不推断后端生成的序号。使用业务设计器时会在模型中递归补齐 UUID 连线 ID，保存后继续沿用。

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

校验覆盖结构、整个模型的定义 ID 唯一性、同层引用、跨层连接、会签比例、操作开关、分支、等待和超时组合。Schema 通过只代表结构正确，还需语义校验。表达式保留原文，不在 SDK 中运行。未知业务数据报错且保留，接入方应修正映射或与平台协商协议升级。

## 节点业务数据

bizJson 是节点公共的可选 string，业务系统解释字符串内容，允许非 JSON 文本。传字符串而非对象，不需要额外 JSON.stringify；外层请求只正常序列化一次。SDK 和设计器原样保留空白、中文、换行、引号和特殊字符，不解析、trim、格式化或改写内部 ID。未配置时缺省；导入显式空字符串和纯空白字符串保留，设计器属性框清空会删除字段。错误类型保留原输入并报 field-type，未知字段仍会阻止编译。

两层嵌套可用已有函数入口构造：

```ts
import { defineWorkflow, subProcess, approval } from '@workflow/sdk/definition'
const model = defineWorkflow({ key: 'business_data' },
  subProcess('outer', subProcess('inner',
    approval('review', { bizJson: '中文 <tag>& 业务数据' }),
    { bizJson: '内层容器默认值' }),
  { bizJson: '外层容器默认值' }),
).toJSON()
```

片段编辑器保存公开 exportDesign().model 后，可通过已有 subprocessFragments 数据源引用。选择时保存独立快照，片段库变化不会自动改写，显式刷新才更新；复制模型的新 ID 不修改 bizJson 内部内容。compile 请求与发布 display-json 保留各层原文。

后端编译把值写入 camunda:property(name=bizJson) 作为模板默认值。后端声明实例变量 {activityId}_bizJson 优先，删除变量后回退模板默认值；2026-11-20 新契约下，上例内部节点的 activityId 为原节点 ID `review`，对应 `review_bizJson`。SDK 不生成这些变量或 params_rules。2026-11-18 的编译证据使用旧契约，当时活动名为 `outer_inner_review`，并发现后端截去首尾空白，见 [历史验证记录](./node-bizjson-verification.md)。该记录只核对 XML，未部署、启动或验证变量覆盖/回退，不表示新契约已完成运行验收。

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

先由业务系统安排发布权限和用户确认，再执行发布。`display-json` 保存标准模型，接入方自己的设计稿另外持久化。后端沿用模型中的节点和连线 ID，生成 XML、监听器、超时派生节点及参数规则；SDK 不生成这些执行结构。请求超时后先查询模板和版本确认是否已发布，再决定重试，避免重复部署。

## 启动实例与办理任务

发布后通过模板详情 `GET /api/v1/template/{templateKey}` 读取全局变量和 `params_rules`；按当前部署实际返回结构解析规则。`source: start` 的必需且未固化配置在启动时提供；`source: complete` 在相应人工任务完成时提供；`source: engine` 由后端负责。规则中的 nodeId、nodeName、nodeType 是元数据，不是需要原样提交的变量。

宿主负责保存 businessKey 与返回的流程实例/业务实例标识关联、任务权限、表单数据和状态同步。SDK 0.2.0 可通过 [client 入口](./function-sdk.md) 组织运行请求；下面保留直接 HTTP 的协议示例。

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
const tasks = await hostRequest('/api/v1/tasks?processInstanceId=' + encodeURIComponent(processInstanceId), { method: 'GET' })
const taskId = selectCurrentTaskId(tasks)
await hostRequest('/api/v1/tasks/' + encodeURIComponent(taskId) + '/complete', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ variables: { review_approved: { value: true } } }),
})
```

以上为宿主集成片段；启动 variables 为普通值，标准完成与消息 variables 按 `{ value }` 包装。approved 仅在当前任务规则声明时提交，无结果分支的普通填写任务可只提交表单字段。既有 `start_biz` / `complete_biz` 按节点机械拼接前缀，保留作为宿主调试入口；SDK 高层只使用标准 start/complete，以保留公共 vote 与表单原 key，并检测冲突。

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

子流程内部保留相对坐标和同层 reminder.target，节点及连线 ID 必须与整个模型内其他定义不同。2026-11-20 后端取消 `{容器ID}_{内部ID}` 自动展开规则，内部节点沿用原 ID 作为活动标识；例如内部 `review` 的办理人变量按规则为 `review_assignee`。运行时以实际 taskDefinitionKey、后端 activityId 和参数规则为准，业务表单字段 key 保持原值。

新契约不会重命名既有部署或实例。历史任务继续按真实 processDefinitionId 读取相应版本快照，使用当时的 taskDefinitionKey 和后端参数规则；旧模型应显式迁移为全局唯一 ID 后再重新编译发布，不用新定义解释旧实例。

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
