import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { resolveWorkflowRuntime } from '@/config/workflowRuntime'

const workflowRuntime = resolveWorkflowRuntime(import.meta.env)

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: AppLayout,
      redirect: workflowRuntime.businessEnabled ? '/workflow-business' : '/table',
      children: [
        {
          path: 'table',
          name: 'table',
          component: () => import('@/views/TableView.vue'),
          meta: { title: '表格示例' },
        },
        {
          path: 'designer',
          name: 'designer',
          component: () => import('@/views/DesignerView.vue'),
          meta: { title: '流程设计' },
        },
        {
          path: 'camunda',
          name: 'camunda',
          component: () => import('@/views/CamundaRuntimeView.vue'),
          meta: { title: 'Camunda 7 引擎联调', developerOnly: true },
        },
        {
          path: 'camunda-validation',
          name: 'camunda-validation',
          component: () => import('@/views/CamundaValidationView.vue'),
          meta: { title: '流程验证', developerOnly: true },
        },
        {
          path: 'workflow-business',
          name: 'workflow-business',
          component: () => import('@/views/BusinessWorkflowView.vue'),
          meta: { title: '业务流程' },
        },
        {
          path: 'workflow-prototype',
          name: 'workflow-prototype',
          component: () => import('@/views/WorkflowPrototypeView.vue'),
          meta: { title: '控制面原型', developerOnly: true },
        },
        {
          path: 'camunda-console',
          name: 'camunda-console',
          component: () => import('@/views/CamundaConsoleView.vue'),
          meta: { title: 'Camunda 管理台', developerOnly: true },
        },
        {
          path: ':pathMatch(.*)*',
          component: () => import('@/views/NotFoundView.vue'),
          meta: { title: '页面不存在' },
        },
      ],
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  if (to.meta.developerOnly && !workflowRuntime.developerToolsEnabled) {
    return workflowRuntime.businessEnabled ? '/workflow-business' : '/table'
  }
  if (to.name === 'workflow-business' && !workflowRuntime.businessEnabled) return '/table'
})

router.afterEach((to) => {
  document.title = `${String(to.meta.title ?? '首页')} · 流程工作台`
})

export default router
