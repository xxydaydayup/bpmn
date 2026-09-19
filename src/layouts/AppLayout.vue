<script setup lang="ts">
import { ElButton, ElIcon, ElMenu, ElMenuItem } from 'element-plus'
import { Fold, Expand, Grid, Connection } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const route = useRoute()
</script>

<template>
  <div class="app-shell" :class="{ 'is-collapsed': app.sidebarCollapsed }">
    <aside class="sidebar">
      <RouterLink to="/" class="brand" aria-label="流程工作台首页">
        <span class="brand-mark"><ElIcon :size="22"><Connection /></ElIcon></span>
        <span v-if="!app.sidebarCollapsed" class="brand-name">流程工作台<small>BPMN WORKSPACE</small></span>
      </RouterLink>
      <div v-if="!app.sidebarCollapsed" class="nav-caption">工作空间</div>
      <ElMenu
        router
        :default-active="route.path"
        :collapse="app.sidebarCollapsed"
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
      </ElMenu>
      <div v-if="!app.sidebarCollapsed" class="sidebar-footer">从一个简单的流程开始。</div>
    </aside>

    <div class="main-shell">
      <header class="app-header">
        <ElButton
          text
          :icon="app.sidebarCollapsed ? Expand : Fold"
          :aria-label="app.sidebarCollapsed ? '展开菜单' : '收起菜单'"
          @click="app.toggleSidebar"
        />
        <span class="breadcrumb-root">工作空间</span>
        <span class="breadcrumb-divider">/</span>
        <span>{{ route.meta.title }}</span>
        <span class="header-label">基础项目</span>
      </header>
      <main class="page-container"><RouterView /></main>
    </div>
  </div>
</template>
