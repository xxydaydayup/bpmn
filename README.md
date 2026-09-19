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
- BPMN 基础编辑器：绘图、导入/导出 XML、适应画布，支持 bpmn-js 原生撤销重做。

暂未接入登录、权限、CRUD 写操作、流程执行引擎和业务属性面板。BPMN 不自动保存，离开页面前请导出文件。

## 目录

```text
src/
  api/            接口函数（demo.ts 为本地示例）
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
