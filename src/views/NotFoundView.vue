<script setup lang="ts">
import { ElButton, ElResult } from 'element-plus'
</script>

<template>
  <ElResult icon="info" title="404" sub-title="你访问的页面不存在">
    <template #extra><ElButton type="primary" @click="$router.push('/')">返回首页</ElButton></template>
  </ElResult>
</template>
