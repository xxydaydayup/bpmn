# Camunda 7 + Go 流程引擎前端生态技术调研

调研日期：2026-09-21。目标：为“Camunda 7 作为流程引擎、Go 作为业务后端包装层”的前端 PoC 提供联调范围、通用能力和库选型依据。本文只记录调研和方案建议，不表示尚未联调的能力已经实现。

## 结论先行

1. **保留当前编辑器技术路线。** 本仓库已经使用 Vue 3 + TypeScript + bpmn-js + diagram-js + Pinia + Axios + Element Plus。bpmn-js 的模型、图形和 XML 读写边界适合继续承载 BPMN 设计器；因为视觉样式或工具栏不合适而切换编辑器，会增加第二套图模型到 BPMN XML 的转换维护。
2. **首先补齐 Camunda 7 扩展和发布闭环。** 需要把 `camunda-bpmn-moddle`、bpmn-js properties panel 集成、Camunda behaviors 和 BPMN 规则检查作为设计器能力候选；然后实现“保存草稿 → 前端检查 → Go 适配 → Camunda 7 部署 → 返回部署/定义版本”的闭环。Camunda 扩展字段能被编辑不等于 Go 适配器已经把它翻译成可执行配置。
3. **Go 服务是浏览器唯一的业务 API。** Camunda 7 REST API 和 External Task API 是 Go 包装层的上游接口；浏览器不应直接携带引擎凭据访问 Camunda。前端应调用稳定的业务 API，后端负责引擎版本、租户、权限、变量和错误码适配。
4. **API 契约优先于状态库。** 建议 Go 服务提供 OpenAPI；前端用 `openapi-typescript` 生成类型，或在需要生成请求函数/查询 hooks 时选择 Orval。现有 Axios 保留为传输层；TanStack Query Vue 用于服务端状态和轮询，Pinia 只保存 UI、编辑草稿和会话级客户端状态。
5. **最小增量库集合是有限的。** P0/P1 优先考虑 `camunda-bpmn-moddle`、bpmn-js 的 properties panel 集成、`bpmnlint`、OpenAPI 类型生成、Vitest + MSW；当运行态页面增多时再引入 TanStack Query，Playwright 用于浏览器闭环。表格、图表、表单、OIDC 和遥测按真实功能再引入，不为“生态完整”预先堆依赖。

文中标签含义：

- **[事实]** 可由列出的官方文档、官方源码或 npm registry 一手元数据直接确认。
- **[建议]** 结合本仓库现状和 Go 包装边界的方案判断，不是已实现功能。
- **[待验证]** 需要用公司的 Camunda 7 版本、认证方式、数据库和业务数据实测后才能承诺。

## 1. 本仓库现状与联调缺口

### 1.1 当前已存在的技术基线

以下版本取自 `pnpm-lock.yaml` 的实际解析结果，查询日为 2026-09-21；`package.json` 中的 `^` 只是允许范围，不应替代锁文件版本。

| 能力 | 当前实现/版本 | 对联调的含义 |
| --- | --- | --- |
| 应用 | Vue `3.5.43`、TypeScript `5.9.3`、Vite `7.3.6` | 适合保留 Vue 单页应用和类型检查；Node 版本以 `package.json` 的 engines 为准 |
| BPMN 设计器 | `bpmn-js 18.28.0`、`diagram-js 15.26.0`、`elkjs 0.12.0` | 已能本地绘图、保存/导入 XML、编辑属性和布局；尚未接 Camunda 7 moddle |
| UI 与请求 | Element Plus `2.14.6`、Axios `1.20.0` | 表格、表单和请求封装已有起点；请求层暂不约定业务码、认证 token 或重试语义 |
| 客户端状态 | Pinia `3.0.4`、Vue Router `4.6.4` | 当前主要用于界面状态和路由；没有服务端缓存层 |
| 已有通用保护 | `useTable` 传递 `AbortSignal`，并以请求序号隔离旧结果 | 可保留到真实列表 API；不能代替服务端幂等、权限或一致性 |
| 后端联调 | 尚未接登录、权限、持久化、流程执行、任务运行时、表单加载 | 设计 XML 能导出不代表引擎能部署或实例能运行 |

项目约定要求区分三层：**前端可以编辑、XML 可以保存、后端可以执行**。本报告的库推荐只解决前端和联调基础设施，不能把建议库当作执行引擎适配器。

### 1.2 需要实现的通用能力

| 层次 | 第一阶段应实现的能力 | 验收证据 |
| --- | --- | --- |
| 设计 | Camunda 7 扩展属性编辑、标准子集检查、XML 原文/版本保存、导入导出警告 | 真实 XML 往返；未知扩展不静默丢失；检查结果带元素 ID |
| 发布 | 草稿校验、发布目标/版本、部署进度、重复发布幂等、引擎返回定义 ID/版本 | Go API 的 OpenAPI 契约；Camunda 7 `Deployment`/`ProcessDefinition` 返回值与日志 |
| 发起 | 选择流程定义版本、传入类型化变量、发起实例、返回实例 ID | 用固定 BPMN 样本启动实例并能在 Go API 查询 |
| 待办 | 待办查询、领取/转派（若后端开放）、完成/拒绝/退回、意见和变量 | 任务状态迁移与并发重复提交测试 |
| 运行可视化 | 当前活动、历史轨迹、异常/Incident、流程版本和设计元素 ID 映射 | 运行实例关联启动时的定义版本，不用最新草稿解释历史 |
| 平台 | 登录会话、权限决策、统一错误码、请求取消、trace/correlation ID、审计 | 401/403/409/429/5xx 分层处理；前端 UI 权限不替代后端鉴权 |

## 2. Camunda 7 后端接口与前端联调边界

### 2.1 Camunda 7 官方 REST/External Task 能力

Camunda 7.24 文档将 REST API 作为引擎资源的 HTTP/JSON 接口，涵盖部署、流程定义、流程实例、任务、变量、历史和异常等资源；External Task 文档另有 fetch-and-lock、complete、failure 和 BPMN error 操作。【S1】【S2】文档版本是 7.24，实际部署版本若不同，必须按公司的引擎版本重新核对。

| Camunda 7 资源 | 官方接口事实 | Go 包装层应提供的稳定语义 |
| --- | --- | --- |
| Deployment / Process Definition | 可创建部署、查询定义、按 key/version 获取定义，并返回引擎生成的部署/定义标识。【S1】【S3】 | `publish` 接受设计版本和目标；返回 `deploymentId`、`definitionId`、`definitionKey`、`version`、适配器版本和内容哈希 |
| Process Instance | 可按定义启动实例并传入变量，也可查询实例。【S1】【S4】 | `start` 接受业务请求号和类型化变量；返回实例 ID、定义版本和 correlation ID |
| User Task | 可查询任务、读取任务变量、完成任务；具体授权、候选人和办理人由引擎配置和 REST 认证决定。【S1】【S5】 | 不暴露 Camunda 原始字段作为唯一业务契约；定义 `taskId`、业务实例、动作、意见、变量、版本和幂等键 |
| External Task | Worker 通过 fetch-and-lock 按 topic 获取锁定任务，再 complete、fail 或报告 BPMN error；锁到期可重新获取。官方说明 worker 可以是独立进程/其他语言，通过 REST 交互。【S2】 | Go worker 使用该接口；浏览器只看经 Go 聚合后的运行状态或失败信息，不直接执行 worker 协议 |
| History / Incident | 引擎可查询历史活动、变量和异常资源；保留范围受引擎历史级别、授权和部署配置影响。【S1】【S6】 | 前端展示“可查询的审计/异常”而非假设所有变量都可追溯；接口标明时间、版本和权限范围 |

**[建议] 不要把 Camunda REST 原样透传给浏览器。** 原样透传会把引擎版本、认证、分页、变量序列化和 Camunda 扩展泄漏到前端，后续替换引擎或升级 7.x 会牵动页面。Go 服务可在内部调用 Camunda REST，在外部提供版本化的业务 API。

### 2.2 建议的 Go API 资源

下面是建议的最小资源，不是当前仓库已实现的接口；字段需要与后端共同定稿并进入 OpenAPI。

```text
GET    /api/workflow/definitions
GET    /api/workflow/definitions/{key}/versions
POST   /api/workflow/definitions/{key}/drafts
POST   /api/workflow/definitions/{key}/deploy
GET    /api/workflow/instances/{id}
POST   /api/workflow/instances
GET    /api/workflow/tasks
GET    /api/workflow/tasks/{id}
POST   /api/workflow/tasks/{id}/actions/{action}
GET    /api/workflow/instances/{id}/timeline
GET    /api/workflow/incidents
GET    /api/workflow/capabilities
```

关键约定：

- 设计源保存 `xml` 原文、设计版本、内容哈希和 `wf` 扩展；发布产物单独保存适配后的 Camunda XML，不反向覆盖设计源。
- 实例、任务和历史记录保存启动时的 `definitionId/version` 及设计元素 ID 映射；前端高亮必须按运行实例的版本取图。
- 变量使用显式类型（字符串、数字、布尔、日期、对象/JSON）和空值规则；不要让前端把任意 JavaScript 值直接塞进 Camunda 变量。
- `POST` 发布、启动和任务动作需要业务幂等键；重复请求应返回同一结果或明确 `409`，不能靠前端按钮禁用保证幂等。
- 错误至少区分认证失败、无权限、版本冲突、变量校验失败、引擎不可用、External Task 锁冲突和未知错误；Axios 层只做传输归一化，业务层显示可行动信息。
- API 返回 `requestId/correlationId`，前端日志、Go 日志和引擎操作可用同一标识串联。

## 3. BPMN 设计器生态

### 3.1 继续使用 bpmn-js/diagram-js

**[事实]** bpmn-js 官方 walkthrough 以 `BpmnModeler` 导入/导出 BPMN XML，并通过 diagram-js 处理画布交互、通过 bpmn-moddle 读写 BPMN 元模型；`saveXML()` 保存模型和 DI，`saveSVG()` 是单独的图形导出。【B1】当前项目锁定 bpmn-js 18.28.0、diagram-js 15.26.0。

**[建议]** 保留 `useBpmnDesigner` 对实例生命周期、选择、命令栈和 XML 的封装。不要把 bpmn-js 的 model/businessObject 深层放入 Vue 响应式对象；现有“面板接收普通快照、通过 `modeling.updateProperties` 修改”的方式适合继续扩展。

### 3.2 Camunda 7 扩展建模

| 库/能力 | 官方事实与版本观察 | 适用建议 |
| --- | --- | --- |
| `camunda-bpmn-moddle` | Camunda 官方仓库提供 bpmn-moddle 扩展描述，可在 modeler 的 `moddleExtensions` 中注册 Camunda 命名空间；npm registry 查询日 latest 为 `8.0.1`。【B2】 | **P1 引入。** 只在确实要编辑 Camunda 属性时使用；它只是 XML 元模型，不是 REST client，也不会自动让 Go/Camunda 执行字段生效 |
| `bpmn-js-properties-panel` + `@bpmn-io/properties-panel` | bpmn.io 官方集成包负责把属性面板接入 bpmn-js，并提供通用/Camunda provider；`@bpmn-io/properties-panel` 是其底层面板组件，需按 bpmn-js/diagram-js 兼容矩阵安装。【B3】 | **P1 评估。** 复用已有 provider 机制编辑标准属性和 Camunda 扩展；本项目 `wf` 审批契约仍应保留自有 provider/面板 |
| `camunda-bpmn-js-behaviors` | Camunda 官方 behaviors 与 `camunda-bpmn-moddle` 配套，用于在编辑时正确维护 Camunda 属性的创建、更新和删除。【B3】 | **与 Camunda 属性面板一起验证。** 只注册 moddle 而不验证 behaviors，可能在属性互相依赖时产生错误或丢失配置 |
| `bpmnlint` | bpmn.io 官方规则检查工具，支持 BPMN 模型规则和自定义规则，可在编辑器或 CI 中运行。【B4】 | **P1 引入。** 与现有结构检查并列：bpmnlint 负责通用 BPMN 规则，自定义检查负责 `wf` 语义和目标 Camunda 版本 |
| `bpmn-js-token-simulation` | bpmn.io 官方插件可在画布上模拟 token，用于交互演示；插件能力不等于真实 Camunda 运行结果。【B5】 | **暂缓。** 可用于设计器教学/冒烟，不要用它替代引擎实例、任务和历史接口 |
| `elkjs` | 当前已用于前端布局；它只改 DI 几何，不负责 Camunda 执行语义 | **保留。** 布局结果与 BPMN XML 业务语义分离，导入失败需恢复原布局 |

Camunda 7 扩展面板第一阶段可以覆盖：流程 `isExecutable`、任务 assignee/candidate users/groups、form key、due date/priority、async before/after、job priority、external task topic、重试策略、listener/connector 等。**[待验证]** 每个字段必须映射到公司实际 Camunda 7 版本和 Go 适配器支持的子集；“面板能写入 XML”不是“部署成功”的证据。`wf` 审批 provider 与 Camunda provider 应分组维护，避免用通用面板覆盖本仓库已有的审批语义。

### 3.3 设计检查应分三层

1. **BPMN 结构检查：** ID/引用、开始结束、连线、DI 和模型类型；可组合 bpmnlint 与现有 `validation.ts`。
2. **业务契约检查：** `wf:approval` 版本、参与人名单、会签/或签、表单引用、结果变量和退回规则；沿用 `docs/adr/0001-human-approval-design.md` 的语义。
3. **目标引擎检查：** Camunda 7 支持的扩展、表达式语言、服务任务绑定、身份标识和变量类型；由 Go 服务或发布预检接口返回，因为浏览器无法证明服务器上的引擎配置。

错误应阻止部署，警告可允许保存草稿；检查结果带稳定元素 ID，以便前端定位节点。不要以 `isExecutable="true"`、XML 解析成功或前端画布能显示为执行兼容证明。

## 4. API、状态和类型安全

### 4.1 请求层：保留 Axios，补齐契约

**[事实]** Axios 官方文档提供实例、拦截器、超时和取消请求能力；本仓库已经有 `axios.create`、超时、错误拦截和 `AbortSignal` 传递。【F1】

**[建议]** 暂不替换为另一个 HTTP 库。需要补的不是换库，而是：

- 统一请求/响应 envelope 和 `ProblemDetail` 错误结构；
- 注入 correlation ID、认证会话和幂等键；
- 仅对幂等 GET 做受控重试，发布/完成任务等写操作必须由服务端幂等；
- 把 401、403、409、422、429、5xx 映射成可测试的错误类型；
- 保留 `AbortSignal`，页面离开或新查询时取消旧请求。

### 4.2 OpenAPI 类型与客户端生成

| 选择 | 官方能力 | 取舍与建议 |
| --- | --- | --- |
| `openapi-typescript` | 将 OpenAPI 3.0/3.1 schema 生成 TypeScript 类型；npm registry 查询日 latest 为 `7.13.0`。【F2】 | **首选起点。** 生成纯类型，保留现有 Axios/request 封装和 API 方法的可读性；不会自动替 Go 服务做运行时校验 |
| Orval | 读取 OpenAPI 生成类型安全的客户端，并可生成 TanStack Query 等 hooks；查询日 latest 为 `8.35.0`。【F3】 | API 数量较大、团队接受生成文件和模板配置时再用；生成代码过多会隐藏 HTTP 错误和取消语义，需要 CI 检查生成结果 |
| 手写 DTO | 直接在 `src/api` 中定义请求/响应类型 | 小规模 PoC 可行，但接口字段变化容易与 Go 契约漂移；不建议在发布/任务 API 稳定后继续手写重复模型 |

建议选择一种生成路线，不同时引入 `openapi-typescript` 和 Orval 生成两套模型。OpenAPI 应由 Go 服务构建产物发布，前端 CI 在契约变化时重新生成并执行类型检查。

### 4.3 Pinia 与 TanStack Query 的边界

**[事实]** Pinia 官方定位是 Vue 的 store，提供 state/getters/actions、开发工具支持等；TanStack Query Vue 官方定位是服务器状态的查询缓存、失效、mutation 和后台刷新。【F4】【F5】

**[建议]** 划分如下：

| 状态 | 放置位置 | 示例 |
| --- | --- | --- |
| 服务端状态 | TanStack Query Vue（查询 key + stale time + mutation/invalidate） | 流程定义列表、任务列表、实例详情、Incident、历史轨迹 |
| 客户端 UI 状态 | Pinia/local composable | 侧边栏、当前租户、筛选项、弹窗、权限展示开关 |
| 设计草稿 | bpmn-js composable + 明确的草稿 store | XML、内容哈希、dirty 状态、撤销/重做、保存版本 |
| 一次性表单输入 | Vue `ref`/Element Plus Form | 启动变量、审批意见、任务动作参数 |

TanStack Query 不是后端一致性保证。任务完成后由 mutation 成功结果触发相关 query 失效；轮询间隔根据业务和引擎负载设置，不能靠每秒全量刷新 Camunda。

### 4.4 Router 与 Vue/TypeScript

Vue 官方 TypeScript 指南推荐在 Vue 3 中使用 `vue-tsc` 做模板类型检查；Vue Router 官方提供路由、导航守卫和懒加载能力。【F6】【F7】建议继续使用当前 Vue Router，按工作流域拆分页面：设计器、定义/版本、实例、待办、历史/异常、管理。路由守卫只改善用户体验；最终授权必须由 Go API 在每个资源和动作上校验。

## 5. 表单、校验、XML 和规则编辑

### 5.1 Element Plus 与 Zod/Ajv

**[事实]** Element Plus 已提供 Vue 表格、表单、分页、反馈等组件；当前项目已锁定 `2.14.6`，可直接承载流程列表和任务操作页。【U1】Zod 是 TypeScript-first 的运行时 schema 校验库，查询日 npm latest 为 `4.6.5`。【V1】

**[建议]** 第一阶段用 Element Plus Form + Zod（或后端生成的 JSON Schema + Ajv）校验启动变量、任务动作、分页过滤器和 API 响应边界。不要把前端校验当成权限或引擎约束；后端仍需重复校验。

Zod 适合手写的少量业务输入；如果 Go 服务已经发布 JSON Schema，Ajv 更适合按 schema 校验大量动态字段。两者不要在同一模型上同时维护手写规则和 schema 规则。

### 5.2 Camunda Form 与 XML 编辑器

| 选项 | 事实/范围 | 建议 |
| --- | --- | --- |
| `@bpmn-io/form-js` | bpmn.io 官方表单模型/编辑器/渲染器，npm registry 查询日 latest 为 `2.0.0`；它是独立的表单 JSON 生态，不会自动等同于 Camunda 7 所有表单机制。【B6】 | 只有当后端决定使用 form-js JSON 作为版本化表单时引入；先定义 `formKey/formVersion` 和数据提交契约 |
| Monaco Editor | Microsoft 官方编辑器，适合 XML、表达式和 JSON schema 辅助；查询日 npm latest 为 `0.56.0`。【U2】 | XML 草稿/表达式需要语法高亮和大文件编辑时再引入；简单弹窗编辑不必增加包体积 |
| 自建 XML parser | bpmn-js 已经通过 bpmn-moddle 读写 BPMN XML | 不要再用字符串替换改 BPMN；扩展属性通过 moddle/modeling 或后端结构化适配 |

Camunda 7 的表单可以是引擎扩展、外部表单或业务页面。**[待验证]** 必须先决定“表单只保存引用”还是“表单定义也由流程平台托管”，否则前端库选择会把产品边界提前锁死。

## 6. 列表、图表和运行态可视化

### 6.1 表格

- **Element Plus Table（当前已有，推荐 P1）：** 适合流程定义、任务和实例的分页/筛选/排序。先接真实 API，沿用 `useTable` 的取消、分页和旧结果隔离。
- **AG Grid Vue（候选 P2）：** 官方 Vue Data Grid 覆盖虚拟化、复杂列、分组和高频数据；npm registry 查询日 `ag-grid-vue3` latest 为 `36.2.0`。【U3】需要评估社区/企业功能授权、包体积和团队学习成本。任务量没有证明达到虚拟化/复杂分组前，不建议替换 Element Plus。

列表必须支持：服务端分页、筛选条件回显、当前定义版本、实例状态、任务 SLA/到期时间、错误重试、取消请求和空/错误/无权限状态。前端分页组件不能掩盖 Go API 的分页一致性问题。

### 6.2 图表与 BPMN 运行覆盖

Apache ECharts 是面向浏览器的图表库，npm registry 查询日 latest 为 `6.1.0`。【U4】可用于实例趋势、节点耗时、任务积压和 Incident 统计。图表数据应由 Go 聚合返回，避免浏览器读取全部历史变量。

运行态 BPMN 图建议继续用 bpmn-js：

1. 后端返回 `definitionVersion`、活动实例/历史活动和稳定的 BPMN element ID；
2. 前端加载与该版本匹配的设计 XML；
3. 通过 overlay/marker 画当前活动、完成、异常和耗时；
4. 对缺失 ID、技术节点或版本不一致显示降级状态。

`bpmn-js-token-simulation` 只能模拟 token 走向，不应拿来显示 Camunda 真实 token、任务锁和变量结果。

## 7. 身份、权限和多租户

### 7.1 推荐边界

**[建议]** 认证和授权由 Go 服务作为资源服务器执行：浏览器获得业务会话或 OIDC token，Go 服务验证 token、租户、资源权限和动作权限，再决定能否调用 Camunda。前端只根据 `/me` 或 `/capabilities` 做菜单/按钮展示；隐藏按钮不是安全控制。

### 7.2 可选库

| 库 | 官方能力与版本观察 | 适用边界 |
| --- | --- | --- |
| `keycloak-js` | Keycloak 官方 JavaScript adapter 用于 OIDC 登录、token 获取/刷新和 logout；npm registry 查询日 latest 为 `26.2.4`。【A1】 | 公司已经选 Keycloak 且浏览器直连 OIDC 时使用；若 Go 采用 HttpOnly session/cookie，则不要为了“有权限库”再引入 |
| `@casl/ability` | CASL 官方提供基于 action/subject 的前端能力判断；npm registry 查询日 latest 为 `7.0.1`。【A2】 | 页面有复杂功能/字段级展示时可用；只做 UX 过滤，不能替代 Go/Camunda 授权 |

不要在浏览器存 Camunda 管理员凭据，也不要把 `candidateUsers/candidateGroups` 当作业务权限的完整实现。候选人是流程执行配置的一部分，真实可见范围仍由 Go 权限服务和引擎授权共同决定。

## 8. 测试、Mock 和可观测性

### 8.1 测试库

| 库 | 官方事实与查询版本 | 在本项目的用途 |
| --- | --- | --- |
| Vitest | Vite 原生测试框架，兼容常见 Jest API；npm registry 查询日 latest 为 `5.0.1`。【T1】 | 单元测试 composables、XML 适配、错误映射、查询 key、权限展示和 bpmnlint 自定义规则 |
| MSW | Mock Service Worker 官方方案可在浏览器 Service Worker 和 Node 测试环境拦截请求；查询日 latest 为 `2.15.0`。【T2】 | 不启动 Camunda 时模拟 Go API；固定 401/403/409/422/429/超时/重复提交响应，验证页面状态和重试边界 |
| Playwright | 官方端到端测试框架，支持 Chromium/Firefox/WebKit 和网络拦截；建议锁定与 Node/Vite 兼容的版本。【T3】 | 验证设计器导入/导出、发布、任务完成、路由守卫、轮询停止和窄屏布局；可用测试 Camunda/Go 环境做少量真实合同测试 |

**[建议]** 测试分层：

1. 不依赖网络的 bpmn-js XML/属性/规则测试；
2. MSW 驱动的 Go API 合同和错误状态测试；
3. Playwright 的浏览器工作流测试；
4. 一组固定 Camunda 7 容器/测试环境的部署、发起、待办和 External Task 合同测试。

MSW mock 通过不等于 Go API 真实契约通过；每次 OpenAPI 或 Camunda 版本升级都应运行第 4 层。

### 8.2 监控与 trace

OpenTelemetry JS 官方文档提供浏览器/网页 trace instrumentation；当前包生态包括 `@opentelemetry/sdk-trace-web 2.11.0`、`@opentelemetry/instrumentation-fetch 0.222.0` 和 `@opentelemetry/instrumentation-xml-http-request 0.222.0`（npm registry 查询日 2026-09-21）。【O1】【O2】

**[建议]** 先让 Go 服务生成和传播 `traceparent`/correlation ID，再决定是否采集浏览器 spans。浏览器遥测应默认采样、脱敏，不记录流程变量、审批意见、token 或 XML 中的敏感信息；前端只上报请求耗时、状态码、路由和稳定资源 ID。若公司已有统一 APM，优先接现有 exporter，不为 PoC 直接绑定单一厂商 SDK。

## 9. 按阶段的落地顺序

| 阶段 | 目标 | 建议库/改动 | 通过条件 |
| --- | --- | --- | --- |
| P0 契约 | Go API/OpenAPI、错误 envelope、认证/租户、幂等和 correlation ID | 保留 Axios；引入 `openapi-typescript`；补 API 类型测试 | 前端能生成类型并处理 401/403/409/422/5xx；无直连 Camunda |
| P1 设计发布 | Camunda 属性、规则检查、草稿/版本、部署 | `camunda-bpmn-moddle`、properties panel、bpmnlint；保留现有 `wf` provider | 真实 XML 往返；部署结果与设计版本可追踪；失败不丢草稿 |
| P2 运行闭环 | 启动、任务列表、任务动作、变量和实例详情 | TanStack Query Vue（服务端状态）；Element Plus Form/Table；Zod 或 JSON Schema | 启动→待办→完成→条件流转；重复动作幂等；query 失效正确 |
| P3 可观测 | 历史、异常、BPMN overlay、趋势 | ECharts；OpenTelemetry；必要时 Monaco | 能按运行版本还原轨迹；Incident/耗时可查询；敏感数据脱敏 |
| P4 平台增强 | SSO、复杂权限、动态表单、大数据量列表 | `keycloak-js`/CASL/form-js/AG Grid 按需求选择 | 后端权限测试先通过；前端库只是展示和交互辅助 |

P0/P1 解决“后端联调成功”最关键的问题；P3/P4 不应阻塞第一条部署和任务闭环。

## 10. 推荐的依赖决策表

| 决策 | 当前/建议 | 理由 |
| --- | --- | --- |
| 保留 | Vue、TypeScript、Vite、bpmn-js、diagram-js、elkjs、Pinia、Vue Router、Axios、Element Plus | 已在仓库运行，替换收益不足；继续把边界做清楚 |
| P1 新增 | `camunda-bpmn-moddle`、`bpmn-js-properties-panel`（及其 `@bpmn-io/properties-panel` peer）、`camunda-bpmn-js-behaviors`、`bpmnlint` | 直接支撑 Camunda 7 XML 扩展编辑和设计检查；需固定 bpmn-js/diagram-js 的兼容组合 |
| P0/P1 新增 | `openapi-typescript` | 让 Go API 变化在前端编译期暴露，低运行时侵入 |
| P2 新增 | `@tanstack/vue-query` | 任务/实例/定义属于服务端状态，需要缓存、失效和轮询边界；不与 Pinia 重复存储 |
| P1 新增 | `vitest`、`msw`；P2/P3 `@playwright/test` | 用 mock 固化后端合同，再用浏览器和真实测试引擎验收 |
| 视需求 | Orval、Zod/Ajv、Monaco、ECharts、form-js、Keycloak、CASL、AG Grid、OpenTelemetry | 依赖业务契约、数据量、认证和运行态需求；引入前先做小样本 PoC |
| 暂不引入 | 第二套 BPMN 编辑器、浏览器直连 Camunda REST、通用 XML 字符串解析器、以 token simulation 替代真实运行、把 UI 权限库当后端授权 | 会扩大转换、凭据、兼容性或安全风险，不能解决当前联调主线 |

## 11. 必须由联调验证的清单

- [ ] 固定 Camunda 7 小版本、REST base path、认证方式、历史级别和引擎插件；报告中的 7.24 文档不能代替本地版本验证。
- [ ] 用 `camunda-bpmn-moddle` 导入一个包含 assignee、candidate、form、external topic、async/retry 的最小 XML，确认未知扩展和 DI 往返不丢失。
- [ ] Go 适配器把 `wf:assignee`/`wf:approval`/`wf:formKey` 映射成 Camunda 7 执行字段，并保存设计元素到部署元素映射。
- [ ] 执行“部署→按版本启动→查询待办→完成→条件流转→历史/异常”合同测试；记录引擎返回的 ID、版本、变量和错误。
- [ ] External Task 验证 fetch-and-lock、锁到期、complete、fail、BPMN error、重试和业务幂等；前端只展示 Go 聚合的状态。
- [ ] 认证/权限验证租户、流程定义、实例、任务和动作级别；UI 隐藏按钮不能作为验收项。
- [ ] 任务完成后的 query invalidation、轮询取消、路由离开和网络断开恢复；不允许旧响应覆盖新筛选条件。
- [ ] 压测真实任务/实例数据后再决定 Element Plus Table 是否需要 AG Grid；先测 API 分页，不先测组件宣传数字。

## 12. 一手资料与版本记录

以下链接均为官方文档、官方仓库或 npm registry；网页/元数据查询日期为 **2026-09-21**。带版本号的 URL 或 npm 版本限定适用范围；未固定版本的官方指南应在升级依赖时重新核对。

对未固定版本的动态官网页面保存了本次响应正文的 UTF-8 SHA-256 快照：bpmn-js Walkthrough `2ec4ce54459ba2b72c5b3ca98ecf6ec2ac72490ac791d6b2100b15b3b18cb813`；Vue TypeScript `a29467a1af5d6d2ce4d976939e19239485527c211c639fdde0f6ff9638e32b15`；Pinia `928daec37035c56b890d3f827f8bcfbe0b13e4f9f8dc1804624934df908a60ca`；Vue Router `581ab62232451f3fcb69d987e177835cd1f1af64a8b731ed3673f28078a81bd8`；Axios `21133bbf191997d901654bb05cac2b89d0ba266b9ba4b969b21e3d80935407ab`；TanStack Query Vue `3d53d3444994e18ac2f6607709160a4d7eacddea04965873c603fea74a9b1200`；Vite `ac58fe396a2000fc73118853b19ec9f722c41efc7f83ee549e3808d37fd8f095`；Element Plus Table `f3b0a719854f6f27a1d3077bbede06dbada64d9f8ab8760eee7991f89b4630e9`；Vitest `eb0a4edba53e26bcc1b0a275161025dad9935fea6c5373e6befc0c1afc4a2e45`；Playwright `5692b91066030420269601e5c271a02ad17b2f1705ae5ec6bbb07607ce665b82`。

### Camunda 7 与 BPMN

| 编号 | 来源 | 版本/用途 |
| --- | --- | --- |
| S1 | [Camunda 7 REST API](https://docs.camunda.org/manual/7.24/reference/rest/) | 文档版本 7.24；部署、定义、实例、任务、变量、历史等资源 |
| S2 | [Camunda 7 External Tasks](https://docs.camunda.org/manual/7.24/user-guide/process-engine/external-tasks/) | 文档版本 7.24；fetch-and-lock、complete、fail、BPMN error、锁 |
| S3 | [Camunda 7 Deployment REST](https://docs.camunda.org/manual/7.24/reference/rest/deployment/) | 文档版本 7.24；部署资源和返回标识 |
| S4 | [Camunda 7 Process Definition REST](https://docs.camunda.org/manual/7.24/reference/rest/process-definition/) | 文档版本 7.24；按 key/version 启动和查询定义 |
| S5 | [Camunda 7 Task REST](https://docs.camunda.org/manual/7.24/reference/rest/task/) | 文档版本 7.24；任务查询和动作 |
| S6 | [Camunda 7 History/Incident REST](https://docs.camunda.org/manual/7.24/reference/rest/history/) / [Incident](https://docs.camunda.org/manual/7.24/reference/rest/incident/) | 文档版本 7.24；历史与异常资源，实际可见范围取决于引擎配置 |
| B1 | [bpmn-js Walkthrough](https://bpmn.io/toolkit/bpmn-js/walkthrough/) | bpmn-js 官方指南；模型器、导入导出 XML/SVG、diagram-js/bpmn-moddle 分工 |
| B2 | [camunda-bpmn-moddle](https://github.com/camunda/camunda-bpmn-moddle) / [npm registry](https://registry.npmjs.org/camunda-bpmn-moddle) | 官方仓库；registry 查询日 latest `8.0.1`；Camunda XML 元模型扩展 |
| B3 | [bpmn-js-properties-panel](https://github.com/bpmn-io/bpmn-js-properties-panel) / [@bpmn-io/properties-panel](https://github.com/bpmn-io/properties-panel) / [camunda-bpmn-js-behaviors](https://github.com/camunda/camunda-bpmn-js-behaviors) | bpmn.io/Camunda 官方仓库；前者负责 bpmn-js 集成与 provider，后者为底层面板组件，behaviors 维护 Camunda 属性联动；按官方 peer 依赖锁定兼容组合 |
| B4 | [bpmnlint](https://github.com/bpmn-io/bpmnlint) | bpmn.io 官方仓库；BPMN 规则和自定义 lint |
| B5 | [bpmn-js token simulation](https://github.com/bpmn-io/bpmn-js-token-simulation) | bpmn.io 官方插件；设计/教学模拟，不是 Camunda 运行时 |
| B6 | [form-js](https://github.com/bpmn-io/form-js) / [npm registry](https://registry.npmjs.org/@bpmn-io%2fform-js) | bpmn.io 官方仓库；registry 查询日 latest `2.0.0`；表单 JSON 编辑/渲染 |

### Vue、API、数据与 UI

| 编号 | 来源 | 版本/用途 |
| --- | --- | --- |
| F1 | [Axios 文档](https://axios-http.com/docs/intro) | 官方文档；实例、拦截器、超时和取消 |
| F2 | [openapi-typescript 文档](https://openapi-ts.dev/introduction) / [npm registry](https://registry.npmjs.org/openapi-typescript) | 官方文档/registry；查询日 latest `7.13.0`；OpenAPI 到 TS 类型 |
| F3 | [Orval 文档](https://orval.dev/overview) / [npm registry](https://registry.npmjs.org/orval) | 官方文档/registry；查询日 latest `8.35.0`；客户端与 query hooks 生成 |
| F4 | [Pinia Introduction](https://pinia.vuejs.org/introduction.html) | 官方文档；Vue store、state/getters/actions |
| F5 | [TanStack Query Vue Overview](https://tanstack.com/query/latest/docs/framework/vue/overview) / [npm registry](https://registry.npmjs.org/@tanstack%2fvue-query) | 官方文档/registry；查询日 latest `5.103.1`；查询缓存、mutation、失效 |
| F6 | [Vue TypeScript Overview](https://vuejs.org/guide/typescript/overview.html) | Vue 官方指南；Vue 3 TypeScript 与 `vue-tsc` |
| F7 | [Vue Router Guide](https://router.vuejs.org/guide/) | Vue Router 官方指南；路由、守卫、懒加载 |
| U1 | [Element Plus Table](https://element-plus.org/en-US/component/table.html) | Element Plus 官方组件文档；本项目锁定 `2.14.6` |
| U2 | [Monaco Editor](https://microsoft.github.io/monaco-editor/) / [npm registry](https://registry.npmjs.org/monaco-editor) | Microsoft 官方站点/registry；查询日 latest `0.56.0` |
| U3 | [AG Grid Vue Data Grid](https://www.ag-grid.com/vue-data-grid/) / [npm registry](https://registry.npmjs.org/ag-grid-vue3) | 官方文档/registry；查询日 latest `36.2.0`；复杂/高数据量表格 |
| U4 | [Apache ECharts](https://echarts.apache.org/en/) / [npm registry](https://registry.npmjs.org/echarts) | Apache 官方站点/registry；查询日 latest `6.1.0`；统计图表 |
| V1 | [Zod](https://zod.dev/) / [npm registry](https://registry.npmjs.org/zod) | 官方站点/registry；查询日 latest `4.6.5`；运行时 schema 校验 |

### 认证、测试和可观测性

| 编号 | 来源 | 版本/用途 |
| --- | --- | --- |
| A1 | [Keycloak JavaScript Adapter](https://www.keycloak.org/securing-apps/javascript-adapter) / [npm registry](https://registry.npmjs.org/keycloak-js) | Keycloak 官方文档/registry；查询日 latest `26.2.4`；OIDC 浏览器 adapter |
| A2 | [CASL](https://casl.js.org/) / [npm registry](https://registry.npmjs.org/@casl%2fability) | 官方站点/registry；查询日 latest `7.0.1`；前端能力判断 |
| T1 | [Vitest Guide](https://vitest.dev/guide/) / [npm registry](https://registry.npmjs.org/vitest) | 官方文档/registry；查询日 latest `5.0.1`；Vite 测试 |
| T2 | [MSW Docs](https://mswjs.io/docs/) / [npm registry](https://registry.npmjs.org/msw) | 官方文档/registry；查询日 latest `2.15.0`；浏览器/Node 请求拦截 |
| T3 | [Playwright Docs](https://playwright.dev/docs/intro) | Microsoft 官方文档；跨浏览器端到端测试和网络拦截 |
| O1 | [OpenTelemetry JS Instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/) | OpenTelemetry 官方文档；浏览器 instrumentation 方向 |
| O2 | [OpenTelemetry Web SDK registry](https://registry.npmjs.org/@opentelemetry%2fsdk-trace-web)、[Fetch instrumentation](https://registry.npmjs.org/@opentelemetry%2finstrumentation-fetch)、[XHR instrumentation](https://registry.npmjs.org/@opentelemetry%2finstrumentation-xml-http-request) | registry 查询日分别为 `2.11.0`、`0.222.0`、`0.222.0`；版本仅作候选快照，需和公司 collector/SDK 兼容性一起锁定 |

## 13. 调研边界

本次没有安装新增依赖、启动 Camunda、调用公司 Go 服务或部署流程；没有把任何候选库宣称为已经兼容本项目。下一步应把上述 P0/P1 选项写成一个最小合同样本：一个含人工任务、服务任务、External Task、条件分支和 `wf` 审批扩展的 BPMN XML，配套 OpenAPI、Go 适配器和 Playwright 场景，真实跑通后再扩大支持子集。
