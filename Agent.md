# 流程工作台 · Agent 协作约定

本文件适用于本仓库的前端实现与流程引擎兼容性调研。沟通、调研结论和用户文案默认使用中文，代码标识沿用项目命名。

## 项目边界

这是 Vue + TypeScript + bpmn-js 前端 PoC。设计器支持本地绘图、Camunda 7 属性编辑、撤销重做和 BPMN XML 导入导出；另有通过开发代理联调 Camunda 原生 REST 的部署、流程定义、实例和人工任务页面。表格数据仍为本地示例；Go 包装层、服务端设计稿持久化、登录权限和表单运行时尚未接入，页面修改也未自动保存。

区分三个层面的能力：前端可以编辑、XML 可以保存、后端可以执行。每次新增流程能力，都说明本次完成到哪一层；调研建议不能当作已实现功能。

## 按任务读取上下文

先确认本次要验证的行为，再按下表读取相关材料。运行环境、依赖版本和可用脚本以 [package.json](./package.json) 为准，安装依赖使用 pnpm；格式遵循 [.editorconfig](./.editorconfig)。

| 任务 | 先读材料 |
| --- | --- |
| 启动项目、确认现有功能、接入环境 | [README.md](./README.md)；代理配置再读 [vite.config.ts](./vite.config.ts) 和 [.env.example](./.env.example) |
| 画布生命周期、选择同步、历史记录、XML 操作 | [useBpmnDesigner.ts](./src/composables/useBpmnDesigner.ts)；页面交互读 [DesignerView.vue](./src/views/DesignerView.vue) |
| 新增或调整节点属性 | [Camunda 7 moddle](./node_modules/camunda-bpmn-moddle/resources/camunda.json)、[types.ts](./src/bpmn/types.ts)、[NodePropertiesPanel.vue](./src/components/designer/NodePropertiesPanel.vue)，以及上面的设计器 composable |
| 修改 Camunda 7 XML 契约或引擎联调 | [ADR-0002](./docs/adr/0002-camunda7-integration.md)、[gateway.ts](./src/api/camunda/gateway.ts)、[CamundaRuntimeView.vue](./src/views/CamundaRuntimeView.vue)、[Camunda XML 测试](./tests/bpmn-approval.test.mjs) |
| 调整画布样式、字体或标签 | [theme.ts](./src/bpmn/theme.ts)、[LabelTextRenderer.ts](./src/bpmn/LabelTextRenderer.ts)；应用级样式读 [main.css](./src/styles/main.css) |
| 修改默认流程或准备 XML 验证样本 | [requirement-process.bpmn](./src/bpmn/requirement-process.bpmn) |
| 修改流程模板或检查、导出规则 | [templates.ts](./src/bpmn/templates.ts)、[validation.ts](./src/bpmn/validation.ts)、[检查测试](./tests/bpmn-validation.test.mjs)；交互入口见设计器页面 |
| 接入流程列表或修改查询行为 | [request.ts](./src/utils/request.ts)、[demo.ts](./src/api/demo.ts)、[useTable.ts](./src/composables/useTable.ts)、[table.ts](./src/types/table.ts) |
| 评估 gobpm、Camunda 扩展或 Go 后端部署契约 | [兼容性报告](./docs/research/gobpm-compatibility.md)及其链接的实验结果；注意报告中的版本与验证范围 |

## 设计器扩展约束

- **模型隔离**：bpmn-js 实例、元素和 businessObject 留在设计器 composable 内，由其负责创建与销毁。Vue 面板接收普通数据快照，通过事件提交修改，保持第三方模型不受深层响应式代理影响。
- **命令栈**：节点属性经 `modeling.updateProperties` 修改，保留撤销、重做和选择同步。新增属性需联动核查 moddle 描述、快照类型、属性映射、面板与 XML 样本，完成一次导出再导入验证。
- **属性语义**：`name`、流程 `id`、连线 `conditionExpression` 与网关 `default` 使用标准 BPMN；条件只保存原文，不由前端求值。办理人、候选用户、候选组和表单引用使用 Camunda 7 标准扩展；UEL/JUEL 表达式只保存原文，交由引擎解释。多人执行只使用 Camunda 7 标准多实例字段，不恢复 `wf:` 审批名单或结果语义。
- **检查边界**：基础检查错误仅阻止文件下载，保留 XML 编辑、复制与导入修复。检查规则和范围由 [README](./README.md#流程检查与导出) 与验证模块维护；修改规则时运行 `pnpm test`，避免将不支持的执行语义误判为结构错误。
- **XML 契约**：命名空间 URI 以 moddle 描述为准，后端按 URI 识别扩展。调整已有 URI、字段名或字段含义时，明确旧 XML 的兼容或迁移方式。
- **失败恢复**：保留导入期间的操作互斥、组件卸载后的异步保护，以及导入失败时恢复原流程的路径。解析阶段尚未替换模型的失败应保留撤销历史；重新导入备份 XML 的恢复路径不能承诺保留原历史。
- **展示与数据**：主题默认值由主题配置与 renderer 控制，保留导入 XML 的显式样式语义。修改标签渲染时验证中文标签重绘后不意外换行；修改适应画布逻辑时验证工具栏不遮挡开始节点。
- **后端存储**：接入 Go 保存和部署时，将流程设计稿原文按版本保存；不要通过引擎重新导出替换原设计稿，以免丢失布局或扩展。当前 Camunda 直连仅为开发联调入口，生产浏览器不得持有引擎管理员凭据。

## 接口与列表约定

请求集中通过现有 `request<T>()` 封装，当前返回 HTTP 响应体。后端协议确定后再添加业务码、认证与响应适配；接口函数负责把分页响应转换为 `PageResult<T>`，页面负责交互反馈。

复用 `useTable` 时传递 `AbortSignal`，保留请求取消与旧结果隔离这两层保护。筛选数据保持可克隆；搜索和重置回到第一页，刷新保留当前页。演示数据的 `published` 状态仅供列表展示，不能作为真实引擎部署结果。

## 调研交付

涉及引擎兼容性或新扩展时，在 `docs/research/` 记录结论，并分别标明源码事实、实测结果和方案建议。引用官方文档或源码时记录版本、提交或内容哈希与调研日期，使结论有明确适用范围。

验证兼容性时，检查生成的真实 XML、导入警告或丢弃项、执行模型中的字段及运行行为；“解析成功”只能证明解析通过。若仅验证前端读写，结论就限定在前端读写。

新增实验应保留最小样本、执行命令或脚本、预期与实际结果，便于复现。现有兼容性报告的结果 JSON 是历史观测，其自定义样本和 probe 未随仓库保存；引用时保留这一限制。

## 验证与完成标准

按改动范围选择验证，并在交付时说明实际运行结果与未覆盖项：

- **代码或构建配置**：运行 `pnpm build`，它已包含类型检查；仅快速检查类型可用 `pnpm typecheck`。其他检查以当前脚本与工具配置为准。
- **设计器交互**：在 `/designer` 验证受影响操作，覆盖节点选择、属性编辑、撤销重做；修改生命周期或异步逻辑时，补查离开后重进及操作中的按钮状态。
- **属性或 XML**：编辑人工任务名称、办理人、候选用户、候选组和表单，移动节点后导出再导入，检查 Camunda 字段、节点 ID、连线和 DI 布局保留；非人工任务不得出现人工分配字段。修改导入逻辑时，另查无效 XML 的原流程与历史恢复、有效文件的警告显示。
- **画布或样式**：检查桌面与窄屏布局、中文标签、适应画布，以及导出 XML 的业务字段未被展示调整意外改写。
- **查询逻辑**：验证搜索、重置、分页与刷新；修改异步处理时验证连续查询后仅最新结果生效，取消请求不产生错误提示。
- **仅文档**：核对路径、命令、能力描述与实现一致即可，无需启动应用或构建。

功能或使用边界变化时同步更新 README；兼容性结论变化时更新对应调研记录。本文件保留协作约束与按需阅读入口，版本清单、完整使用说明和实验细节继续由各自文件维护。

## Agent skills

### Issue tracker

需求规格与工单使用本地 Markdown。创建、读取或更新事项前，读取 [事项跟踪约定](./docs/agents/issue-tracker.md)。

### Triage labels

使用默认五个分诊状态。分诊工单或修改状态前，读取 [状态映射](./docs/agents/triage-labels.md)。

### Domain docs

采用 single-context 布局。探索业务术语或架构决策前，读取 [领域文档约定](./docs/agents/domain.md)。
