# React 表格迁移与 Vue 公共组件方案

状态：第一阶段已实现。下列九项范围已由用户确认；查询层仍按页面实际语义保留，后续再评估统一。

核对日期：2026-10-13。当前 Vue 仓库基线记录为 `abd9157`，旧 React 仓库基线为 `dd21970d`。公共表格和 Camunda 流程定义表已接入；模板列由异步字典驱动的可运行示例仍待补齐。

## 已确认范围

| 问题 | 用户选择 | 对方案的影响 |
| --- | --- | --- |
| 使用范围 | 当前 Vue 项目 | 使用现有 Vue 3、TypeScript、Element Plus，先在仓库内维护 |
| 首批页面 | 表格示例 + 一个真实列表 | 用两个场景检验接口，再推广 |
| 用户列设置 | 公司当前没有需求 | 不迁移列设置面板、用户显隐/调序/固定偏好、配置保存和每页条数记忆 |
| 真实列表 | Camunda 流程定义列表 | 覆盖复合单元格、行操作、分页和详情联动 |
| 开发写法 | 列数组 + 复杂单元格插槽 | 普通列在 TypeScript 中声明，交互和复合内容用 Vue 模板 |
| DataTable API | 小而明确的接口 | 先满足试点，不镜像全部 Element Plus 属性 |
| renderMap | 首期完整迁移 | 旧金额、日期、枚举、标签等模板纳入；重复格式化再提纯函数 |
| 空值展示 | `—` | `0` 和 `false` 保留 |
| 分页 | 留在页面 | DataTable 只处理表格及单元格渲染 |

“不需要列配置”在本方案中指取消终端用户的个性化设置。开发者仍用列数组声明字段、标题、宽度和操作列固定位置；它们是代码定义，不需要配置存储。

## 源码核对结果

当前项目入口：

- [依赖及脚本](../package.json)：Vue 3.5、Element Plus 2.11、TypeScript 5.9、Vite 7，使用 pnpm。
- [useTable](../src/composables/useTable.ts)：查询、重置、刷新、分页、加载/错误状态、AbortSignal、请求序号隔离和卸载取消。
- [分页类型](../src/types/table.ts)：`PageQuery<F>` 与 `PageResult<T>`。
- [表格示例](../src/views/TableView.vue)：使用 `DataTable`，本地数据接口已经正确执行筛选和切片。
- [Camunda 管理台](../src/views/CamundaConsoleView.vue)：页面内维护多个查询通道、已提交筛选条件、分页和详情联动。真实页面没有直接使用 `useCamundaConsole` composable。
- [请求封装](../src/utils/request.ts)和 [Camunda gateway](../src/api/camunda/gateway.ts)：继续作为接口调用入口。

旧 React 项目位于 `C:/Users/ht/Desktop/work/equity_platform`，本次读取了以下文件：

- `src/components/ProxyComponents/XZLTable/index.tsx`
- `src/components/ProxyComponents/XZLTable/renderTemplate.tsx`
- `src/hooks/useTable.tsx`
- `src/hooks/useTableColumns.ts`
- `src/components/ColumnSettings/index.tsx`
- `src/types/table.d.ts`
- `src/pages/execute/task/taskMgr/list/index.tsx`

结合[原封装笔记](./Table组件封装笔记.md)，迁移关系如下：

| React 实现 | 本项目处理 |
| --- | --- |
| `XZLTable` 及 Ant Design 默认设置 | 改为 Vue 的 `DataTable`，仅保留适用于当前页面的规则 |
| `useAntdTable` 数据 hook | 保留现有 Vue `useTable`；真实页面首轮保留原查询逻辑 |
| `useTableColumns`、`ColumnSettings`、`pageConf` | 按用户要求不迁移 |
| `renderMap` 中的日期、金额、枚举等 | `DataTable` 首期已提供金额、日期、标签、链接、字典、Tooltip、状态和枚举渲染；复杂业务内容仍使用插槽 |
| React `render`、`ReactNode` | 改成 Vue 作用域插槽；基础文本格式化用普通函数 |
| React keepalive 刷新 | 不照搬；当前页面是否需要激活刷新应由具体页面决定 |
| `postData` 管道 | 数据协议转换放在 API 适配函数；业务衍生展示由页面 computed/formatter 完成 |

需要避开的旧实现问题：

1. React 本地分页使用 `slice(current - 1, current * pageSize)`。起点应为 `(current - 1) * pageSize`；现有 Vue demo 已正确处理。
2. React `formatMoney` 用 truthy 判断，把数字 `0` 显示为 `--`。默认空值规则必须保留 `0` 和 `false`。
3. React 的 `originalRender` 结果先被判空，指定 `type` 后又用原始值运行模板。Vue 版应只有明确的一条渲染路径。
4. 笔记中的缓存、延迟加载、虚拟滚动等不能直接视作已实现的表格能力；本轮也没有对应需求。

## 建议的模块职责

第一版新增一个公共表格模块，内部包含列类型和单元格值处理。现有数据请求模块保持独立。

```text
页面
  ├─ 筛选表单、工具栏、业务错误提示
  ├─ useTable 或页面现有查询逻辑 → API → request
  ├─ DataTable → Element Plus ElTable / ElTableColumn
  │    ├─ columns：字段、标题、尺寸、文本格式化
  │    └─ cell-* 插槽：复合内容、状态、按钮
  └─ 现有 ElPagination → 页面翻页处理函数
```

`DataTable` 接收数据、列和加载状态，并发出交互事件。它不创建请求，不拥有分页状态，也不解释 Camunda 的挂起、恢复或业务任务语义。列中的操作按钮调用页面处理函数。

当前目录：

```text
src/
  components/
    common/
      DataTable/
        DataTable.vue       # 表格渲染与 Vue 插槽
        types.ts            # 列和单元格上下文类型
        cellValue.ts        # 默认值展示与空值处理
        index.ts            # 对外导出组件及类型
  composables/
    useTable.ts             # 已有，首轮保留
  types/
    table.ts                # 已有，只存请求分页类型
```

只有一个调用点的辅助函数可以先留在组件文件中。目录用于表达职责，不要求每个职责立刻变成单独文件或公共导出。

## 列接口建议

以下是已实现接口的核心部分；完整类型见 `src/components/common/DataTable/types.ts`。

```typescript
type CellText = string | number | boolean | null | undefined

export interface DataTableColumn<T extends object> {
  key: string
  label: string
  prop?: Extract<keyof T, string>
  width?: number | string
  minWidth?: number | string
  align?: 'left' | 'center' | 'right'
  fixed?: 'left' | 'right' | false
  showOverflowTooltip?: boolean
  kind?: 'money' | 'dateTime' | 'date' | 'month' | 'time' | 'tag' | 'link' | 'select' | 'tooltip' | 'status' | 'enum'
  options?: TableOption[] | Record<string, string | TableOption>
  formatter?: (cell: CellContext<T>) => CellText
}

export interface CellContext<T extends object> {
  row: T
  value: unknown
  column: DataTableColumn<T>
  rowIndex: number
}
```

- `key` 是唯一、稳定的列标识，并决定插槽名 `cell-{key}`；操作列和复合列也必须有 key。
- `prop` 是可选的数据字段；复合列可以直接在插槽中读取 row。第一版不设计字符串形式的任意嵌套路径。
- `formatter` 返回基础文本值，接收完整 row；存在 formatter 时它优先于 `kind` 的默认渲染。跨页面重复的 formatter 再提取成纯函数。
- `fixed` 是开发者声明的列布局，例如将操作列固定在右侧，与用户列设置无关。
- `rowKey` 由页面明确传入字段名或函数，不假设所有业务行都使用 `id`。
- 数据通过 `rows` prop 传入；公共组件不排序、不分页、不修改原始行和列。
- `loading` 控制加载遮罩和忙碌状态；`emptyText` 描述整张表无记录时的文案；`emptyValue` 描述普通单元格缺失值，建议默认为 `—`。
- `row-click` 至少提供类型化的 row。试点保留 Element Plus 行点击行为，按钮通过 `@click.stop` 避免触发行选择。
- 只开放试点需要的属性和事件。无需为全部 Element Plus 能力建立平行 API；后续有使用场景时再明确加入。

单元格渲染规则：

1. 存在 `cell-{key}` 插槽时，完全由插槽处理，包括有意渲染为空的情况。
2. 没有插槽且指定 formatter 时，调用 formatter；不再叠加其他渲染模板。
3. 否则读取 `prop` 的原始值。
4. 第 2、3 步结果为 `null`、`undefined` 或空字符串时显示 `emptyValue`；`0` 和 `false` 保留。数组、对象等复杂值要求 formatter 或插槽明确展示。

“未分配”“未领取”“未命名流程”是页面语义，不使用全局空值替代。日期不自动猜测：demo 的更新时间已经是展示字符串，按原样显示；真实时间需要格式化时，由列显式选择函数。金额渲染保留两位小数并按远离零的方向舍入，不附加货币符号。

## 异步字典驱动的列（下一步示例）

遇到“接口返回编码，另一个接口返回编码对应的显示名”时，请求仍由页面或 API 层负责，`DataTable` 只消费最终的行和列。推荐让行数据保留稳定的 `categoryCode`，把字典请求结果放入页面 `ref`，再用 `computed` 同时生成列选项和需要使用这组选项的筛选控件。字典刷新后，computed 列会更新，表格随响应式数据重新渲染。

```typescript
const categoryOptions = ref<TableOption[]>([])
const categoryLabelByCode = computed(() => new Map(
  categoryOptions.value
    .filter(option => option.value !== undefined)
    .map(option => [String(option.value), option.label]),
))

const columns = computed<DataTableColumn<TemplateRow>[]>(() => [
  {
    key: 'category',
    prop: 'categoryCode',
    label: '分类',
    kind: 'enum',
    options: categoryOptions.value,
    // 字典还没返回或后端给出新编码时，保留编码便于识别。
    formatter: ({ value }) => categoryLabelByCode.value.get(String(value))
      ?? (value === null || value === undefined || value === '' ? '—' : String(value)),
  },
])
```

页面在 `onMounted` 中调用独立的 `listCategories(signal)`；真实 API 通过现有 `request<T>()` 封装，本地示例可以用可取消的异步 mock。分类筛选控件也遍历 `categoryOptions`，避免表格和筛选各自维护一份标签。请求要提供 loading/error/retry，刷新时先 abort 前一个 controller，再用请求序号隔离旧成功和旧失败；卸载时递增序号并 abort，避免晚到响应写回。列表请求和字典请求互相独立，不能让 `formatter`、`cell-*` 插槽或单元格逐行触发网络请求。

若动态数据是每行关联信息（例如负责人名称），在 API/fetcher 中按当前页的 ID 批量读取并适配成行字段；也可由页面维护按 ID 去重缓存，再让插槽读取。不要在每个单元格执行一次请求。

参考用户提供的 `equity_platform/src/pages/execute/assignment/list/index.tsx` 中，`businessDict.brandMap` 被送入 `generateColumns` 的品牌枚举 options；提案人和执行人接口结果用于筛选选项，表格行本身读取 `proposerName` 和 `executorName`。这正对应“页面拿数据、列配置消费选项、DataTable 同步渲染”的边界，不需要把异步能力塞进公共表格。

接手状态：上述接线目前是方案，不应描述为已实现。落地时在 `src/api/demo.ts` 添加仅供示例的分类编码数据和独立可取消字典函数，在 `src/views/TableView.vue` 改为 `categoryCode` + computed options/columns，补错误重试和生命周期隔离测试；真实部署替换 API 函数即可。

## Camunda 流程定义列表的目标写法

以下片段表达已采用的用法。`filteredDefinitions`、`loading`、`pending`、`selectDefinition`、`toggleDefinition` 和 `showDefinitionXml` 均沿用现有页面。

```typescript
import DataTable, { type DataTableColumn } from '@/components/common/DataTable'
import type { CamundaProcessDefinition } from '@/api/camunda/types'

const definitionColumns = [
  { key: 'name', prop: 'name', label: '名称', minWidth: 170 },
  {
    key: 'version', prop: 'version', label: '版本', width: 90,
    formatter: ({ row }) => row.version == null ? 'v—' : `v${row.version}`,
  },
  { key: 'id', prop: 'id', label: 'definitionId', minWidth: 220 },
  { key: 'deploymentId', prop: 'deploymentId', label: 'deploymentId', minWidth: 170 },
  { key: 'status', label: '状态', width: 100 },
  { key: 'actions', label: '操作', width: 160, fixed: 'right' },
] satisfies DataTableColumn<CamundaProcessDefinition>[]
```

```vue
<DataTable
  :rows="filteredDefinitions"
  :columns="definitionColumns"
  :loading="!!loading.definitions"
  row-key="id"
  empty-text="暂无流程定义"
  @row-click="selectDefinition"
>
  <template #cell-name="{ row }">
    <b>{{ row.name || '未命名流程' }}</b>
    <small class="table-sub">{{ row.key }}</small>
  </template>

  <template #cell-id="{ row }"><code>{{ row.id }}</code></template>
  <template #cell-deploymentId="{ row }"><code>{{ row.deploymentId || '—' }}</code></template>

  <template #cell-status="{ row }">
    <ElTag :type="row.suspended ? 'warning' : 'success'" effect="light">
      {{ row.suspended ? '已挂起' : '可启动' }}
    </ElTag>
  </template>

  <template #cell-actions="{ row }">
    <ElButton text size="small" :disabled="pending[row.id]" @click.stop="toggleDefinition(row)">
      {{ row.suspended ? '恢复' : '挂起' }}
    </ElButton>
    <ElButton text size="small" @click.stop="selectDefinition(row); showDefinitionXml = true">
      XML
    </ElButton>
  </template>
</DataTable>
```

复杂表格仍然保留可读的 Vue 模板。公共模块集中处理的是列遍历、默认值、加载和统一展示规则，而业务处理仍然能够在页面中直接找到。

## 数据层迁移中的关键差异

首轮在 TableView 继续使用现有 useTable，在 Camunda 页保留现有 `loadPage` 和查询通道。原因是行为尚不等价：

| 行为 | 当前 useTable | 当前 Camunda 管理台 |
| --- | --- | --- |
| 请求格式 | `PageQuery<F>` → `PageResult<T>` | list 与 count 分开调用，使用偏移分页 |
| 筛选 | refresh 读取当前 filters | 编辑条件与 applied 条件分开 |
| 页码超出结果范围 | 暂无回退逻辑 | 回退到最后有效页并重新查询 |
| 加载和失败时的数据 | 保留此前 rows，暴露 error | 查询时清空目标数据，total 设为 null |
| 详情联动 | 不负责 | 查询前清除定义详情，取消旧详情请求，支持路由定位 |

用现有 useTable 直接替换 Camunda 的 loadPage，会改变未提交筛选、空页恢复、失败显示和详情联动。这些应作为第二阶段的数据层工作明确约定并验证。

将来统一分页时，Camunda API 适配函数可并行读取 list/count，把 `page/pageSize` 转换为 `firstResult/maxResults`，再返回 `PageResult<T>`；两个请求共享 AbortSignal。公共表格无需知道这个转换。

另外，业务页目前按 `maxResults: 100` 获取模板和任务；结果数组长度不是服务端总量，不能据此生成假分页。真正接入时应先确认 API 的分页和计数能力。

## 实施顺序与验收

### 第一阶段：公共表格与两个试点

1. 实现最小 DataTable、列类型和单元格兜底规则。第一版无需增加第三方依赖。
2. 迁移 TableView 的列定义，保留筛选、useTable 和现有 ElPagination 接线。它继续作为可本地运行的使用示例。
3. 仅迁移 CamundaConsoleView 的流程定义表格展示；保留查询、分页、行操作、路由定位、XML 和只读流程图联动。
4. 核对 scoped 样式、固定操作列、横向滚动和窄屏，避免组件根元素变化导致已有 CSS 失效。
5. 已补充组件使用说明，并在 README 记录实际完成的能力。

验收关注行为：

- 普通列、复合列、操作列正常；0/false 不丢失，null/undefined/空字符串正确兜底。
- 插槽优先且允许有意渲染为空；formatter 处理结果不被另一套模板覆盖。
- 示例页搜索、重置、分页、刷新保持现有语义；切换 pageSize 不因重复事件多次请求。
- 真实页连续查询只接收最新结果；未提交筛选不影响分页；total 为 null 时仍显示未加载成功。
- 行点击选择正确的流程定义，操作按钮不意外触发行点击；详情按 id 查询，不用最新流程定义替代选中版本。
- 页码回退、路由定位、离开页面后的异步保护保持有效。

截至 2026-10-13，`node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`、`node node_modules/vite/bin/vite.js build` 和 `node --test tests/data-table.test.mjs` 已通过（表格单测 4/4）。组合运行 `node --test tests/data-table.test.mjs tests/camunda-console.test.mjs` 时表格单测通过，Camunda 测试中 8 个挂载页面的用例在测试 harness 转换 SFC 时抛出 `SyntaxError: Missing initializer in destructuring declaration`；应先修复或定位 harness，再判断这些用例是否通过。当前源码类型检查和构建成功，但仍有 Vite 大 chunk 警告。DataTable 的 Element Plus 加载遮罩接线以及表格示例的异步字典渲染尚需复核/补齐；页面布局、操作传播仍由用户在浏览器验证。

未进行真实 Camunda 后端联调；构建只验证前端产物。

### 第二阶段：根据使用反馈扩展

1. 逐张接入其他真实表格，检查列接口是否仍然简单。静态原型无需为统一组件而整体重写。
2. 对反复出现的查询语义补强 useTable，明确已提交条件、页码回退、失败数据策略，然后逐个替换页面查询代码。
3. 从多个真实页面提取 QueryBar、TableToolbar 或分页模块。若只是转发一组 ElPagination 属性，先直接使用 Element Plus。
4. 日期、枚举、状态标签等出现重复规则后再提取纯函数或展示模块；业务状态映射留在对应领域。
5. 弹窗和表单在字段、校验、提交、关闭规则出现实际重复后提取。避免用大量布尔参数和任意配置对象覆盖所有页面。

公共模块的判断标准：删除它以后，同一条复杂规则是否会在多个页面重复出现？如果只有一层属性转发消失，就暂缓抽取。

## 设计确认记录

- 已确认：项目内使用、两个页面试点、不做用户列设置、选 Camunda 流程定义列表、列数组与 Vue 插槽结合。
- 已确认并实现：采用本文最小 DataTable 方案，先统一展示，第二阶段再统一查询行为。
- 本次没有新增流程业务术语，组件字段不写入 CONTEXT.md；当前方案可以逐步调整，先保存在本文，不提前设为 accepted ADR。
