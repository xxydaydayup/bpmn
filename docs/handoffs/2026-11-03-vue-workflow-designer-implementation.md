# 交接：实现可复用 Vue 工作流设计器

日期：2026-11-03

## 下一对话目标

从 `.scratch/vue-workflow-designer/issues/01-workspace-contract.md` 开始实现，按依赖推进 01 → 02 → 03 → 04。目标是在当前 Vue 3 项目中新增隔离的 Vue Flow 业务工作流设计器，同时保留现有 bpmn-js BPMN/XML 编辑器。

## 先读的资料

- 仓库执行规则：`Agent.md`。
- 已确认架构决策：`docs/adr/0005-vue-workflow-designer.md`。
- 领域术语：`CONTEXT.md`，single-context 约定：`docs/agents/domain.md`。
- 完整规格、测试接缝、验收边界：`.scratch/vue-workflow-designer/spec.md`。
- 分阶段验收清单：`.scratch/vue-workflow-designer/issues/01-workspace-contract.md` 至 `04-host-integration-acceptance.md`。
- JSON v1 迁移依据在另一个仓库 `D:\Code\github.com\xxydaydayup\workflow`：`src/api/workflowModel.ts`、`src/features/designer/workflowModel.ts` 和 `docs/examples/立项申请/project_approval_json.md`。不要复用那里的 React 组件或状态代码。目标后端编译 API 由该 React 应用当前封装在 `/v1/bpmn/json2xml`；真实可达性和编译结果在实施时再确认。

## 已定实现方向

- 以 Vue Flow（`@vue-flow/core`）实现画布，ELK 承担自动布局；在 `bpmn` 仓库内增加 pnpm workspace 设计器包，现有 Vue 应用做集成宿主示例。首版不发布 npm。
- Vue/Vue Flow 由宿主提供；库不依赖 bpmn-js、Camunda moddle、Element Plus、Axios、Pinia、路由或现有页面代码。
- Tailwind CSS 作为库构建依赖，输出独立 CSS：工具类使用专属前缀、不含全局 reset，库自有样式限制于根作用域；通过 CSS 变量和插槽定制。宿主无需安装 Tailwind。
- 维护现有 `WorkflowModel` v1 编译输入；节点 `x/y` 仍是后端编译契约的一部分。画布节点/边对象不作为后端或持久化格式。完整设计稿使用独立版本化信封保存业务模型和视口/主题/连线路由等编辑状态；编译回调只接收通过校验的业务模型。
- 公开组件以 `v-model` 交换完整设计稿，通过宿主传入的 `compile(model)` 回调编译；宿主负责鉴权、API 请求、保存和发布。
- 未知业务字段/节点需保留原始数据并禁用编译；未知节点作为只读占位。未知新版设计稿信封只读打开并原样导出。展示扩展不得污染业务模型。
- 扩展限于已有节点的展示、属性编辑、默认值、节点库、连接规则、校验和主题。新增业务语义前先升级正式 JSON Schema/样例和后端编译器。当前 Schema 唯一正式来源待后端编译器维护方提供；之前先从现有 workflow 定义/样例建立有来源说明的副本。

## 实施注意

- 开工先读取当前 `git status`；当前已知的先前改动是 `CONTEXT.md` 与未跟踪的 `docs/adr/0005-vue-workflow-designer.md`，不要覆盖或重置。新建规格位于 `.scratch/vue-workflow-designer/`。
- 根项目当前是 pnpm 9.9.0、Vue 3.5、Vite 7、TypeScript 5.9；无 `pnpm-workspace.yaml`，有 pnpm lockfile。修改 workspace manifest 和依赖后需正常更新 lockfile。
- 当前 `src/router/index.ts` 把 `/designer` 指向 `DesignerView.vue`。保留该路由和 bpmn-js 能力，为新业务设计器添加独立入口。
- 当前仓库已有 `elkjs` 依赖和 ELK 布局实现，可以借鉴布局算法/边界，但新包应有自己的 adapter；不得依赖既有 bpmn 画布模块或复用其业务状态。
- 新包/示例需要独立构建和根项目构建、类型检查。按规格在公开组件/API 边界以真实 JSON fixture 测模型往返、compile payload 和未知数据保护；在宿主示例进行实际浏览器交互、桌面/窄屏及 CSS 隔离验收。仓库 `Agent.md` 要求最终报告实际功能验证。
- 工作流 React 仓库和本 Vue 仓库位于不同目录/远端；如需处理 React 仓库或后端契约，不要假定当前工具 workspace 已附着那些项目。先以只读方式确认可用性。

## 建议技能

- `react-flow-implementation`：理解 Vue Flow 时不适用；应优先查找 Vue Flow 官方文档/本地资料，不要调用 React Flow 实现技能来生成 Vue 代码。
- `dagre-react-flow`：仅其 dagre/React Flow 专用，不建议用于 Vue 实现。
- `ui-ux-pro-max`：设计/实现新画布和属性面板 UI 时调用。
- `tdd`：只有实施任务明确要求测试优先时再调用；本规格要求行为测试，但不要求严格 TDD。
- `writing-for-agents`：若修改 AGENTS.md/Agent.md 或撰写代理指南时调用；一般功能实现不需要。
- `domain-modeling`：若新增/修改术语或后续架构决策时调用。

## 完成状态

本交接只记录已确认决策和实施路径；尚未实现功能，也未运行构建、测试或浏览器验收。下一对话应从工单 01 开始，不需要重新访谈前述已定决策。
