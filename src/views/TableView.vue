<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  ElAlert,
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElPagination,
  ElSelect,
  ElTag,
} from "element-plus";
import { Refresh, Search } from "@element-plus/icons-vue";
import {
  listCategories,
  listProcesses,
  type ProcessFilters,
  type ProcessRow,
} from "@/api/demo";
import DataTable, {
  RenderFunctionType,
  type DataTableColumn,
  type TableContext,
  type TableOption,
  type TableOptionMap,
} from "@/components/common/DataTable";
import { useTable } from "@/composables/useTable";
import { TableColumnWidth } from "@/types/table";


const {
  rows,
  loading,
  error,
  filters,
  pagination,
  search,
  reset,
  refresh,
  changePage,
  changePageSize,
} = useTable<ProcessRow, ProcessFilters>(listProcesses, {
  initialFilters: { keyword: "", status: "" },
  pageSize: 5,
});

// 枚举 / 选择列：数组形式（可携带 type、color 展示为状态标签）
const statusOptions: TableOption[] = [
  { value: "published", label: "已发布", type: "success" },
  { value: "draft", label: "草稿", type: "info" },
];

const priorityOptions: TableOption[] = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

// 分类列：编码 → 显示名 由独立字典接口返回，请求结果写入 ref。
const categoryOptions = ref<TableOption[]>([]);

const categoryLabelByCode = computed(
  () =>
    new Map(
      categoryOptions.value
        .filter((option) => option.value !== undefined)
        .map((option) => [String(option.value), option.label]),
    ),
);

let categoryController: AbortController | undefined;
let categoryRequestId = 0;

async function loadCategories(): Promise<void> {
  const currentRequestId = ++categoryRequestId;
  categoryController?.abort();
  const controller = new AbortController();
  categoryController = controller;
  try {
    const options = await listCategories(controller.signal);
    if (currentRequestId === categoryRequestId && !controller.signal.aborted) {
      categoryOptions.value = options;
    }
  } catch {
    // 字典失败保留空数组，表格以编码兜底展示。
  } finally {
    if (currentRequestId === categoryRequestId) {
      categoryController = undefined;
    }
  }
}

// 标签列：映射形式（携带颜色 / 类型）
const tagOptions: TableOptionMap = {
  审批: { label: "审批", type: "primary" },
  人事: { label: "人事", type: "success" },
  财务: { label: "财务", type: "warning" },
  行政: { label: "行政", type: "info" },
  业务: { label: "业务", type: "danger" },
  报销: { label: "报销", type: "warning" },
};

function openDoc(context: TableContext<ProcessRow>): void {
  ElMessage.info(`打开文档：${context.row.docUrl}`);
}

// 列配置改为 computed，等价于 React 的 generateColumns({ brandMap })。

const columns = computed<DataTableColumn<ProcessRow>[]>(() => [
  {
    key: "code",
    label: "编号",
    width: TableColumnWidth.Code,
    formatter: ({ row }) => `#${String(row.id).padStart(4, "0")}`,
  },
  {
    key: "name",
    prop: "name",
    label: "流程名称",
    minWidth: TableColumnWidth.ProcessNameMin,
    showOverflowTooltip: true,
  },
  {
    key: "key",
    prop: "key",
    label: "流程标识",
    minWidth: TableColumnWidth.Wide,
    showOverflowTooltip: true,
  },
  {
    key: "category",
    prop: "categoryCode",
    label: "分类",
    width: TableColumnWidth.Medium,
    type: RenderFunctionType.Enum,
    options: categoryOptions.value,
    formatter: ({ value }) =>
      categoryLabelByCode.value.get(String(value)) ??
      (value === "" || value == null ? "—" : String(value)),
  },
  {
    key: "status",
    prop: "status",
    label: "状态",
    width: TableColumnWidth.Compact,
    align: "center",
    type: RenderFunctionType.Status,
    options: statusOptions,
  },
  {
    key: "priority",
    prop: "priority",
    label: "优先级",
    width: TableColumnWidth.Compact,
    align: "center",
    type: RenderFunctionType.Select,
    options: priorityOptions,
  },
  {
    key: "owner",
    prop: "owner",
    label: "负责人",
    width: TableColumnWidth.Owner,
  },
  {
    key: "amount",
    prop: "amount",
    label: "预算金额",
    minWidth: TableColumnWidth.Medium,
    align: "right",
    type: RenderFunctionType.Money,
  },
  {
    key: "tags",
    prop: "tags",
    label: "标签",
    minWidth: TableColumnWidth.Wide,
    type: RenderFunctionType.Tag,
    options: tagOptions,
  },
  {
    key: "startDate",
    prop: "startDate",
    label: "开始日期",
    width: TableColumnWidth.Date,
    type: RenderFunctionType.Date,
  },
  {
    key: "deadlineMonth",
    prop: "deadlineMonth",
    label: "截止月份",
    width: TableColumnWidth.Month,
    type: RenderFunctionType.Month,
  },
  {
    key: "runAt",
    prop: "runAt",
    label: "运行时间",
    width: TableColumnWidth.Date,
    align: "center",
    type: RenderFunctionType.Time,
  },
  {
    key: "description",
    prop: "description",
    label: "描述",
    minWidth: TableColumnWidth.DescriptionMin,
    type: RenderFunctionType.Tooltip,
    tooltipOptions: { placement: "top", showAfter: 200 },
  },
  {
    key: "docUrl",
    prop: "docUrl",
    label: "文档",
    width: TableColumnWidth.Compact,
    align: "center",
    type: RenderFunctionType.Link,
    linkAction: openDoc,
  },
  {
    key: "updatedAt",
    prop: "updatedAt",
    label: "更新时间",
    minWidth: TableColumnWidth.UpdatedAtMin,
    type: RenderFunctionType.DateTime,
  },
  {
    key: "actions",
    label: "操作",
    width: TableColumnWidth.Actions,
    align: "center",
    fixed: "right",
    buttons: [
      {
        key: "view",
        label: "查看",
        type: "primary",
        onClick: ({ row }) => ElMessage.info(`查看：${row.name}`),
      },
      {
        key: "delete",
        label: "删除",
        type: "danger",
        onClick: ({ row }) => ElMessage.warning(`删除：${row.name}`),
      },
    ],
  },
]);

onMounted(() => {
  void loadCategories();
});

onBeforeUnmount(() => {
  categoryRequestId += 1;
  categoryController?.abort();
});
</script>

<template>
  <section>
    <div class="page-heading">
      <h1>表格示例</h1>
      <ElTag type="info" effect="plain" round>本地示例数据</ElTag>
    </div>

    <div class="surface">
      <ElForm class="search-form" :inline="true" @submit.prevent="search">
        <ElFormItem label="流程名称" for="process-keyword">
          <ElInput id="process-keyword" v-model="filters.keyword" clearable placeholder="名称或流程标识" />
        </ElFormItem>
        <ElFormItem label="状态" for="process-status">
          <ElSelect id="process-status" v-model="filters.status" placeholder="全部状态" clearable :value-on-clear="''">
            <ElOption label="已发布" value="published" />
            <ElOption label="草稿" value="draft" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :icon="Search" native-type="submit" :loading="loading">查询</ElButton>
          <ElButton @click="reset">重置</ElButton>
        </ElFormItem>
      </ElForm>
      <div class="table-toolbar">
        <div class="table-title">
          流程列表 <span>{{ pagination.total }} 条记录</span>
        </div>
        <ElButton :icon="Refresh" :loading="loading" @click="refresh">刷新</ElButton>
      </div>
      <ElAlert v-if="error" :title="error.message" type="error" :closable="false" show-icon />
      <DataTable :rows="rows" :columns="columns" :loading="loading" row-key="id" empty-text="暂无符合条件的流程" />
      <div class="pagination-bar">
        <ElPagination :current-page="pagination.page" :page-size="pagination.pageSize" :page-sizes="[5, 10, 20]"
          :total="pagination.total" layout="total, sizes, prev, pager, next" @update:current-page="changePage"
          @update:page-size="changePageSize" />
      </div>
    </div>
  </section>
</template>
