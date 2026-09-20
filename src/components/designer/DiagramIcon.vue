<script setup lang="ts">
import { diagramIcons, type DiagramIconName } from '@/bpmn/icons'
defineProps<{ name: DiagramIconName }>()
</script>

<template>
  <span class="diagram-icon" aria-hidden="true" v-html="diagramIcons[name]"></span>
</template>

<style scoped>
.diagram-icon { display: inline-flex; width: 18px; height: 18px; flex: 0 0 auto; color: inherit; pointer-events: none; }
.diagram-icon :deep(svg) { width: 100%; height: 100%; stroke-width: 1.65; }
</style>
