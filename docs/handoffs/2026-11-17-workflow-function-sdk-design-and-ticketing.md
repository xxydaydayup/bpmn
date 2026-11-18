# 函数式流程 SDK 设计与工单拆分交接

日期：2026-11-17（Asia/Shanghai）。最新接续方式：已发布 13 张纵向子工单，按工单核验已有实现并补齐缺口。

## 子工单发布与接续入口（最新）

用户说明已在另一个对话完成实现，随后明确要求先生成 13 张纵向子工单再按工单推进。现已在原功能目录发布 02—14，一单一文件；[工单索引与依赖计划](../../.scratch/workflow-function-sdk/tickets-plan.md) 为接续入口。父工单保持原样。

- 先读 [Agent.md](../../Agent.md)、[本地工单约定](../agents/issue-tracker.md)、[设计规格](../../.scratch/workflow-function-sdk/spec.md) 和工单计划。当前从04、08、12的剩余后端差异接续，编译已恢复、06已完成；旧超时保留历史；02 的 startable=false 复验按用户授权暂时跳过。
- 子工单发布时统一 Status: ready-for-agent、Progress: pending。pending 表示尚未按各单核验与补齐，不表示其代码尚未编写；不得直接继承父工单勾选或批量关闭。每单已注明相关既有证据和已知缺口。
- 保留已有 SDK 0.2.0 代码和验证记录，逐项复核、复用满足要求的成果，仅补齐缺口。直接阻塞工单完成后再实施后续工单，每单保留自己的真实引擎验收，不把所有验证压到 14。
- 04保留单人决定及动态路径参数差异；07保留服务环境条件；08保留实例ID关联与单timer发布差异；12保留非空候选清理失败；13等待前置后补余下Gateway与页面验证；14完成组合交付。固定办理人旧差异已复验解除。
- 发布工单阶段仅同步文档；后续实施结果已更新于下节及各单 Validation。已完成的真实串行/版本场景可以复用，恢复后新增真实编译和完整引擎复验，逐单结果已写入工单；隔离资源均按报告清理。未执行 Git 提交。

原“拆分待确认”状态已被这次用户指令和发布动作替代。下文是此前设计与实现阶段的历史记录，涉及未发布、未实现或待批准的表述不再用于指导下一步。

## 实施状态更新

02—14共13张纵向子工单已发布。03、06、11 completed；02/04/08/12 in-progress；05/07/09/10/13/14 pending。02 startable=false沿用用户跳过授权，跳过不计通过，其余依赖和验收要求保持。

编译已恢复，四类SDK复核28/16/17/22ms；旧超时原始报告保留。06嵌套并行从发布、启动到两级join、历史、结束worker与独立安装包消费者全部通过。03/11新增真实启动/办理响应丢失核对通过；08真实消息定时/运行参数/歧义/未授权、12无候选基线/受限/未授权通过，但不能代替各自剩余必需项。

04仍有单人review_passed规则与approved契约冲突及未选中分支必填；08仍有实例ID消息tenant-id冲突和单timer发布XML命名空间错误；12实际候选用户/组任务的两操作均500/下游405。详见 [后端差异及复验条件](../../.scratch/workflow-function-sdk/verification/04-08-12-backend-followup.md)。07仍缺worker可访问测试服务。04阻塞05/09，12与05阻塞13，未跨依赖迁移工作台。

SDK补齐参数阶段错误的任务/业务上下文，40项公开测试、生产构建、实际tgz仓库外ESM/类型/浏览器消费通过。旧全量212项是复用，未标为本轮重跑。九份恢复后真实报告25个部署全部cleaned；最终包复验另单保存，累计资源与包SHA以 [交付索引](../../.scratch/workflow-function-sdk/verification/ticket-audit-delivery.json) 为准。包未发布registry，未执行Git提交。

代码入口和调用方式见 [函数SDK指南](../../packages/workflow-sdk/docs/function-sdk.md) 与 [验证记录](../../packages/workflow-sdk/docs/function-sdk-verification.md)，逐单进展以 [tickets-plan](../../.scratch/workflow-function-sdk/tickets-plan.md) 及各单Validation为准。

下文保留设计交接时的历史状态，接续实施时以本节、父工单与验证记录为准。

## 用户已确认的目标

- 业务系统通过函数和参数使用流程引擎，由 SDK 组织后端所需 JSON，减少调用方对协议的了解。
- 同时覆盖“定义流程”和“调用流程运行能力”，包括发布、启动、办理及查询。
- 必须通过真实引擎流转验收；模拟请求、XML 编译成功或任务消失都不足以证明流程完成。

这些目标已写入规格。不要重新发起需求访谈；新增问题应限于尚未确定的拆分或实施条件。

## 交付物与当前状态

| 交付物 | 位置 | 状态 |
| --- | --- | --- |
| 设计规格 | [spec.md](../../.scratch/workflow-function-sdk/spec.md) | 已编写；功能尚未实施 |
| 调用设计 | [api-examples.md](../../.scratch/workflow-function-sdk/api-examples.md) | 拟交付接口，示例尚未执行 |
| 父工单 01 | [函数式流程定义与运行 SDK](../../.scratch/workflow-function-sdk/issues/01-function-definition-and-runtime-sdk.md) | 已发布本地文件；Status: ready-for-agent，Progress: pending |
| 子工单拆分草案 | [tickets-plan.md](../../.scratch/workflow-function-sdk/tickets-plan.md) | draft；拟建 02—14 共 13 张，尚未发布 |

上一轮已向用户展示拆分及依赖，等待确认粒度和阻塞关系。`to-tickets` 要求拆分经用户认可后发布；目前没有收到认可。此次“整理交接文档”不代表认可拆分，也不代表开始实现。

新增 definition/client 仍是方案；当前实现和使用边界以 [SDK README](../../packages/workflow-sdk/README.md) 为准。较早的 [模型 SDK 规格](../../.scratch/workflow-model-sdk/spec.md) 仅作背景，继续设计时以本次规格为主。

## 接续步骤

1. 先读 [Agent.md](../../Agent.md)、[本地工单约定](../agents/issue-tracker.md) 和 [标签映射](../agents/triage-labels.md)，再读上表四份文档。
2. 未收到用户认可时，保留拆分草案；继续拆票时只收集必要的粒度和依赖反馈。不要把父工单的 ready-for-agent 当作用户已批准子工单拆分。
3. 用户认可后，按草案在同一 issues 目录发布 02—14，每单一个文件，包含规格/父工单引用、真正的阻塞关系、状态、进度、验收项和 Comments。遵循 `to-tickets`，保持父工单原样。
4. 收到实施指令后，从无阻塞的 02 开始，按依赖推进；具体切片和覆盖关系只维护在拆分文档及后续子工单中。
5. 每个切片包含自己的公开入口验证、消费者示例和真实引擎场景。环境条件不足时可推进离线部分，对应真实验收保持未完成。

## 实施时的导航

完整接口、映射规则、错误语义与验收场景见规格和调用设计；下表只提供现有代码入口。

| 关注点 | 入口 |
| --- | --- |
| 当前 SDK 模型、导出与校验 | [index.ts](../../packages/workflow-sdk/src/index.ts)、[types.ts](../../packages/workflow-sdk/src/types.ts)、[validation.ts](../../packages/workflow-sdk/src/validation.ts) |
| 宿主业务网关与结果类型 | [gateway.ts](../../src/api/workflow/gateway.ts)、[types.ts](../../src/api/workflow/types.ts) |
| 表单、节点参数与版本一致性 | [forms.ts](../../src/api/workflow/forms.ts)、[nodeForms.ts](../../src/api/workflow/nodeForms.ts)、[consistency.ts](../../src/api/workflow/consistency.ts) |
| 宿主请求封装 | [request.ts](../../src/utils/request.ts) |
| 后端声明契约快照 | [form-swagger.json](../../.scratch/form-swagger.json)，仅作契约证据，不代表线上行为已验证 |
| 公开 API 与宿主兼容测试先例 | [public-api.test.mjs](../../packages/workflow-sdk/tests/public-api.test.mjs)、[business-workflow-gateway.test.mjs](../../tests/business-workflow-gateway.test.mjs) |
| 包消费验证及已有联调入口 | [verify-package.mjs](../../packages/workflow-sdk/scripts/verify-package.mjs)、[form-smoke.mjs](../../scripts/form-smoke.mjs) |

几个容易误用的约束已在规格展开，实施前须核对：

- 标准启动传普通变量值，标准完成按变量使用 `{ value: ... }` 包装；旧接入说明中的完成示例不能直接作为契约。
- 单人审批、个人会签意见和引擎汇总结果各有语义；表单原 key、任务实际定义版本和后端参数规则必须保留。
- 现有请求封装仅返回响应体；接入客户端需要保留真实 HTTP 状态。写入结果不确定时不得自动重试。
- 没有人工任务可能表示正在等待服务、消息、定时器或 worker，终态须结合进度与历史核实。

## 架构与验证边界

实施前按 [领域文档约定](../agents/domain.md) 阅读相关材料。[ADR-0004](../adr/0004-workflow-control-plane.md) 保持后端执行与安全职责；[ADR-0005](../adr/0005-vue-workflow-designer.md) 当前的纯模型 SDK 边界需在首次实现显式客户端时同步扩展，尚未修改。SDK 根模型入口继续兼容，新增定义与客户端入口的完整边界见规格。

本项工作目前只完成设计、调用示例、父工单及拆分草案。已检查文档关联、工单元数据和草案依赖无环；尚无子工单文件，未实现新增 SDK，未运行功能测试或构建，也未执行真实部署、启动、办理、提交、推送或 registry 发布。

## 工作区与交接携带事项

- `.scratch/` 被 Git 忽略。上表中的规格、示例、工单、拆分草案及契约快照目前只在本地；跨机器或新克隆接续时须一并转交，单独同步本交接文档不足以继续。未修改忽略规则或强制入库。
- 写交接前已有无关的工作区改动，包括 CONTEXT.md、ADR-0006、流程预览文档和 HTML 文件。保留它们，继续工作时重新检查状态，不归入 SDK 设计交付。
- 本轮仅新增本交接文档；按仓库规则检查文档链接和表述，无需启动应用或构建。

## Suggested skills（建议技能）

下一位 agent 应通过 Skill 工具调用所需技能；工具不可用时，从当前会话技能目录读取对应 SKILL.md。

- `to-tickets`：继续确认拆分并发布本地子工单时使用，先读其发布前确认要求。
- `codebase-design`：开始 SDK 实施时，用于公开接口及模块边界设计。
- `domain-modeling`：需要修改术语或 ADR 时使用，不能提前把提案标为 accepted。
- `diagnosing-bugs`：实际引擎联调出现故障时使用。
- `agent-browser`：需要验证宿主页面接入时使用。
