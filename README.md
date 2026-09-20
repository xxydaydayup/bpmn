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
- BPMN 编辑器：默认展示“开始 → 提交需求 → 确认需求 → 结束”，支持绘图、XML 文件或粘贴导入、XML 编辑与复制、导出和适应画布。
- 属性面板：编辑流程名称和标识、节点名称、单人/会签/或签、固定参与人名单与办理顺序、表单、连线名称、排他条件及默认分支；修改支持撤销重做。
- 六个常用审批模板，以及带元素定位的基础连接、名单和一层并行结构检查；检查错误会阻止文件导出。
- 统一的青绿工作台、Tabler 节点库与快捷操作、人工/服务任务卡片；主题、图标映射可由开发者调整。
- 旧尺寸普通流程导入时自动扩大卡片并重排，已适配图保留手动布局；“整理布局”可一次撤销、重做。

暂未接入登录、权限、CRUD 写操作和流程执行引擎。BPMN 不自动保存，离开页面前请导出文件，或通过“编辑 XML”复制草稿保存。

## 需求确认流程示例

打开 `/designer`。初始流程包含两个人工任务：

| 节点 | 办理人标识 | 表单标识 |
| --- | --- | --- |
| 提交需求 | `requester` | `requirement-submit` |
| 确认需求 | `reviewer` | `requirement-confirm` |

选择节点后在右侧修改字段，输入完成并离开输入框后应用。办理人必填，表单可空。当前办理人是静态用户标识，表单是引用标识；此例不执行审批、不加载表单内容，也不解析办理人表达式。

- 标准节点名称保存为 BPMN 的 `name` 属性。
- 办理人、表单保存为 `wf:assignee`、`wf:formKey`。
- 扩展定义：`src/bpmn/workflow-moddle.json`，命名空间为 `https://bpmn-workspace.local/schema/workflow`（它是协议标识，不需要访问该域名）。
- 初始完整流程与布局：`src/bpmn/requirement-process.bpmn`。
- XML 导出后再导入，可以继续编辑以上属性与布局。导入无效 XML 会尝试保留原流程；解析阶段失败也保留撤销历史。

属性修改通过 `modeling.updateProperties` 进入 bpmn-js 命令栈。`useBpmnDesigner` 管理模型生命周期、选择同步和 XML 操作，Vue 属性面板只接收普通数据快照，避免把 bpmn-js 模型变成响应式代理。

点击“编辑 XML”会在弹窗中载入当前画布的格式化 XML，可直接修改或粘贴替换文本。“复制 XML”复制的是弹窗内的当前草稿，“应用到画布”才会将草稿导入设计器；取消不改变画布。每次重新打开编辑弹窗都会从画布生成 XML。

点击“导入 XML”可直接粘贴 XML，也可通过“选择文件”载入 `.bpmn` 或 `.xml` 文件，检查或修改后点击“导入到画布”。空白内容不能提交；导入失败时弹窗保留草稿并显示错误，可继续修正，原流程恢复沿用设计器的导入逻辑。

应用或导入成功会替换当前流程并重置画布撤销记录。画布的“导出 XML”始终导出已经应用的内容，`.bpmn` 文件本身就是 XML。

### 常用流程设计

点击“流程属性”可修改流程名称和 BPMN 标识。标识需要符合 XML 名称规则且在文档中唯一；修改与撤销会同步更新流程引用和 DI 布局引用。

选择连线可修改名称；选择排他网关的出线还可输入条件原文或设为默认分支。也可在网关属性中选择默认出线。默认分支由来源网关的 `default` 引用保存，每个网关最多一条；设置默认分支会清除该出线的条件，在默认出线上输入条件会取消默认设置。这些关联变更可一起撤销、重做。

条件保存为标准 `bpmn:conditionExpression` / `bpmn:tFormalExpression`，保留导入表达式已有的 `language`。前端不求值，也不验证未知引擎的表达式语法。示例 `amount > 5000` 仅用于设计演示，绑定引擎后需确认变量来源、表达式语言和转换方式。

“流程模板”提供以下完整流程，点击“使用模板”会替换画布并重置撤销记录；使用前可先导出或复制当前 XML。

| 模板 | 流程结构 |
| --- | --- |
| 串行审批 | 提交申请 → 主管审批 → 财务审批 |
| 金额分支审批 | 提交报销 → 排他分支：高额审批（`amount > 5000`）或普通审批（默认）→ 汇合 |
| 并行审批 | 财务会签及主管审批、法务审批并行 → 统一汇合 → 通过/不通过/退回 |
| 会签审批 | 固定名单，全员同意才通过 → 审批结果路由 |
| 或签审批 | 固定名单，任一同意即通过 → 审批结果路由 |
| 退回重提 | 主管 → 总监；退回修改后从主管重新审批 |

模板中的办理人和表单引用都是示例标识，可按业务修改。模板文件位于 `src/bpmn/templates/`。

### 复杂人工审批

选择人工任务，在“审批方式”中选择单人、会签或或签。多人任务每行填写一个用户标识，也可用中英文逗号分隔；至少一人，空白项和重复用户会报错。办理顺序可选同时办理或按名单顺序办理，表单引用可空。

- 会签：全员同意才通过，任一拒绝即不通过。或签：任一同意即通过，全员拒绝才不通过。个人拒绝不直接等于或签环节不通过。
- 环节结果未确定时，任一退回使本环节退回；结果确定后结束该环节剩余待办。这些规则保存在设计协议中，当前前端不创建或执行真实待办。
- 单人切多人会将原办理人带入名单；多人切单人时仅一人的名单会自动带入，否则需重填办理人。模式、名单、人数和标准多实例标记关联更新，可一起撤销。
- 通过原生画布菜单修改多实例标记时，面板会同步办理顺序或显示配置冲突；可点击“同步多人配置”恢复标准标记和人数。无名单的普通多实例须先选择会签/或签并补齐名单。
- 含外部集合绑定、完成条件、未知审批版本等配置时，相关多人字段只读并显示原因，仍可在 XML 中查看、修改；面板不会覆盖这些内容。

不同环节的并行审批使用一层并行网关，各分支结束后统一汇合。分支出现不通过/退回时应通过结果连线跳过本分支后续审批，其他分支继续结束；汇合后优先处理不通过，其次退回，全部通过才继续。退回回路放在汇合之后，重提重新走全部审批。并行模板展示了财务会签不通过/退回时跳过财务主管的路径。

多人名单和策略保存为结构化 `wf:approval version="1"`，并行/顺序与数量使用标准 BPMN 多实例结构。数量本身不会将实例分配给用户。完整规则、XML 示例、结果变量及后端适配边界见 [人工审批设计契约](./docs/adr/0001-human-approval-design.md)。四个复杂模板标记为 `isExecutable="false"`；实际部署需要先完成引擎映射与验证。

### 流程检查与导出

“检查流程”和“导出 XML”使用同一套基础检查规则。执行过检查后，属性与画布修改、撤销重做和导入会自动更新结果，点击问题可定位元素。

- 错误：标识不合法或重复、缺开始/结束、连接缺失或无效、节点不可达或无法到达结束、排他分支缺条件、默认引用或条件冲突、单人任务缺办理人、多人名单为空/重复、人数或模式冲突。
- 并行错误：分叉/汇合不配对、分支跨接或绕过汇合、从外部进入分支、分支内回路、把排他选择的多条路径直接作为并行汇合入线，以及并行出线带条件或默认分支。
- 警告：排他分支缺默认出线、并行区域外的人工任务具有多条出线，以及超出当前范围的结构。表单为空不报错；并行区域外的合法回路允许保留。
- 有错误时禁止下载文件；“编辑 XML”的查看、编辑和复制，以及文件/粘贴导入仍可使用。仅有警告时允许下载。

检查面向单个流程中的普通开始/结束事件、单人或固定名单多人任务、排他网关和一层并行网关。嵌套并行提示警告并跳过该流程的并行配对检查，仍检查基础连接；子流程、特殊事件等其他高级节点会提示警告并跳过该流程的路径检查，仍检查标识和顶层人工任务配置。多流程协作提示范围限制。检查通过不代表引擎可执行，不验证审批结果的计算、条件求值、用户有效性或运行时取消行为。

### 当前属性与 Camunda 支持范围

当前使用标准 BPMN 2.0 和自有 `wf` 扩展，未安装或注册 Camunda 7 的 `camunda-bpmn-moddle` 或 Camunda 8 的 Zeebe 扩展。Camunda 文件中的标准 BPMN 图形与专有扩展属于不同层面：画布能显示标准节点，不代表支持 Camunda 配置的编辑、完整往返保存或执行。

| 属性面板字段 | XML 属性 | 适用范围 |
| --- | --- | --- |
| 流程标识 | Process 的 `id` | 单个根流程，可编辑并检查合法性、唯一性 |
| 流程/节点/连线名称 | `name` | 当前选中的流程、节点或顺序流 |
| 办理人 | `wf:assignee` | 单人任务，静态用户标识，必填 |
| 会签/或签与固定名单 | `extensionElements/wf:approval`、`wf:participant` | 多人任务，版本化的自有设计规则 |
| 办理顺序与人数 | `multiInstanceLoopCharacteristics` 的 `isSequential`、`loopCardinality` | 固定名单多实例；人数随名单更新 |
| 表单 | `wf:formKey` | 仅人工任务，表单引用标识，可空 |
| 条件表达式 | `conditionExpression` | 排他网关出线，保存原文 |
| 默认分支 | 来源网关的 `default` | 排他网关的一条出线引用 |

节点、连线 ID 与类型只展示，位置和连线路径由画布编辑并保存为 BPMN DI。候选人/组、办理人表达式、监听器、异步/重试、服务任务执行配置等尚无属性面板支持，也未接入流程引擎执行。后端 gobpm 对部分 Camunda 字段的兼容性实验见 [调研报告](./docs/research/gobpm-compatibility.md)，该报告不代表当前前端已注册这些扩展。

### 流程图主题入口

编辑 `src/bpmn/theme.ts` 中的 `diagramTheme` 可调整默认颜色、字体、卡片尺寸、圆角、线宽和布局间距；`src/bpmn/icons.ts` 管理本地 Tabler SVG 映射。人工/服务任务由 `BusinessRenderer` 绘制为卡片，保留原生多实例、循环和补偿标记，事件与网关保留标准形状。完整修改入口见 [设计器样式维护说明](./docs/designer-styling.md)。

节点库支持点击添加与拖入画布；选中节点上方的快捷操作复用原生创建、连线、替换和删除能力。完整配置继续在右侧面板编辑。默认卡片为 `184×88`，只显示名称和类型，长名称最多两行并截断；完整名称仍保存在 XML 和属性面板中。旧图的紧凑卡片使用一行名称，尺寸过小时保留原生渲染。

普通单流程中，只要人工/服务任务小于约定尺寸，导入时会用 ELK 统一整理节点、连线和标签；导入完成后以此作为新的撤销基线。已符合尺寸的图不自动重排，手动位置和布线随 XML 保留。“整理布局”主动重排整个流程，可以一次撤销、重做。

自动布局支持普通开始/结束事件、人工/服务任务、排他/并行网关和顺序流，包括分支、汇合、回退与多实例任务。含泳道、泳池、子流程、边界/特殊事件、注释或其他未支持元素的图继续导入，保留原几何，显示跳过原因并禁用整理按钮。计算失败时也保留原布局。布局只更新 DI，不修改 ID、逻辑连接、条件或审批字段。

主题默认色不写入业务字段，导入 XML 的显式颜色优先。尺寸和整理后的几何会保存到 BPMN DI；其他 BPMN 工具可能以自己的原生外观展示这些节点。本次没有增加 Flowable/Camunda 部署转换器或执行引擎。

### Go 后端对接约定

本例没有引入 `camunda-bpmn-moddle`。Go 后端需按命名空间 URI 识别自有 `wf` 属性，再映射到 gobpm 的办理人配置和业务表单注册表；原生 gobpm 不会自动执行这些自有扩展。设计 XML 应原文保存，另外解析为执行模型，避免从引擎模型重新导出导致布局或扩展丢失。

## 目录

```text
src/
  api/            接口函数（demo.ts 为本地示例）
  bpmn/           自有 moddle、初始流程、模板、检查规则、主题与属性类型
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

按需复制 `.env.example` 为 `.env.local`。默认请求前缀为 `/api`，开发服务将路径原样代理到 `http://localhost:8080`。

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
