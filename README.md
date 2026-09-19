# 流程工作台

Vue 3 + TypeScript + Vite 的基础项目，集成 Vue Router、Pinia、Axios、Element Plus 和 bpmn-js。

## 启动

需要 Node.js 20.19+ 或 22.12+，推荐 Node.js 22，包管理器使用 pnpm 9。

```bash
pnpm install
pnpm dev
```

打开终端显示的本地地址，默认是 http://localhost:5173。

如需使用本地代理，可在当前终端设置后再安装（不需要写入项目配置）：

```bash
export https_proxy=http://127.0.0.1:7897
export http_proxy=http://127.0.0.1:7897
export all_proxy=socks5://127.0.0.1:7897
pnpm install
```

```bash
pnpm typecheck  # TypeScript 检查
pnpm build      # 类型检查并构建到 dist
pnpm preview    # 预览构建结果
```

## 当前范围

- 基础布局、可折叠菜单、路由懒加载和 404 页面。
- Pinia 管理侧边栏状态。
- Axios 请求封装：基础地址、超时、HTTP 错误处理和类型化响应。
- `useTable`：查询、重置、刷新、分页、加载状态、错误状态、请求取消和旧结果隔离。
- 表格示例使用本地静态数据，无需后端即可运行。
- BPMN 编辑器：默认展示“开始 → 提交需求 → 确认需求 → 结束”，支持绘图、XML 导入导出和适应画布。
- 自定义节点属性面板：编辑名称、办理人和表单，修改支持撤销重做；自有 moddle 扩展随 XML 保存。
- 流程图默认颜色、字体和画布样式集中配置，为后续主题定制预留入口。

暂未接入登录、权限、CRUD 写操作和流程执行引擎。BPMN 不自动保存，离开页面前请导出文件。

## 需求确认流程示例

打开 `/designer`。初始流程包含两个人工任务：

| 节点 | 办理人标识 | 表单标识 |
| --- | --- | --- |
| 提交需求 | `requester` | `requirement-submit` |
| 确认需求 | `reviewer` | `requirement-confirm` |

选择节点后在右侧修改字段，输入完成并离开输入框后应用。开始、结束及其他非人工任务节点只编辑名称。当前办理人是静态用户标识，表单是引用标识；此例不执行审批、不加载表单内容，也不解析办理人表达式。

- 标准节点名称保存为 BPMN 的 `name` 属性。
- 办理人、表单保存为 `wf:assignee`、`wf:formKey`。
- 扩展定义：`src/bpmn/workflow-moddle.json`，命名空间为 `https://bpmn-workspace.local/schema/workflow`（它是协议标识，不需要访问该域名）。
- 初始完整流程与布局：`src/bpmn/requirement-process.bpmn`。
- XML 导出后再导入，可以继续编辑以上属性与布局。导入无效 XML 会尝试保留原流程；解析阶段失败也保留撤销历史。

属性修改通过 `modeling.updateProperties` 进入 bpmn-js 命令栈。`useBpmnDesigner` 管理模型生命周期、选择同步和 XML 操作，Vue 属性面板只接收普通数据快照，避免把 bpmn-js 模型变成响应式代理。

### 流程图主题入口

编辑 `src/bpmn/theme.ts` 中的 `diagramTheme` 即可调整节点默认填充、描边、文字颜色、字体、画布背景和网格色。节点主题通过 bpmn-js 的 `bpmnRenderer` / `textRenderer` 配置应用，画布通过 CSS 变量应用；这些默认展示样式不改写业务 XML。

如果以后需要不同节点形状或状态样式，可在创建 Modeler 时通过 `additionalModules` 注册自定义 renderer，继续复用同一主题配置。导入 XML 自带的显式节点颜色仍遵循 bpmn-js 的渲染规则。

### Go 后端对接约定

本例没有引入 `camunda-bpmn-moddle`。Go 后端需按命名空间 URI 识别自有 `wf` 属性，再映射到 gobpm 的办理人配置和业务表单注册表；原生 gobpm 不会自动执行这些自有扩展。设计 XML 应原文保存，另外解析为执行模型，避免从引擎模型重新导出导致布局或扩展丢失。

## 目录

```text
src/
  api/            接口函数（demo.ts 为本地示例）
  bpmn/           自有 moddle、初始流程、主题与属性类型
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
