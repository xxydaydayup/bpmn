# bizJson 节点业务数据功能实施交接

日期：2026-11-18（Asia/Shanghai）。下一次会话用于按已确认工单实施业务工作流设计器的 bizJson 功能。

## 接续状态

用户已完成规格确认及工单拆分确认，最新要求是「生成合适的交接文档，我等下再实现」。本次到交接为止，不开始产品实现。下次收到实施指令后，从子工单 02 开始，无需再次确认既定粒度或验收边界。

本轮已完成代码与后端契约调研、规格、本地父工单和两个子工单发布。未为 bizJson 修改产品代码，未执行产品测试、构建、后端编译、部署或实例运行。后端 Schema 和业务规范曾于本日只读获取成功，这不能作为编译或运行时已验收的证据。

## 必读资料与实施顺序

先读 [工程入口](../../Agent.md)、[本地工单约定](../agents/issue-tracker.md)、[标签映射](../agents/triage-labels.md)；涉及领域概念时按 [领域文档约定](../agents/domain.md) 读取 [CONTEXT.md](../../CONTEXT.md)。

| 资料 | 用途与当前状态 |
| --- | --- |
| [bizJson 规格](../../.scratch/node-bizjson/spec.md) | 功能行为、实现决策、范围和已确认验证边界的依据 |
| [拆分计划](../../.scratch/node-bizjson/tickets-plan.md) | 已发布，用户已回复「合适」确认两单粒度及依赖 |
| [02：节点 bizJson 编辑、保存与编译](../../.scratch/node-bizjson/issues/02-node-bizjson-edit-save-compile.md) | ready-for-agent / pending；无阻塞，首先实施 |
| [03：子流程片段 bizJson 复用与嵌套编译](../../.scratch/node-bizjson/issues/03-subprocess-bizjson-reuse-compile.md) | ready-for-agent / pending；仅依赖 02 完成 |
| [01：父工单](../../.scratch/node-bizjson/issues/01-node-bizjson-field.md) | 汇总来源，按拆票约定保持原样；不是 02 的前置任务 |
| [后端来源与摘要](../../.scratch/node-bizjson/reference/provenance.json) | 两份正式契约原件的来源、抓取时间和 SHA-256 |

实施时读取各子工单完整正文及 Comments，以各单记录维护 Progress、验收勾选和真实结果。不要直接领取内容重叠的父工单再重复实现。规格中的早期「一个完整功能工单」描述属于拆分前记录；执行顺序以已发布子工单及计划为准。

详细字段语义和验收清单已经写在规格与工单中，本交接不复制。前端编辑、XML 编译保存、后端运行时执行的验证范围须分别报告。运行时覆盖行为的声明与本次验收边界见规格，不能套用其他 SDK 项目的真实引擎验收范围。

## 已有实现的导航

下列是已查阅的接入位置，不代表需要逐个修改；先复用自然保留字段的已有链路，仅补实际缺口。

| 关注点 | 入口 |
| --- | --- |
| 标准节点类型及协议字段识别 | [SDK 类型](../../packages/workflow-sdk/src/types.ts)、[SDK Schema 定义](../../packages/workflow-sdk/src/schema.ts)、[公共校验](../../packages/workflow-sdk/src/validation.ts) |
| 函数式定义配置 | [definition.ts](../../packages/workflow-sdk/src/definition.ts)：通用配置类型和运行时允许字段集合均需检查 |
| 模型基线与历史来源 | [compatibility.ts](../../packages/workflow-sdk/src/compatibility.ts)；正式契约原件由上述来源清单索引 |
| Schema 生成与同步 | [SDK 生成脚本](../../packages/workflow-sdk/scripts/write-schema.mjs)、[设计器同步脚本](../../packages/workflow-designer/scripts/sync-schema.mjs) |
| 通用属性面板、更新与历史 | [WorkflowDesigner.vue](../../packages/workflow-designer/src/WorkflowDesigner.vue)：既有 bizType 控件、updateNode、compileModel |
| 模型与设计稿转换 | [设计器类型](../../packages/workflow-designer/src/types.ts)、[contract.ts](../../packages/workflow-designer/src/contract.ts)、[adapter.ts](../../packages/workflow-designer/src/adapter.ts)、[compiler-model.ts](../../packages/workflow-designer/src/compiler-model.ts) |
| 片段编辑和引用快照 | [子流程属性编辑器](../../packages/workflow-designer/src/nodes/subprocess/PropertyEditor.vue)、[片段管理页](../../src/views/SubProcessLibraryView.vue) |
| 宿主编译/发布及请求边界 | [设计器宿主页](../../src/views/WorkflowDesignerHostView.vue)、[宿主客户端适配](../../src/api/workflow/client.ts)、[SDK 客户端](../../packages/workflow-sdk/src/client.ts) |
| 既有公开验证入口 | [设计器组件测试](../../packages/workflow-designer/tests/WorkflowDesigner.test.ts)、[往返契约测试](../../packages/workflow-designer/tests/contract.test.ts)、[SDK 公共 API 测试](../../packages/workflow-sdk/tests/public-api.test.mjs)、[函数定义测试](../../packages/workflow-sdk/tests/definition.test.mjs)、[宿主适配测试](../../tests/forms/workflow-client-adapter.test.ts) |

当前 SDK 类型与 Schema 尚无 bizJson；设计器已存在可复用的 bizType 交互及可选属性删除行为。片段模式对现有 bizType 有显示条件，实施 bizJson 时须按其工单检查片段入口。现有编译转换会递归剥离编辑器元数据，应先核对其公共输出再决定是否改动。

架构依据为 [ADR-0005](../adr/0005-vue-workflow-designer.md) 和 [ADR-0004](../adr/0004-workflow-control-plane.md)。测试、构建和 Schema 同步命令以工程入口及 [根 package.json](../../package.json)、[SDK package.json](../../packages/workflow-sdk/package.json)、[设计器 package.json](../../packages/workflow-designer/package.json) 的现状为准。

## 工作区和资料保留

- 工作区已有多项未提交修改与未跟踪文件，涉及函数式 SDK、宿主客户端、文档等。这些是本轮 bizJson 之前就存在的工作；接续先检查 git status 与目标文件差异，保留现有改动，不把未跟踪的新 SDK 入口误当成可删除文件。差异细节直接看当前 Git 状态，不在交接里复制。
- `.scratch/node-bizjson/` 已确认被 Git 忽略。其规格、工单及契约原件在当前目录可用，但仅提交本交接或新建干净 worktree 不会自动带上这些资料。迁移会话目录或机器前一并保留该功能目录；当前没有更改忽略规则或执行 Git 提交。
- 本会话较早生成的 [鹈鹕自行车 HTML](../../pelican-bicycle.html) 属于独立已完成任务。那次「不测试、不使用 skill、不依赖本地 AGENTS.md」仅针对 HTML 任务；bizJson 后续已明确调用 to-spec、to-tickets，并确认验证方案，不能沿用该旧任务约束跳过本功能验收。
- 当前仓库没有 `.codegraph/`；接续若仍不存在则按普通搜索探索，不主动索引。若状态变化，遵循仓库的 CodeGraph 使用规则。

## Suggested skills

下一位代理按实际实施阶段使用 Skill 工具调用相关技能；若环境没有 Skill 工具，读取对应 SKILL.md，并遵循会话中可用技能的调用方式。

- **ui-ux-pro-max**：接入属性面板多行输入时，核对现有样式、标签、帮助文案、键盘和只读交互；此处是现有面板的小范围功能扩展。
- **agent-browser**：实施后在业务流程设计器和片段编辑器验证受影响的真实浏览器交互。
- **diagnosing-bugs**：仅当实现中出现失败、异常或回归且需要诊断时调用。

无需重跑 to-spec 或 to-tickets；其交付物与用户确认已经完成。先读取本交接和工单，再按新的实施指令继续。
