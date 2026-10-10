# 流程工作台

Vue 3 + TypeScript + Vite 的基础项目，集成 Vue Router、Pinia、Axios、Element Plus 和 bpmn-js。

## 启动

需要 Node.js 20.19+ 或 22.12+，推荐 Node.js 22，包管理器使用 pnpm 9。

```bash
pnpm install
pnpm dev
```

打开终端显示的本地地址，默认是 http://localhost:5173。

如需使用本地代理，可在当前终端设置后再安装（不需要写入项目配置）。代理客户端需要正在运行，并监听 `127.0.0.1:7897`。

Windows PowerShell（已在 Node.js 24.19.0 / Corepack 0.35.0 下验证）：

```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7897"
$env:HTTPS_PROXY = "http://127.0.0.1:7897"
$env:NODE_USE_ENV_PROXY = "1"
pnpm --version
pnpm install --frozen-lockfile --registry=https://registry.npmjs.org
```

如果 `pnpm --version` 就在下载 `pnpm-9.9.0.tgz` 时出现 `UND_ERR_CONNECT_TIMEOUT`，说明 Corepack 尚未下载好 pnpm。上述 Corepack 版本通过 Node 内置 `fetch` 下载，需要启用 `NODE_USE_ENV_PROXY` 才会使用代理环境变量。这些设置仅作用于当前终端及其子进程，新终端需要重新设置。

`--registry=https://registry.npmjs.org` 仅让本次安装使用 npm 官方仓库，适用于镜像源经代理访问时出现 `ECONNRESET` 的情况，不修改全局仓库配置。`--frozen-lockfile` 保持锁文件指定的依赖版本。

Bash（使用支持 `NODE_USE_ENV_PROXY` 的 Node.js 版本）：

```bash
export https_proxy=http://127.0.0.1:7897
export http_proxy=http://127.0.0.1:7897
export NODE_USE_ENV_PROXY=1
pnpm install --frozen-lockfile --registry=https://registry.npmjs.org
```

```bash
pnpm typecheck  # TypeScript 检查
pnpm test       # 基础流程检查与模板 XML 往返测试
pnpm build      # 类型检查并构建到 dist
pnpm preview    # 预览构建结果
```

## 当前范围

- 基础布局、可折叠菜单、路由懒加载和 404 页面。
- Pinia 管理侧边栏状态。
- Axios 请求封装：基础地址、超时、HTTP 错误处理和类型化响应。
- `useTable`：查询、重置、刷新、分页、加载状态、错误状态、请求取消和旧结果隔离。
- 表格示例使用本地静态数据，无需后端即可运行。
- BPMN 编辑器：默认展示“开始 → 提交需求 → 确认需求 → 结束”，支持绘图、XML 文件或粘贴导入、XML 编辑与复制、导出、当前画布部署和适应画布。
- 自定义属性面板：编辑 Camunda 办理人/候选用户/候选组/表单、UserTask/ServiceTask 多实例，以及 ServiceTask 的 External/Java 执行方式；也可编辑流程/节点/连线基础字段和排他分支。
- 六个常用审批模板，以及带元素定位的基础连接、名单和一层并行结构检查；检查错误会阻止文件导出。
- Camunda 7 引擎联调页：通过 Vite 开发代理部署 BPMN、查询流程定义、启动实例、查询/领取/完成人工任务和查看活动树。
- Camunda REST 管理台：`/camunda-console` 提供运行总览、部署与定义查询、定义/实例挂起恢复、实例终止、活动树与变量查看、任务与 External Task 查询、Job/Incident 异常查看、历史查询、JSON 导出和 Camunda 用户操作日志；页面直接调用官方 REST，仅用于开发联调。
- 流程验证工作台：在 `/camunda-validation` 选择串行审批或金额分支审批，自动部署唯一测试版本、启动并完成人工任务、核对历史和断言；默认级联清理测试部署，可按需保留数据。
- 后端业务流程页：`/workflow-business` 通过 `/api/v1` 浏览任务模板、查看当前模板详情和流程图、删除模板、启动业务任务实例、查询和完成人工任务，并支持将任务退回待重派或重派给指定办理人；开发模式可用 Camunda 状态核对业务返回。
- 设计器同时提供“部署流程”（引擎验证）和“发布任务模板”（业务发布），结果和失败状态互不覆盖。
- 统一的青绿工作台、Tabler 节点库与快捷操作、人工/服务任务卡片；主题、图标映射可由开发者调整。
- 导入保留 BPMN 文件中的布局和连线折点；小于主题标准的人工/服务任务只在原中心位置规范化为卡片尺寸，不做整图重排。需要重新整理路径时，点击“整理布局”，操作可一次撤销、重做。

当前仓库不包含后端实现、登录权限、流程设计稿服务端保存或表单运行时；已接入外部后端的任务模板、业务实例和人工任务接口。业务页可读取当前任务模板的 BPMN XML 并载入设计器；编辑内容仍是本地草稿，需通过“发布任务模板”发布，离开页面前也可导出文件或复制 XML 保存。删除任务模板会同时删除当前租户该 taskKey 的业务记录及全部流程定义版本，存在运行中的任务实例时后端会拒绝删除；业务任务实例记录暂不支持删除。后端“拒绝任务”接口的实际语义是退回待重派：清空办理人及候选用户/组，任务仍在运行中，不会触发 BPMN 拒绝分支；之后需重派给具体用户，再由该办理人完成以推进流程。业务页默认查询当前租户的运行中任务，因此未分配任务会显示为“待重派”；按办理人筛选时它不会出现在结果中。Camunda REST 直连或后端透传只用于开发联调与受控验证。

`/camunda-console` 是面向流程管理员/运维人员的引擎控制面，不是业务审批入口。它展示和操作 Camunda 官方 REST 能力，操作日志也是 Camunda 引擎用户操作历史，不等于平台审计。正式接入业务系统后，应由 Go/BFF 代理这些能力，补充登录、权限、租户隔离、变量脱敏、幂等、审计和业务语义；前端不应持有 Camunda 管理员凭据。没有业务系统时，可使用 `/camunda-validation` 验证已有串行审批、金额分支场景的部署、启动、任务流转和历史记录。

### Camunda 管理台

打开 `/camunda-console`，或从侧边栏选择“Camunda 管理台”。`/workflow-prototype` 仍是静态设计预览，真实接口入口是管理台。

| 页面 | 已实现能力 |
| --- | --- |
| 运行总览 | 引擎版本、实例/人工任务/异常 Job/Incident/定义/External Task 数量、最近 5 次部署；部分失败单独提示，不将查询失败显示为 0 |
| 流程定义 | 名称或 key 模糊筛选、definitionId 精确查询、版本/部署 ID、只读 BPMN 图、原始 XML 查看与下载、挂起/恢复（不包含已有实例） |
| 运行实例 | 按业务键和流程 key 查询、变量和活动树、已部署流程图和当前活动/异步等待节点高亮、挂起/恢复、确认后终止 |
| 任务查询 | 人工任务按办理人/实例筛选；External Task 按 Topic/实例筛选，查看 Worker、锁到期时间和 retries |
| Job / Incident | 独立分页、Incident 时间、Job 异常堆栈和重试次数调整 |
| 历史查询 | 历史实例、任务、活动、变量（包含未结束记录）、按实例筛选、导出当前页 JSON |
| 操作日志 | Camunda 用户操作历史，展示对象/操作 ID、变更属性与新值；受引擎历史及认证配置影响 |

“部署 BPMN”支持选择 `.bpmn` / `.xml` 文件或粘贴 XML，保留现有部署前 `historyTimeToLive` 缺省补齐为 30 天的逻辑，并展示返回的部署 ID 和定义版本。原始设计稿不自动保存。

列表每页 20 条，搜索/重置回到第一页，刷新保留当前页及已提交筛选。新查询会取消旧请求，详情切换和离开页面后不会被旧结果覆盖。变量使用 `deserializeValues=false` 查询，避免展示时依赖 Java 对象类。当前采用手动刷新；持续告警、历史路径高亮、业务审批表单、服务端设计稿管理、完整平台审计尚未实现。

开发引擎可用以下命令复查部署/运维生命周期；脚本只操作本次生成的唯一测试部署，结束时级联清理该部署及其测试实例。

```powershell
$env:CAMUNDA_TEST_BASE_URL = 'http://192.168.124.202:8085/engine-rest'
node scripts/camunda-console-smoke.mjs
```

观察同一个 Job 反复失败、剩余重试次数递减以及最终出现 Incident，可运行 `node scripts/camunda-job-retry-demo.mjs`。该示例会为自动验证创建唯一测试部署并在结束时清理。

## 需求确认流程示例

打开 `/designer`。初始流程包含两个人工任务：

| 节点 | 办理人标识 | 表单标识 |
| --- | --- | --- |
| 提交需求 | `requester` | `requirement-submit` |
| 确认需求 | `reviewer` | `requirement-confirm` |

选择节点后在右侧修改字段，输入完成并离开输入框后应用。办理人、候选用户和候选组均可为空，但至少应配置一种任务分配方式；表单可空。字段按 Camunda 7 标准扩展保存；UEL/JUEL 表达式只保留原文，前端不解析或执行。

- 标准节点名称保存为 BPMN 的 `name` 属性。
- 办理人、候选用户、候选组和表单保存为 `camunda:assignee`、`camunda:candidateUsers`、`camunda:candidateGroups` 和 `camunda:formKey`。
- Camunda 模型扩展由 `camunda-bpmn-moddle` 注册，命名空间为 `http://camunda.org/schema/1.0/bpmn`；平台级建模联动由 `camunda-bpmn-js-behaviors` 提供。职责区别和最小示例见 [Camunda 7 建模依赖说明](./docs/camunda-modeling.md)。
- 初始完整流程与布局：`src/bpmn/requirement-process.bpmn`。
- XML 导出后再导入，可以继续编辑以上属性与布局。导入无效 XML 会尝试保留原流程；解析阶段失败也保留撤销历史。

属性修改通过 `modeling.updateProperties` 进入 bpmn-js 命令栈。`useBpmnDesigner` 管理模型生命周期、选择同步和 XML 操作，Vue 属性面板只接收普通数据快照，避免把 bpmn-js 模型变成响应式代理。

点击“编辑 XML”会在弹窗中载入当前画布的格式化 XML，可直接修改或粘贴替换文本。“复制 XML”复制的是弹窗内的当前草稿，“应用到画布”才会将草稿导入设计器；取消不改变画布。每次重新打开编辑弹窗都会从画布生成 XML。

点击“导入 XML”可直接粘贴 XML，也可通过“选择文件”载入 `.bpmn` 或 `.xml` 文件，检查或修改后点击“导入到画布”。空白内容不能提交；导入失败时弹窗保留草稿并显示错误，可继续修正，原流程恢复沿用设计器的导入逻辑。

应用或导入成功会替换当前流程并重置画布撤销记录。画布的“导出 XML”始终导出已经应用的内容，`.bpmn` 文件本身就是 XML。

点击“部署流程”会检查并固定当前画布的 XML 快照；未应用的 XML 草稿不会参与部署。部署目前支持单个 `isExecutable="true"` 的流程，基础检查错误会阻止提交，警告会在确认弹窗列出。确认后通过 Vite 开发代理调用 Camunda 7，保留现有历史数据保留期缺省补齐和重复过滤行为，不自动启动实例。成功后显示 deploymentId 及引擎实际返回的流程定义 ID、版本；重复过滤没有返回新定义时应到管理台核对。超时或连接中断后先核对引擎结果再重试。弹窗中的部署结果和继续编辑的本地设计稿相互独立，离开页面前仍需导出或复制原稿。正式发布仍需 Go/BFF 承接鉴权、权限、幂等、审计和设计稿追溯。

### 常用流程设计

点击“流程属性”可修改流程名称和 BPMN 标识。标识需要符合 XML 名称规则且在文档中唯一；修改与撤销会同步更新流程引用和 DI 布局引用。

选择连线可修改名称；选择排他网关的出线还可输入条件原文或设为默认分支。也可在网关属性中选择默认出线。默认分支由来源网关的 `default` 引用保存，每个网关最多一条；设置默认分支会清除该出线的条件，在默认出线上输入条件会取消默认设置。这些关联变更可一起撤销、重做。

条件保存为标准 `bpmn:conditionExpression` / `bpmn:tFormalExpression`，保留导入表达式已有的 `language`。前端不求值，也不验证未知引擎的表达式语法。示例 `amount > 5000` 仅用于设计演示，绑定引擎后需确认变量来源、表达式语言和转换方式。

“流程模板”提供以下完整流程，点击“使用模板”会替换画布并重置撤销记录；使用前可先导出或复制当前 XML。

| 模板 | 流程结构 |
| --- | --- |
| 串行审批 | 提交申请 → 主管审批 → 财务审批 |
| 金额分支审批 | 提交报销 → 排他分支：高额审批（`${amount > 5000}`）或普通审批（默认）→ 汇合 |
| 并行审批 | 财务会签及主管审批、法务审批并行 → 统一汇合 → 通过/不通过/退回 |
| 会签审批 | Camunda 集合多实例设计样本；结果路由依赖业务变量 |
| 或签审批 | Camunda 集合多实例设计样本；结果路由依赖业务变量 |
| 退回重提 | 主管 → 总监；退回修改后从主管重新审批 |

模板中的办理人和表单引用都是示例标识，可按业务修改。模板文件位于 `src/bpmn/templates/`。

### Camunda 多实例

多实例任务按 Camunda 7 标准 BPMN `multiInstanceLoopCharacteristics` 编辑和保存；集合与元素变量可以在 XML 中指定。集合表达式、办理人表达式和审批结果均由流程变量及 Camunda 运行时解释。标准多实例只定义重复执行结构，不等于会签/或签业务规则，也不会自动生成固定参与人名单。

旧 `wf:` 扩展与固定名单审批结果协议已退出执行契约。复杂审批模板仅供设计参考，其中设置为 `isExecutable="false"` 的流程不会作为可部署样例；正式审批规则需要业务侧定义变量、结算和路径语义。当前首条联调使用可执行的需求确认或串行模板。

六个模板是设计样本；当前仅需求确认和串行模板作为可执行联调样本，其余模板仍需业务规则和引擎验证。

### 流程检查与导出

“检查流程”和“导出 XML”使用同一套基础检查规则。执行过检查后，属性与画布修改、撤销重做和导入会自动更新结果，点击问题可定位元素。

- 错误：标识不合法或重复、缺开始/结束、连接缺失或无效、节点不可达或无法到达结束、排他分支缺条件、默认引用或条件冲突、人工任务缺少分配方式、多实例缺少来源/元素变量、服务任务缺少执行方式或 topic。
- 并行错误：分叉/汇合不配对、分支跨接或绕过汇合、从外部进入分支、分支内回路、把排他选择的多条路径直接作为并行汇合入线，以及并行出线带条件或默认分支。
- 警告：排他分支缺默认出线、并行区域外的人工任务具有多条出线，以及超出当前范围的结构。表单为空不报错；并行区域外的合法回路允许保留。
- 有错误时禁止下载文件和从设计器部署；“编辑 XML”的查看、编辑和复制，以及文件/粘贴导入仍可使用。仅有警告时允许下载，并可在部署确认弹窗核对后提交。

检查面向单个流程中的普通开始/结束事件、人工任务、服务任务、排他网关和一层并行网关。嵌套并行提示警告并跳过该流程的并行配对检查，仍检查基础连接；子流程、特殊事件等其他高级节点会提示警告并跳过该流程的路径检查，仍检查标识和顶层任务配置。多流程协作提示范围限制。检查通过不代表引擎可执行，不验证条件求值、用户有效性或运行时取消行为。

### 当前属性与 Camunda 支持范围

当前使用标准 BPMN 2.0 和 Camunda 7 `camunda:` 扩展；已安装 `camunda-bpmn-moddle` 和 `camunda-bpmn-js-behaviors`。右侧面板为自定义 Vue 面板，不使用 `bpmn-js-properties-panel`；当前可配置字段如下。

| 属性面板字段 | XML 属性 | 适用范围 |
| --- | --- | --- |
| 流程标识 | Process 的 `id` | 单个根流程，可编辑并检查合法性、唯一性 |
| 历史数据保留期 | `camunda:historyTimeToLive` | 根流程，默认 30 天；导入缺失该属性的 XML 时自动补齐 |
| 流程/节点/连线名称 | `name` | 当前选中的流程、节点或顺序流 |
| 办理人 | `camunda:assignee` | 人工任务；可为静态标识或由引擎解释的表达式 |
| 候选用户 | `camunda:candidateUsers` | 人工任务；用户列表或表达式 |
| 候选组 | `camunda:candidateGroups` | 人工任务；组列表或表达式 |
| 表单 | `camunda:formKey` | 仅人工任务，表单引用标识，可空 |
| 多实例 | `camunda:collection`、`camunda:elementVariable` 或标准 BPMN 循环次数 | UserTask/ServiceTask 支持集合、次数、并行或顺序；复杂完成条件只读保留 |
| 服务任务执行 | `camunda:type/topic`、`camunda:class`、`camunda:delegateExpression`、`camunda:expression` | 支持 External Task、Java class、Delegate expression、Expression；只保存执行配置，不运行 worker |
| 条件表达式 | `conditionExpression` | 排他网关出线，保存原文 |
| 默认分支 | 来源网关的 `default` | 排他网关的一条出线引用 |

节点、连线 ID 与类型只展示，位置和连线路径由画布编辑并保存为 BPMN DI。UEL/JUEL 只保存原文；监听器、异步/重试、输入输出映射等尚无专用表单。直接联调仅代表 Camunda REST 调用可用，不代表生产认证、业务审批或 Go 适配已完成。决策背景见 [Camunda 7 集成 ADR](./docs/adr/0002-camunda7-integration.md)。

### 流程图主题入口

设计器顶部的“主题”选择器可在青雾、石墨和高对比预设之间切换，切换只更新运行时 token、CSS 变量和画布渲染，不修改 BPMN XML、DI 几何或撤销记录。开发者可在 `src/bpmn/theme.ts` 中维护预设；`src/bpmn/icons.ts` 管理本地 Tabler SVG 映射。人工/服务任务由 `BusinessRenderer` 绘制为卡片，保留原生多实例、循环和补偿标记，事件与网关保留标准形状。完整修改入口见 [设计器样式维护说明](./docs/designer-styling.md)。

节点库支持点击添加与拖入画布；选中节点上方的快捷操作复用原生创建、连线、替换和删除能力。完整配置继续在右侧面板编辑。默认卡片为 `184×88`，只显示名称和类型，长名称最多两行并截断；完整名称仍保存在 XML 和属性面板中。旧图的紧凑卡片使用一行名称，尺寸过小时保留原生渲染。

普通单流程导入时保留 XML 中的节点相对位置、连线折点和标签；小于标准尺寸的人工/服务任务会保持中心不变并规范化为 `184×88` 卡片，只局部调整连接端点。用户点击“整理布局”后，才会用 ELK 统一整理节点、连线和标签；操作可以一次撤销、重做。

手动整理支持普通开始/结束事件、人工/服务任务、排他/并行网关和顺序流，包括分支、汇合、回退与多实例任务。含泳道、泳池、子流程、边界/特殊事件、注释或其他未支持元素的图继续导入，保留原几何，显示跳过原因并禁用整理按钮。计算失败时也保留原布局。布局只更新 DI，不修改 ID、逻辑连接、条件或审批字段。

主题默认色不写入业务字段，导入 XML 的显式颜色优先。尺寸和整理后的几何会保存到 BPMN DI；其他 BPMN 工具可能以自己的原生外观展示这些节点。本次没有增加 Flowable/Camunda 部署转换器或执行引擎。

### Go 后端对接约定

当前有两条明确分开的通道：`/api/v1` 是后端业务 Interface，`/engine-rest` 是 Camunda 官方语义的开发验证 Interface。`/camunda`、`/camunda-validation` 和 `/camunda-console` 通过 Vite 的 `/api/camunda` 代理访问引擎；`/workflow-business` 和“发布任务模板”通过 `/api/v1` 使用后端业务接口。

开发代理目标分别由 `API_PROXY_TARGET` 和 `CAMUNDA_PROXY_TARGET` 指定。Basic Auth 使用 `API_PROXY_AUTH` / `CAMUNDA_PROXY_AUTH`，格式为 `username:password`，只能由 Vite 服务端或生产服务器读取；禁止将凭据写入 `VITE_` 变量。`VITE_CAMUNDA_ACCESS_MODE` 和 `VITE_CAMUNDA_TENANT` 仅控制页面来源提示。

`VITE_WORKFLOW_DEVTOOLS=false` 时，侧边栏隐藏且路由拦截引擎联调、流程验证和 Camunda 管理台；普通业务入口只调用 `BusinessWorkflowGateway`。Vite 代理不会进入生产构建，生产环境应由 Go/BFF 承接认证、权限、租户隔离、变量脱敏、幂等和平台审计。

可运行隔离烟测复查后端代理的透传写操作；测试使用 UUID 名称并在结束时清理自己的 Camunda 部署。

```powershell
$env:CAMUNDA_DIRECT_BASE_URL = 'http://192.168.124.202:8085/engine-rest'
$env:CAMUNDA_PROXY_BASE_URL = 'http://192.168.124.202:9000/engine-rest'
$env:CAMUNDA_PROXY_AUTH = '<username>:<password>'
$env:CAMUNDA_TEST_TENANT = '<tenant-id>'
node scripts/camunda-proxy-smoke.mjs
```

接入 Go 后端保存时，应保留流程设计稿原文并单独记录部署产物和引擎返回的定义版本；不要从 Camunda 引擎模型重新导出覆盖设计原稿，以免丢失布局或扩展。

## 目录

```text
src/
  api/            接口函数（demo.ts 为本地示例，camunda/ 为 Camunda 7 gateway）
  bpmn/           初始流程、模板、检查规则、主题与属性类型
  components/     节点属性面板等可复用组件
  composables/    通用 hooks
  layouts/        应用布局
  router/         路由配置
  stores/         Pinia 状态
  styles/         全局样式
  types/          公共类型
  utils/          请求工具
  views/          页面
```

## 接入后端

按需复制 `.env.example` 为 `.env.local`。默认业务请求前缀为 `/api`：业务 Gateway 调用 `/api/v1`；`/api/camunda` 单独代理到 `CAMUNDA_PROXY_TARGET` 并重写为 `/engine-rest`，只用于开发联调。不要把包含密码的 `.env.local` 提交到版本库。

`request<T>()` 返回 HTTP 响应体，不预设后端的业务状态码或 token 协议，也不自动显示错误弹窗。后端协议确定后，再在请求层统一适配。

```ts
import { request } from '@/utils/request'
import type { PageQuery, PageResult } from '@/types/table'
import type { ProcessFilters, ProcessRow } from '@/api/demo'

export function listProcesses(params: PageQuery<ProcessFilters>, signal: AbortSignal) {
  return request<PageResult<ProcessRow>>({
    url: '/processes/page',
    method: 'POST',
    data: params,
    signal,
  })
}
```

如果后端响应结构不同，在 API 函数中转换成 `{ list, total }`。将 `TableView.vue` 的查询函数替换为真实接口即可复用页面。

## useTable

```ts
const { rows, loading, error, filters, pagination, search, reset, refresh } = useTable(
  listProcesses,
  { initialFilters: { keyword: '', status: '' }, pageSize: 10 },
)
```

`filters` 是 ref，脚本中使用 `filters.value`，模板中自动解包。筛选值应为普通可克隆数据。`search` 回到第一页后查询，`reset` 恢复初始条件并查询；`refresh` 保留当前页码。组件挂载时默认加载，设置 `immediate: false` 可关闭。

生产部署使用 `dist`，需要将页面路由回退到 `index.html`，并由服务器代理 `/api` 或配置 `VITE_API_BASE_URL`。Vite 的开发代理不会进入生产构建。
