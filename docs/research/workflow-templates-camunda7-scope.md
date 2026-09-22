# 六个流程模板的 Camunda 7 可执行性与接口范围

调研日期：2026-09-22。范围：当前工作区 `workflowTemplates` 的六份 BPMN、现有 Camunda gateway/联调页、用户提供的 HTML 报告、公司服务公开的 OpenAPI 7.20.0 和 Camunda 引擎 7.20.0 源码。

状态：**事实核查与方案建议；业务规则及实施方案待确认。** 本文不构成六个模板已通过引擎验收的声明，也不恢复已被 ADR-0002 替代的 `wf:` 执行协议。

## 1. 结论

**六种流程均可基于 Camunda 7 实现，不需要接入完整 REST API。当前不足主要在模板执行配置、审批业务服务与表单/身份/审计模块，而不在 REST 端点数量。**

- 当前串行、金额分支模板可作为基础流转样例；它们没有审批拒绝/退回路径，不能把“完成任务”当成完整审批功能。
- 并行、会签、或签、退回重提四个模板目前是 `isExecutable="false"` 的设计样本。联调页在部署前阻止它们。不能只把该标志改成 `true` 就发布。
- 会签与或签目前没有不同的结算配置，没有 `completionCondition`，只有相同的集合多实例结构及结果变量路由。名字不同不会让引擎自动执行不同规则。
- 六个模板共用部署、启动、任务查询和完成接口。没有专属“会签 REST”“或签 REST”或“正常退回 REST”。网关、多实例与返回路径由 BPMN 和变量控制。
- 首期不需要 DMN、迁移、批处理、任意节点修改、组织管理全套 CRUD，也不必为这六个纯人工模板建设 External Task worker。

这里的“流程模板”是可复用的设计起点；“已部署流程定义”是引擎内的版本；“流程实例”是一次实际办理。当前 `workflowTemplates` 是前端内置资源，不是服务器上的模板管理模块。

## 2. 证据与验证边界

| 类别 | 本次事实 | 能证明什么 |
| --- | --- | --- |
| 本地源码 | 六份模板、`templates.ts`、gateway、联调页、校验模块与相关 ADR 已读取；XML 已按命名空间解析检查 | 当前编辑、保存与调用实现；不代表执行成功 |
| 在线接口文档 | `GET /swaggerui/openapi.json` 成功；版本 `7.20.0`，304 个路径、380 个非 OPTIONS 操作，另有 13 个 OPTIONS，合计 393 个操作，51 个 tags | 静态契约确实完整；不能证明每项配置/插件都可用 |
| 服务只读观测 | `GET /engine-rest/version` 返回 `7.20.0`；无 Authorization 的定义、任务、历史查询得到 200 | 本次网络路径上的这些读接口未要求调用者提交凭据；不据此推断所有写接口的权限 |
| 现有金额实例 | 服务已有 `Process_AmountApproval` 定义，XML 包含 `${amount > 5000}`；现有实例停在提交报销，变量查询为 `{}` | 已有部署/启动记录；未证明金额两个分支已执行 |
| 引擎源码 | 核查 7.20.0 的多实例数量、集合、完成条件和条件结果类型检查 | 引擎默认实现语义；公司定制扩展仍可能改变行为 |
| 未执行 | 没有部署、启动或完成任何任务，没有修改在线数据；没有六模板引擎端到端测试 | 下文“能实现”是有依据的可行性判断，验收仍需后续实验 |

OpenAPI UTF-8 内容 SHA-256：`234fd928589122ba059ba5f312d40beb9402dc16e4be7440970125ba7b036e96`。用户报告与该文档的版本相符，但“380 含 13 个 OPTIONS”的计数表述不准确。

## 3. 逐模板评估

| 模板 | 当前 XML/代码事实 | 可实现性及必须补齐的内容 |
| --- | --- | --- |
| 串行审批 | `true`；提交申请 → 主管 → 财务；办理人是字面量 `requester/manager/finance`；无结果网关 | 基础顺序流转可实现。绑定实际人员和表单；若产品要求拒绝/退回，须增加结果变量、网关与路径。仅提交 `approved=false` 不会改变当前走向 |
| 金额分支审批 | `true`；`${amount > 5000}` 走高额，否则默认普通；有 `expense` 表单引用，无字段定义 | 基础分支可实现。进入网关前提供校验后的数值 `amount`；5000 走普通，5000 以上走高额。缺变量/类型异常不能靠默认分支兜底；审批节点目前同样无拒绝路径 |
| 并行审批 | `false`；财务会签后可进入主管，法务独立办理，最后并行汇合；依赖 `financeReviewOutcome/financeOutcome/legalOutcome` | 可实现。须先完成财务会签结算、财务分支结果映射、合法 UEL 与重提轮次隔离。当前图等待两个分支汇合，不表达一方拒绝就取消另一方 |
| 会签审批 | `false`；`${reviewers}`、`${reviewer}`、并行多实例；还固定 `loopCardinality=3`；路由看 `reviewOutcome` | 可实现。实现全员同意/任一拒绝的结算；定义退回处理、剩余任务取消和并发幂等；统一集合类型并移除与动态人数冲突的固定次数 |
| 或签审批 | `false`；与会签相同的多实例与结果路由；无提前完成条件 | 可实现。任一同意才通过、全员拒绝才拒绝；不能用“第一个完成”代替“第一个同意”，也不能把候选人池当多人投票 |
| 退回重提 | `false`；主管/总监结果网关；回到填写/修改申请，重提后从主管重走；依赖 `managerOutcome/directorOutcome` | 可实现。修正 UEL，约束结果枚举，清理/隔离上一轮变量，保留每轮表单与意见；使用已建模返回路径即可，无需 modification |

模板入口：[templates.ts](../../src/bpmn/templates.ts)。部署前阻止 `false` 的逻辑：[CamundaRuntimeView.vue](../../src/views/CamundaRuntimeView.vue)。基础校验只检查结构与配置存在性：[validation.ts](../../src/bpmn/validation.ts)。

### 3.1 四个复杂模板共有的表达式缺口

当前条件写成 `reviewOutcome == 'approved'`、`managerOutcome == 'approved'` 等裸文本。使用 Camunda 默认 UEL 时，需要表达式形式，例如 `${reviewOutcome == 'approved'}`。裸文本被当成字面量时不会得到 Boolean，而引擎的条件执行明确要求 Boolean。[S3][S4]

已有默认退回路径不能补救条件求值异常，也不能把任意非法结果都解释成“用户退回”。业务服务需要验证 `approved/rejected/returned`，缺失或非法输入应拒绝办理。是否将退回改成显式条件、另设异常路径，是发布契约的一部分。

### 3.2 集合与固定次数同时配置不是无害冗余

会签、或签同时配置 `${reviewers}` 和固定次数 3；并行模板财务会签同时配置 `${financeReviewers}` 和固定次数 2。

Camunda 7.20.0 `resolveNrOfInstances` **优先使用 loopCardinality，再考虑集合大小**；随后按下标从集合读取每个办理人。[S1]

因此，给会签传入 5 人不保证创建 5 个任务；传入少于 3 人还可能在取集合元素时失败。建议集合模式只保留 collection/elementVariable；由服务端验证名单非空、去重、用户有效、人数上限。空集合在引擎中可能直接离开环节，不能默认认为“无人会签就是通过”。

`${reviewers}` 必须求值得到引擎接受的 Collection。前端把 JS 数组标记为 `type: Json` 并原样放入 `value`，不能证明它会变成 Java Collection。必须确定 Object JSON 序列化契约，或明确采用 Spin JSON 表达式并验证 serializer/plugin 配置；不能混用两种模型。

### 3.3 多实例结构不等于审批结算

按现有术语表：会签为全员同意才通过，或签为任一同意即可通过。每次个人意见必须与任务、环节、办理轮次绑定；`reviewOutcome` 是环节汇总结果，不能让每个浏览器直接覆盖这个同名流程变量。

建议由服务端统一完成：检查任务可办 → 记录个人意见 → 计算环节结果 → 在合适作用域写入汇总结果 → 推进/结束剩余待办。若采用完成条件，Camunda 可以在条件成立时取消其他多实例子执行，但条件本身不会替你统计同意/拒绝。[S2]

`nrOfCompletedInstances == nrOfInstances` 只表示都已完成，不表示都同意。`nrOfCompletedInstances >= 1` 只表示有人完成，不是或签通过规则。

### 3.4 并行与重提需要轮次和结果映射

财务会签未通过时，要把该结果映射为 `financeOutcome` 并跳过财务主管；会签通过后，主管结果才成为财务分支结果。法务写 `legalOutcome`，汇合后再决策。引擎并行网关只同步执行流，不自动合并业务结果。

当前 XML 中没有实现上述映射的 listener/service/input-output 配置。重提还必须创建新轮次，重新初始化本轮结果/计数，保证迟到的旧任务请求不能污染新轮次。历史意见保留为独立记录，不能仅覆盖一个流程变量。

## 4. 应保留的 Camunda 接口

以下路径均省略 `/engine-rest`。这里是 **Go/BFF 到引擎的接口范围**，不是建议把所有路径原样公开给浏览器。

### 4.1 首条流转闭环及流程图：管理联调与验证工作台共用 gateway

| 用途 | 原生端点 | 当前状态与取舍 |
| --- | --- | --- |
| 发布 XML | `POST /deployment/create` | 已实现 multipart；管理端使用；不是保存草稿 |
| 查询已部署定义 | `GET /process-definition` | 已实现；正式列表增加分页与发布可见范围 |
| 启动实例 | `POST /process-definition/key/{key}/start` | 已实现；正式业务建议按确定的 `POST /process-definition/{id}/start` 锁定版本 |
| 验证时锁定版本启动 | `POST /process-definition/{id}/start` | 已实现；验证页只使用部署响应中的 definitionId，避免 key 指向其他版本 |
| 查询待办 | `GET /task` | 已实现；六模板共享；复杂 OR 查询时可选 `POST /task`，无需 GET/POST 两套全接 |
| 完成任务及提交变量 | `POST /task/{id}/complete` | 已实现；正常同意、拒绝、退回均在业务校验后映射为变量+完成任务，再由 BPMN 路由 |
| 获取实例对应版本 XML | `GET /process-definition/{id}/xml` | gateway 已实现，联调页尚未接流程图；实例使用 definitionId，不按 key 拉最新版 |
| 当前活动树 | `GET /process-instance/{id}/activity-instances` | 已实现树展示；可扩展为当前节点高亮；结束后转历史查询 |
| 领取候选任务 | `POST /task/{id}/claim` | 已实现；六模板当前都是直接指定 assignee，并非每次办理都要领取；采用候选人池时需要 |
| 验证历史流程 | `GET /history/process-instance`、`GET /history/task`、`GET /history/activity-instance`、`GET /history/variable-instance` | 已实现；验证页按实例核对结束状态、任务数量、活动和变量记录 |
| 清理验证数据 | `DELETE /deployment/{id}?cascade=true` | 已实现；验证默认级联删除测试部署和实例，保留开关用于排查 |

证据：[gateway.ts](../../src/api/camunda/gateway.ts)。原联调页仍支持按 key 启动；验证页使用 definitionId 锁定刚部署的版本。生产业务仍应由服务端保存发布版本绑定，不能把浏览器选择的 key 当作权限或版本控制。

人工任务已有办理人时直接办理；不应机械地每次执行 claim → complete。`claim` 检查已有分配，但不能代替业务侧资格与权限检查。

### 4.2 做成可用工作台时增加的查询接口

| 模块 | 建议接入端点 | 说明 |
| --- | --- | --- |
| 定义分页 | `GET /process-definition/count` | 与列表相同过滤条件；有分页总数需求时接 |
| 待办分页/详情 | `GET /task/count`、`GET /task/{id}` | 以当前登录人权限约束查询；不是前端任意输入用户 ID 就能查他人待办 |
| 任务数据 | `GET /task/{id}/variables` | 按契约取任务可见变量；若采用引擎表单方案，可选 form-variables，不必重复全取 |
| 运行实例列表/详情 | `GET /process-instance`、`GET /process-instance/count`、`GET /process-instance/{id}` | 仅覆盖运行中实例；列表也可由业务数据库聚合，不强制全部直查引擎 |
| 实例变量 | `GET /process-instance/{id}/variables` | 实例详情需要时接；限制可见字段及对象反序列化 |
| 我的发起/归档 | `GET /history/process-instance`、`GET /history/process-instance/count`、`GET /history/process-instance/{id}` | 结合业务发起人映射；服务账号启动时不能直接把引擎 startUserId 当业务用户 |
| 已办 | `GET /history/task`、`GET /history/task/count` | 运行态 `assignee` 与历史 `taskAssignee` 参数名称不同；审批意见取业务记录 |
| 历史节点 | `GET /history/activity-instance` | 按实例、活动实例展示多轮与多实例，不能只按 activityId 去重 |

核心执行集不会因模板从两种增加到六种而大幅增长；复杂度增长集中在办理命令与模型规则。

### 4.3 按明确功能增量接入，暂不作为六模板必需项

| 功能触发条件 | 端点/模块 | 边界 |
| --- | --- | --- |
| 引擎托管表单 | `GET /task/{id}/form`、`/form-variables`、`/deployed-form`，`POST /task/{id}/submit-form`；启动表单对应定义端点 | 先确定表单方案；当前 formKey 只是标识，六模板没有完整表单定义，也没有开始表单配置 |
| 释放、转办、委托 | `POST /task/{id}/unclaim`、`/assignee`、`/delegate`、`/resolve` | 转办与委托生命周期不同；当前模板没要求这些动作 |
| 引擎评论/附件 | Task Comment、Task Attachment 的选定接口 | 可作为承载手段；不替代业务审批记录、存储权限和附件策略；单独 comment 与 complete 不是一次跨请求原子操作 |
| 管理员终止/暂停 | `DELETE /process-instance/{id}`、`PUT /process-instance/{id}/suspended` | 明确业务撤销/终止规则后接；正常驳回不应等价于删除实例 |
| 结果变量运维/排障 | 历史变量/明细、变量读写端点 | 有用途再接；审批记录已有业务存储时不必把历史变量当唯一审计来源 |
| 作业异常 | `GET /incident`、`GET /job`、`GET /job/{id}/stacktrace`、`PUT /job/{id}/retries` 等 | 引入异步任务/作业后配置管理端；同步 complete 报错未必会产生 incident |
| 自动服务节点 | External Task `fetchAndLock/complete/failure/extendLock` 等 | 由 worker 调用；六个现有模板没有 service task，不是当前必需 |
| 动态加签/任意跳转 | `POST /process-instance/{id}/modification` | 是执行状态修改原语，不是完整加签功能；先定义前加签/后加签/并行加签及计数、撤销、审计规则 |

暂不建设：DMN/DRD、Migration、Batch、Telemetry、Metrics、Schema Log、History Cleanup 管理页面，以及 User/Group/Tenant/Authorization 全套管理。若人员来自现有组织系统，只接人员/组查询与映射即可；不要复制一套组织管理产品。消息/信号只有模型明确使用对应事件后再纳入。

## 5. 需要补充的模块

| 优先级 | 模块 | 前端需要补齐 | 后端需要补齐 |
| --- | --- | --- | --- |
| P0 | 审批命令与规则 | 同意/拒绝/退回按钮、意见、可办动作、冲突反馈 | 个人意见、环节汇总、策略版本、并发结算、幂等、迟到提交处理；前端不能自报最终汇总结果 |
| P0 | 业务单据与变量契约 | 申请/修改页面，类型校验和表单回填 | 单据 ID 与 businessKey/instanceId 关联；金额单位、名单 Collection、各节点可写变量白名单；重复启动防重 |
| P0 | 身份、组织与权限 | 当前用户、人员选择器、真实待办 | 登录/SSO，发起/读取/办理/发布权限，主管/角色解析，候选组映射；鉴权必须在服务端执行 |
| P0 | 表单定义与运行时 | 将 application/expense 等引用映射到可显示的表单；按钮/字段权限 | 表单版本、字段校验、业务数据、每轮快照；可先使用固定业务表单，不必立即建设可视化表单设计器 |
| P0 | 发布校验与绑定 | 缺变量、裸条件、未绑定人员、完成条件缺失等可定位提示；可执行状态说明 | 校验模型子集、结果契约、名单/次数互斥与人员/表单引用，发布前验证；完成验证再生成可执行版本 |
| P1 | 设计稿与版本管理 | 保存/打开、版本列表、发布反馈；连通设计器与部署入口 | 原始 XML 按版本保存，乐观锁，部署产物与 definitionId 关联；不以引擎 XML 覆盖设计原稿 |
| P1 | 工作台与历史 | 我的发起、我的待办、已办、实例详情、当前节点和历史轨迹 | 查询聚合、分页、业务状态、不可覆盖的审批记录；结束、拒绝、撤回、取消不能混称 |
| P1 | 运维与结果同步 | 可理解的接口错误、过期待办刷新、发布失败提示 | Camunda 错误适配、超时结果核对、实例与单据对账、异常处理、历史等级/保留策略 |
| 后续 | 通知与催办 | 消息中心、催办按钮、限频反馈 | 通知渠道、收件人、去重、定时任务/事件机制；Camunda 没有一个通用“催办 REST”替你发送业务消息 |

优先级按先做开发闭环、再做可用产品划分；真实上线前，设计稿/版本、历史与运维也必须纳入验收。模板均声明 30 天 TTL，不能据此承诺业务审批审计长期保留。

### 5.1 建议对浏览器提供的业务接口（尚不存在）

可以从以下业务动作收敛，而不复制完整 Camunda 路径：

| 业务接口示意 | 服务职责 |
| --- | --- |
| `GET/POST /api/workflow/drafts`、`GET/PUT /drafts/{id}` | 保存原稿与版本并校验并发修改 |
| `POST /api/workflow/drafts/{id}/publish` | 校验、部署、记录 definitionId 与版本绑定 |
| `GET /api/workflow/definitions` | 可发起范围、业务元数据、表单版本 |
| `POST /api/workflow/instances` | 权限、单据校验、真实人员解析、幂等启动 |
| `GET /api/workflow/tasks`、`GET /tasks/{id}` | 用户待办、表单数据、可执行动作 |
| `POST /api/workflow/tasks/{id}/decisions` | 受控提交个人意见，结算/推进，返回业务结果和下一步状态 |
| `GET /api/workflow/instances/{id}`、`/timeline`、`/diagram` | 聚合运行态、历史态、业务审批记录和对应版本 XML |

上述是建议命名，不是已实现协议。一次 decision 至少关联任务、幂等请求 ID、个人意见及意见文本；用户身份从服务端会话取得，不能信任请求体自报办理人。变量转换留在后端。

### 5.2 复杂审批实现路线：待确认的真正技术取舍

**推荐路线：Go 提供业务 API，少量 Camunda Java listener/delegate/扩展命令负责引擎内的审批汇总与流程推进。** 配合标准多实例与 completionCondition，在引擎事务内处理本轮结果、完成条件及剩余子执行；仍需幂等和对并发失败的重试/核对。若审批账本在 Go 独立数据库，仍需 outbox/对账等一致性机制，不能宣称跨数据库天然原子。

**纯 Go + 原生 REST 也可以设计，但工程成本更高。** 需要按实例/环节串行化办理、持久化幂等命令、解决 REST 超时后的结果不确定性、对账重试，并限制其他入口绕过该服务。可以通过重新建模、业务状态服务及必要的 worker 承接规则。简单地“GET 已有票数 → POST 改变量 → POST complete”会产生并发/部分成功窗口。

不能由“完整 REST 已有 modification”推导出加签或提前结算已经可靠实现；正常六模板应优先使用已建模路径和明确完成条件。是否增加 Java 扩展、是否重新建模，需要确认后再记录 ADR。

## 6. 对原 HTML 报告的修正

| 报告表述 | 核查结论 |
| --- | --- |
| 常见审批功能均可直接对接，主要只确认 Basic/CORS | 端点齐全是必要条件之一；还缺业务规则、人员/权限、表单/数据、事务幂等、历史与执行配置。会签、或签、加签、催办不能只靠端点名成立 |
| form-variables 返回字段定义/校验规则 | 响应是 `VariableValueDto` 映射，字段只有 value/type/valueInfo；没有完整布局、标签、选项和 validators |
| submit-form 自动完成表单校验 | 仅在相应表单元数据确有 validator 时执行对应校验；不自动验证自定义业务表单 |
| identity/verify 返回所属组并代表登录认证 | AuthenticationResult 的 groups/tenants 说明为 “Will be null.”；它验证凭据，不签发业务会话；静态 basicAuth 声明不证明部署开启认证/授权 |
| history/task 包含审批结果 | HistoricTaskInstanceDto 无业务审批结果字段；意见和汇总结果必须主动建模保存 |
| activity-instances 可给出历史连线 | 返回当前活动树；transition instance 是异步 continuation，不是已走过的 sequenceFlow。完整历史连线需要专门执行轨迹记录 |
| 按 key 拉 XML 高亮实例 | key 可能指向新版本；应通过实例 definitionId 拉对应 XML |
| diagram 直接得到引擎生成 SVG | 不能承诺必然存在或为 SVG；本次所查项目定义 diagram 为 null。当前项目已有 bpmn-js，优先 XML 渲染 |
| 用户操作日志可完整承担审批审计 | 依赖历史等级、认证上下文与引擎实际记录范围；不自动包含全部业务意见、表单快照与外部调用者身份 |

## 7. 建议实施与验收顺序

### 7.1 第一阶段：前端可视化验证工作台

当前后端只有 Camunda 引擎接口，尚未设计业务 API。因此第一阶段采用前端页面直接调用现有 Camunda 7 REST，验证 **引擎层流程是否能够按模板运行**，不把业务表单、真实组织权限、审批账本和通知等问题混入第一轮验收。页面使用示例办理人和人工构造的流程变量，并明确显示这些数据与真实业务的差异。

工作台入口为 `/camunda-validation`（菜单“流程验证”）。它会为每次运行创建唯一部署，按流程定义 ID 启动实例，自动完成示例人工任务，展示任务流转、活动历史、流程变量和断言结果；默认级联删除测试部署，也可以勾选“测试后保留 Camunda 数据”供排查。原 `/camunda` 页面继续保留，用于手工部署、启动和办理。

按当前 `workflowTemplates` 的顺序，依次处理：

1. 串行审批
2. 金额分支审批
3. 并行审批
4. 会签审批
5. 或签审批
6. 退回重提

每个模板都采用同一轮验证流程，页面对应的引擎接口为：

1. 读取 `workflowTemplates` 中的 BPMN XML，并确认 `isExecutable="true"`；对于当前 `isExecutable="false"` 的设计样本，先修改模板或生成单独的可验证版本，不把设计样本直接当作生产可执行版本。
2. 通过 `POST /deployment/create` 部署，记录 deploymentId、processDefinitionId、key 和 version；验证页关闭重复过滤，确保每次拿到新的测试定义。
3. 通过 `POST /process-definition/{id}/start` 按明确的流程定义 ID 启动实例，传入该模板的最小变量和唯一 businessKey。
4. 查询 `GET /task?processInstanceId=...`，按预期路径逐步完成任务；分支模板至少覆盖每条分支，退回/多人模板覆盖关键结果组合。
5. 查询活动树、`history/process-instance`、`history/task`、`history/activity-instance` 和 `history/variable-instance`，确认任务创建、流转、结束状态和流程变量符合 BPMN 设计。
6. 验证完成后调用 `DELETE /deployment/{id}?cascade=true` 清理实例和部署；保留开关只用于排查，不代表业务系统需要依赖引擎数据清理。

单个模板的引擎验证完成标准：

- XML 能部署，且能取得明确的流程定义版本；
- 实例能启动，首个活动与模板一致；
- 每条声明支持的路径都能通过 REST 完成并到达预期任务或结束事件；
- 所需变量的名称、类型、作用域和传递时机已经记录；
- 流程异常、条件不满足、变量缺失等失败情况有可观察的错误；
- 测试结果没有被表述为业务审批已经完成，业务缺口被单独列出。

第一轮建议先验证串行审批和金额分支审批，因为它们当前已标记为可执行；再处理并行、会签、或签和退回重提。后四个模板的验证前置条件、结果变量和多人规则仍需在对应模板开始前由后续讨论确定。

1. **串行 + 金额**：接固定业务表单、真实人员、业务单据与版本绑定；确认申请是在启动前提交，还是启动后办理首个人工任务，避免同一单据重复提交。
2. **退回重提**：修复表达式，加入节点结果契约与新轮次；先验证单人返回路径。
3. **会签 + 或签**：统一名单和集合序列化，去除固定次数冲突，实现并发结算和剩余待办结束。
4. **并行审批**：复用会签，在分支层完成结果映射与统一汇合，验证重提轮次不串数据。
5. **产品化查询与运维**：从联调页演进为我的发起/待办/已办/详情；按需要再加转办、委托、附件、催办等。

最小执行验收矩阵：

| 范围 | 必须观察的行为 |
| --- | --- |
| 串行 | 每次完成只到下一个任务；重复提交不重复推进；无权用户被拒绝；明确模板是否需要拒绝路径 |
| 金额 | 4999、5000、5001；缺失/字符串/非法金额被业务校验拦截；网关失败时任务状态与错误可解释 |
| 退回 | 主管退回、总监退回、拒绝终止；第二轮从主管开始，旧结果与旧请求不影响新轮次 |
| 会签 | 全员同意、首个拒绝、退回与拒绝并发；名单 1/2/3/5 人、空/重复名单；剩余待办状态符合选择 |
| 或签 | 首个拒绝后仍等待、后来同意则通过、全员拒绝；同意与退回并发；不能把首个完成当通过 |
| 并行 | 财务先完成/法务先完成；财务会签失败不启动主管；混合结果的优先级明确；重提重新办理哪些分支 |
| 恢复/审计 | 接口超时后查询真实结果、幂等重试、引擎重启、完成后历史详情、保留期、发起人与实际办理人可追溯 |

当前页面已落地串行审批和金额分支审批的第一轮验证入口；仍需在连接目标 Camunda 7.20 服务后实际点击运行，才能形成“引擎已实测”的结果。页面的通过只表示执行层通过，不表示业务审批闭环已经完成。

## 8. 设计决策树与第一轮待确认项

已确定前提：Camunda 7 原生扩展契约（ADR-0002）；六个模板范围；会签/或签基本含义沿用 CONTEXT.md。

```text
六模板可执行闭环
├─ 并行分支何时结束（待确认）
│  ├─ 等待所有分支汇合 → 当前结构 + 分支结果映射
│  └─ 一方失败立即中断 → 需要重新建模中断范围
├─ 多人环节何时结束剩余待办（待确认）
│  ├─ 结果一确定即结束 → 完成条件 + 取消原因 + 并发结算
│  └─ 等所有人提交 → 末尾汇总，仍需审计和合法结果
└─ 后端允许怎样实现规则（待确认）
   ├─ 允许 Java 扩展 → 引擎内事务 + Go 业务 API
   └─ 仅 Go + REST → 服务端协调 + 幂等/对账 + 必要的模型调整
```

推荐分别为：并行等待汇合；会签/或签结果确定即结束剩余待办；允许少量 Java 扩展。**截至本文写入时，这些建议未获确认。** 下一轮再确认冲突意见优先级、退回范围、重提时参与人重算及表单/业务数据方案，不把旧 ADR-0001 的全部策略默认为新执行契约。

## 9. 来源

- [用户报告](<C:/Users/ht/AppData/Roaming/TRAE SOLO CN/ModularData/ai-agent/work-mode-projects/6ab1f0c6b40737717a81b4ba/camunda-rest-analysis.html>)：本地原文件名 `camunda-rest-analysis.html`；重点核查第 69、189、193 行，报告自身作为待核查材料；此链接依赖本机原文件。
- [在线 OpenAPI 7.20.0](http://192.168.124.202:8085/swaggerui/openapi.json)：本次读取与上文内容哈希；schema `VariableValueDto`、`AuthenticationResult`、`HistoricTaskInstanceDto`、`ActivityInstanceDto`、`TransitionInstanceDto`。
- [S1：MultiInstanceActivityBehavior.java，7.20.0](https://github.com/camunda/camunda-bpm-platform/blob/7.20.0/engine/src/main/java/org/camunda/bpm/engine/impl/bpmn/behavior/MultiInstanceActivityBehavior.java)：数量优先级、Collection 检查、空集合与元素读取、完成条件。
- [S2：ParallelMultiInstanceActivityBehavior.java，7.20.0](https://github.com/camunda/camunda-bpm-platform/blob/7.20.0/engine/src/main/java/org/camunda/bpm/engine/impl/bpmn/behavior/ParallelMultiInstanceActivityBehavior.java)：完成条件成立后的剩余执行清理。UTF-8 SHA-256：`9f1bd8ed1afef1364e6f36a643e8c4dde92ae2fbf7f119168e1cb993778e69cc`。
- [S3：UelExpressionCondition.java，7.20.0](https://github.com/camunda/camunda-bpm-platform/blob/7.20.0/engine/src/main/java/org/camunda/bpm/engine/impl/el/UelExpressionCondition.java)：条件结果必须为 Boolean。
- [S4：JuelExpressionManager.java，7.20.0](https://github.com/camunda/camunda-bpm-platform/blob/7.20.0/engine/src/main/java/org/camunda/bpm/engine/impl/el/JuelExpressionManager.java)：表达式文本原样交由 EL factory 创建 Object 类型结果。UTF-8 SHA-256：`353dfce7340fe8c197b256f975adf6d42689f6ae3cf311e291c50a2730b9ebf5`。
- [领域术语](../../CONTEXT.md)、[ADR-0002](../adr/0002-camunda7-integration.md)、[README](../../README.md)：当前项目约定。ADR-0001 标记为 superseded，仅用于了解旧设计背景。
