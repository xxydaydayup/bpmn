<script setup lang="ts">
import { computed } from 'vue'

type NavPage = 'instances' | 'operations' | 'definitions' | 'validation'

const props = withDefaults(defineProps<{ variant?: string }>(), {
  variant: 'A',
})

const emit = defineEmits<{
  (event: 'navigate', page: NavPage): void
}>()

const activeVariant = computed(() => {
  const value = props.variant?.toUpperCase()
  return value === 'B' || value === 'C' ? value : 'A'
})

const stats = [
  { label: '运行实例', value: '128', note: '当前在 Camunda 中运行', tone: 'teal', trend: '+12.4%' },
  { label: '待处理异常', value: '3', note: '需要运维关注', tone: 'amber', trend: '2 个高优先级' },
  { label: '今日完成', value: '86', note: '过去 24 小时', tone: 'green', trend: '+8.1%' },
  { label: '已部署定义', value: '12', note: '3 个租户 · 8 个 key', tone: 'slate', trend: '全部可用' },
]

const exceptions = [
  {
    title: 'Job 重试次数耗尽',
    detail: '采购审批 · payment-service',
    time: '12 分钟前',
    severity: '高',
    severityClass: 'critical',
  },
  {
    title: 'External Task 未锁定',
    detail: '费用报销 · notify-applicant',
    time: '34 分钟前',
    severity: '中',
    severityClass: 'warning',
  },
  {
    title: '流程定义已挂起',
    detail: '请假审批 · v4',
    time: '昨天 18:05',
    severity: '提示',
    severityClass: 'info',
  },
]

const distribution = [
  { name: '采购审批', key: 'purchase-approval', running: 42, share: 76, color: 'teal' },
  { name: '请假审批', key: 'leave-request', running: 28, share: 52, color: 'blue' },
  { name: '费用报销', key: 'expense-reimbursement', running: 19, share: 35, color: 'green' },
]

const releases = [
  { name: '采购审批', version: 'v12', time: '今天 15:32', author: '平台管理员', status: '已部署' },
  { name: '费用报销', version: 'v6', time: '昨天 18:05', author: '流程管理员', status: '已部署' },
]

function go(page: NavPage) {
  emit('navigate', page)
}
</script>

<template>
  <section class="overview-content" :class="`variant-${activeVariant.toLowerCase()}`">
    <div class="demo-strip" role="note">
      <span class="demo-dot" aria-hidden="true"></span>
      设计预览 · 演示数据，不访问 Camunda 接口
    </div>

    <div class="metric-grid" aria-label="运行摘要">
      <article v-for="stat in stats" :key="stat.label" class="metric-card" :class="`metric-${stat.tone}`">
        <div class="metric-topline">
          <span class="metric-label">{{ stat.label }}</span>
          <span class="metric-trend">{{ stat.trend }}</span>
        </div>
        <div class="metric-value">{{ stat.value }}</div>
        <div class="metric-note">{{ stat.note }}</div>
      </article>
    </div>

    <div class="primary-grid">
      <article class="surface-card trend-card">
        <div class="card-heading">
          <div>
            <h2>运行趋势</h2>
            <p>近 7 日流程实例变化</p>
          </div>
          <button class="text-action" type="button" @click="go('instances')">查看实例 <span aria-hidden="true">›</span></button>
        </div>
        <div class="chart-wrap">
          <svg class="trend-chart" viewBox="0 0 640 250" role="img" aria-label="近七日运行实例趋势图">
            <title>近七日运行实例趋势图</title>
            <defs>
              <linearGradient id="overviewTrendFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stop-color="#2f9476" stop-opacity="0.22" />
                <stop offset="1" stop-color="#2f9476" stop-opacity="0" />
              </linearGradient>
            </defs>
            <g class="chart-grid">
              <line x1="52" y1="36" x2="616" y2="36" />
              <line x1="52" y1="86" x2="616" y2="86" />
              <line x1="52" y1="136" x2="616" y2="136" />
              <line x1="52" y1="186" x2="616" y2="186" />
            </g>
            <g class="chart-labels">
              <text x="18" y="41">160</text>
              <text x="18" y="91">120</text>
              <text x="25" y="141">80</text>
              <text x="25" y="191">40</text>
              <text x="60" y="224">09/18</text>
              <text x="148" y="224">09/19</text>
              <text x="236" y="224">09/20</text>
              <text x="324" y="224">09/21</text>
              <text x="412" y="224">09/22</text>
              <text x="500" y="224">09/23</text>
              <text x="575" y="224">今天</text>
            </g>
            <path class="trend-area" d="M62 157 L150 139 L238 147 L326 112 L414 123 L502 77 L590 63 L590 194 L62 194 Z" />
            <polyline class="trend-line" points="62,157 150,139 238,147 326,112 414,123 502,77 590,63" />
            <g class="trend-points">
              <circle cx="62" cy="157" r="4" />
              <circle cx="150" cy="139" r="4" />
              <circle cx="238" cy="147" r="4" />
              <circle cx="326" cy="112" r="4" />
              <circle cx="414" cy="123" r="4" />
              <circle cx="502" cy="77" r="4" />
              <circle cx="590" cy="63" r="5" />
            </g>
          </svg>
        </div>
        <div class="chart-footer">
          <span><i class="legend-swatch"></i>运行中实例</span>
          <strong>今日峰值 148</strong>
        </div>
      </article>

      <article class="surface-card exception-card">
        <div class="card-heading">
          <div>
            <h2>待处理事项</h2>
            <p>需要运维人员关注的引擎状态</p>
          </div>
          <button class="text-action" type="button" @click="go('operations')">全部异常 <span aria-hidden="true">›</span></button>
        </div>
        <div class="exception-list">
          <button v-for="item in exceptions" :key="item.title" class="exception-row" type="button" @click="go('operations')">
            <span class="severity-mark" :class="item.severityClass" aria-hidden="true"></span>
            <span class="exception-copy">
              <strong>{{ item.title }}</strong>
              <small>{{ item.detail }}</small>
            </span>
            <span class="exception-meta">
              <em :class="item.severityClass">{{ item.severity }}</em>
              <small>{{ item.time }}</small>
            </span>
            <span class="row-arrow" aria-hidden="true">›</span>
          </button>
        </div>
      </article>
    </div>

    <div class="secondary-grid">
      <article class="surface-card distribution-card">
        <div class="card-heading">
          <div>
            <h2>定义运行分布</h2>
            <p>当前运行中的实例，按流程定义统计</p>
          </div>
          <button class="text-action" type="button" @click="go('definitions')">流程定义 <span aria-hidden="true">›</span></button>
        </div>
        <div class="distribution-list">
          <button v-for="item in distribution" :key="item.key" class="distribution-row" type="button" @click="go('definitions')">
            <span class="distribution-name">
              <strong>{{ item.name }}</strong>
              <small>{{ item.key }}</small>
            </span>
            <span class="distribution-bar" aria-hidden="true"><i :class="`bar-${item.color}`" :style="{ width: `${item.share}%` }"></i></span>
            <strong class="distribution-count">{{ item.running }}</strong>
            <span class="row-arrow" aria-hidden="true">›</span>
          </button>
        </div>
      </article>

      <article class="surface-card release-card">
        <div class="card-heading">
          <div>
            <h2>近期发布</h2>
            <p>最近部署到当前环境的流程版本</p>
          </div>
          <button class="text-action" type="button" @click="go('definitions')">部署记录 <span aria-hidden="true">›</span></button>
        </div>
        <div class="release-list">
          <button v-for="release in releases" :key="`${release.name}-${release.version}`" class="release-row" type="button" @click="go('definitions')">
            <span class="release-icon" aria-hidden="true">↗</span>
            <span class="release-copy">
              <strong>{{ release.name }} <b>{{ release.version }}</b></strong>
              <small>{{ release.author }} · {{ release.time }}</small>
            </span>
            <span class="release-status">{{ release.status }}</span>
          </button>
        </div>
      </article>
    </div>

    <div class="overview-footer">
      <span>当前环境：开发环境</span>
      <span class="footer-separator" aria-hidden="true">·</span>
      <span>租户：平台默认租户</span>
      <span class="footer-separator" aria-hidden="true">·</span>
      <span>最近刷新：刚刚</span>
    </div>
  </section>
</template>

<style scoped>
.overview-content {
  --ink: #17382f;
  --muted: #71837b;
  --line: #e5ece8;
  --soft: #f7faf8;
  --teal: #24745e;
  color: var(--ink);
}

.demo-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  margin: 0 0 18px auto;
  color: #637a70;
  font-size: 12px;
}

.demo-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #a9baad;
  box-shadow: 0 0 0 3px #e9f0eb;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.metric-card,
.surface-card {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 5px 18px rgba(23, 56, 47, 0.035);
}

.metric-card {
  min-height: 137px;
  padding: 20px 20px 17px;
  border-top: 3px solid var(--metric-accent, #2f9476);
}

.metric-teal { --metric-accent: #2f9476; }
.metric-amber { --metric-accent: #d19a37; }
.metric-green { --metric-accent: #55a57b; }
.metric-slate { --metric-accent: #7b9b90; }

.metric-topline,
.card-heading,
.chart-footer,
.overview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.metric-label {
  color: #61766b;
  font-size: 13px;
}

.metric-trend {
  color: var(--metric-accent, var(--teal));
  font-size: 11px;
  white-space: nowrap;
}

.metric-value {
  margin-top: 13px;
  color: #183d32;
  font-size: 33px;
  font-weight: 600;
  letter-spacing: -1px;
  line-height: 1;
}

.metric-note {
  margin-top: 12px;
  color: #8a9a92;
  font-size: 12px;
}

.primary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.32fr) minmax(340px, 0.88fr);
  gap: 14px;
  margin-top: 14px;
}

.secondary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.32fr) minmax(340px, 0.88fr);
  gap: 14px;
  margin-top: 14px;
}

.surface-card {
  min-width: 0;
  overflow: hidden;
}

.card-heading {
  padding: 20px 22px 17px;
  border-bottom: 1px solid #edf2ef;
}

.card-heading h2 {
  margin: 0;
  color: #23483c;
  font-size: 15px;
  font-weight: 600;
}

.card-heading p {
  margin: 6px 0 0;
  color: #83938c;
  font-size: 12px;
}

.text-action {
  flex: none;
  padding: 3px 0;
  border: 0;
  background: transparent;
  color: #2e846b;
  cursor: pointer;
  font-size: 12px;
}

.text-action:hover,
.text-action:focus-visible {
  color: #1b5d4b;
  text-decoration: underline;
  outline: none;
}

.chart-wrap {
  padding: 16px 20px 0;
}

.trend-chart {
  display: block;
  width: 100%;
  min-height: 245px;
}

.chart-grid line {
  stroke: #edf2ef;
  stroke-width: 1;
}

.chart-labels text {
  fill: #9aa9a2;
  font-size: 10px;
}

.trend-area {
  fill: url(#overviewTrendFill);
}

.trend-line {
  fill: none;
  stroke: #2f9476;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
}

.trend-points circle {
  fill: #fff;
  stroke: #2f9476;
  stroke-width: 3;
}

.chart-footer {
  padding: 0 22px 18px;
  color: #8a9a92;
  font-size: 11px;
}

.chart-footer span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.chart-footer strong {
  color: #5f776c;
  font-weight: 500;
}

.legend-swatch {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2f9476;
}

.exception-list,
.distribution-list,
.release-list {
  padding: 4px 0;
}

.exception-row,
.distribution-row,
.release-row {
  display: grid;
  align-items: center;
  width: 100%;
  border: 0;
  border-bottom: 1px solid #f0f3f1;
  background: #fff;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.exception-row:last-child,
.distribution-row:last-child,
.release-row:last-child {
  border-bottom: 0;
}

.exception-row {
  grid-template-columns: 10px minmax(0, 1fr) auto 14px;
  gap: 11px;
  min-height: 79px;
  padding: 13px 20px;
}

.exception-row:hover,
.exception-row:focus-visible,
.distribution-row:hover,
.distribution-row:focus-visible,
.release-row:hover,
.release-row:focus-visible {
  background: #f8fbf9;
  outline: none;
}

.severity-mark {
  align-self: start;
  width: 7px;
  height: 7px;
  margin-top: 6px;
  border-radius: 50%;
}

.severity-mark.critical,
.exception-meta em.critical { background: #d05a4a; color: #a74134; }
.severity-mark.warning,
.exception-meta em.warning { background: #d69a37; color: #a46f1e; }
.severity-mark.info,
.exception-meta em.info { background: #7a9e91; color: #527568; }

.exception-copy,
.release-copy,
.distribution-name {
  min-width: 0;
}

.exception-copy strong,
.release-copy strong,
.distribution-name strong {
  display: block;
  overflow: hidden;
  color: #34564a;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exception-copy small,
.release-copy small,
.distribution-name small {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: #91a097;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exception-meta {
  display: grid;
  justify-items: end;
  gap: 6px;
  white-space: nowrap;
}

.exception-meta em {
  padding: 2px 6px;
  border-radius: 3px;
  background: #f3f6f4;
  font-size: 10px;
  font-style: normal;
}

.exception-meta small {
  color: #9aa79f;
  font-size: 10px;
}

.row-arrow {
  color: #9aae9f;
  font-size: 20px;
  font-weight: 300;
  line-height: 1;
}

.distribution-row {
  grid-template-columns: minmax(120px, 1.1fr) minmax(100px, 1.5fr) 34px 14px;
  gap: 14px;
  min-height: 76px;
  padding: 11px 22px;
}

.distribution-bar {
  height: 7px;
  overflow: hidden;
  border-radius: 8px;
  background: #edf3ef;
}

.distribution-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.bar-teal { background: #3f987d; }
.bar-blue { background: #7d9eaf; }
.bar-green { background: #8bb28b; }

.distribution-count {
  color: #385e50;
  font-size: 15px;
  font-weight: 600;
  text-align: right;
}

.release-row {
  grid-template-columns: 31px minmax(0, 1fr) auto;
  gap: 10px;
  min-height: 76px;
  padding: 11px 20px;
}

.release-icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid #cce1d6;
  border-radius: 6px;
  background: #f1f8f3;
  color: #2f8067;
  font-size: 15px;
}

.release-copy b {
  margin-left: 5px;
  color: #729083;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 11px;
  font-weight: 500;
}

.release-status {
  padding: 4px 7px;
  border-radius: 3px;
  background: #edf7f1;
  color: #357d61;
  font-size: 10px;
  white-space: nowrap;
}

.overview-footer {
  justify-content: flex-start;
  margin: 14px 2px 0;
  color: #9aa9a2;
  font-size: 11px;
}

.footer-separator {
  color: #c1ccc6;
}

/* Variant B makes the exception queue a horizontal attention strip before the trend. */
.variant-b .primary-grid {
  display: flex;
  flex-direction: column;
}

.variant-b .exception-card {
  order: -1;
}

.variant-b .exception-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 0;
}

.variant-b .exception-row {
  min-height: 92px;
  border-right: 1px solid #f0f3f1;
  border-bottom: 0;
}

.variant-b .exception-row:last-child {
  border-right: 0;
}

/* Variant C puts the exception queue first and keeps the trend as a compact side rail. */
.variant-c .primary-grid {
  grid-template-areas: 'exceptions trend';
  grid-template-columns: minmax(0, 1fr) 320px;
  align-items: start;
}

.variant-c .exception-card { grid-area: exceptions; }
.variant-c .trend-card { grid-area: trend; }
.variant-c .trend-chart { min-height: 182px; }
.variant-c .chart-wrap { padding-inline: 12px; }
.variant-c .chart-footer { align-items: flex-start; flex-direction: column; gap: 5px; }
.variant-c .exception-row { min-height: 88px; }

@media (max-width: 1080px) {
  .primary-grid,
  .secondary-grid,
  .variant-c .primary-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: none;
  }

  .variant-c .exception-card,
  .variant-c .trend-card {
    grid-area: auto;
  }
}

@media (max-width: 820px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .variant-b .exception-list {
    grid-template-columns: 1fr;
  }

  .variant-b .exception-row {
    border-right: 0;
    border-bottom: 1px solid #f0f3f1;
  }

  .variant-b .exception-row:last-child {
    border-bottom: 0;
  }
}

@media (max-width: 560px) {
  .demo-strip {
    margin-left: 0;
  }

  .metric-grid {
    gap: 10px;
  }

  .metric-card {
    min-height: 124px;
    padding: 16px;
  }

  .metric-value {
    font-size: 28px;
  }

  .card-heading {
    align-items: flex-start;
    flex-direction: column;
    padding: 17px 16px 14px;
  }

  .chart-wrap {
    padding-inline: 6px;
  }

  .trend-chart {
    min-height: 205px;
  }

  .exception-row {
    grid-template-columns: 8px minmax(0, 1fr) 14px;
    gap: 9px;
    padding-inline: 15px;
  }

  .exception-meta {
    display: none;
  }

  .distribution-row {
    grid-template-columns: minmax(90px, 1fr) minmax(70px, 1fr) 25px 12px;
    gap: 8px;
    padding-inline: 15px;
  }

  .release-row {
    grid-template-columns: 28px minmax(0, 1fr);
    padding-inline: 15px;
  }

  .release-status {
    display: none;
  }

  .overview-footer {
    align-items: flex-start;
    flex-wrap: wrap;
    line-height: 1.6;
  }
}
</style>
