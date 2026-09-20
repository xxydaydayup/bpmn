<script setup lang="ts">
import {
  ElAlert, ElButton, ElForm, ElFormItem, ElInput, ElOption,
  ElPagination, ElSelect, ElTable, ElTableColumn, ElTag,
} from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'
import { listProcesses, type ProcessFilters, type ProcessRow } from '@/api/demo'
import { useTable } from '@/composables/useTable'

const {
  rows, loading, error, filters, pagination,
  search, reset, refresh, changePage, changePageSize,
} = useTable<ProcessRow, ProcessFilters>(listProcesses, {
  initialFilters: { keyword: '', status: '' },
  pageSize: 5,
})
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
        <div class="table-title">流程列表 <span>{{ pagination.total }} 条记录</span></div>
        <ElButton :icon="Refresh" :loading="loading" @click="refresh">刷新</ElButton>
      </div>
      <ElAlert v-if="error" :title="error.message" type="error" :closable="false" show-icon />
      <ElTable :data="rows" row-key="id" empty-text="暂无符合条件的流程" :aria-busy="loading">
        <ElTableColumn prop="name" label="流程名称" min-width="150" />
        <ElTableColumn prop="key" label="流程标识" min-width="190">
          <template #default="{ row }"><span class="process-key">{{ row.key }}</span></template>
        </ElTableColumn>
        <ElTableColumn prop="category" label="分类" min-width="120" />
        <ElTableColumn label="状态" width="110">
          <template #default="{ row }">
            <ElTag :type="row.status === 'published' ? 'success' : 'info'" effect="light" size="small">
              {{ row.status === 'published' ? '已发布' : '草稿' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="updatedAt" label="更新时间" min-width="175" />
      </ElTable>
      <div class="pagination-bar">
        <ElPagination
          :current-page="pagination.page"
          :page-size="pagination.pageSize"
          :page-sizes="[5, 10, 20]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          @update:current-page="changePage"
          @update:page-size="changePageSize"
        />
      </div>
    </div>
  </section>
</template>
