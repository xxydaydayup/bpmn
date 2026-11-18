# workflow-function-sdk 接续交接

日期：2026-11-18（Asia/Shanghai）。下一次会话用于复核后端修复、完成 02/04 剩余验收，再按依赖推进后续工单。

## 用户最新指示与本次交接边界

用户本次明确要求先写交接，稍后继续，并提供两项更新：

- **04 入口分支问题后端应该已经解决**。这是待真实复验的最新反馈，不能继续直接引用旧报告断言当前仍失败，也不能据此将 04 标为 completed。
- **模板发布的 startable 保存问题后端也解决了，不需要再传这个参数**。接续应按这个最新调用要求调整 SDK 发布请求，并核对当前接口契约。旧的 startable=false 跳过记录仍是历史跳过，不计通过；协议变化应明确记录，不再机械地把旧参数保存要求作为新协议的必需项。

本次仅新增交接文档，核对了计划、历史证据索引、当前发布代码和工作区状态；没有修改产品代码、工单状态或旧证据，没有执行构建、引擎发布或实例操作。

## 接续先读

先读 [Agent.md](../../Agent.md)；领取或更新工单前读 [本地工单约定](../agents/issue-tracker.md)。工单正文及 Comments 是逐单执行依据。

| 资料 | 用途 |
| --- | --- |
| [tickets-plan.md](../../.scratch/workflow-function-sdk/tickets-plan.md) | 13 张子工单、状态、依赖与共用完成条件；接续以其届时现状为准 |
| [spec.md](../../.scratch/workflow-function-sdk/spec.md)、[api-examples.md](../../.scratch/workflow-function-sdk/api-examples.md) | 函数定义及运行接口设计；涉及后端新协议时结合最新指示和契约核对 |
| [最初设计与拆票交接](2026-11-17-workflow-function-sdk-design-and-ticketing.md) | 原始范围及拆分背景 |
| [交付证据索引](../../.scratch/workflow-function-sdk/verification/ticket-audit-delivery.json) | 历次实际检查、包 SHA、独立消费者、逐场景报告与清理账目 |
| [SDK 使用说明](../../packages/workflow-sdk/docs/function-sdk.md)、[验证说明](../../packages/workflow-sdk/docs/function-sdk-verification.md) | 已公开的调用方式及验收边界；其中 startable 和入口分支结论需要按复验追加更新 |
| [04 后端问题及历史诊断](2026-11-17-workflow-sdk-04-backend-issues.md) | 原先失败的精确请求、响应、编译 XML 交叉核对；保留为历史，不覆盖 |

本次核对的计划状态：completed 为 **03、06、11**；in-progress 为 **02、04、08、12**；pending 为 **05、07、09、10、13、14**。未因后端反馈变更状态。

## 可复用的已验证检查点

11 月 17 日已完成 SDK 对新人工意见协议的适配：单人意见和会签个人意见依据当前任务规则写入 passed:Boolean，兼容旧 approved/vote；服务与引擎汇总变量仍受保护。映射使用后端准确规则及任务版本，不拆活动 ID 或解析说明文本。实现入口是 [client-parameters.ts](../../packages/workflow-sdk/src/client-parameters.ts)。

该轮单人同意/拒绝已完成真实发布、启动、办理、路径与历史终态核对，覆盖原表单 key、false、后续办理人、拒绝提前结束及结束 worker；实际 tgz 的仓库外消费者也通过真实同意/拒绝。主要证据是 [04 场景报告](../../.scratch/workflow-function-sdk/verification/sdk_5a47d8d7ad284b58860863a8e546da7d.json) 和 [独立消费者报告](../../.scratch/workflow-function-sdk/verification/sdk_d19e2abcf43b4225a4699d297ff7d875.json)。详细检查与资源账目直接复用交付索引。

此前编译超时已有单独恢复记录，旧超时原件仍保留；编译恢复不等同于未验收功能全部通过。11 月 17 日的 44 项 SDK 测试、生产构建及包验证是当时源码的证据，不能作为当前工作区或后续修复后的全量证明。

## 下次实施顺序

### 1. 核对当前协议并调整发布请求

正式接口入口：

- [模型 Schema](http://192.168.124.202:8085/bpmn/json-schema)
- [模型及业务规范](http://192.168.124.202:8085/bpmn/spec)
- [Swagger UI](http://192.168.124.202:9000/swagger/index.html#/) 与 [Swagger JSON](http://192.168.124.202:9000/swagger/doc.json)

模型 Schema 不能代替每个模板或任务的运行参数规则。此前正式规范版本号未随语义变动升级，重新获取时记录时间、来源及 SHA，不覆盖旧快照。

本次已核对 [client.ts](../../packages/workflow-sdk/src/client.ts)：publish 仍无条件追加 startable（缺省 true），并在显式选项与返回值不一致时抛出 PUBLISH_OPTIONS_MISMATCH。[client-types.ts](../../packages/workflow-sdk/src/client-types.ts) 仍公开 startable 发布选项，使用说明和测试也有旧约定。

按用户最新要求，让发布请求不再依赖或发送该参数；核对公开选项的兼容处理、返回快照字段、错误语义、示例及包验证中的旧断言，不把请求参数停用误解为必须删除后端返回字段。同步在 [02 工单](../../.scratch/workflow-function-sdk/issues/02-minimal-definition-and-publish.md) 记录新协议来源、对原验收项的调整依据和实际结果；保留旧请求、保存差异和跳过证据。通过 SDK 公开入口真实发布，核对版本、部署、定义、display-json 及清理，不能只以 HTTP 成功关闭工单。

### 2. 复验 04 入口条件分支

读取 [04 工单](../../.scratch/workflow-function-sdk/issues/04-approval-and-conditional-routing.md) 及上述历史报告。优先重跑曾失败的非默认入口：

- 状态 ready 只传 ready 分支办理人；unknown 只传默认分支办理人。
- 金额 101 只传 large 分支办理人；0 只传 small 分支办理人，保留数值 0。
- 查询 start-variables 时核对决策 query 与候选/必填含义；缺少实际选中分支必需参数时仍须被正确拒绝。

同时记录实际发布、启动、进入节点、办理人、办理、历史终态及清理；结合有效旧证据覆盖 04 全部必需项。历史失败原因为非默认路径错误要求默认路径办理人；不要用同时补齐两条路径参数来绕过复验。SDK 不自行求值后端表达式。新增报告与旧失败分别存放，全部必需项满足后才更新完成状态及计划。

### 3. 解锁后优先推进 05，再推进依赖允许的分支

此前建议下一项优先 [05 多人审批](../../.scratch/workflow-function-sdk/issues/05-multi-person-approval.md)，但尚未开始该单的新实现。先审计现有构造、参数映射和证据，补齐 ALL/ANY/VOTE、顺序多人、同意/拒绝结算及剩余任务处理，验收清单以工单全文为准。

04 完成且 06 已完成后，[09 递归子流程](../../.scratch/workflow-function-sdk/issues/09-recursive-subprocess-reuse.md) 可推进，随后是 [10 超时动作](../../.scratch/workflow-function-sdk/issues/10-timeout-actions.md)。[13 宿主接入](../../.scratch/workflow-function-sdk/issues/13-host-workbench-sdk-integration.md) 等待 05、11、12；最终 [14 独立组合消费者](../../.scratch/workflow-function-sdk/issues/14-independent-consumer-and-final-acceptance.md) 等待 07、08、10、13。其余依赖直接查计划，不扩大原 02 的例外范围。

## 其他尚未解除的条件

以下是最后一次有效证据的结论，本次没有重新请求后端；不能从 04/startable 的修复反馈推断这些项目也已修复。详情见 [04/08/12 后端跟进记录](../../.scratch/workflow-function-sdk/verification/04-08-12-backend-followup.md)。

- [08 消息与定时等待](../../.scratch/workflow-function-sdk/issues/08-message-and-timer-waits.md)：业务键消息→定时→结束已通过；processInstanceId 关联曾失败 ENGINE-13028，单 timer 发布曾有 camunda 命名空间错误。
- [12 退回重派](../../.scratch/workflow-function-sdk/issues/12-return-and-reassign.md)：无候选基线及权限/操作开关有通过证据；真实候选用户/组存在时，refuse/reassign 曾返回 500、下游 405，分配没有清空。
- [07 服务与服务会签](../../.scratch/workflow-function-sdk/issues/07-service-and-service-countersign.md)：还缺后端 worker 可访问且能核对调用与结果的隔离测试服务，用户此前表示暂时没有。

用户是前端开发者。SDK 或前端问题可直接修复；后端问题记录准确请求、响应、资源与影响，供用户交涉，不擅自改同级 Go/Java 仓库。每张工单分别记录实际验证和真实引擎验收，缺条件保留未完成并推进依赖允许的其他项。

## 当前工作区与证据保留

工作区有大量未提交及未跟踪的 SDK、设计器、宿主和文档改动，也包含其他会话成果。接续先检查 git status 和目标文件差异，不能整体恢复、覆盖或清理；尚未要求提交或推送。

尤其注意：另一个 bizJson 任务已有 [当前验证记录](../../packages/workflow-sdk/docs/node-bizjson-verification.md) 及 11 月 18 日模型契约来源，已记录实现、241 项测试及后端编译结果，也明确首尾空白仍有后端差异。[该任务较早交接](2026-11-18-node-bizjson-implementation.md) 描述的是实施前状态，不能据此断言 bizJson 尚未实现。它的验证范围不替代函数式 SDK 各单的真实引擎要求。

`.scratch/workflow-function-sdk/` 被 Git 忽略。工单、原始验证报告和 tgz 都在当前磁盘，迁移机器、目录或干净 worktree 时须一并保留；仅提交本交接不会带上它们。已清理资源不可直接重放，复验需创建隔离新资源并记录清理。历史 tgz 的准确 SHA 与消费者路径见交付索引，源码变动后重新打包验证。

verification 下若干 record/sync 脚本是当轮专用记录工具；先读后用，避免重复执行覆盖证据或重复追加文案。

## Suggested skills

用户本次显式调用的是 [handoff](C:/Users/ht/.agents/skills/handoff/SKILL.md)，用于本交接。下一位代理按实际阶段和届时用户授权读取对应 SKILL.md；环境有 Skill 工具时通过该工具调用。

- **handoff**：再次需要交接时调用，写新文件并引用现有证据。
- **diagnosing-bugs**：复验发现真实失败并需要定位时使用；先读取已有报告。
- **agent-browser**：进入 13 或其他需要真实页面交互验收的阶段时使用，核对宿主页面完整操作。

已完成的拆票不需要重跑；技能建议不构成额外审批步骤，具体执行遵循新的会话指示。
