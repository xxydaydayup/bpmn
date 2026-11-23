# 业务流程只读预览

2026-11-23：按已确认规格实现模板、运行实例、历史实例以及 iframe 预览。架构边界见 [ADR-0006](adr/0006-embeddable-workflow-preview.md)，部署和数据接口见 [嵌入指南](workflow-preview-embedding.md)。

## 当前入口

- `/workflow-business`：点击任务模板行或“详情”，优先显示本次详情响应的 `displayJson`，同时显示名称、key、版本和流程定义 ID。
- `/camunda-console`：选择运行实例查看准确版本与当前活动；“历史查询 → 历史实例 → 查看详情”打开同一只读实例预览。管理台原有变量/运维操作仍属于开发控制面。
- `/workflow-preview?templateKey=...` 或 `/workflow-preview?processInstanceId=...`：无工作台导航的嵌入页，只显示结构、版本和活动状态，不查询变量或表单。

业务图提供缩放、平移和适应画布，关闭拖拽节点、连接、选中编辑和键盘删除。已有可靠坐标和尺寸保留；缺少坐标时只为预览副本产生临时布局。未知类型保留名称与原类型，未知字段不自动展示。子流程只展示外层及步骤数，不展开内部；无法匹配的活动明确提示并保持未标记。

业务模型缺失或无法可靠绘制时清除旧图，显示原因；存在 XML 时通过“查看 BPMN XML 备用图”显式打开。备用图使用模板同次响应的 XML，或实例精确流程定义 ID 的 XML，显示区别于业务图的标题。两种图均区分当前活动、已完成和已取消状态。表达式按文本展示，不执行。

## Vue 组件

从 `@workflow/designer` 导入 `WorkflowPreview`，同时导入 `@workflow/designer/style.css`；使用 `<WorkflowPreview :model="displayJson" :metadata="metadata" :node-states="nodeStates" />`。

`model` 支持裸业务模型或其 JSON 字符串，不支持设计稿信封。可选 `metadata` 含名称、key、版本和流程定义 ID。可选 `nodeStates` 按模型节点 ID 传入 `active`、`completed` 或 `canceled`；`ready` 返回可见节点 ID，`error` / `warning` 提供可观察反馈。组件不请求接口、不修改输入、不编译或保存。完整接口与示例见 [包说明](../packages/workflow-designer/README.md)。

## 实例版本与活动

当前由前端适配层组合模板历史、实例和活动查询。后续可由后端提供一次返回准确模板快照与活动信息的实例预览聚合接口，减少前端查找和请求数量；该接口尚未实现，方案见[后端聚合接口优化建议](workflow-preview-backend-optimization.md)。

实例读取自己的 `processDefinitionId`，在可见模板及其历史索引中匹配，随后核对历史详情的模板 key、版本和定义 ID。找不到匹配时提示模型不可用，并保留同 ID XML 备用入口；从不按 key 读取最新版替代。精确引擎定义补充名称、key 和版本元信息。模板历史列表受用户可见范围限制，已删除或无权限的快照不能由前端恢复。

运行实例只读取活动树的 BPMN `activityId`，移除多实例体后缀以匹配业务节点。历史实例只把有 `endTime` 的记录标为完成、明确 `canceled=true` 的记录标为取消。同一节点存在相互冲突的历史状态时给出提示并不合并为单一标记；不推断未返回的执行路径。

请求切换、关闭和卸载时取消旧请求，并隔离迟到响应。新目标加载期间清除旧图、版本、活动和错误；模板、实例、状态与 XML 作为同一目标快照展示。

## 验证边界

实际检查结果见 [交付验证记录](handoffs/2026-11-23-workflow-preview.md)。自动测试使用真实 Vue Flow 绘制节点/连线，覆盖工作台模板详情、运行与历史入口、iframe 状态和切换；后端只读探测验证历史索引及准确版本字段。生产同源会话、多用户/租户隔离和 CSP 仍需在业务系统部署环境验收。
