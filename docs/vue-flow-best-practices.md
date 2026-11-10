# Vue Flow 实践摘要

核对日期：2026-11-10。

本文基于仓库当前依赖的 `@vue-flow/core` 1.48.2 和 Vue Flow 官方指南，提炼适用于本仓库 Vue 业务工作流设计器的实践。官方库的行为说明与本项目为 WorkflowModel v1、设计稿信封及编辑会话做出的架构推导分开列出；不是所有建议都是 Vue Flow 的强制规则。

## 官方指南中的要点

- **为图元素提供唯一标识和合法连接。** 每个 node/edge 都需要唯一 `id`；node 需要位置，edge 的 `source` 和 `target` 应引用 node id。删除 node 时也要删除或处理相连 edge。
  来源：[Vue Flow README](https://github.com/bcakmakoglu/vue-flow#quickstart)、[Troubleshooting](https://vueflow.dev/guide/troubleshooting.html)。
- **需要让应用状态跟随画布交互时，绑定 `v-model:nodes` 和 `v-model:edges`。** Vue Flow 的内部状态和应用所持的 nodes/edges 不是所有操作都自动双向同步；官方特别说明，调用 store 操作更新内部 state 时，如需同步到应用自己的 nodes/edges，应使用对应的 v-model。
  来源：[Controlled Flow](https://vueflow.dev/guide/controlled-flow.html)、[Vue Flow State](https://vueflow.dev/guide/vue-flow/state.html)、[README 示例](https://github.com/bcakmakoglu/vue-flow#quickstart)。
- **保留默认变更应用，除非确实需要手动控制。** 默认情况下，Vue Flow 会自动应用交互产生的 node/edge 变更。只有需要在变更前做确认或自定义校验时，才考虑关闭默认应用、监听变更并显式应用通过检查的变更；官方将手动控制标记为进阶能力，并提示当前 API 可能在下一个主版本调整。
  来源：[Controlled Flow](https://vueflow.dev/guide/controlled-flow.html)、[Vue Flow State](https://vueflow.dev/guide/vue-flow/state.html)。
- **把交互事件和应用自己的业务提交语义分清。** Vue Flow 的 change 指交互或 API 导致的元素新增、位置、选中、尺寸和删除等变化；视口缩放/平移以及只更新 node 的 `data` 并不属于该指南所述的 change 事件。若需要追踪应用数据变化，应通过应用的状态更新路径处理，而不是假设每次赋值都会产生 nodes-change/edges-change。
  来源：[Controlled Flow](https://vueflow.dev/guide/controlled-flow.html)。
- **在组件树中正确使用 store 注入。** `useVueFlow` 会创建或注入当前 Vue 组件树可访问的响应式 store；第一次调用会决定该树使用的实例。若同一上下文有多个 Flow 实例，应为每个实例传入不同 `id`，以确保访问正确的 store。组件事件和 `useVueFlow` 的事件 hook 都是官方支持的监听方式。
  来源：[Composables](https://vueflow.dev/guide/composables.html)、[Vue Flow State](https://vueflow.dev/guide/vue-flow/state.html)、[Events](https://vueflow.dev/guide/vue-flow/events.html)。
- **等画布具备布局所需的尺寸后再执行依赖几何信息的操作。** Vue Flow 容器必须有宽高才能渲染；需要 node 实际宽高或 handles 的布局应等待节点初始化/尺寸可用，再执行 fitView 等视口操作。
  来源：[Troubleshooting](https://vueflow.dev/guide/troubleshooting.html)、[Vue Flow Events](https://vueflow.dev/guide/vue-flow/events.html)、[Composables](https://vueflow.dev/guide/composables.html)。
- **自定义 node/edge 类型应有对应组件；检查图引用关系。** 缺少自定义 edge 类型的渲染组件、edge 指向不存在的 node 等会产生诊断；删除节点时及时清理孤立 edge。
  来源：[Troubleshooting](https://vueflow.dev/guide/troubleshooting.html)。
- **Vue Flow 样式在全局层引入。** 官方 README 要求引入基础样式，并明确不要给这些样式加 Vue 的 `scoped`。
  来源：[Vue Flow README](https://github.com/bcakmakoglu/vue-flow#quickstart)。

## 对本仓库编辑会话改造的应用

- **编辑会话以业务工作流模型为准，Vue Flow 作为画布 adapter。** Vue Flow node/edge 是交互和布局表示；撤销快照仍使用完整 WorkflowModel v1，并继续通过现有 adapter 做双向映射。不要把 Vue Flow store 的内部对象直接当作可持久化设计稿或编译输入。该建议是本仓库 WorkflowModel/设计稿信封契约的推导。
- **继续使用节点和顺序流的 `v-model`，不为抽取历史而全面切到手动受控 flow。** 当前设计器需要把画布拖动等结果带回模型。默认变更应用可保留；只有具体交互需要在应用前拒绝时才考虑 `apply-default=false` 和 change handlers，并考虑 Vue Flow 官方对 API 主版本调整的提示。
- **只在已提交的编辑边界记语义历史。** 例如节点拖动在 drag-stop 后生成一个模型快照；属性编辑在提交时记录；节点和顺序流增删改按现有交互提交。不要把 Vue Flow 的每次位置更新帧、selection、dimensions 或视口事件逐条转成 undo 步骤。官方 change 事件语义与项目已确认的语义历史规则共同支持此边界。
- **视口和路由展示数据仍由视图 adapter 协调。** pan/zoom 写入设计稿信封的 editor viewport，但不进 WorkflowModel 历史；节点尺寸、反馈路由刷新、恢复快照后布局和 fitView 依赖 Vue Flow 状态，留在 WorkflowDesigner 生命周期层，不塞进不依赖 Vue 的编辑会话 module。
- **保留每个 Flow 的唯一实例 id。** 设计器允许嵌入宿主；如果页面同时挂载多个设计器，必须让 `useVueFlow(id)` 与对应 `<VueFlow id>` 成对且唯一，避免编辑会话适配器操作到另一个画布实例。现有 `useId()` 路径符合官方多实例建议。
- **异步布局先等测量，更新后再恢复视口。** 初始布局需要有效的 node dimensions/handles；恢复或重新布局后，先让 Vue 更新并完成 Vue Flow 的几何计算，再调用 `fitView` 或更新路由。异步任务还要遵守仓库的卸载保护与恢复路径。前半条来自官方尺寸/初始化指南；卸载保护来自本仓库生命周期约定。
- **使用 Vue Flow 提供的实例动作，而不是自建 viewport 状态机。** `fitView`、`setViewport` 及交互事件由 `useVueFlow`/VueFlow 负责；编辑会话只决定模型/路由快照，视图层再把视口状态合并回信封。

## 本次改造的建议验收点

- 节点拖动过程中不产生多条历史；drag-stop 后撤销/重做恢复 WorkflowModel 坐标和适用的反馈路由。
- `move-end` 单独更新信封中的 editor viewport，不改变 undo/redo 可用状态。
- undo/redo 更新组件拥有的 nodes/edges，并仍通过 `<VueFlow v-model:nodes v-model:edges>` 正常呈现；尺寸刷新和 `fitView` 仍在 VueFlow 实例可用时执行。
- 单一画布实例保持显式唯一 id；不存在误取其他画布 store 的情况。
- 路由恢复以顺序流语义身份关联，不依赖 Vue Flow 内部 edge 对象身份；移除或改端点后不留下孤立画布 edge/错误路由。
- 自定义节点和边类型都有 renderer；尺寸未测量时不会把零尺寸用于布局。

## 官方一手资料

- [Vue Flow 官方指南](https://vueflow.dev/guide/)
- [Controlled Flow](https://vueflow.dev/guide/controlled-flow.html)
- [Vue Flow State](https://vueflow.dev/guide/vue-flow/state.html)
- [Events](https://vueflow.dev/guide/vue-flow/events.html)
- [Composables](https://vueflow.dev/guide/composables.html)
- [Troubleshooting](https://vueflow.dev/guide/troubleshooting.html)
- [Vue Flow 官方 GitHub README](https://github.com/bcakmakoglu/vue-flow)

