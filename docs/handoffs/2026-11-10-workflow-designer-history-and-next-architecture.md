# 交接：工作流设计器语义历史完成与后续架构升级

日期：2026-11-10

## 下一会话目标

继续评估工作流设计器后续架构升级。Candidate 02「让撤销/重做历史只追踪编辑意图」已按规格实现；接下来可重新评估 Candidate 03「将画布编辑事务从大型 WorkflowDesigner.vue 收到编辑会话 module」，先做架构分析与边界设计，再决定是否创建规格、工单或直接实现。不要仅按旧交接把 Candidate 02 当作待办，也不要未经评估就把拆分扩大为全包重构。

## 已完成工作与依据

- Candidate 02 的规格及验收细节：.scratch/workflow-designer-history/spec.md。
- 四张完成工单及逐项验收状态：.scratch/workflow-designer-history/issues/01-semantic-history.md 至 04-template-import-and-host-history.md。
- 实现入口：packages/workflow-designer/src/WorkflowDesigner.vue；路由恢复支持：packages/workflow-designer/src/layout.ts；公开行为测试：packages/workflow-designer/tests/WorkflowDesigner.test.ts。
- 语义历史记录 WorkflowModel v1 和按顺序流端点/重复关系关联的路由恢复数据；视口更新单独发布完整设计稿，不产生历史步。撤销/重做保留当前信封、视口、主题、编辑器扩展；外部模型替换重设历史基线，组件自身的受控 v-model 回写通过发出快照集合识别。
- 节点/顺序流编辑、文本提交、拖动、手动布局、模板和有效 JSON 导入已纳入历史；拖动在结束时提交，初始自动布局后建立基线。未来只读信封仍原样保留。
- Candidate 01 节点目录登记已有实现，参考 packages/workflow-designer/src/nodes/index.ts 及旧交接 docs/handoffs/2026-11-09-workflow-designer-architecture-next-step.md。

## 验证状态

- pnpm --filter @workflow/designer typecheck：通过。
- pnpm --filter @workflow/designer test：74 项通过。
- 最终 pnpm build：通过；构建有既有大 chunk 体积提示。
- 根目录 pnpm test：设计器测试通过，但总测试运行有 9 项 BPMN/运行时测试失败。已观察到的失败是 data: URL mock 不能解析相对 ./types 模块，波及 console 和 data-table 测试；全量问题尚未单独调查。
- 未创建提交。工作区已有多项未提交改动，不能把所有差异都归为本次历史实现。

## 开始前

先读 Agent.md，并检查 git status --short 与相关 diff。保留现有工作区内容；不要 reset、checkout 或覆盖其他未提交修改。设计器的长期契约以 docs/adr/0005-vue-workflow-designer.md、packages/workflow-designer/README.md 和完成的历史规格为准。若讨论领域术语或新增 ADR，遵循 docs/agents/domain.md；创建/更新本地工单前遵循 docs/agents/issue-tracker.md。

若继续 Candidate 03，先沿 WorkflowDesigner.vue 追踪节点/连线/属性事件、画布更新发布、撤销重做、导入/模板、布局、宿主回调和 Vue Flow 生命周期。重点设计一个可独立测试的深模块接口，让 SFC 负责视图绑定，编辑会话模块负责业务模型、提交历史和路由恢复；保持 bpmn-js 编辑器边界、WorkflowModel v1、设计稿信封和公开宿主接口不变。优先用现有公开行为测试保护契约，再逐步迁移，不要改写或删除现有未提交的节点目录及其他功能改动。

## 建议技能

- codebase-design：用于梳理深模块边界、接口和测试 seam，是 Candidate 03 的首选。
- tdd：若下一会话决定拆分编辑会话模块并需要先建立迁移保护测试，再使用。
- domain-modeling：仅在形成新的领域术语或架构决策、需要补充上下文/ADR 时使用。

