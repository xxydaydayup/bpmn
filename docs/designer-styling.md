# 设计器样式维护说明

这套界面沿用 Vue、Element Plus 和 bpmn-js；人工/服务任务采用业务卡片，图标为本地 Tabler Icons 3.47.0。画布支持顶部工具栏切换预设主题；主题只影响运行时展示，页面暂未开放逐节点改色功能。

## 修改入口

| 需求 | 文件与配置 |
| --- | --- |
| 预设主题、画布背景和强调色 | `src/bpmn/theme.ts` → `themePresets`、`canvas` |
| 默认节点、连线与文字颜色 | 同文件 → `renderer`、`colors` |
| 中文字体与字号 | 同文件 → `typography` |
| 卡片尺寸、圆角、线宽、图标大小、内边距 | 同文件 → `card`；运行时主题切换保持几何不变 |
| 自动布局的节点、层与连线间距 | 同文件 → `layout`；运行时主题切换保持布局参数不变 |
| 替换 Tabler 图标 | `src/bpmn/icons.ts` 的 SVG 导入与 `diagramIcons` |
| 节点库分组与名称 | 同文件 → `nodePresentation`、`libraryGroups` |
| 工具栏、工作区布局和响应式断点 | `src/styles/designer.css` |
| 属性面板的分组、表单控件 | `src/components/designer/NodePropertiesPanel.vue` |
| 新的节点绘制方式 | `src/bpmn/BusinessRenderer.ts` |
| 快捷操作的图标、中文名称 | `src/bpmn/BusinessContextPad.ts` |

顶部选择器切换主题时，`useBpmnDesigner` 会更新文本渲染器样式并触发 bpmn-js 的 `elements.changed` 重绘事件；视口、选择状态、DI 几何和命令栈保持不变。编辑 `themePresets` 中的 `card.width`、`layout` 等几何值会影响新建任务和自动整理后的任务；已有图的尺寸仍从 DI 读取。需要统一现有图时点击“整理布局”，或重新导入尺寸小于新约定的普通流程。导入的显式颜色继续优先。

图标文件放在 `src/assets/tabler/`，新增时保留该目录的 MIT 许可及来源说明。渲染器只使用这些可信本地 SVG；用户输入的节点名称以文本绘制，不作为 HTML 执行。外层 Element Plus 的应用级主题位于 `src/styles/main.css`。

## 模型与渲染

`src/bpmn/modules.ts` 集中注册扩展：卡片 Renderer、默认尺寸工厂、快捷操作与中文标签渲染器。任务的标准语义标记由原生任务 Renderer 绘制，业务卡片仅替换标题和类型图标区域。事件、网关和其他未定制类型仍由原生 Renderer 保留其 BPMN 语义。

正常卡片显示两行以内的名称和一行类型；小尺寸兼容卡片显示一行名称，剩余空间留给任务标记。完整名称可在面板与 SVG 标题中读取。很小的任务退回原生绘制。

模型实例留在 `useBpmnDesigner`，不进入 Vue 的深层响应式。面板仍提交标准建模命令，业务审批扩展与主题没有依赖关系。

## 布局与 XML

1. `layout.ts` 检查范围和尺寸，把普通图转换为带卡片尺寸的 ELK 图。
2. `LayoutRunner.ts` 按需启动 ELK 0.12.0 的本地 Worker，20 秒超时；退出设计器时终止计算。
3. 结果完整校验后，由 `LayoutCommand.ts` 按稳定 ID 原子更新形状、外部标签及连接的 DI；标签写入 `di.label.bounds`，不覆盖节点自身的 `di.bounds`。
4. 手动整理作为一个命令加入历史。旧尺寸图导入时自动整理，然后清空历史，形成导入基线。

ELK 只接收几何与图连接快照，不重新解析/导出业务 XML。标准 BPMN 类型、审批字段和未知扩展仍由原模型持有。是否能保存某种第三方扩展取决于原有 moddle 导入能力；仍须检查导入警告，不承诺任意引擎扩展无损。

复杂图整体跳过重排，不只放大其中一部分节点。新建卡片仍使用当前标准尺寸，用户可手动安排。未覆盖的复杂路由将来可逐步扩大白名单；启用前应补齐样本与验证。

XML 中保存标准节点、业务字段及 DI 几何，不嵌入 Tabler 图标或这套 Vue/CSS 界面。其他工具可打开相同 BPMN，外观由各自 Renderer 决定。实际部署到 Flowable、Camunda 或 Go 自定义引擎仍需单独实现已选定的执行契约。

## 验证

`pnpm test` 包含默认流程、六个审批模板和服务任务的真实 ELK + moddle 往返，检查尺寸、节点不重叠、正交路由、业务 XML 保留、开始节点阅读方向及整体撤销/重做；另检查缺失路由与目标时不产生部分修改。`pnpm build` 包含 TypeScript 检查。

浏览器验收还覆盖实际模型中的一次布局撤销/重做、属性编辑与回导、手动几何保留、泳道紧凑导入与禁用整理、显式颜色和未知扩展、错误 XML 的原图与历史保护，以及桌面与窄屏控件。修改 Renderer 或 bpmn-js/diagram-js 版本后，应重新检查这些交互，尤其是外部标签 DI 和原生任务标记。

当前构建包含约 1.6 MB 的 ELK Worker 原始文件，首次需要布局时加载；设计器主块仍有体积提示。部署时应提供压缩和静态缓存，并允许同源 Worker。
