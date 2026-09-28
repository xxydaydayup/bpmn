<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, ArrowRight, Bell, CaretRight, CircleCheckFilled, Clock,
  Connection, Document, Download, InfoFilled, Monitor, MoreFilled,
  Operation, Refresh, Search, Setting, Tickets, Upload, User, VideoPlay, View,
  WarningFilled,
} from '@element-plus/icons-vue'
import PrototypeOverview from '@/components/prototype/PrototypeOverview.vue'
import PrototypeFlowDiagram from '@/components/prototype/PrototypeFlowDiagram.vue'

type VariantKey = 'a' | 'b' | 'c'
type PageKey = 'overview' | 'definitions' | 'instances' | 'tasks' | 'operations' | 'history' | 'validation' | 'audit'

const route = useRoute()
const router = useRouter()

const variants: Record<VariantKey, { label: string; hint: string }> = {
  a: { label: '运行总览', hint: '异常和状态并排，适合日常值守' },
  b: { label: '定义中心', hint: '版本与发布优先，适合平台管理员' },
  c: { label: '异常工作台', hint: '把 Incident 和 Job 放到首要位置' },
}

const pages: Array<{ key: PageKey; label: string; description: string; icon: typeof Monitor }> = [
  { key: 'overview', label: '运行总览', description: '先看引擎健康与需要处理的信号', icon: Monitor },
  { key: 'definitions', label: '流程定义', description: '版本、部署和发布资源', icon: Document },
  { key: 'instances', label: '运行实例', description: '按业务键和流程版本定位实例', icon: Connection },
  { key: 'tasks', label: '任务查询', description: '查看人工任务与 External Task', icon: Tickets },
  { key: 'operations', label: 'Job / Incident', description: '异常、重试和引擎执行队列', icon: WarningFilled },
  { key: 'history', label: '历史查询', description: '实例、活动、变量和操作轨迹', icon: Clock },
  { key: 'validation', label: '引擎验证', description: '用可重复场景验证执行闭环', icon: CircleCheckFilled },
  { key: 'audit', label: '操作审计', description: '权限范围与高风险动作留痕', icon: Operation },
]

const definitions = [
  { name: '采购申请', key: 'purchase-request', version: 12, status: '运行中', tenant: '总部租户', instances: 48, incidents: 2, deployed: '今天 09:42', definitionId: 'purchase-request:12:7f1d' },
  { name: '费用报销', key: 'expense-claim', version: 8, status: '运行中', tenant: '总部租户', instances: 31, incidents: 1, deployed: '昨天 16:18', definitionId: 'expense-claim:8:0ac4' },
  { name: '合同会签', key: 'contract-review', version: 4, status: '已挂起', tenant: '华东租户', instances: 12, incidents: 0, deployed: '09-21 14:06', definitionId: 'contract-review:4:4e62' },
]

const instances = [
  { id: 'a9c4e2', businessKey: 'PO-20260924-0182', name: '采购申请', version: 12, status: '运行中', node: '金额判断', owner: '王晨', time: '今天 10:24', incident: true },
  { id: 'c1d8aa', businessKey: 'EXP-20260924-0057', name: '费用报销', version: 8, status: '运行中', node: '部门负责人审批', owner: '林晓', time: '今天 09:58', incident: false },
  { id: 'e5b2f9', businessKey: 'PO-20260923-0171', name: '采购申请', version: 12, status: '已完成', node: '结束', owner: '赵一', time: '昨天 18:42', incident: false },
  { id: 'b7f0cd', businessKey: 'CON-20260922-0034', name: '合同会签', version: 4, status: '已挂起', node: '法务会签', owner: '陈立', time: '09-22 15:32', incident: false },
]

const incidents = [
  { id: 'INC-1048', type: 'Failed Job', summary: '服务任务 charge-card 重试次数耗尽', instance: 'PO-20260924-0182', node: '付款服务', age: '12 分钟前', retries: 0, severity: '高' },
  { id: 'INC-1047', type: 'Incident', summary: '外部任务锁定超时，等待 worker 重新获取', instance: 'EXP-20260924-0057', node: '发票校验', age: '41 分钟前', retries: 2, severity: '中' },
  { id: 'INC-1044', type: 'Failed Job', summary: '定时器到期但执行器暂不可用', instance: 'CON-20260922-0034', node: '合同归档', age: '昨天 16:22', retries: 1, severity: '低' },
]

const selectedDefinition = ref(definitions[0])
const selectedInstance = ref(instances[0])
const deployDialog = ref(false)
const retryDialog = ref(false)
const selectedIncident = ref(incidents[0])
const toast = ref('')

const currentVariant = computed<VariantKey>(() => {
  const value = String(route.query.variant ?? 'a')
  return value === 'b' || value === 'c' ? value : 'a'
})
const activePage = computed<PageKey>(() => {
  const value = String(route.query.page ?? 'overview') as PageKey
  return pages.some((page) => page.key === value) ? value : 'overview'
})
const pageMeta = computed(() => pages.find((page) => page.key === activePage.value) ?? pages[0])
const variantMeta = computed(() => variants[currentVariant.value])

function navigate(page: string) {
  const next = pages.some((item) => item.key === page) ? page : 'overview'
  router.replace({ query: { ...route.query, page: next } })
}

function setVariant(variant: VariantKey) {
  router.replace({ query: { ...route.query, variant } })
}

function cycleVariant(direction: 1 | -1) {
  const keys = Object.keys(variants) as VariantKey[]
  const index = keys.indexOf(currentVariant.value)
  setVariant(keys[(index + direction + keys.length) % keys.length])
}

function notify(message: string) {
  toast.value = message
  window.setTimeout(() => { toast.value = '' }, 2400)
}

function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
  if (event.key === 'ArrowLeft') cycleVariant(-1)
  if (event.key === 'ArrowRight') cycleVariant(1)
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="workflow-prototype" :class="`workflow-prototype--${currentVariant}`">
    <div class="prototype-strip">
      <div><span class="prototype-dot" />设计预览 · 示例数据</div>
      <div class="prototype-strip-meta"><span>Camunda Platform 7.20.0</span><span>开发环境</span><span>总部租户</span><span>运维操作员</span></div>
    </div>

    <header class="prototype-header">
      <div class="prototype-title-block">
        <div class="prototype-kicker">流程控制面 / {{ variantMeta.label }}</div>
        <h1>{{ pageMeta.label }}</h1>
        <p>{{ pageMeta.description }}<span class="prototype-title-note">{{ variantMeta.hint }}</span></p>
      </div>
      <div class="prototype-header-actions">
        <button class="quiet-action" type="button" @click="notify('已刷新示例数据')"><Refresh :size="15" /> 刷新</button>
        <button class="quiet-action" type="button" @click="notify('当前为只读设计预览')"><Bell :size="15" /> 通知</button>
        <div class="operator-chip"><span class="operator-avatar">运</span><span><b>运维操作员</b><small>平台控制面</small></span><CaretRight :size="14" /></div>
      </div>
    </header>

    <div class="prototype-body">
      <aside class="prototype-sidebar">
        <div class="prototype-sidebar-label">控制台</div>
        <button v-for="page in pages" :key="page.key" type="button" class="prototype-nav-item" :class="{ active: activePage === page.key }" @click="navigate(page.key)">
          <component :is="page.icon" :size="17" /><span>{{ page.label }}</span><small v-if="page.key === 'operations'">3</small>
        </button>
        <div class="prototype-sidebar-divider" />
        <div class="prototype-sidebar-card">
          <div class="sidebar-card-head"><span class="status-pulse" />引擎连接正常</div>
          <strong>7.20.0</strong>
          <span>最近检查 · 30 秒前</span>
        </div>
        <div class="prototype-sidebar-foot"><Setting :size="15" /> 平台设置 <span>⌘K</span></div>
      </aside>

      <main class="prototype-content">
        <PrototypeOverview v-if="activePage === 'overview'" :variant="currentVariant" @navigate="navigate" />

        <section v-else-if="activePage === 'definitions'" class="prototype-section">
          <div class="section-toolbar"><div><div class="section-eyebrow">流程资产</div><h2>流程定义与部署</h2><p>按 key 聚合定义，版本独立发布与回溯。</p></div><button class="primary-action" type="button" @click="deployDialog = true"><Upload :size="16" /> 部署 BPMN</button></div>
          <div class="filter-row"><label class="search-field"><Search :size="16" /><input placeholder="搜索名称或流程 key" /></label><button class="filter-button" type="button">状态：全部 <CaretRight :size="14" /></button><button class="filter-button" type="button">租户：总部租户 <CaretRight :size="14" /></button><span class="filter-result">12 个流程定义</span></div>
          <div class="definition-layout">
            <div class="data-panel definition-list-panel"><div class="panel-head"><span>已部署定义</span><span>最新版本</span></div><button v-for="item in definitions" :key="item.key" type="button" class="definition-row" :class="{ selected: selectedDefinition.key === item.key }" @click="selectedDefinition = item"><div class="definition-icon"><Document :size="17" /></div><div class="definition-main"><strong>{{ item.name }}</strong><span>{{ item.key }}</span></div><div class="definition-version"><b>v{{ item.version }}</b><small :class="item.status === '已挂起' ? 'muted' : ''">{{ item.status }}</small></div><CaretRight :size="15" /></button></div>
            <div class="data-panel definition-detail-panel"><div class="detail-topline"><div><div class="detail-label">流程定义版本</div><h3>{{ selectedDefinition.name }} <span>v{{ selectedDefinition.version }}</span></h3><code>{{ selectedDefinition.definitionId }}</code></div><button class="icon-action" type="button" @click="notify('更多操作在正式版本中开放')"><MoreFilled :size="18" /></button></div><div class="definition-metrics"><div><span>运行实例</span><b>{{ selectedDefinition.instances }}</b></div><div><span>Incident</span><b class="danger-text">{{ selectedDefinition.incidents }}</b></div><div><span>最近部署</span><b>{{ selectedDefinition.deployed }}</b></div></div><div class="mini-diagram"><div class="mini-node done">开始</div><div class="mini-line done-line" /><div class="mini-node done">提交申请</div><div class="mini-line" /><div class="mini-node active">金额判断</div><div class="mini-line" /><div class="mini-node">付款服务</div></div><div class="detail-tabs"><button class="active" type="button">版本信息</button><button type="button">部署资源</button><button type="button">运行实例</button><button type="button">XML</button></div><div class="detail-meta-grid"><div><span>部署 ID</span><b>dep-20260924-091</b></div><div><span>部署环境</span><b>开发环境</b></div><div><span>historyTimeToLive</span><b>30 天 · 平台策略</b></div><div><span>发布人</span><b>平台管理员</b></div></div></div>
          </div>
        </section>

        <section v-else-if="activePage === 'instances'" class="prototype-section">
          <div class="section-toolbar"><div><div class="section-eyebrow">运行态</div><h2>运行实例</h2><p>按业务键、流程版本和当前状态定位一次运行。</p></div><button class="quiet-action" type="button" @click="notify('示例数据已刷新')"><Refresh :size="15" /> 刷新列表</button></div>
          <div class="filter-row"><label class="search-field wide"><Search :size="16" /><input placeholder="业务键 / 实例 ID / 流程名称" /></label><button class="filter-button" type="button">状态：运行中 <CaretRight :size="14" /></button><button class="filter-button" type="button">存在 Incident <CaretRight :size="14" /></button></div>
          <div class="instance-layout"><div class="data-panel instance-list-panel"><div class="panel-head"><span>实例列表</span><span>{{ instances.length }} 条示例记录</span></div><button v-for="item in instances" :key="item.id" type="button" class="instance-row" :class="{ selected: selectedInstance.id === item.id }" @click="selectedInstance = item"><div class="instance-status" :class="item.status === '运行中' ? 'running' : item.status === '已完成' ? 'success' : 'paused'" /><div class="instance-main"><strong>{{ item.businessKey }}</strong><span>{{ item.name }} · v{{ item.version }} · {{ item.owner }}</span></div><div class="instance-state"><b>{{ item.status }}</b><small>{{ item.time }}</small></div><WarningFilled v-if="item.incident" class="instance-alert" :size="16" /></button></div><div class="data-panel instance-detail-panel"><div class="instance-detail-head"><div><div class="detail-label">实例详情</div><h3>{{ selectedInstance.businessKey }}</h3><span>{{ selectedInstance.name }} · v{{ selectedInstance.version }} · {{ selectedInstance.id }}</span></div><span class="status-tag" :class="selectedInstance.status === '运行中' ? 'green' : 'gray'">{{ selectedInstance.status }}</span></div><div class="instance-summary"><div><span>当前节点</span><b>{{ selectedInstance.node }}</b></div><div><span>发起人</span><b>{{ selectedInstance.owner }}</b></div><div><span>开始时间</span><b>{{ selectedInstance.time }}</b></div></div><PrototypeFlowDiagram mode="instance" @select="(node) => notify(`已选中节点：${node}`)" /><div class="detail-tabs"><button class="active" type="button">活动轨迹</button><button type="button">任务</button><button type="button">变量</button><button type="button">Incident</button></div><div class="timeline-row"><span class="timeline-dot done" /><div><b>提交申请</b><span>王晨 · 已完成 · 10:24</span></div><strong>完成</strong></div><div class="timeline-row"><span class="timeline-dot active" /><div><b>{{ selectedInstance.node }}</b><span>当前活动 · 等待处理</span></div><strong class="active-text">进行中</strong></div></div></div>
        </section>

        <section v-else-if="activePage === 'tasks'" class="prototype-section">
          <div class="section-toolbar"><div><div class="section-eyebrow">运行态</div><h2>任务查询</h2><p>用于定位人工任务和 External Task，不承载业务审批动作。</p></div><button class="quiet-action" type="button" @click="notify('任务查询已刷新')"><Refresh :size="15" /> 刷新列表</button></div>
          <div class="task-summary"><div><span>人工任务</span><b>24</b><small>当前活动</small></div><div><span>External Task</span><b>7</b><small>等待 worker</small></div><div><span>即将超时</span><b class="danger-text">3</b><small>24 小时内</small></div></div>
          <div class="filter-row"><label class="search-field wide"><Search :size="16" /><input placeholder="任务名称 / 实例业务键" /></label><button class="filter-button" type="button">类型：全部 <CaretRight :size="14" /></button><button class="filter-button" type="button">租户：总部租户 <CaretRight :size="14" /></button></div>
          <div class="data-panel table-panel"><div class="table-head"><span>当前任务</span><span>数据为示例，不触发真实办理</span></div><div class="table-row table-row-head"><span>任务</span><span>流程实例</span><span>办理人 / Topic</span><span>状态</span><span>创建时间</span><span /></div><div v-for="task in [{ name:'金额审批', instance:'PO-20260924-0182', owner:'finance-review', state:'未领取', time:'10:25' }, { name:'部门负责人审批', instance:'EXP-20260924-0057', owner:'林晓', state:'已领取', time:'09:58' }, { name:'发票校验', instance:'EXP-20260924-0057', owner:'invoice.validate', state:'等待 worker', time:'09:57' }]" :key="task.name" class="table-row"><span><b>{{ task.name }}</b><small>userTask</small></span><span class="mono">{{ task.instance }}</span><span>{{ task.owner }}</span><span><i class="table-state" :class="task.state === '已领取' ? 'green' : task.state === '等待 worker' ? 'orange' : 'gray'" />{{ task.state }}</span><span>{{ task.time }}</span><button class="row-more" type="button" @click="notify('正式版本将跳转到实例详情')"><MoreFilled :size="17" /></button></div></div>
        </section>

        <section v-else-if="activePage === 'operations'" class="prototype-section">
          <div class="section-toolbar"><div><div class="section-eyebrow">运维控制面</div><h2>Job / Incident</h2><p>先确认失败原因，再执行受控重试。</p></div><button class="quiet-action" type="button" @click="notify('异常列表已刷新')"><Refresh :size="15" /> 刷新异常</button></div>
          <div class="ops-summary"><div class="ops-summary-main"><WarningFilled :size="20" /><div><b>3 个待处理信号</b><span>其中 1 个高优先级，建议先查看关联实例</span></div></div><div><span>失败 Job</span><b>2</b></div><div><span>外部任务锁定</span><b>7</b></div><div><span>过去 24 小时</span><b>18</b></div></div>
          <div class="operations-layout"><div class="data-panel incident-panel"><div class="panel-head"><span>待处理 Incident</span><span class="danger-text">3 条</span></div><button v-for="item in incidents" :key="item.id" type="button" class="incident-row" :class="{ selected: selectedIncident.id === item.id }" @click="selectedIncident = item"><span class="severity-bar" :class="item.severity === '高' ? 'high' : item.severity === '中' ? 'medium' : 'low'" /><div><strong>{{ item.summary }}</strong><small>{{ item.instance }} · {{ item.node }} · {{ item.age }}</small></div><span class="incident-severity">{{ item.severity }}</span></button></div><div class="data-panel incident-detail"><div class="detail-topline"><div><div class="detail-label">异常详情 · {{ selectedIncident.id }}</div><h3>{{ selectedIncident.type }}</h3><code>{{ selectedIncident.instance }} / {{ selectedIncident.node }}</code></div><span class="status-tag red">待处理</span></div><div class="error-box"><InfoFilled :size="17" /><div><b>{{ selectedIncident.summary }}</b><span>这是原型中的错误摘要。正式版本展示 Camunda 返回的异常消息与 stacktrace。</span></div></div><div class="retry-meta"><div><span>当前 retries</span><b>{{ selectedIncident.retries }}</b></div><div><span>出现时间</span><b>{{ selectedIncident.age }}</b></div><div><span>关联流程</span><b>采购申请 v12</b></div></div><div class="detail-actions"><button class="primary-action" type="button" @click="retryDialog = true"><Refresh :size="16" /> 模拟重试</button><button class="quiet-action" type="button" @click="navigate('instances')"><View :size="15" /> 查看实例</button></div></div></div>
        </section>

        <section v-else-if="activePage === 'history'" class="prototype-section">
          <div class="section-toolbar"><div><div class="section-eyebrow">可追溯性</div><h2>历史查询</h2><p>运行态和历史态分开，保留实例所属的流程版本。</p></div><button class="quiet-action" type="button" @click="notify('示例历史数据已刷新')"><Download :size="15" /> 导出示例</button></div>
          <div class="filter-row"><label class="search-field wide"><Search :size="16" /><input placeholder="业务键 / 流程 key / 实例 ID" /></label><button class="filter-button" type="button">时间：最近 7 天 <CaretRight :size="14" /></button><button class="filter-button" type="button">结果：全部 <CaretRight :size="14" /></button></div>
          <div class="history-layout"><div class="data-panel history-list"><div class="panel-head"><span>历史实例</span><span>最近完成</span></div><button v-for="item in [{ key:'PO-20260923-0171', name:'采购申请', result:'已完成', duration:'2 小时 18 分', date:'昨天 18:42' }, { key:'EXP-20260923-0032', name:'费用报销', result:'已终止', duration:'38 分钟', date:'昨天 16:10' }, { key:'CON-20260922-0034', name:'合同会签', result:'运行中', duration:'1 天 4 小时', date:'09-22 15:32' }]" :key="item.key" class="history-row" type="button" @click="notify(`将打开 ${item.key} 的历史详情`)"><div class="history-icon" :class="item.result === '已完成' ? 'success' : item.result === '已终止' ? 'danger' : 'active'"><CircleCheckFilled v-if="item.result === '已完成'" :size="16" /><WarningFilled v-else-if="item.result === '已终止'" :size="16" /><Clock v-else :size="16" /></div><div><strong>{{ item.key }}</strong><span>{{ item.name }} · {{ item.duration }}</span></div><div class="history-date"><b>{{ item.result }}</b><small>{{ item.date }}</small></div></button></div><div class="data-panel history-detail"><div class="detail-topline"><div><div class="detail-label">历史轨迹</div><h3>采购申请 <span>v12</span></h3><code>PO-20260923-0171 · 完整历史</code></div><span class="status-tag green">已完成</span></div><div class="history-timeline"><div class="history-point done"><span /><div><b>提交申请</b><small>王晨 · 09-23 16:24</small></div></div><div class="history-point done"><span /><div><b>部门负责人审批</b><small>林晓 · 09-23 17:02</small></div></div><div class="history-point done"><span /><div><b>金额判断</b><small>条件：amount &gt; 5000 · 09-23 17:03</small></div></div><div class="history-point done"><span /><div><b>付款服务</b><small>worker: charge-card · 09-23 18:40</small></div></div><div class="history-point done"><span /><div><b>结束</b><small>09-23 18:42</small></div></div></div></div></div>
        </section>

        <section v-else-if="activePage === 'validation'" class="prototype-section">
          <div class="section-toolbar"><div><div class="section-eyebrow">验证中心</div><h2>引擎验证场景</h2><p>用固定流程和断言验证 Camunda 执行闭环，不代表真实业务审批。</p></div><button class="primary-action" type="button" @click="notify('请选择一个场景开始验证')"><VideoPlay :size="16" /> 开始验证</button></div>
          <div class="validation-layout"><div class="validation-scenarios"><button v-for="scenario in [{ name:'串行审批', key:'serial', desc:'提交申请 → 主管审批 → 财务审批', result:'上次通过', time:'今天 09:12', tone:'green' }, { name:'金额分支', key:'amount', desc:'4999 / 5000 / 5001 三组变量路径', result:'上次通过', time:'昨天 17:44', tone:'green' }, { name:'并行会签', key:'parallel', desc:'验证多实例与汇合，不作为正式模板', result:'待验证', time:'—', tone:'gray' }]" :key="scenario.key" class="scenario-card" type="button"><div class="scenario-mark" :class="scenario.tone"><CircleCheckFilled v-if="scenario.tone === 'green'" :size="18" /><Clock v-else :size="18" /></div><div><strong>{{ scenario.name }}</strong><span>{{ scenario.desc }}</span><small>{{ scenario.result }} · {{ scenario.time }}</small></div><CaretRight :size="16" /></button></div><div class="data-panel validation-report"><div class="report-head"><div><div class="detail-label">最近一次运行报告</div><h3>金额分支 · 3/3 断言通过</h3><span>验证部署 dep-test-0924 · Camunda 7.20.0</span></div><span class="status-tag green">PASS</span></div><div class="assertion-list"><div><CircleCheckFilled :size="17" /><span>XML 部署并返回 definitionId</span><b>通过</b></div><div><CircleCheckFilled :size="17" /><span>amount = 4999 进入普通审批</span><b>通过</b></div><div><CircleCheckFilled :size="17" /><span>amount = 5001 进入高额审批</span><b>通过</b></div></div><div class="report-foot"><span><b>实例 ID</b> test-instance-4821</span><span><b>清理状态</b> 已清理</span><span><b>XML 哈希</b> <code>9af0…c2e1</code></span></div></div></div>
        </section>

        <section v-else class="prototype-section">
          <div class="section-toolbar"><div><div class="section-eyebrow">治理</div><h2>操作审计</h2><p>记录谁在什么环境，以什么权限执行了什么动作。</p></div><button class="quiet-action" type="button" @click="notify('审计筛选已刷新')"><Refresh :size="15" /> 刷新</button></div>
          <div class="audit-scope"><div class="scope-icon"><User :size="18" /></div><div><b>当前权限视图</b><span>运维操作员 · 总部租户 · 开发环境</span></div><button class="quiet-action" type="button" @click="notify('权限管理将在正式版本开放')">查看范围 <CaretRight :size="14" /></button></div>
          <div class="data-panel table-panel"><div class="table-head"><span>最近操作</span><span>高风险动作必须填写原因</span></div><div class="table-row table-row-head"><span>时间</span><span>操作人</span><span>动作</span><span>目标</span><span>结果</span><span /></div><div v-for="row in [{ time:'10:28:14', user:'运维操作员', action:'查看 Incident', target:'INC-1048', result:'成功' }, { time:'09:42:08', user:'平台管理员', action:'部署流程定义', target:'purchase-request v12', result:'成功' }, { time:'昨天 16:23', user:'运维操作员', action:'设置 Job retries', target:'job-8831', result:'已拒绝' }]" :key="row.time" class="table-row"><span class="mono">{{ row.time }}</span><span>{{ row.user }}</span><span><b>{{ row.action }}</b></span><span class="mono">{{ row.target }}</span><span><i class="table-state" :class="row.result === '成功' ? 'green' : 'orange'" />{{ row.result }}</span><button class="row-more" type="button" @click="notify('审计详情将在正式版本打开')"><MoreFilled :size="17" /></button></div></div>
        </section>
      </main>
    </div>

    <div v-if="toast" class="prototype-toast"><CircleCheckFilled :size="16" />{{ toast }}</div>

    <div class="prototype-switcher" aria-label="原型变体切换">
      <button type="button" aria-label="上一个变体" @click="cycleVariant(-1)"><ArrowLeft :size="16" /></button>
      <div><span>原型变体</span><b>{{ currentVariant.toUpperCase() }} · {{ variantMeta.label }}</b></div>
      <button type="button" aria-label="下一个变体" @click="cycleVariant(1)"><ArrowRight :size="16" /></button>
    </div>

    <el-dialog v-model="deployDialog" title="部署 BPMN · 设计预览" width="540px"><div class="dialog-copy"><div class="dialog-file"><Document :size="19" /><div><b>purchase-request.bpmn</b><span>本地文件 · 84 KB · hash 9af0…c2e1</span></div><CircleCheckFilled class="dialog-success" :size="18" /></div><div class="dialog-field"><label>部署环境</label><div class="dialog-select">开发环境 <CaretRight :size="14" /></div></div><div class="dialog-field"><label>用途</label><div class="dialog-select">正式部署 <CaretRight :size="14" /></div></div><p><InfoFilled :size="15" /> 正式版本将先由 Go 服务校验租户、权限、historyTimeToLive 和幂等键。</p></div><template #footer><button class="quiet-action" type="button" @click="deployDialog = false">取消</button><button class="primary-action" type="button" @click="deployDialog = false; notify('已模拟部署成功，definitionId 已返回')"><Upload :size="15" /> 确认部署</button></template></el-dialog>
    <el-dialog v-model="retryDialog" title="重试 Job · 设计预览" width="500px"><div class="dialog-copy"><div class="retry-warning"><WarningFilled :size="18" /><div><b>请先确认失败原因</b><span>这会改变引擎执行状态，正式版本需要填写操作原因并记录审计。</span></div></div><div class="dialog-field"><label>重试次数</label><div class="retry-number">3</div></div><div class="dialog-field"><label>操作原因</label><textarea rows="3" placeholder="例如：worker 已恢复，准备重新执行"></textarea></div></div><template #footer><button class="quiet-action" type="button" @click="retryDialog = false">取消</button><button class="primary-action" type="button" @click="retryDialog = false; notify('已模拟提交重试请求')"><Refresh :size="15" /> 提交重试</button></template></el-dialog>
  </div>
</template>

<style scoped>
.workflow-prototype { --proto-ink: #18392d; --proto-muted: #73847b; --proto-line: #e1e9e4; --proto-soft: #f5f8f6; --proto-accent: #24745e; --proto-danger: #c85b55; --proto-amber: #bd7b2d; min-width: 0; color: var(--proto-ink); }
.prototype-strip { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 8px 16px; color: #557269; background: #eef5f1; border: 1px solid #dce9e1; border-radius: 8px; font-size: 12px; }
.prototype-dot { display: inline-block; width: 7px; height: 7px; margin-right: 7px; border-radius: 50%; background: #3a9b75; vertical-align: 1px; box-shadow: 0 0 0 4px #d8eee3; }
.prototype-strip-meta { display: flex; gap: 18px; color: #81958a; }
.prototype-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding: 30px 2px 28px; }
.prototype-kicker, .section-eyebrow, .detail-label { color: #71867b; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
.prototype-title-block h1 { margin: 8px 0 8px; font-size: 28px; letter-spacing: -.02em; }
.prototype-title-block p { margin: 0; color: var(--proto-muted); font-size: 13px; }
.prototype-title-note { display: inline-flex; margin-left: 12px; padding-left: 12px; border-left: 1px solid #dbe5df; color: #8c9d95; }
.prototype-header-actions { display: flex; align-items: center; gap: 8px; }
.quiet-action, .filter-button, .icon-action, .row-more { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--proto-line); background: #fff; color: #5e756a; border-radius: 6px; min-height: 34px; padding: 0 11px; cursor: pointer; font-size: 12px; transition: border-color .18s, color .18s, background .18s; }
.quiet-action:hover, .filter-button:hover, .icon-action:hover, .row-more:hover { color: var(--proto-accent); border-color: #9cc5b4; background: #f7fbf8; }
.operator-chip { display: flex; align-items: center; gap: 8px; margin-left: 8px; padding-left: 14px; border-left: 1px solid var(--proto-line); color: #698078; }
.operator-chip span:not(.operator-avatar) { display: grid; gap: 2px; }
.operator-chip b { color: #2c4a3e; font-size: 12px; font-weight: 600; }
.operator-chip small { color: #93a39c; font-size: 10px; }
.operator-avatar { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; color: #286a52; background: #dff0e6; font-size: 12px; font-weight: 700; }
.prototype-body { display: grid; grid-template-columns: 206px minmax(0, 1fr); gap: 24px; align-items: start; }
.prototype-sidebar { min-height: 680px; padding: 7px; background: #fbfdfc; border: 1px solid var(--proto-line); border-radius: 10px; }
.prototype-sidebar-label { padding: 11px 12px 8px; color: #97a69f; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
.prototype-nav-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 38px; margin: 2px 0; padding: 0 11px; border: 0; border-radius: 6px; color: #6d8278; background: transparent; text-align: left; cursor: pointer; font-size: 12px; }
.prototype-nav-item span { flex: 1; }
.prototype-nav-item small { min-width: 19px; padding: 2px 5px; border-radius: 9px; color: #b94f4c; background: #fdebea; text-align: center; font-size: 10px; }
.prototype-nav-item:hover { background: #f1f7f3; color: var(--proto-accent); }
.prototype-nav-item.active { color: #236b52; background: #e6f2eb; font-weight: 600; }
.prototype-sidebar-divider { height: 1px; margin: 16px 8px; background: var(--proto-line); }
.prototype-sidebar-card { display: grid; gap: 6px; margin: 0 7px; padding: 13px; border: 1px solid #dceae1; border-radius: 7px; background: #f4faf6; }
.sidebar-card-head { display: flex; align-items: center; gap: 7px; color: #43816a; font-size: 11px; }
.status-pulse { width: 7px; height: 7px; border-radius: 50%; background: #3d9f76; box-shadow: 0 0 0 4px #d7eee0; }
.prototype-sidebar-card strong { font-size: 19px; letter-spacing: .02em; }
.prototype-sidebar-card > span { color: #8c9c94; font-size: 10px; }
.prototype-sidebar-foot { display: flex; align-items: center; gap: 8px; margin: 16px 6px 4px; padding: 9px 7px; color: #85948e; font-size: 11px; }
.prototype-sidebar-foot span { margin-left: auto; color: #afbab5; font-family: monospace; font-size: 10px; }
.prototype-content { min-width: 0; }
.prototype-section { min-width: 0; }
.section-toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; }
.section-toolbar h2 { margin: 7px 0 6px; font-size: 20px; letter-spacing: -.01em; }
.section-toolbar p { margin: 0; color: var(--proto-muted); font-size: 12px; }
.primary-action { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 35px; padding: 0 13px; border: 1px solid #24745e; border-radius: 6px; color: #fff; background: #24745e; box-shadow: 0 3px 8px #24745e1f; cursor: pointer; font-size: 12px; transition: background .18s, transform .18s; }
.primary-action:hover { background: #1d624e; transform: translateY(-1px); }
.filter-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 14px; }
.search-field { display: flex; align-items: center; gap: 8px; width: 250px; min-height: 35px; padding: 0 11px; border: 1px solid var(--proto-line); border-radius: 6px; color: #9aa9a2; background: #fff; }
.search-field.wide { width: 310px; }
.search-field input { width: 100%; border: 0; outline: none; color: #395a4d; background: transparent; font-size: 12px; }
.filter-result { margin-left: auto; color: #91a099; font-size: 11px; }
.data-panel { border: 1px solid var(--proto-line); border-radius: 8px; background: #fff; overflow: hidden; }
.panel-head, .table-head { display: flex; justify-content: space-between; align-items: center; min-height: 47px; padding: 0 17px; border-bottom: 1px solid #edf2ee; color: #6c8077; font-size: 11px; }
.panel-head span:first-child, .table-head span:first-child { color: #375b4b; font-size: 12px; font-weight: 600; }
.definition-layout, .instance-layout, .operations-layout, .history-layout, .validation-layout { display: grid; grid-template-columns: minmax(330px, .9fr) minmax(420px, 1.35fr); gap: 14px; }
.definition-list-panel, .instance-list-panel, .incident-panel, .history-list { min-width: 0; }
.definition-row, .instance-row, .incident-row, .history-row { display: flex; align-items: center; gap: 11px; width: 100%; min-height: 72px; padding: 12px 16px; border: 0; border-bottom: 1px solid #edf2ee; background: #fff; text-align: left; cursor: pointer; }
.definition-row:last-child, .instance-row:last-child, .incident-row:last-child, .history-row:last-child { border-bottom: 0; }
.definition-row:hover, .instance-row:hover, .incident-row:hover, .history-row:hover, .definition-row.selected, .instance-row.selected, .incident-row.selected { background: #f7fbf8; }
.definition-icon, .history-icon { display: grid; place-items: center; width: 32px; height: 32px; flex: 0 0 auto; border-radius: 7px; color: #33775e; background: #e6f2eb; }
.definition-main, .instance-main { display: grid; gap: 4px; min-width: 0; flex: 1; }
.definition-main strong, .instance-main strong, .incident-row strong, .history-row strong { overflow: hidden; color: #345647; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.definition-main span, .instance-main span, .incident-row small, .history-row span { overflow: hidden; color: #94a39c; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.definition-version, .instance-state, .history-date { display: grid; gap: 4px; min-width: 63px; justify-items: end; text-align: right; }
.definition-version b, .instance-state b, .history-date b { color: #507163; font-size: 11px; font-weight: 600; }
.definition-version small, .instance-state small, .history-date small { color: #9aa8a1; font-size: 10px; }
.definition-version small.muted { color: #bd7b2d; }
.detail-topline, .instance-detail-head, .report-head { display: flex; justify-content: space-between; gap: 16px; padding: 20px 20px 16px; }
.detail-topline h3, .instance-detail-head h3, .report-head h3 { margin: 6px 0 5px; color: #294c3e; font-size: 17px; font-weight: 600; }
.detail-topline h3 span, .instance-detail-head h3 span, .report-head h3 span { color: #88a096; font-size: 12px; font-weight: 500; }
code, .mono { color: #84988f; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 10px; }
.icon-action { min-width: 32px; padding: 0; border-color: transparent; }
.definition-metrics, .instance-summary, .retry-meta, .task-summary, .ops-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin: 0 20px 18px; border: 1px solid #e8efeb; border-radius: 6px; overflow: hidden; background: #e8efeb; }
.definition-metrics > div, .instance-summary > div, .retry-meta > div, .task-summary > div, .ops-summary > div { display: grid; gap: 7px; padding: 13px 14px; background: #fbfdfc; }
.definition-metrics span, .instance-summary span, .retry-meta span, .task-summary span, .ops-summary span { color: #8da097; font-size: 10px; }
.definition-metrics b, .instance-summary b, .retry-meta b, .task-summary b, .ops-summary b { color: #3c6252; font-size: 14px; font-weight: 600; }
.danger-text { color: var(--proto-danger) !important; }
.mini-diagram { display: flex; align-items: center; padding: 18px 20px 20px; overflow-x: auto; background: #f7faf8; }
.mini-node { flex: 0 0 auto; padding: 8px 10px; border: 1px solid #d5e0da; border-radius: 5px; color: #7d9187; background: #fff; font-size: 10px; white-space: nowrap; }
.mini-node.done { color: #2f7d61; border-color: #a7d2bc; background: #eef8f1; }
.mini-node.active { color: #b57929; border-color: #e2c28e; background: #fff8e9; }
.mini-line { flex: 1 0 18px; height: 1px; min-width: 18px; background: #cdd9d1; }
.mini-line.done-line { background: #7ab69b; }
.detail-tabs { display: flex; gap: 18px; padding: 0 20px; border-bottom: 1px solid #edf2ee; }
.detail-tabs button { padding: 11px 0; border: 0; border-bottom: 2px solid transparent; color: #96a59e; background: transparent; cursor: pointer; font-size: 11px; }
.detail-tabs button.active { border-color: var(--proto-accent); color: #2c6d53; font-weight: 600; }
.detail-meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px 24px; padding: 18px 20px 22px; }
.detail-meta-grid div { display: grid; gap: 5px; }
.detail-meta-grid span { color: #94a39b; font-size: 10px; }
.detail-meta-grid b { color: #557367; font-size: 11px; font-weight: 500; }
.instance-status { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: #9aa9a2; }
.instance-status.running { background: #3c9c74; box-shadow: 0 0 0 4px #e0f1e7; }
.instance-status.success { background: #8cbba3; }
.instance-status.paused { background: #c28a3c; }
.instance-alert { color: #c85b55; }
.status-tag { display: inline-flex; align-items: center; align-self: flex-start; padding: 5px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
.status-tag.green { color: #2e7a5c; background: #e9f5ed; }
.status-tag.gray { color: #7d8e86; background: #f0f3f1; }
.status-tag.red { color: #b44d49; background: #fcedeb; }
.instance-detail-head > div { display: grid; gap: 4px; }
.instance-detail-head > div > span { color: #8d9e95; font-size: 10px; }
.instance-summary { grid-template-columns: repeat(3, 1fr); }
.instance-detail-panel .prototype-flow { margin: 0 20px 18px; }
.timeline-row { display: flex; align-items: center; gap: 11px; padding: 11px 20px; border-bottom: 1px solid #f0f3f1; }
.timeline-row > div { display: grid; gap: 4px; flex: 1; }
.timeline-row b { color: #4f6e60; font-size: 11px; }
.timeline-row span { color: #9baaa3; font-size: 10px; }
.timeline-row > strong { color: #86a097; font-size: 10px; font-weight: 500; }
.timeline-dot { width: 8px; height: 8px; border-radius: 50%; background: #d0d9d4; }
.timeline-dot.done { background: #53a780; box-shadow: 0 0 0 4px #e2f2e8; }
.timeline-dot.active { background: #d18a2e; box-shadow: 0 0 0 4px #fff0d8; }
.active-text { color: #bd7b2d !important; }
.task-summary { grid-template-columns: repeat(3, 1fr); margin: 0 0 16px; }
.task-summary > div { min-height: 82px; }
.task-summary b { font-size: 24px; }
.task-summary small { color: #9aa9a2; font-size: 10px; }
.table-panel { overflow-x: auto; }
.table-row { display: grid; grid-template-columns: 1.2fr 1.05fr 1fr .8fr .7fr 34px; align-items: center; gap: 13px; min-width: 740px; min-height: 59px; padding: 0 17px; border-bottom: 1px solid #edf2ee; color: #667c71; font-size: 11px; }
.table-row:last-child { border-bottom: 0; }
.table-row > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.table-row b { display: block; color: #466858; font-size: 11px; font-weight: 600; }
.table-row small { display: block; margin-top: 4px; color: #9cabA4; font-size: 9px; }
.table-row-head { min-height: 43px; color: #9aa9a2; background: #fbfdfc; font-size: 10px; }
.row-more { min-width: 28px; padding: 0; border-color: transparent; }
.table-state { display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: #b8c3bd; }
.table-state.green { background: #4c9d76; }
.table-state.orange { background: #ca862d; }
.ops-summary { grid-template-columns: minmax(220px, 1.5fr) repeat(3, 1fr); margin: 0 0 16px; }
.ops-summary-main { display: flex !important; align-items: center; gap: 11px; color: #bc5a55; background: #fff8f7 !important; }
.ops-summary-main div { display: grid; gap: 4px; }
.ops-summary-main b { color: #a84e4a; font-size: 13px; }
.ops-summary-main span { color: #bd8d8a; font-size: 10px; }
.incident-row { gap: 12px; }
.severity-bar { width: 3px; height: 32px; border-radius: 3px; background: #a9b7af; }
.severity-bar.high { background: #c75953; }
.severity-bar.medium { background: #ca862d; }
.severity-bar.low { background: #78a991; }
.incident-row > div { display: grid; gap: 5px; flex: 1; min-width: 0; }
.incident-severity { color: #a17643; font-size: 10px; }
.error-box { display: flex; gap: 10px; margin: 0 20px 18px; padding: 13px; border: 1px solid #f0d4d1; border-radius: 6px; color: #ba5a54; background: #fff7f6; }
.error-box div { display: grid; gap: 5px; }
.error-box b { color: #a64e49; font-size: 11px; }
.error-box span { color: #c1827e; font-size: 10px; line-height: 1.6; }
.retry-meta { grid-template-columns: repeat(3, 1fr); margin-bottom: 20px; }
.detail-actions { display: flex; gap: 8px; padding: 0 20px 20px; }
.history-icon.success { color: #3b8d6b; background: #e6f4ec; }
.history-icon.danger { color: #bd5a54; background: #fdeceb; }
.history-icon.active { color: #b77c31; background: #fff4de; }
.history-row > div:nth-child(2) { display: grid; gap: 5px; flex: 1; min-width: 0; }
.history-date { min-width: 75px; }
.history-date b { color: #4e7162; }
.history-timeline { padding: 18px 22px 24px 30px; }
.history-point { position: relative; display: grid; grid-template-columns: 18px 1fr; gap: 10px; min-height: 58px; }
.history-point::before { position: absolute; top: 13px; bottom: -11px; left: 4px; width: 1px; background: #dbe6df; content: ''; }
.history-point:last-child::before { display: none; }
.history-point > span { z-index: 1; width: 9px; height: 9px; margin-top: 5px; border: 2px solid #fff; border-radius: 50%; background: #58a47d; box-shadow: 0 0 0 1px #9bcbb1; }
.history-point > div { display: grid; gap: 4px; }
.history-point b { color: #557467; font-size: 11px; }
.history-point small { color: #95a49c; font-size: 10px; }
.validation-scenarios { display: grid; gap: 9px; }
.scenario-card { display: flex; align-items: center; gap: 12px; width: 100%; padding: 15px; border: 1px solid var(--proto-line); border-radius: 8px; color: #5e756a; background: #fff; text-align: left; cursor: pointer; }
.scenario-card:hover { border-color: #a4cab7; background: #f9fcfa; }
.scenario-card > div:nth-child(2) { display: grid; gap: 5px; flex: 1; }
.scenario-card strong { color: #426656; font-size: 12px; }
.scenario-card span, .scenario-card small { color: #99a8a0; font-size: 10px; }
.scenario-mark { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 7px; }
.scenario-mark.green { color: #3b8e6a; background: #e8f5ed; }
.scenario-mark.gray { color: #9aa8a0; background: #f0f3f1; }
.report-head { align-items: flex-start; border-bottom: 1px solid #edf2ee; }
.report-head > div { display: grid; gap: 5px; }
.report-head span { color: #94a39c; font-size: 10px; }
.assertion-list { padding: 4px 20px 10px; }
.assertion-list > div { display: flex; align-items: center; gap: 8px; padding: 11px 0; border-bottom: 1px solid #f0f3f1; color: #4d6e5f; font-size: 11px; }
.assertion-list > div:last-child { border-bottom: 0; }
.assertion-list svg { color: #42a177; }
.assertion-list span { flex: 1; }
.assertion-list b { color: #42a177; font-size: 10px; font-weight: 500; }
.report-foot { display: flex; flex-wrap: wrap; gap: 14px 24px; padding: 14px 20px; border-top: 1px solid #edf2ee; color: #8d9d95; font-size: 10px; }
.report-foot b { margin-right: 4px; color: #647f72; font-weight: 600; }
.audit-scope { display: flex; align-items: center; gap: 11px; margin-bottom: 16px; padding: 12px 15px; border: 1px solid #dce9e1; border-radius: 7px; background: #f5faf7; }
.scope-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 7px; color: #387e62; background: #e2f2e9; }
.audit-scope > div:nth-child(2) { display: grid; gap: 4px; flex: 1; }
.audit-scope b { color: #426656; font-size: 11px; }
.audit-scope span { color: #91a198; font-size: 10px; }
.prototype-toast { position: fixed; right: 28px; bottom: 82px; z-index: 20; display: inline-flex; align-items: center; gap: 8px; padding: 10px 13px; border: 1px solid #cde4d5; border-radius: 7px; color: #39775c; background: #f1faf4; box-shadow: 0 10px 32px #21513c1a; font-size: 12px; }
.prototype-switcher { position: fixed; left: 50%; bottom: 17px; z-index: 30; display: flex; align-items: center; gap: 11px; transform: translateX(-50%); padding: 6px 8px; border: 1px solid #cad7cf; border-radius: 9px; background: #183d35; box-shadow: 0 12px 30px #153b302b; }
.prototype-switcher button { display: grid; place-items: center; width: 29px; height: 29px; border: 0; border-radius: 5px; color: #c6ded2; background: transparent; cursor: pointer; }
.prototype-switcher button:hover { color: #fff; background: #2a5a4a; }
.prototype-switcher div { display: grid; gap: 2px; min-width: 118px; text-align: center; }
.prototype-switcher span { color: #87a89a; font-size: 9px; }
.prototype-switcher b { color: #f1f7f3; font-size: 11px; font-weight: 500; }
.dialog-copy { display: grid; gap: 16px; }
.dialog-file { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid #dce9e1; border-radius: 6px; color: #3f6a57; background: #f6fbf7; }
.dialog-file > div { display: grid; gap: 4px; flex: 1; }
.dialog-file b { font-size: 12px; }
.dialog-file span { color: #91a198; font-size: 10px; }
.dialog-success { color: #429a71; }
.dialog-field { display: grid; gap: 7px; }
.dialog-field label { color: #7b8e85; font-size: 11px; }
.dialog-select, .retry-number { display: flex; align-items: center; justify-content: space-between; min-height: 35px; padding: 0 10px; border: 1px solid #dfe8e2; border-radius: 5px; color: #547366; background: #fff; font-size: 12px; }
.dialog-copy p { display: flex; gap: 6px; align-items: flex-start; margin: 0; color: #899990; font-size: 11px; line-height: 1.6; }
.retry-warning { display: flex; gap: 9px; padding: 12px; border: 1px solid #efd9b6; border-radius: 6px; color: #b3782c; background: #fff9ee; }
.retry-warning div { display: grid; gap: 4px; }
.retry-warning b { color: #a56d29; font-size: 12px; }
.retry-warning span { color: #bd9660; font-size: 10px; }
.dialog-field textarea { resize: vertical; padding: 9px 10px; border: 1px solid #dfe8e2; border-radius: 5px; outline: none; color: #4f6d60; font-size: 12px; }
@media (max-width: 1100px) { .prototype-body { grid-template-columns: 176px minmax(0, 1fr); } .prototype-strip-meta span:nth-child(2), .prototype-strip-meta span:nth-child(3) { display: none; } .definition-layout, .instance-layout, .operations-layout, .history-layout, .validation-layout { grid-template-columns: 1fr; } .definition-detail-panel, .instance-detail-panel, .incident-detail, .history-detail, .validation-report { min-height: auto; } }
@media (max-width: 760px) { .prototype-strip { align-items: flex-start; flex-direction: column; } .prototype-strip-meta { gap: 10px; } .prototype-header { flex-direction: column; padding: 23px 0; } .prototype-header-actions { width: 100%; flex-wrap: wrap; } .prototype-body { grid-template-columns: 1fr; } .prototype-sidebar { min-height: 0; display: flex; gap: 2px; overflow-x: auto; padding: 6px; } .prototype-sidebar-label, .prototype-sidebar-divider, .prototype-sidebar-card, .prototype-sidebar-foot { display: none; } .prototype-nav-item { flex: 0 0 auto; width: auto; white-space: nowrap; } .prototype-nav-item span { flex: 0 0 auto; } .prototype-nav-item small { display: none; } .prototype-title-note { display: block; margin: 7px 0 0; padding: 0; border-left: 0; } .section-toolbar { flex-direction: column; } .filter-result { margin-left: 0; } .detail-meta-grid { grid-template-columns: 1fr; } .ops-summary { grid-template-columns: 1fr 1fr; } .ops-summary-main { grid-column: 1 / -1; } .prototype-switcher { bottom: 9px; } .prototype-switcher div { min-width: 104px; } }
</style>
