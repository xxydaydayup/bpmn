<script setup lang="ts">
import { ref } from 'vue'

/** 演示用 BPMN 运行图，不连接真实 bpmn-js 实例或 Camunda 数据。 */
withDefaults(defineProps<{ mode?: 'definition' | 'instance' }>(), { mode: 'instance' })
const emit = defineEmits<{ select: [node: string] }>()
const zoom = ref(1)
const selected = ref('付款服务')

function selectNode(node: string) {
  selected.value = node
  emit('select', node)
}

function changeZoom(delta: number) {
  zoom.value = Math.min(1.2, Math.max(.82, Number((zoom.value + delta).toFixed(2))))
}
</script>

<template>
  <div class="prototype-flow" aria-label="流程实例 BPMN 运行图">
    <div class="prototype-flow-toolbar"><span><b>{{ mode === 'definition' ? '流程定义预览' : '运行轨迹' }}</b><small>点击节点查看状态</small></span><div><button type="button" aria-label="缩小" @click="changeZoom(-.1)">−</button><b>{{ Math.round(zoom * 100) }}%</b><button type="button" aria-label="放大" @click="changeZoom(.1)">+</button><button type="button" aria-label="适应画布" @click="zoom = 1">适应</button></div></div>
    <div class="prototype-flow-scroll">
      <svg class="prototype-flow-svg" :style="{ transform: `scale(${zoom})` }" viewBox="0 0 760 260" role="img" aria-label="提交申请到付款服务的流程图">
        <defs><marker id="prototype-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#9cafa4" /></marker></defs>
        <path class="flow-line done" d="M58 130 H135" /><path class="flow-line done" d="M205 130 H255" /><path class="flow-line" d="M305 130 H365" /><path class="flow-line branch" d="M395 130 V70 H465" /><path class="flow-line branch" d="M395 130 V190 H465" /><path class="flow-line" d="M540 70 H595 V130" /><path class="flow-line" d="M540 190 H595 V130" /><path class="flow-line" d="M625 130 H700" />
        <g class="flow-node done" tabindex="0" role="button" aria-label="开始" @click="selectNode('开始')" @keydown.enter="selectNode('开始')"><circle cx="42" cy="130" r="16" /><text x="42" y="165">开始</text></g>
        <g class="flow-node done" tabindex="0" role="button" aria-label="提交申请" @click="selectNode('提交申请')" @keydown.enter="selectNode('提交申请')"><rect x="135" y="105" width="70" height="50" rx="6" /><text x="170" y="133">提交申请</text><text class="sub" x="170" y="147">已完成</text></g>
        <g class="flow-node active" tabindex="0" role="button" aria-label="金额判断" @click="selectNode('金额判断')" @keydown.enter="selectNode('金额判断')"><path d="M280 100 L310 130 L280 160 L250 130 Z" /><text x="280" y="184">金额判断</text></g>
        <g class="flow-node done" tabindex="0" role="button" aria-label="普通审批" @click="selectNode('普通审批')" @keydown.enter="selectNode('普通审批')"><rect x="465" y="45" width="75" height="50" rx="6" /><text x="502" y="74">普通审批</text><text class="sub" x="502" y="88">已完成</text></g>
        <g class="flow-node pending" tabindex="0" role="button" aria-label="高额审批" @click="selectNode('高额审批')" @keydown.enter="selectNode('高额审批')"><rect x="465" y="165" width="75" height="50" rx="6" /><text x="502" y="194">高额审批</text><text class="sub" x="502" y="208">未经过</text></g>
        <g class="flow-node error" tabindex="0" role="button" aria-label="付款服务" @click="selectNode('付款服务')" @keydown.enter="selectNode('付款服务')"><rect x="595" y="105" width="70" height="50" rx="6" /><text x="630" y="133">付款服务</text><text class="sub" x="630" y="147">Incident</text><circle class="error-dot" cx="665" cy="101" r="8" /><text class="error-mark" x="665" y="105">!</text></g>
        <g class="flow-node pending" tabindex="0" role="button" aria-label="结束" @click="selectNode('结束')" @keydown.enter="selectNode('结束')"><circle cx="716" cy="130" r="16" /><text x="716" y="165">结束</text></g>
        <text class="branch-label" x="420" y="66">amount ≤ 5000</text><text class="branch-label" x="420" y="205">amount &gt; 5000</text>
      </svg>
    </div>
    <div class="prototype-flow-footer"><span><i class="legend-dot done" />已完成</span><span><i class="legend-dot active" />当前活动</span><span><i class="legend-dot error" />异常</span><span><i class="legend-dot pending" />未经过</span><b>已选：{{ selected }}</b></div>
  </div>
</template>

<style scoped>
.prototype-flow { border: 1px solid #e3ece6; border-radius: 7px; overflow: hidden; background: #fbfdfc; }
.prototype-flow-toolbar, .prototype-flow-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 12px; color: #7d9288; font-size: 10px; }
.prototype-flow-toolbar { border-bottom: 1px solid #e8efeb; background: #fff; }
.prototype-flow-toolbar span { display: grid; gap: 3px; }
.prototype-flow-toolbar b { color: #4e7061; font-size: 11px; font-weight: 600; }
.prototype-flow-toolbar small { color: #9aa9a1; font-size: 9px; }
.prototype-flow-toolbar > div { display: flex; align-items: center; gap: 6px; }
.prototype-flow-toolbar button { min-width: 24px; height: 23px; padding: 0 6px; border: 1px solid #dfe9e3; border-radius: 4px; color: #70867b; background: #fff; cursor: pointer; font-size: 10px; }
.prototype-flow-toolbar button:hover { color: #24745e; border-color: #a7cbb7; }
.prototype-flow-scroll { overflow-x: auto; padding: 12px 14px 4px; background-image: radial-gradient(#dfe9e3 .65px, transparent .65px); background-size: 15px 15px; }
.prototype-flow-svg { display: block; width: 760px; min-width: 760px; height: 260px; transform-origin: 50% 50%; transition: transform .18s ease; }
.flow-line { fill: none; stroke: #b8c9bf; stroke-width: 1.6; marker-end: url('#prototype-arrow'); }
.flow-line.done { stroke: #68ae8b; }
.flow-line.branch { stroke: #c5a56c; stroke-dasharray: 4 3; }
.flow-node { cursor: pointer; outline: none; }
.flow-node rect, .flow-node circle, .flow-node path { stroke-width: 1.5; }
.flow-node.done rect, .flow-node.done circle { stroke: #6db08f; fill: #eef8f1; }
.flow-node.active path { stroke: #ca8c36; fill: #fff7e8; }
.flow-node.pending rect, .flow-node.pending circle { stroke: #cfdad3; fill: #fff; }
.flow-node.error rect { stroke: #c85b55; fill: #fff4f3; }
.flow-node:hover rect, .flow-node:hover circle, .flow-node:hover path, .flow-node:focus rect, .flow-node:focus circle, .flow-node:focus path { stroke-width: 2.5; }
.flow-node text { fill: #537264; font-size: 11px; text-anchor: middle; dominant-baseline: middle; pointer-events: none; }
.flow-node text.sub { fill: #91a39a; font-size: 8px; }
.flow-node.active text { fill: #a6712c; }
.flow-node.error text { fill: #ae5550; }
.error-dot { fill: #c85b55 !important; stroke: #fff !important; }
.error-mark { fill: #fff !important; font-size: 10px !important; font-weight: 700; }
.branch-label { fill: #a07b42; font-size: 9px; text-anchor: middle; }
.prototype-flow-footer { justify-content: flex-start; flex-wrap: wrap; border-top: 1px solid #e8efeb; background: #fff; }
.prototype-flow-footer span { display: inline-flex; align-items: center; gap: 5px; }
.prototype-flow-footer b { margin-left: auto; color: #557568; font-size: 10px; font-weight: 500; }
.legend-dot { width: 7px; height: 7px; border: 1px solid #b7c8bd; border-radius: 50%; background: #fff; }
.legend-dot.done { border-color: #6db08f; background: #eaf7ef; }
.legend-dot.active { border-color: #ca8c36; background: #fff3d9; }
.legend-dot.error { border-color: #c85b55; background: #fde9e7; }
.legend-dot.pending { background: #fff; }
@media (max-width: 760px) { .prototype-flow-footer b { width: 100%; margin-left: 0; } }
</style>
