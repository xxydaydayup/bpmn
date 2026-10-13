import type { TableOption } from '@/components/common/DataTable'
import type { PageQuery, PageResult } from '@/types/table'

export type ProcessStatus = 'draft' | 'published'
export type ProcessPriority = 'low' | 'medium' | 'high'

export interface ProcessRow {
  id: number
  name: string
  key: string
  categoryCode: string
  status: ProcessStatus
  priority: ProcessPriority
  owner: string
  amount: number
  tags: string[]
  startDate: string
  deadlineMonth: string
  runAt: string
  description: string
  docUrl: string
  updatedAt: string
}

export interface ProcessFilters {
  keyword: string
  status: '' | ProcessRow['status']
}

const processes: ProcessRow[] = [
  { id: 1, name: '请假申请', key: 'leave_request', categoryCode: 'hr', status: 'published', priority: 'high', owner: '张伟', amount: 1200.5, tags: ['审批', '人事'], startDate: '2026-09-01', deadlineMonth: '2026-09', runAt: '2026-09-18 08:30:00', description: '员工请假申请与审批流程，支持多级主管审批与假期余额校验。', docUrl: 'https://example.com/leave_request', updatedAt: '2026-09-18 14:30:00' },
  { id: 2, name: '费用报销', key: 'expense_claim', categoryCode: 'finance', status: 'published', priority: 'medium', owner: '李娜', amount: 8500.75, tags: ['财务', '报销'], startDate: '2026-09-05', deadlineMonth: '2026-09', runAt: '2026-09-17 09:15:00', description: '员工差旅与日常费用报销流程，包含发票校验与预算扣减。', docUrl: 'https://example.com/expense_claim', updatedAt: '2026-09-18 11:20:00' },
  { id: 3, name: '采购审批', key: 'purchase_approval', categoryCode: 'admin', status: 'draft', priority: 'high', owner: '王强', amount: 32000, tags: ['审批', '行政'], startDate: '2026-09-10', deadlineMonth: '2026-10', runAt: '2026-09-17 16:45:00', description: '办公物资与服务采购审批流程，按金额分级授权。', docUrl: 'https://example.com/purchase_approval', updatedAt: '2026-09-17 16:45:00' },
  { id: 4, name: '合同审批', key: 'contract_approval', categoryCode: 'biz', status: 'draft', priority: 'medium', owner: '赵敏', amount: 150000, tags: ['审批', '业务'], startDate: '2026-09-08', deadlineMonth: '2026-10', runAt: '2026-09-17 10:10:00', description: '销售与采购合同的法务、财务、管理层联合审批流程。', docUrl: 'https://example.com/contract_approval', updatedAt: '2026-09-17 10:10:00' },
  { id: 5, name: '出差申请', key: 'travel_request', categoryCode: 'hr', status: 'published', priority: 'low', owner: '陈杰', amount: 2600, tags: ['审批', '人事'], startDate: '2026-09-02', deadlineMonth: '2026-09', runAt: '2026-09-16 09:30:00', description: '员工出差申请与行程变更审批流程。', docUrl: 'https://example.com/travel_request', updatedAt: '2026-09-16 09:30:00' },
  { id: 6, name: '用印申请', key: 'seal_request', categoryCode: 'admin', status: 'draft', priority: 'low', owner: '刘洋', amount: 0, tags: ['行政'], startDate: '2026-09-12', deadlineMonth: '2026-09', runAt: '2026-09-15 15:00:00', description: '公司公章与合同专用章的使用申请流程。', docUrl: 'https://example.com/seal_request', updatedAt: '2026-09-15 15:00:00' },
  { id: 7, name: '入职办理', key: 'onboarding', categoryCode: 'hr', status: 'published', priority: 'medium', owner: '孙丽', amount: 500, tags: ['人事'], startDate: '2026-09-14', deadlineMonth: '2026-09', runAt: '2026-09-15 11:40:00', description: '新员工入职、账号开通与设备申领协同流程。', docUrl: 'https://example.com/onboarding', updatedAt: '2026-09-15 11:40:00' },
  { id: 8, name: '付款申请', key: 'payment_request', categoryCode: 'finance', status: 'draft', priority: 'high', owner: '周婷', amount: 48000.5, tags: ['财务', '审批'], startDate: '2026-09-06', deadlineMonth: '2026-10', runAt: '2026-09-14 13:20:00', description: '供应商货款与往来款项的付款申请与复核流程。', docUrl: 'https://example.com/payment_request', updatedAt: '2026-09-14 13:20:00' },
]

// 分类字典：接口返回编码，此处提供编码 → 显示名 的映射。
const categoryCatalog: TableOption[] = [
  { value: 'hr', label: '人事管理' },
  { value: 'finance', label: '财务管理' },
  { value: 'admin', label: '行政管理' },
  { value: 'biz', label: '业务管理' },
]

// 本地数据只用于演示 useTable；接入后端时替换此函数即可。
export async function listProcesses(
  { page, pageSize, filters }: PageQuery<ProcessFilters>,
  signal: AbortSignal,
): Promise<PageResult<ProcessRow>> {
  signal.throwIfAborted()
  const keyword = filters.keyword.trim().toLowerCase()
  const filtered = processes.filter((item) => (
    (!keyword || `${item.name} ${item.key}`.toLowerCase().includes(keyword))
    && (!filters.status || item.status === filters.status)
  ))
  const start = (page - 1) * pageSize
  return { list: filtered.slice(start, start + pageSize), total: filtered.length }
}

// 独立、可取消的字典请求；接入后端时替换为 request 封装。
export async function listCategories(signal: AbortSignal): Promise<TableOption[]> {
  signal.throwIfAborted()
  // 模拟网络延迟，便于观察字典未返回时编码兜底展示。
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 200)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('Aborted'))
    }, { once: true })
  })
  signal.throwIfAborted()
  return categoryCatalog
}
