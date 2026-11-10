# 交接：实现工作流设计器编辑会话 module

日期：2026-11-10

## 下一会话目标

按已确认规格和工单实现 Candidate 03：将业务工作流设计器的语义编辑历史从大型 `WorkflowDesigner.vue` 收到包内私有的 edit-session module，并让现有 Vue Flow 画布 adapter 继续负责快照映射、画布应用、视口/信封合并和宿主发布。以现有 `WorkflowDesigner` 公开组件行为作为唯一高层测试 seam。

**本次是一项已授权的代码实施任务**：直接继续实现，无需重新询问用户是否实施或是否采用该 seam。实施颗粒度是一张工单；不扩展为全包重构。

## 已确定的设计与验收来源

- 规格和模块职责、历史语义、路由身份、兼容要求及测试范围：[.scratch/workflow-designer-edit-session/spec.md](../../.scratch/workflow-designer-edit-session/spec.md)。
- 唯一工单和验收清单：[.scratch/workflow-designer-edit-session/issues/01-extract-edit-session-module.md](../../.scratch/workflow-designer-edit-session/issues/01-extract-edit-session-module.md)。用户已确认一张工单、无阻塞项；状态为 `ready-for-agent`。
- Vue Flow 官方实践和对本次改造的应用：[Vue Flow 实践摘要](../vue-flow-best-practices.md)。重点是保留 `v-model:nodes`/`v-model:edges` 和默认画布变更应用；不要把每次画布变更帧、viewport、selection 或 dimensions 都记入业务历史；等尺寸有效后再执行几何依赖操作；每个 Flow 实例使用匹配且唯一的 id。
- 长期设计器契约依据：[Agent.md](../../Agent.md)、[ADR-0005](../adr/0005-vue-workflow-designer.md)、[设计器包说明](../../packages/workflow-designer/README.md) 和根目录 `CONTEXT.md`。开工仍按 Agent.md 检查适用材料。

关键边界：

- edit-session module 接收/返回完整 WorkflowModel v1（坐标和应保留的未知业务数据都在内）及用于恢复的语义路由快照；内部拥有历史基线、提交/去重、撤销/重做和分支状态。不要暴露历史数组或游标。
- 路由身份按顺序流端点与同端点重复项序号关联；module 不依赖 Vue Flow store、组件、DOM、异步布局器或宿主回调。
- `WorkflowDesigner` 继续负责 WorkflowModel 与 Vue Flow nodes/edges 映射、节点尺寸读取、反馈路由几何刷新、异步布局/初始化协调、当前 viewport/theme/宿主扩展与完整信封合并、`v-model` 发布。
- 保持文本提交、节点拖动结束、手动布局、有效 JSON 导入、模板应用的既有单次历史时机；失败操作不入历史。外部真实模型替换建新基线，组件自身受控回写不重置历史。
- 保持 WorkflowModel v1、设计稿信封 v1、公开包导出和宿主回调不变；未知业务数据仍阻止编译，未来未知信封仍只读原样保留。

## 当前工作区注意事项

- 工作区：`C:\Users\ht\Desktop\work\软件工厂\software_product\poc\bpmn`。
- 进入实施前读取 `Agent.md`，检查 `git status --short` 及相关差异。当前工作区有未提交修改，包含 `WorkflowDesigner.vue`、adapter、契约、布局、节点目录和测试等；它们不一定全部属于 Candidate 03。保留现有工作，不要 reset、checkout、清理或覆盖无关改动。特别保留新建的节点目录登记及节点模块。
- Candidate 02 语义历史已完成，但实现代码仍可能处于未提交状态。以当前代码和既有规格/公开行为测试为准，不把 Candidate 02 重做成待办。
- 上一份历史交接记录：设计器包 typecheck 通过，74 项包测试通过，根目录 build 通过；根目录全量 `pnpm test` 曾有 9 项 BPMN/运行时失败，已观察到 data URL mock 无法解析相对 `./types` 模块。由于工作树后续已有额外未提交修改，这些仅是先前基线记录，实施时应重新运行适合的设计器包检查并确认结果；不要把历史全量失败误归因于本次抽取。
- 不要求本交接任务运行测试；它只记录下一会话实施信息。代码实施按工单和 Agent.md 执行验证，并更新工单进度/结果。

## 推荐实施顺序

1. 对照规格梳理 `WorkflowDesigner.vue` 中语义快照捕获、历史基线/分支、撤销/重做恢复、路由映射及其画布生命周期调用点。
2. 先定义尽量小的内部 edit-session interface，能独立管理完整快照历史与 undo/redo；将 Vue Flow 路由几何刷新留在 adapter。
3. 迁移 SFC 调用并保持事件提交时机、v-model 受控回写识别、viewport 合并和异步初始化行为。
4. 通过公开 `WorkflowDesigner` 交互验证验收清单，运行设计器包 typecheck、测试及构建；确认相关工作区未提交内容没有被覆盖。
5. 更新本地工单 Progress 与验收勾选，并记录实际验证结果；只在实现确实改变已有架构取舍时才考虑 ADR。

## Suggested skills

- `codebase-design`：设计小而深的 edit-session interface，并确认 Vue Flow adapter 与模块职责的 seam。
- `tdd`：如按现有公开组件行为先保护撤销/重做契约，再逐步迁移实现，可使用此技能；避免为私有历史容器新增测试 seam。

