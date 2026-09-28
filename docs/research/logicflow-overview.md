# LogicFlow 概览与能力边界

- 调研日期：2026-09-28。
- 依据：官方文档及 didi/LogicFlow 官方仓库；取样时 master 的 Git tree SHA 为 `c818328d990dbe43756d4dff2af7d3c7c3a72a23`。这是仓库树标识，不是 npm 发布版本。
- 验证范围：文档核查。未安装 LogicFlow，未运行前端、进行 XML 往返测试或连接后端引擎。本记录不构成 Camunda 兼容性实测结论。

## 文档事实

1. **定位**：LogicFlow 是可嵌入业务系统的流程图编辑框架，提供可视化编辑、自定义节点与连线、插件及数据转换能力；代码和文档采用 Apache-2.0 协议。[官方 README](https://github.com/didi/LogicFlow/blob/master/README.md)
2. **包的分工**：`@logicflow/core` 负责画布、节点、连线、模型、事件和基础交互；`@logicflow/extension` 提供官方插件；`@logicflow/layout` 提供自动布局插件。基础图数据由 `nodes` 和 `edges` 组成。[官方 README](https://github.com/didi/LogicFlow/blob/master/README.md)
3. **Vue 节点**：`@logicflow/vue-node-registry` 可将 Vue 组件接入 LogicFlow 节点系统，视图与节点模型分别注册。[官方 Vue 节点说明](https://github.com/didi/LogicFlow/blob/master/packages/vue-node-registry/README.md)
4. **BPMN 编辑与 XML 转换**：官方提供基础版、扩充版 BPMN 元素与适配器。文档明确说明内置插件主要用于基础演示与快速上手，覆盖部分常用元素；复杂扩展、自定义属性及特定引擎契约需要业务方适配。[官方 BPMN 文档](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/extension/bpmn-element.zh.md)
5. **XML 适配机制**：扩充版适配器支持导入、导出转换，提供 `transformer`、`mapping`、保留属性及排除字段配置。官方将内置 transformer 标为参考实现，包含条件表达式和定时事件示例。这说明存在扩展机制，不证明任意 BPMN XML 均能无损往返。适配器 README 使用 `BpmnXmlAdapterV2` 示例，而当前 BPMN 指南使用 `BPMNAdapter` / `BPMNBaseAdapter`；实际接入应核对所选发布版本的导出接口。[官方适配器说明](https://github.com/didi/LogicFlow/blob/master/packages/extension/src/bpmn-elements-adapter/README.md)、[当前 BPMN 指南](https://github.com/didi/LogicFlow/blob/master/sites/docs/docs/tutorial/extension/bpmn-element.zh.md)
6. **执行能力独立存在**：`@logicflow/engine` 从图数据执行工作流，面向浏览器和 Node.js，独立于 `@logicflow/core`；职责包括节点注册、调度、执行生命周期及执行记录。该定位本身不能证明与 Camunda 的 BPMN 执行语义兼容。[官方引擎架构](https://github.com/didi/LogicFlow/blob/master/packages/engine/ARCHITECTURE.md)
7. **对比基准**：bpmn-js 官方定位是 BPMN 2.0 查看与编辑工具包，提供 XML 导入及扩展机制。[bpmn-js 官网](https://bpmn.io/toolkit/bpmn-js/)

## 方案判断（非实测结论）

- 如果目标是业务化的审批卡片、规则编排或其他高度自定义节点界面，LogicFlow 值得作为画布基础评估；属性面板、业务语义、存储及执行对接仍需产品自身设计。
- 如果目标是标准 BPMN 建模与现有 Camunda 7 XML 契约延续，优先评估保留 bpmn-js。使用 LogicFlow 应先估算节点体系、属性映射及 XML 适配成本，不能依据“支持 BPMN”直接判断可替换现有设计器。
- 若后续开展兼容性实验，应分别验证：前端编辑与属性保存；XML 导出再导入及警告/字段保留；目标引擎部署与真实运行。解析成功不能代替运行验证。
