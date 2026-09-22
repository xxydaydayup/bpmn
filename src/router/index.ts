import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: AppLayout,
      redirect: '/table',
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
          meta: { title: 'Camunda 7 引擎联调' },
        },
        {
          path: 'camunda-validation',
          name: 'camunda-validation',
          component: () => import('@/views/CamundaValidationView.vue'),
          meta: { title: '流程验证' },
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

router.afterEach((to) => {
  document.title = `${String(to.meta.title ?? '首页')} · 流程工作台`
})

export default router
