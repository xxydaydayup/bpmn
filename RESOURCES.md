# 流程引擎控制面工作台资源

## Knowledge

- [本仓库 README](./README.md)
  当前页面、真实实现和未接入项的事实来源；判断功能是否已经实现时先看这里。
- [ADR-0004：流程控制面与 Camunda 7 引擎验证边界](./docs/adr/0004-workflow-control-plane.md)
  本项目的角色范围、正式发布追踪、生产代理与运维动作约束；规划下一版时的首要决策依据。
- [本仓库领域术语](./CONTEXT.md)
  区分设计稿、部署、定义版本、实例、任务与审计，避免功能清单混用对象。
- [Camunda 7 官方：部署](https://docs.camunda.org/manual/7.24/user-guide/process-engine/deployments/)与[流程版本](https://docs.camunda.org/manual/7.24/user-guide/process-engine/process-versioning/)
  解释保存模型、部署和新版本对已有实例的不同影响；设计发布与追溯功能时使用。
- [Camunda 7 官方：Cockpit 实例视图](https://docs.camunda.org/manual/7.24/webapps/cockpit/bpmn/process-instance-view/)与[失败作业](https://docs.camunda.org/manual/7.24/webapps/cockpit/bpmn/failed-jobs/)
  观察实例、活动、变量和失败作业时的参考；其中部分官方产品 UI 能力有版本或商业版限制，不能推断本仓库已经具备。
- [Camunda 7 官方：Tasklist 工作方式](https://docs.camunda.org/manual/7.24/webapps/tasklist/working-with-tasklist/)
  理解业务用户认领、办理和完成任务的体验，用来划清未来业务审批应用与本控制面的职责。
- [Camunda 7 官方：安全](https://docs.camunda.org/manual/7.24/user-guide/security/)与[历史配置](https://docs.camunda.org/manual/7.24/user-guide/process-engine/history/history-configuration/)
  规划生产鉴权、授权、历史查询和保留策略时使用；引擎历史不代替本项目规定的平台审计。

以上 Camunda 官方页面为 7.24 版，用于理解产品概念；本项目的目标执行契约仍是 Camunda 7.20.0，具体接口与行为应按仓库验证资料和目标服务复核。

### 成熟工作台参考

- [Camunda 7 Cockpit](https://docs.camunda.org/manual/7.24/webapps/cockpit/)
  与当前仓库最接近：重点看部署、流程定义、实例、失败 Job 的信息组织；部分界面能力受版本或商业版限制。
- [Flowable Control](https://documentation.flowable.com/latest/user/control/processes/index.html)与[接替它的 Flowable Hub](https://documentation.flowable.com/latest/user/hub/introduction/index.html)
  对比成熟运维控制台的实例诊断、任务/Job/Incident 和多环境管理。Control 已进入有限维护；Hub 文档公开，实际安装需要含 Hub 权益的许可证。重点可读[实例详情](https://documentation.flowable.com/latest/user/hub/work-instances/index.html)。
- [Camunda 8 Operate](https://docs.camunda.io/docs/components/operate/operate-introduction/)与[Web Modeler](https://docs.camunda.io/docs/components/modeler/about-modeler/)
  借鉴现代实例搜索、故障处理与协作建模交互；Camunda 8 基于 Zeebe，不能照搬到本项目的 Camunda 7 XML 和 REST 契约。
- [Bonita Process Manager Application](https://documentation.ofelia.com/bonita/latest/runtime/process-manager-application)
  对照监控、流程/实例/任务管理与[用户应用](https://documentation.ofelia.com/bonita/latest/runtime/user-application-index)的分工；Process Manager Application 仅在官方列出的商业版本提供。

## Wisdom (Communities)

- [Camunda Forum](https://forum.camunda.io/)
  官方社区，适合带着具体 BPMN、版本号和复现步骤请教实际部署、历史与运维问题。

## Gaps

- 本项目尚无正式 Go/BFF API 与业务审批应用的已确认契约；相关功能建议来自 ADR 和现状分析，不能作为已实现接口引用。
