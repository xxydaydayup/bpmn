# 函数 SDK：验收范围调整后接续

> 2026-11-19 接续结果：本交接已执行完毕，当前状态/证据请看 [本期交付记录](2026-11-19-workflow-function-sdk-delivery.md)。02—14和父01已按既定调整范围completed；下文保留接续前历史，不能再当成当前待办。

日期：2026-11-19（Asia/Shanghai）。用户本次要求先调整08验收范围、保存交接，稍后继续；不要据此立即开发、操作引擎或创建新chat。

## 接续入口与本轮变更

先读 [Agent.md](../../Agent.md) 和 [本地工单约定](../agents/issue-tracker.md)，再读 [计划顶部最新状态](../../.scratch/workflow-function-sdk/tickets-plan.md) 及对应工单顶部当前有效结论、正文和 Comments。旧交接与长文下部保留历史，不能拿历史阻塞覆盖最新授权。

本轮会话主要是状态梳理、解释差异及用户授权收窄范围；只修改了需求/工单/README/验证记录，没有修改产品代码或修复后端。用户已确认的07/08/10/12范围均已写入 [spec顶部](../../.scratch/workflow-function-sdk/spec.md) 和对应工单，此处不重复细则。

## 下次从哪里继续

1. 核对 [07服务](../../.scratch/workflow-function-sdk/issues/07-service-and-service-countersign.md) 与 [10超时](../../.scratch/workflow-function-sdk/issues/10-timeout-actions.md) 的调整后验收项。两单仍为in-progress，剩余工作是按新范围逐项核对、同步勾选和Validation后收口，不能直接把缺失真实证据写成passed。真实服务及NATS缺失不再作为本期阻塞；内部end现状已被用户接受，不要求为本期修复整个实例终止。
2. 推进 [13宿主工作台接入](../../.scratch/workflow-function-sdk/issues/13-host-workbench-sdk-integration.md)：其05/11/12前置已完成。编译/发布已有SDK adapter，其他运行操作的迁移、页面单人/多人/重派和交互回归仍需实际实现验收，不能仅凭编译发布迁移判完成。按工单确认当前代码，避免重复已有实现。
3. 前置全部完成后做 [14独立消费者与最终交付](../../.scratch/workflow-function-sdk/issues/14-independent-consumer-and-final-acceptance.md)：按已调整的本期范围设计组合验证、核对资源清理、最终回归/包验证，再决定是否关闭父工单。

当前准确状态见计划顶部；08、12已按收窄范围completed，父工单仍in-progress，13/14仍pending。本次没有执行上述接续步骤。

## 后端问题如何处理

- [08消息工单](../../.scratch/workflow-function-sdk/issues/08-message-and-timer-waits.md)：businessKey关联已通过；processInstanceId路径仍因tenant-id参数组合报ENGINE-13028。本期已排除该路径成功验收，但仍是未修复bug；不可声称修好、移除租户权限校验或静默换业务键重发。
- [12重派工单](../../.scratch/workflow-function-sdk/issues/12-return-and-reassign.md)：本期无候选用户/组、直接传userId，真实基线已通过。带候选身份的下游405保留未修复，不能把它推广为普通直接重派也坏了；用户已将候选身份排除本期。
- 04状态入口缺参返回500是此前已接受差异，非本次修复；07/10的未验证或行为差异同样须保留真实描述。

## 证据与工作区保护

- 验证总入口：[函数SDK验证记录](../../packages/workflow-sdk/docs/function-sdk-verification.md)；最新历史交付账：[07交付总账](../../.scratch/workflow-function-sdk/verification/07-approval-subprocess-timeouts-delivery.json)。测试数量、包SHA及真实资源证据按这些原件查，不从旧交接复制后冒充本轮结果。
- 本次没有运行测试、构建或引擎；最近已有SDK52项和构建通过记录属于2026-11-18，历史根目录全量回归不代表最新全量。
- `git status --short` 已有多处SDK源码、测试、示例和未跟踪文件，均须保留；本会话仅动文档，不要整体reset/restore/clean，也不要把工作区全部改动归为本次。
- `.scratch/`包含本地工单、原始报告和tgz，可能被Git忽略；交接时不要清理或只带走已跟踪文件。本期未发布registry、未提交/推送。
- 原始失败报告保持不变；未来真实运行只操作本次唯一前缀的隔离资源，按仓库规则清理，不触碰既有业务数据。

## Suggested skills（建议技能）

下一agent按任务调用 Skill 工具（如无该工具则读取对应SKILL.md）：

- `diagnosing-bugs`：只有继续复现/诊断消息关联或其他bug时使用，不因已知验收例外自动启动后端修复。
- `agent-browser`：13需要真实页面流程与交互回归时使用。
- `writing-for-agents`：更新接续说明等agent文档时使用。
- `handoff`：再次暂停任务并整理交接时使用。

用户未授权本轮创建新chat或委派子agent；若后续要委派，先确认适用授权。
