# 函数定义与运行客户端

SDK 0.2.0 提供三个独立 ESM 入口。模型入口保持兼容；definition 只构造标准 v1 模型；client 只通过注入的 request 调用业务网关，不在 JavaScript 内执行审批或等待。

```ts
import { defineWorkflow, sequence, approval, countersign } from '@workflow/sdk/definition'
import { createWorkflowClient, type WorkflowRequester } from '@workflow/sdk/client'

const definition = defineWorkflow({ key: 'project_review', name: '立项审批' }, sequence(
  approval('review', { name: '材料核对' }),
  countersign('managers', { name: '经理会签', mode: 'ALL' }),
))

// hostRequest 保留 HTTP status 和完整 code/data/message 信封。
declare const hostRequest: WorkflowRequester
const workflow = createWorkflowClient({ request: hostRequest, timeoutMs: 15000 })

// 配置/发布阶段执行一次。也可分别 compile(definition) 和检查 XML。
const template = await workflow.publish(definition)
console.log(template.templateVersion, template.deploymentId, template.processDefinitionId)

const instance = await workflow.start('project_review', {
  businessKey: 'PROJECT-2026-001',
  nodes: { review: { assignee: 'alice' } },
  variables: { budget: 0, checked: false },
})
const page = await workflow.listTasks({ processInstanceId: instance.processInstanceId, offset: 0, limit: 20 })
const review = page.items.find(task => task.taskDefinitionKey === 'review')
if (!review) throw new Error('尚无材料核对任务')
// 普通填写任务没有结果分支时不声明审批结果变量；无需传 decision。
await workflow.complete(review, {
  fields: { comment: '核对完成', amount: 0, checked: false },
  nodes: { managers: { approverList: ['bob', 'carol'] } },
}, { templateSnapshot: template })
// 会签任务的 decision 按当前任务规则映射为个人 passed 布尔值；旧规则仍兼容公共 vote。每位办理人选择自己的任务。
```

## 定义规则

`sequence(...bodies)` 至少一个体；`choice(id, { branches })` 至少两条，每条含 `branch` 或 `conditionExpression` 及 `body`。`branch: 'default'` 为默认；pass/reject 必须紧接唯一审批、多人审批或服务节点。表达式保留原文，不在客户端求值。存活分支通过生成的排他汇合节点连接后续；显式 `end(id)` 结束当前作用域路径。

`parallel(id, [a, b])` 生成 fork/join。每条分支的所有路径都必须回 join，禁止提前 end；正常结束的子流程可放在并行体内。`subProcess(id, body, options)` 内使用局部标识，递归保留，不由 SDK 展开；运行时按后端规则的 activityId 传参数。

`approval` 接受 assignee、form/bizFormKey、allowTransfer、reminder；`countersign` 接受 mode、passRate、sequential、allowTransfer、allowAddSigner 和表单/提醒；`service` 的 mode/passRate/sequential 需 countersign=true。mode 映射 approveMode，VOTE 需比例字符串 `(0,1]`。receive 支持 messageName，timer 支持 timerType/timerValue。已有通用配置的节点入口可传 name、bizType、bizJson、整数布局字段。bizJson 为原样保存的可选字符串，支持容器与嵌套内部节点；自动生成节点及 parallel 不增加配置参数。缺省值保持缺省。

函数描述冻结且复制配置；`toJSON()` 每次返回独立副本。`__wf_` 是保留前缀；生成开始/结束/汇合/连线标识在相同 SDK 版本下确定。同层 ID 冲突、错误字段、空体、终结后串接等抛出带 `issues` 的 WorkflowDefinitionError（继承 WorkflowModelError）。这些严格构造规则不影响合法原始模型；compile/publish 也接受 WorkflowModel。

## 请求适配

```ts
const request: WorkflowRequester = async ({ method, path, query, headers, body, signal }) => {
  const url = new URL('/api/v1' + path, location.origin)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  const multipart = body instanceof FormData
  const response = await fetch(url, {
    method, signal,
    headers: { ...headers, ...(!multipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}
```

完整可运行适配器在 [fetch-request.mjs](../examples/fetch-request.mjs)。鉴权和 base URL 由宿主提供；multipart 不手动设置 Content-Type。宿主已有 request 继续返回响应体，新 `requestWithStatus` 专供 SDK 保留实际状态。Node.js 使用绝对 baseUrl，浏览器可使用同源路径。

可复用的串行消费者函数见 [serial-client.mjs](../examples/serial-client.mjs)。显式调用 runSerialWorkflow 才会发布并启动；需提供唯一 key/businessKey，它使用有限轮询返回实际进度和历史，调用者负责测试资源的后续清理。

[嵌套并行消费者](../examples/parallel-client.mjs) 按任务引用分别完成内外两层分支，并检查提前汇合；[消息及定时消费者](../examples/wait-client.mjs) 使用单一业务键目标和有限轮询；[退回与重派示例](../examples/reassignment-client.mjs) 核对同一任务身份及新办理人筛选。示例导入不产生请求，运行后均由宿主负责测试资源清理。示例提供调用方式，其真实验收状态分别记录于验证文档。

[单人分支消费者](../examples/branch-client.mjs) 在 agree 时提供 accepted 的办理人，在 reject 时只提交当前意见及原 key 表单；拒绝路径通过 end 提前结束，存活路径完成后进入 archive。新契约下的单人 agree/reject 已完成真实引擎复验；入口状态和金额分支仍有参数校验差异，见验证记录。

## 参数与版本

2026-11-17 的 [运行契约快照](../contract/backend-runtime-spec-2026-11-17.json) 与 [来源摘要](../contract/backend-runtime-spec-2026-11-17.provenance.json) 记录本轮适配依据。后端 /bpmn/json-schema 是流程定义模型 Schema；具体启动和办理变量仍读取模板与任务规则。2026-11-17 的该轮验证未引入 bizJson；当前模型基线已更新为 2026-11-18 正式契约并支持 bizJson，历史快照保留。字段语义与本次编译范围见 [bizJson 验证记录](./node-bizjson-verification.md)。

`getStartRequirements(key, decisions?, options?)` 读取模板与最小启动规则，区分 required/hints/rules。入口分支/子流程/缺失拓扑时保守返回提示，避免把所有分支设为必填；后端仍做最终校验。规则接口缺少时返回 START_REQUIREMENTS_UNAVAILABLE。模板固定配置及 source=engine 只读。

`nodes` 以实际 activityId 索引。优先使用 fieldKey；否则只匹配已知节点字段且要求完整变量名确实存在。不会按下划线拆 ID 或解析 description。显式 `variables` 提供完整变量名。complete 的 `fields` 保留表单原 key，和 nodes/variables/decision 一次提交；任何重名报 PARAMETER_CONFLICT。

启动发送普通值，完成与消息发送 `{ value }` 包装；false、0、数组、对象、合法 null 保留，不强制 Spin Json。可选 undefined 省略，循环、BigInt、函数、非有限数、非 JSON 对象被拒绝。decision=agree/reject 按当前任务规则映射：新契约的 approval/countersign 使用 source=complete 且类型为 Boolean 的 passed；旧任务规则继续使用 approved:Boolean 或公共 vote=agree/reject。必须有明确规则或匹配定义版本的快照，不根据说明文本猜测；source=engine、服务 passed 与其他任务的意见仍不可写。新旧可写目标同时存在时报映射不唯一。无审批变量的普通填写任务可只提交 fields。

`getTemplateVersion(key, version)` 返回历史快照；`complete(task, input, { templateSnapshot })` 严格核对 processDefinitionId。规则足够时无需快照；需要补充固定字段保护、旧版本规则时建议传入。SDK 不获取最新模板解释旧任务、不长期缓存。启动只按 key 使用当前版本；发生发布竞争时，返回已创建实例及 START_VERSION_CHANGED，不再次启动。

## 查询、分配与错误

客户端还提供 getTaskRequirements、getTaskForm、getProgress、listHistory、sendMessage、returnForReassignment 和 reassign。分页是 offset/limit → firstResult/maxResults；未返回 total 时不伪造，不自动取全量。历史保留节点重复进入记录，进度保留原始 state；无待办不能认定完成。表单 type=form/route/none 为可区分类型。退回待重派清空分配，业务拒绝使用 complete 的 reject。消息必须明确 businessKey 或 processInstanceId，不广播。

操作选项独立传 signal/timeoutMs，不进入业务 JSON。WorkflowClientError 保留 code、operation、phase、httpStatus、cause、issues、resources、effect。HTTP 200 且业务 code 非 OK 仍失败。effect=unknown 表示写入可能已生效，先按模板、业务键、任务 ID 查询核对；SDK 从不自动重试，不把 BUSINESS_KEY_EXISTS 当幂等成功。

参数映射或必填检查失败同样保留已知上下文：complete 的 resources 含 taskId/processInstanceId/processDefinitionId/taskDefinitionKey，start 含 templateKey/businessKey/mappedProcessDefinitionId。此类本地失败为 phase=parameters、effect=none，尚未派发写请求；仅当规则明确声明人工 passed 为 complete/Boolean 时接受；版本快照中显式 engine 规则仍优先保护。

只读核对示例见 [write-recovery.mjs](../examples/write-recovery.mjs)。完成响应丢失时，可按已知实例查询当前任务、历史与进度，核对原 taskId 是否结束。启动响应丢失时，错误仍保留 templateKey/businessKey，但不臆造未知实例 ID；模板任务查询只提供候选页，必须由宿主按业务键核对真实实例。无任务、分页未取到或最新版本查询为空均不能证明启动失败。发布核对也须考虑并发版本，不能把当前模板直接当成丢失响应对应的版本。

2026-11-18 起发布请求不再发送 startable，可发起状态由后端管理。PublishOptions.startable 保留为弃用兼容字段：true 被接受但不发送，false 在任何网络请求前以 UNSUPPORTED_PUBLISH_OPTION（effect=none）拒绝，避免调用者误以为禁发起设置已保存。模板响应中的 startable 仍原样保留；旧 PUBLISH_OPTIONS_MISMATCH 不再产生。历史 startable=false 保存差异保留在验证记录。

实际网关尚有验收差异，见 [验证记录](./function-sdk-verification.md)。权限、租户、参数最终校验、worker、通知与审计始终属于后端。
