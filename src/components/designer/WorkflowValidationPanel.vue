<script setup lang="ts">
import { computed } from 'vue'
import { ElButton } from 'element-plus'
import type { ValidationIssue } from '@/bpmn/types'

const props = defineProps<{ issues: ValidationIssue[]; disabled: boolean }>()
const emit = defineEmits<{ locate: [id: string]; close: [] }>()
const errors = computed(() => props.issues.filter(issue => issue.severity === 'error').length)
</script>

<template>
  <section class="workflow-validation" aria-label="流程检查结果">
    <div class="validation-heading">
      <div>
        <strong>{{ issues.length ? `流程检查：${errors} 项错误，${issues.length - errors} 项警告` : '基础结构检查通过' }}</strong>
        <p>检查基础连接、固定审批名单和一层并行结构，不执行审批规则或条件表达式。点击问题定位元素。</p>
      </div>
      <ElButton text aria-label="关闭检查结果" @click="emit('close')">收起</ElButton>
    </div>
    <ul v-if="issues.length">
      <li v-for="(issue, index) in issues" :key="`${issue.code}:${issue.elementId}:${index}`">
        <button type="button" :class="['validation-issue', issue.severity]" :disabled="disabled || !issue.elementId" @click="emit('locate', issue.elementId)">
          <span>{{ issue.severity === 'error' ? '错误' : '警告' }}</span>
          <span>{{ issue.message }}</span>
          <code>{{ issue.elementId }}</code>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.workflow-validation { padding: 16px 20px; background: #fafcfb; border-bottom: 1px solid #e6ebe8; }
.validation-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.validation-heading strong { font-size: 13px; }
.validation-heading p { margin: 7px 0 0; color: #718176; font-size: 11px; line-height: 1.7; }
ul { list-style: none; padding: 0; margin: 12px 0 0; max-height: 180px; overflow: auto; }
.validation-issue { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; width: 100%; padding: 9px 10px; border: 0; border-radius: 4px; background: transparent; color: #455b50; text-align: left; font: inherit; font-size: 12px; cursor: pointer; }
.validation-issue:hover { background: #edf3ef; }
.validation-issue.error > span:first-child { color: #b34343; }
.validation-issue.warning > span:first-child { color: #987025; }
.validation-issue code { margin-left: auto; color: #819187; overflow-wrap: anywhere; }
.validation-issue:disabled { cursor: default; }
</style>
