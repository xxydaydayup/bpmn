# Camunda 7 BPMN 契约与首条联调闭环

**Status: accepted**

项目采用 Camunda 7 原生 BPMN 扩展作为设计与执行配置契约，使用 `camunda-bpmn-moddle` 和 Camunda Platform behaviors；属性面板继续由 Vue 自定义实现，以保持现有交互与样式控制。实验性 `wf:` 扩展及其固定名单审批结果语义不再作为部署契约，旧 XML 不承诺自动迁移；多人任务只使用 Camunda 7 标准多实例集合、元素变量和办理人表达式。

首阶段通过开发代理调用 Camunda 7 原生 REST，避免浏览器直接承担跨域 Basic Auth 和引擎凭据；待 Go 包装层就绪后，生产请求改由 Go API 承接。验收闭环限定为 XML 部署、流程定义查询、按 key 启动实例、查询人工任务、领取/完成任务和读取活动树；不把该范围表述为已实现草稿持久化、完整审批、表单运行时或 External Task worker。
