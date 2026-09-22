<script setup lang="ts">
import { ElButton, ElIcon, ElMenu, ElMenuItem } from 'element-plus'
import { Fold, Expand, Grid, Connection, VideoPlay, CircleCheck } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const route = useRoute()
const isDesigner = computed(() => route.path === '/designer')
const collapsed = computed(() => isDesigner.value || app.sidebarCollapsed)
</script>

<template>
  <div class="app-shell" :class="{ 'is-collapsed': collapsed, 'designer-shell': isDesigner }">
    <aside class="sidebar">
      <RouterLink to="/" class="brand" aria-label="流程工作台首页">
        <span class="brand-mark"><ElIcon :size="22"><Connection /></ElIcon></span>
        <span v-if="!collapsed" class="brand-name">流程工作台<small>BPMN WORKSPACE</small></span>
      </RouterLink>
      <div v-if="!collapsed" class="nav-caption">工作空间</div>
      <ElMenu
        router
        :default-active="route.path"
        :collapse="collapsed"
        :collapse-transition="false"
        class="sidebar-menu"
      >
        <ElMenuItem index="/table" aria-label="表格示例">
          <ElIcon><Grid /></ElIcon>
          <template #title><span>表格示例</span></template>
        </ElMenuItem>
        <ElMenuItem index="/designer" aria-label="流程设计">
          <ElIcon><Connection /></ElIcon>
          <template #title><span>流程设计</span></template>
        </ElMenuItem>
        <ElMenuItem index="/camunda" aria-label="Camunda 7 引擎联调">
          <ElIcon><VideoPlay /></ElIcon>
          <template #title><span>引擎联调</span></template>
        </ElMenuItem>
        <ElMenuItem index="/camunda-validation" aria-label="流程验证">
          <ElIcon><CircleCheck /></ElIcon>
          <template #title><span>流程验证</span></template>
        </ElMenuItem>
      </ElMenu>
    </aside>

    <div class="main-shell">
      <header v-if="!isDesigner" class="app-header">
        <ElButton
          text
          :icon="app.sidebarCollapsed ? Expand : Fold"
          :aria-label="app.sidebarCollapsed ? '展开菜单' : '收起菜单'"
          @click="app.toggleSidebar"
        />
        <span class="breadcrumb-root">工作空间</span>
        <span class="breadcrumb-divider">/</span>
        <span>{{ route.meta.title }}</span>
      </header>
      <main class="page-container"><RouterView /></main>
    </div>
  </div>
</template>
