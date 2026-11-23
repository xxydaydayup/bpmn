# 业务流程只读预览交付与验证

日期：2026-11-23。覆盖模板、运行实例、历史实例、模板 iframe 与实例 iframe 的仓库内实现。部署集成说明见 [嵌入指南](../workflow-preview-embedding.md)，能力边界见 [ADR-0006](../adr/0006-embeddable-workflow-preview.md)。

## 已交付

- 设计器包导出独立 `WorkflowPreview`，接收裸业务模型、元信息与可选活动状态；不请求网络、不改输入、不提供编辑操作。保留可靠坐标和尺寸，缺坐标时为副本生成临时布局。
- 模板详情优先显示本次响应的 `displayJson`，并保留名称、key、版本和定义 ID；缺模型或结构无效时提供明确提示与显式 XML 备用入口。未知类型展示名称及原类型，子流程只显示外层和步骤数。
- 运行/历史实例严格以实际 `processDefinitionId` 查找历史模板版本，并核对 key、版本、定义 ID。不存在精确模型时只使用同定义 ID 的 XML。当前活动、历史完成/取消状态分别标记，不推断顺序流执行路径。
- 管理台历史实例行和“查看详情”可打开共享预览；关闭、页签切换、目标变更与卸载清理图形及请求。
- 独立 `/workflow-preview` 页面只接受单个 `templateKey` 或 `processInstanceId`，无工作台导航、变量和表单。支持应用/API 子路径，限制同源 API，提供错误状态、重试与迟到响应隔离。
- 同源 HTML iframe 示例和 nginx/CSP 配置位于 [examples/workflow-preview](../../examples/workflow-preview/)。

## 自动检查

最终运行结果：`pnpm test` 共 354 项通过（SDK 56、设计器 161、宿主 42、原 Node 测试 95）；`pnpm build` 包含包/应用类型检查和构建。新增共享组件及宿主测试使用真实 Vue Flow 节点/连线，涵盖模板详情、管理台运行/历史选择、iframe 状态、模型不变、精确旧版本、活动标记、请求切换和错误/备用入口。XML 尺寸缓存回归测试在查看器 seam 隔离隐藏容器：修复前会抛出非有限 SVGMatrix 缩放错误，修复后通过。

首轮全量表单测试与构建并行时，两项原表单测试触发 5 秒超时；将宿主测试并发限制为 2 后全量通过。未增加测试超时或改变表单产品行为。Vite 继续报告部分依赖块大于 500 kB 的构建提示。

## 真实后端只读实测

通过本地已有开发代理配置执行 GET，无发布、启动、办理或部署操作，无凭据写入记录：

- `/api/v1/template` 返回 200，共 16 个模板；响应使用 `code/data/message` 信封。
- `amount_branch_start_demo_20261117/history` 返回两个版本；v1 与 v2 的 `processDefinitionId` 不同，历史详情分别与索引定义 ID 一致。v1 含 5 节点 `displayJson` 及 XML，确认现有服务可提供精确历史快照。
- 历史活动查询返回 200，实测字段包含 `activityId`、`activityType`、`processInstanceId`、`processDefinitionId`、`startTime`、`endTime`、`canceled`、`completeScope`；抽样 4 条记录有结束时间且定义 ID 匹配。取消状态自动测试使用明确 fixture，未声称真实取消记录通过。

模板历史查询只遍历当前访问者可见模板；无可见索引的已删除模板/旧快照只提供同定义 XML，无法从前端恢复业务模型。生产网关仍需在每个只读路径执行用户及租户授权。

## 浏览器实测

使用 agent-browser 和真实组件：

- 工作台模板详情真实 API：5 节点、5 连线，模板名称、版本、定义 ID 与当前响应一致；390px 窄屏页面宽度和 scrollWidth 相同。
- 管理台运行实例真实 API：`74fcb170-e337-11f1-b049-00155d21c8ae`，7 外层节点、7 连线，`sibling` 和 `work_join` 标为当前活动；子流程只显示外层和步骤数。精确定义为 `f1aa876e-e336-11f1-b049-00155d21c8ae`。
- 历史列表打开真实实例 `d065166e-e4c2-11f1-aa47-00155d21c8ae`：3 节点、2 连线，完成状态可见；派生 `FinishNotify_1` 无业务节点可匹配时提示并保持未标记。390px 窄屏无横向溢出。
- 同定义 XML 备用图真实浏览器：31 个图形、2 个当前活动标记，尺寸缓存修复后浏览器 errors 为空。
- `/workflow/` 子路径的真实同源 iframe：通过仓库 HTML 示例载入模板/实例，API 使用模拟数据；桌面 1280×960 和窄屏 390×844 均显示真实 3 节点/2 连线和当前状态。资源/懒加载 200 且带 `/workflow/`，API 带 `/workflow/api/`，iframe 无横向溢出，浏览器 errors 为空。

本地截图保存在忽略目录 `.scratch/workflow-preview/`：`template-desktop.png`、`template-narrow.png`、`running-desktop.png`、`history-desktop.png`、`history-narrow.png`、`iframe-desktop.png`、`iframe-narrow-instance.png`。

## 仍需实际部署验收

本仓库没有生产业务网关、登录、租户系统和 TLS/CSP 部署，以下尚未完成，不以模拟接口或开发代理替代：

- 当前业务用户会话透传及未登录/已登录切换。
- 多用户、跨租户对模板、实例、历史、精确定义元信息与 XML 的授权隔离，包括直接调用 API。
- 真实 HTTP `frame-ancestors` 来源策略：同源父页面正常嵌入、未授权来源被浏览器阻止。
- 生产反向代理下刷新、连续切换和缓存隔离。

因此第 01～03 单完成仓库内与开发后端验收，第 04～05 单完成前端和示例交付，生产部署验收项保持待办。
