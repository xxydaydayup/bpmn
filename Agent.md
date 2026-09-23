# 流程工作台 · Agent 协作约定

本文件是仓库协作规则的单一来源。沟通、调研结论和用户文案默认使用中文，代码标识沿用项目命名。

## 边界

当前功能与未接入项见 [README](./README.md)。新增能力或调研结论分别说明前端编辑、XML 保存、后端执行的验证范围；建议与已实现能力分开描述。

## 开工前

按任务读取下列材料。依赖、脚本和版本以 [package.json](./package.json) 为准；安装使用 pnpm，格式遵循 [.editorconfig](./.editorconfig)。

| 任务 | 先读材料 |
| --- | --- |
| 启动、确认功能或配置环境 | [README](./README.md)；代理配置再读 [vite.config.ts](./vite.config.ts) 和 [.env.example](./.env.example) |
| 画布生命周期、选择、历史和 XML 操作 | [useBpmnDesigner.ts](./src/composables/useBpmnDesigner.ts)；页面交互再读 [DesignerView.vue](./src/views/DesignerView.vue) |
| 新增属性、调整 Camunda 依赖或编辑联动 | [建模依赖说明](./docs/camunda-modeling.md)；[camunda.json](./node_modules/camunda-bpmn-moddle/resources/camunda.json)；[types.ts](./src/bpmn/types.ts)；[NodePropertiesPanel.vue](./src/components/designer/NodePropertiesPanel.vue)；[useBpmnDesigner.ts](./src/composables/useBpmnDesigner.ts) |
| 修改 XML 契约或 Camunda 联调 | [ADR-0002](./docs/adr/0002-camunda7-integration.md)；[XML 测试](./tests/bpmn-approval.test.mjs)；REST 联调再读 [gateway.ts](./src/api/camunda/gateway.ts) 和 [CamundaRuntimeView.vue](./src/views/CamundaRuntimeView.vue) |
| 修改画布样式、标签或布局 | [设计器样式维护说明](./docs/designer-styling.md) 中对应入口 |
| 修改模板、默认流程或检查规则 | [templates.ts](./src/bpmn/templates.ts)；[默认流程](./src/bpmn/requirement-process.bpmn)；[validation.ts](./src/bpmn/validation.ts)；[检查测试](./tests/bpmn-validation.test.mjs) |
| 修改列表或查询 | [request.ts](./src/utils/request.ts)；[useTable.ts](./src/composables/useTable.ts)；[table.ts](./src/types/table.ts)；[demo.ts](./src/api/demo.ts) |
| 评估 gobpm 或 Go 部署契约 | [兼容性报告](./docs/research/gobpm-compatibility.md)及其链接的实验材料；按报告日期和验证范围引用历史结论 |

## 设计器规则

- **模型隔离**：bpmn-js 实例、元素和 businessObject 留在设计器 composable 内；Vue 面板只接收普通数据快照，通过事件提交修改。
- **命令栈**：属性修改使用 `modeling.updateProperties` 或相应建模命令，保留撤销、重做和选择同步。新增字段同步检查 moddle、行为联动、快照类型、属性映射和面板。
- **属性语义**：采用标准 BPMN 和 Camunda 7 扩展；表达式保存原文，交由引擎求值。多人执行采用标准多实例字段，旧 `wf:` 审批名单和结果协议已退出契约，见 ADR-0002。
- **检查边界**：按 [README](./README.md#流程检查与导出) 和验证模块声明的范围判断错误；错误只阻止下载，保留 XML 编辑、复制和导入修复。
- **XML 契约**：命名空间 URI 以 moddle 描述为准。修改 URI、字段名或含义时，说明旧 XML 的兼容或迁移方式；保存设计稿时保留原始 XML 版本，不能用引擎重新导出结果覆盖设计稿。
- **失败恢复**：导入操作互斥，保留卸载后的异步保护和失败恢复路径。解析失败且模型未替换时保留撤销历史；重新导入备份 XML 不能保证原历史。

## 接口和列表

- 请求通过现有 `request<T>()` 封装；接口负责把分页响应转换为 `PageResult<T>`，页面负责交互反馈。
- 使用 `useTable` 时传递 `AbortSignal`，同时保留请求取消和旧结果隔离；筛选数据可克隆，搜索、重置回第一页，刷新保留当前页。
- 演示数据只用于展示，不能作为真实引擎部署或发布状态。
- Camunda 直连用于开发联调；生产凭据由后端持有，浏览器不得持有引擎管理员凭据。

## 调研交付

涉及引擎兼容性或新扩展时，在 `docs/research/` 记录源码事实、实测结果和方案建议，并注明版本、提交或内容哈希、调研日期。实验保留最小样本、命令、预期和实际结果。

兼容性验证要检查真实 XML、导入警告或丢弃项、执行模型字段和运行行为；解析成功只能证明解析通过。只验证前端读写时，结论限定为前端读写。

## 验证和交付

按改动范围执行检查，交付时说明实际结果与未覆盖项：

- 代码或构建配置：运行 `pnpm build`；需要快速类型检查时运行 `pnpm typecheck`。
- BPMN 属性、XML 或检查规则：运行 `pnpm test`；属性/XML 改动还需导出再导入，核对字段适用节点、ID、连线和 DI。导入改动另查无效 XML 的原图/历史恢复及有效 XML 的警告展示。
- 设计器交互：在 `/designer` 验证受影响的选择、属性编辑和撤销重做；生命周期/异步改动补查离开后重进及操作期间按钮状态。
- 画布样式：检查桌面与窄屏、中文标签重绘、工具栏不遮挡适应后的流程，以及导入显式样式和业务 XML 保留。
- 查询逻辑：验证搜索、重置、分页与刷新；异步改动需确认连续查询只显示最新结果，取消请求不报错。
- 仅文档：核对链接、命令和能力描述与实现一致，无需启动应用或构建。

功能或使用边界变化时同步 README；兼容性结论变化时更新对应调研记录。

## 专项文档

- 创建、读取或更新需求/事项 Markdown 前，读取[事项跟踪约定](./docs/agents/issue-tracker.md)。
- 分诊事项或修改状态前，读取[状态映射](./docs/agents/triage-labels.md)。
- 探索业务术语或架构决策前，读取[领域文档约定](./docs/agents/domain.md)。
