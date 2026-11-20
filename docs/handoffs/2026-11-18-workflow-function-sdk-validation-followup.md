# 函数 SDK 后端待验证记录（2026-11-18）

## 用户确认后的当前口径

最终补记：07服务worker索引结果保护已修正，服务对象数组/别名及固定值测试补齐。SDK当前52项和最终生产构建通过；最终包SHA256 `53a24fc0e16e4259e38551a0c9b44df5db81d6ed8e777090e1709836360b1268`，仓库外类型/浏览器和多人/子流程真实消费通过。详见 [07交付总账](../../.scratch/workflow-function-sdk/verification/07-approval-subprocess-timeouts-delivery.json)；9份已保存报告45部署逐一只读复核清理。早期路径错误导致落盘失败的临时运行另记，不算安装包证据或已逐ID复核数。

用户已明确接受状态入口缺少所选办理人返回500/INTERNAL_ERROR，现阶段报错拒绝启动即满足负向验收；返回400和优化提示记录为后端待优化项，未修复。SDK继续保留真实错误、effect=unknown及资源上下文。其余04验收已有通过证据，04已按调整口径完成，05及09开始实施。原始失败报告及下列“等待用户验证”内容保留为历史，不再作为04的阻塞项。

后续05/09已完成完整真实矩阵、专用消费者及安装包消费；当前completed为02、03、04、05、06、09、11。SDK补齐会签汇总分支判断、已供配置provided、显式空必需配置校验，50项公开测试和生产构建通过。10已通过运行/嵌套退回、容器/会签取消及恢复和顶层子流程end；notify按用户答复保留待验收。新增 [嵌套审批end后端差异](2026-11-18-workflow-sdk-timeout-end-backend-issue.md)：内部终止后外层并行任务仍ACTIVE，未修复，10仍in-progress。07服务环境、08实例ID消息、12候选重派条件未解除，13/14按依赖等待；最新资源/包/报告见本地07交付账目。以下旧状态均为用户接受差异前的历史记录。

用户最新要求：“等我来验证后再继续”。本轮停在后续实施前，05 多人审批与 09 子流程未开工。02 按最新发布协议验收完成；04、08、12 保持 in-progress。本文件给出用户复验所需的触发条件及已完成结果。

## 04：正常入口分支已修复，状态缺参仍返回 500

环境：2026-11-18 15:57—16:02（Asia/Shanghai），开发代理 http://localhost:5171，tenant-a，Camunda 7.24.0。网关/编译器未暴露构建版本。SDK 不求值表达式，也没有向未选中分支补参数。

已通过 SDK 公开入口真实发布、启动、办理并核对历史 COMPLETED/endTime 和结束 worker：

| 决策 | 仅提交的节点参数 | 实际任务 |
| --- | --- | --- |
| state=ready | ready.assignee | ready |
| state=unknown | fallback.assignee | fallback |
| amount=101 | large.assignee | large |
| amount=0 | small.assignee | small |

单人 agree → accepted → archive、reject → rejected 提前结束也重新通过，原表单 key、false、后续办理人均核对。正常路径原先错误要求默认分支办理人的问题已不复现。

剩余问题为状态入口缺少实际选中办理人的负向校验。用于复现的定义为：


```ts
const definition = defineWorkflow({ key: uniqueKey }, choice('route', {
  statusVariable: 'state',
  branches: [
    { branch: 'ready', body: approval('ready') },
    { branch: 'default', body: approval('fallback') },
  ],
}))
await client.publish(definition)
```

启动请求：`POST /api/v1/task/instances/start`（SDK 发送普通变量值）：

```json
{
  "templateKey": "sdk_2b54634c6dfb4bd99c7aa03c9c96bcfa_status_missing",
  "businessKey": "sdk_2b54634c6dfb4bd99c7aa03c9c96bcfa_status_missing_ready",
  "variables": { "state": "ready" }
}
```

实际 HTTP 500，code=INTERNAL_ERROR，message：

```text
camunda 返回 500: Cannot instantiate process definition eb500184-e325-11f1-b049-00155d21c8ae: Unknown property used in expression: ${ready_assignee}. Cause: Cannot resolve identifier 'ready_assignee'
```

同一模板以 state=unknown 且不传 fallback_assignee 时，同样返回 500，无法解析 fallback_assignee。SDK 保留 effect=unknown 及模板/业务键/定义上下文，没有自动重试。按定义 ID 和精确 businessKey 查询引擎运行实例，两次均为空。

期望：网关在启动前返回 400/VARIABLE_VALIDATION_FAILED（或 SDK 在有明确可靠规则时给出 PARAMETER_REQUIRED），只指出实际选中分支缺失的办理人，effect=none。金额表达式的两条路径缺参已经按此要求返回 400，可作为对照。

另一个仍存在的接口差异：GET /api/v1/template/{key}/start-variables?state=ready 或 ?state=unknown 都返回 ready_assignee 与 fallback_assignee 的候选并集。SDK 已将它们作为 hints，并返回 START_REQUIREMENTS_HINTS_ONLY；不会把两条路径都当必填。正式 Swagger 声明决策 query 可精确过滤，当前实际返回仍需后端核对。

证据：

- [首轮报告](../../.scratch/workflow-function-sdk/verification/sdk_fcebc692bd094f05b8b9988919f1da55.json)：发布、单人审批、金额正常路径通过；状态负向断言失败后该报告未执行正常状态启动。
- [分离复验报告](../../.scratch/workflow-function-sdk/verification/sdk_2b54634c6dfb4bd99c7aa03c9c96bcfa.json)：status-default 两条正常路径通过，status-missing-selected 两条负向路径失败，amount-missing-selected 两条负向路径通过。请求、响应及只读实例查询完整保留。

这些测试模板已清理。用户复验需用唯一新 key 重新发布，不复用已删除的部署。复验后才能判断 04 是否满足剩余验收；目前不解锁 05/09。

## 02：发布协议变更已落地

用户交接明确“不需要再传 startable”。本轮正式 Swagger 的 POST /api/v1/template 也已不再列出该 multipart 字段，见 [发布契约及来源 SHA](../../packages/workflow-sdk/contract/backend-publish-2026-11-18.json)。SDK publish 默认不发送 startable；公开字段保留为弃用兼容，true 被接受但不发送，false 在任何网络请求前以 UNSUPPORTED_PUBLISH_OPTION/effect=none 拒绝，避免误以为禁止发起已生效。TemplateSnapshot.startable 仍保留后端原值或缺省；不再产生旧 PUBLISH_OPTIONS_MISMATCH。

最小发布通过 SDK 显式 compile 和 publish 完成；GET 回读名称、displayJson、模板版本与定义标识一致，按 deploymentId 核对引擎定义和租户，发布后没有自动启动。本单原来的 startable=false 保存要求按用户最新协议调整，历史失败和跳过仍保留，未改写为通过。

## 08 / 12：复验结果

| 项目 | 当前结果 | 证据 |
| --- | --- | --- |
| 单 timer 发布命名空间 | duration、date、cycle 仅含 timer 的定义均已发布并运行成功；到期前 ACTIVE 且无人工任务，到期后 COMPLETED，结束 worker 完成。旧命名空间错误不复现。 | [定时报告](../../.scratch/workflow-function-sdk/verification/sdk_334d792d888a4da9a0621cb66a1df35c.json) |
| 按 processInstanceId 消息关联 | 仍 400/MESSAGE_CORRELATION_FAILED，ENGINE-13028 Cannot specify a tenant-id when correlate a message to a single process instance. | 分离复验报告 message-instance |
| 带真实候选用户/组的 reassign | 仍 500/INTERNAL_ERROR，下游 HTTP 405 Method Not Allowed；失败后任务和候选分配保留，实例 ACTIVE。 | 分离复验报告 reassignment-candidates |
| 带真实候选用户/组的 refuse | 仍 500/INTERNAL_ERROR，下游 HTTP 405 Method Not Allowed；SDK 保留 unknown 和任务身份，无自动重试或补偿。 | 定时报告 reassignment-identity |

本轮三个真实报告共创建 15 个隔离部署，均已逐项 cleaned。业务实例行及模板历史可能按后端删除契约保留，没有直接清库。未修改同级后端仓库。最终本地检查、包 SHA 和清理核对见 [本轮账目](../../.scratch/workflow-function-sdk/verification/06-resume-delivery.json)。

