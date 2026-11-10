# 交接：工作流设计器后续架构升级

日期：2026-11-09

## 下一会话目标

继续推进工作流设计器架构升级。已完成 Candidate 01「节点定义统一登记」后，建议按架构评审顺序做 Candidate 02：收窄撤销/重做历史，让历史只反映流程编辑意图；视口等编辑器状态仍通过完整设计稿持久化。此交接只确定调查与方案方向，Candidate 02 尚未立项或实现。先检查当前代码和工作区，再决定是否需要规格、工单或 ADR。

Candidate 03「将画布编辑事务从大型 SFC 收到编辑会话 module」留待 Candidate 02 完成后重新评估，不要把两项合并成一次重构。

## 已完成工作

- Candidate 01 的方案、验收边界和两张已完成工单：.scratch/workflow-node-registry/spec.md、.scratch/workflow-node-registry/issues/01-node-registry-catalog.md、.scratch/workflow-node-registry/issues/02-node-validation-connections.md。
- 节点定义实现入口：packages/workflow-designer/src/nodes/index.ts；历史与事件编排仍在 packages/workflow-designer/src/WorkflowDesigner.vue。
- 最近一次包级验证通过：pnpm --filter @workflow/designer typecheck、pnpm --filter @workflow/designer test（60 tests）及 pnpm --filter @workflow/designer build。
- 更完整的长期约束以 Agent.md、docs/adr/0005-vue-workflow-designer.md、packages/workflow-designer/README.md 为准；不要在本交接中重复它们的契约内容。

## Candidate 02 调查入口

主要查看 packages/workflow-designer/src/WorkflowDesigner.vue：

- snapshot() 当前序列化 currentDocument()，即完整设计稿信封。
- pushHistory()、restoreHistory() 和 updateDocument() 负责历史入栈与恢复。
- onViewportChange() 在平移/缩放后更新 editorState，然后调用 updateDocument()；因此视口导航会进入当前历史快照。
- 节点拖动、自动布局、模板替换、导入及属性编辑都与 pushHistory() / updateDocument() 有交互，修改前要逐一追踪，保留现有 undo/redo 语义。
- currentEditor() 组装视口、路由与其他 editor 状态；模型坐标仍在 WorkflowModel v1 中，是业务模型的一部分。

仓库根目录的架构评审文件曾列出以下目标行为：节点或连线编辑进入语义历史；视口、主题等纯展示状态继续持久化，但导航不新增 undo 步。候选设计图见本机会话临时文档 C:/Users/ht/AppData/Local/Temp/architecture-review-20261109-流程设计器.html#history；它是临时文件，若不可用，以本交接和当前代码为准。

## 方案阶段需要明确的边界

- 历史记录的最小单位是什么：业务模型、Vue Flow 图快照，还是模型加必要的连线路由状态。不要只改 snapshot() 的序列化内容而不检查恢复路径。
- 节点拖动和自动布局会改 WorkflowModel.nodes[].x/y，属于编译输入模型变化，应继续可撤销；路由点属于 editor 状态，需要明确在节点/连线撤销时如何恢复或重算。
- 模板替换、JSON 导入、undo、redo 后，视口、主题、路由及未知 editor 扩展应保持合理且符合现有信封语义。
- update:modelValue 仍应发出完整设计稿；compile 回调仍只接收原有 WorkflowModel v1。不新增业务字段或改变设计稿信封版本。
- 核验 onMounted() 的初始历史快照时机、文本输入的单步提交、拖动只在结束时提交、分支回流路由、未知数据保护等已有行为。新增测试优先从设计器公开行为断言，沿用 packages/workflow-designer/tests/WorkflowDesigner.test.ts。

## 工作区注意事项

开始前先运行 git status --short 并阅读相关差异。当前工作区不干净；除节点登记改动外，还可见 package.json、pnpm-lock.yaml、vite.config.ts 与设计器 CSS 的本地修改。它们的来源和意图尚未确认，先检查并保留，不要 reset、checkout 或覆盖。仅处理 Candidate 02 所需的文件。

## 建议技能

- codebase-design：设计历史状态边界与 edit-session seam，评估是否需要深模块。
- domain-modeling：仅当本次形成需长期记录的新架构决策或术语时使用；先阅读 docs/agents/domain.md。
- to-spec、to-tickets：若 Candidate 02 需要正式规格及分步工单，再使用这两个技能；创建/更新本地工单前读取 docs/agents/issue-tracker.md。

