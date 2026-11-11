# 交接：子流程界面讨论结论与下一步

日期：2026-11-11

## 下一会话目标

继续完善工作流设计器的子流程体验。用户已经同意将已讨论方向写成交接，接下来应先按明确结论实现简洁的子流程节点属性面板和顶部工具栏入口，并将片段库表格改用项目已有 `DataTable`。片段 CRUD 页的整体视觉优化目标为苹果风格，但具体视觉方向用户希望后续继续讨论；先基于现有截图和组件做结构整理，避免擅自把未确认的色彩、圆角、阴影等细节视为定稿。

## 已确认的产品决定

1. **嵌入式子流程属性面板**：做简洁、苹果风格；暂时不需要搜索，直接用下拉框选择片段。降低当前面板的密度，移除重复呈现的片段列表与下拉选择。截图展示了目前不理想的情况：搜索结果按钮列表和选择下拉并存，来源、嵌入、刷新、清除等控件堆叠。
2. **片段库管理入口**：用户同意只把入口放进设计器，片段 CRUD 页面继续独立。入口放在设计器顶部工具栏；移除节点库中的「管理与插入片段」伪节点/辅助入口。当前标题行已有「管理子流程片段」链接，应合并到工具栏，避免重复入口。
3. **工具栏布局**：用户提出当前顶部一排按钮不够美观且左对齐别扭，倾向苹果风格，并询问按钮靠右是否更好。已回复建议按钮靠右、左侧留流程名和画布空间、按功能分组，并突出主操作。需要实现时结合现有工具栏明确哪些内容右对齐；不应保留标题行的第二个管理入口。
4. **CRUD 管理页视觉**：当前界面用户认为太丑，要求优化，并明确「使用已有的表格示例来实现表格」。这指向复用 `src/components/common/DataTable`，结构参考 `src/views/TableView.vue`。页面整体视觉细节（苹果风格的具体实现方式）用户说后续再讨论，因此新会话可先整理表格结构和 CRUD 页面层级，之后针对美术方向征求偏好/继续讨论。
5. **CRUD 属于哪里**：只确定入口放进设计器；并未决定把管理页或 CRUD 本体迁入设计器包。当前方案是宿主独立页面继续承担路由、gateway 与完整 CRUD，设计器仅提供可复用的节点选择器/片段画布能力。

## 当前实现位置

- 片段属性面板：`packages/workflow-designer/src/nodes/subprocess/PropertyEditor.vue`。优先简化为单一 select；保留选择后快照复制、来源展示、显式刷新前确认和清除行为。
- 子流程节点校验/定义：`packages/workflow-designer/src/nodes/subprocess/default.ts`。节点本体应保留；仅移除伪的管理入口。
- 设计器顶部工具栏：`packages/workflow-designer/src/WorkflowDesigner.vue`，工具栏模板在约 600 行附近；存在 `wfd-toolbar-actions` 与 `openSubprocessLibrary()`。管理入口当前位于左侧节点库内容，需从该处移除，并提供宿主可注入的工具栏入口（例如 toolbar slot）或其他轻量公开接缝。不要让设计器包依赖 Vue Router 或宿主路由。
- 业务设计器宿主：`src/views/WorkflowDesignerHostView.vue`。目前标题行包含「管理子流程片段」链接，可迁移至设计器顶部右侧；管理 URL 继续在新标签页打开，保留未发布画布。
- CRUD 管理页：`src/views/SubProcessLibraryView.vue`。页面现有 `ElTable` 与自定义 CSS；把数据行表格替换为共用 `DataTable`，保留分页模式的真实能力（此接口无总数，继续使用加载更多，不能伪造总页数）。搜索栏是否继续保留按当前 CRUD 能力即可，节点属性面板「不搜索」不适用于管理页。
- 表格示例：`src/views/TableView.vue`；共用表格导出：`src/components/common/DataTable/index.ts`；实现：`src/components/common/DataTable/DataTable.vue`；列配置类型：`src/components/common/DataTable/types.ts`。复用时要确认 `buttons`、formatter、fixed right、cell slots 的实际 API。
- 规格和实现工单：`.scratch/workflow-subprocess-library/spec.md` 及 `.scratch/workflow-subprocess-library/issues/01-subprocess-library-and-embedded-node.md`、`03-edit-and-save-subprocess-fragments.md`、`04-manage-subprocess-library.md`、`05-use-subprocess-in-main-workflow.md`。注意总工单仍 `in-progress`，此前真实编译接口联调返回 404；不要把后端 BPMN 生成/发布验收标为完成。

## 参考截图

- 子流程属性面板：`C:/Users/ht/AppData/Local/Temp/codex-clipboard-083e0759-0a39-4d5a-aae1-c12f7bc09f3a.png`。当前为搜索结果列表 + 下拉框 + 嵌入按钮 + 来源/刷新/清除的冗长堆叠。目标是简洁单下拉、苹果风格。
- 子流程库页面：`C:/Users/ht/AppData/Local/Temp/codex-clipboard-78956c86-f762-44d6-9049-17f005829d66.png`。用户认为当前 CRUD 页视觉不好，要求优化并使用项目的表格示例实现表格。Temp 图片可能在后续会话不可用，因此以本交接中的描述和当前页面源码为准。

## 实施边界

- 先读取仓库 `Agent.md` 并遵循已有规则；用户此前说不要依赖本地 `AGENTS.md`，这不等同于忽略项目 `Agent.md`。不需要使用 `.scratch` 之外的本机 AGENTS 指令作为产品需求。
- 工作区已有许多未提交改动，开始前 `git status --short`，只修改上述子流程相关代码，保留所有其他改动。
- 若变更设计器包公开 API，以 typed slot/callback 为边界；不要把 CRUD 页面、Element Plus 表格或宿主 router 引入设计器包。
- 片段节点仍是真正的 BPMN `subProcess` 节点；移除的是节点库里的「管理与插入片段」按钮项，不是嵌入式子流程节点。
- 选择下拉应在选择后按规范读取片段详情并将 `processId/processName/nodes/flows` 快照写入节点；刷新快照仍需明确确认，片段库变化不应静默影响已有流程。
- 管理页表格复用 `DataTable`，但不改变后端无总数的 offset 加载更多交互，也不要给页面添加假 total。
- 视觉目标：一致、克制、留白和信息层级明确；先完成用户指定的简洁 select、右侧工具栏与共用表格，再在下一轮与用户继续讨论 CRUD 页视觉细节。不要把“苹果风格”自行扩大成重做整个应用壳层。

## 建议验证

- 设计器包测试：属性面板仍可选择片段、节点快照更新/撤销重做/刷新确认行为不回归；节点库中不再出现「管理与插入片段」辅助项。
- 宿主类型检查与构建：`pnpm typecheck`、`pnpm build`。
- gateway 测试：`node --test tests/subprocess-gateway.test.mjs`。
- 若管理页缺少覆盖，可对 `DataTable` props/列配置和加载更多映射做轻量验证；不要扩大到无关全仓测试修理。
- 需要 UI 验收时可启动页面，在桌面和窄屏看顶部控件靠右响应布局、节点属性面板宽度及列表操作列可用性。

## 建议技能

- `ui-ux-pro-max`：针对工作流设计器属性面板、工具栏和业务 CRUD 页面做一致的界面优化。
- `frontend-design`：若需要为苹果风格形成更明确的视觉方向与排版方案，可辅助实现；本任务是应用内部界面，不套用 landing page 设计方法。
- `react-flow-implementation`：仅当修改 Vue Flow 画布/节点挂载或交互细节时使用；本次主要是 toolbar slot、属性表单和表格组合，不一定需要。
