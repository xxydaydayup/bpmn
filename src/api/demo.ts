import type { PageQuery, PageResult } from '@/types/table'

export interface ProcessRow {
  id: number
  name: string
  key: string
  category: string
  status: 'draft' | 'published'
  updatedAt: string
}

export interface ProcessFilters {
  keyword: string
  status: '' | ProcessRow['status']
}

const processes: ProcessRow[] = [
  { id: 1, name: '请假申请', key: 'leave_request', category: '人事管理', status: 'published', updatedAt: '2026-09-18 14:30' },
  { id: 2, name: '费用报销', key: 'expense_claim', category: '财务管理', status: 'published', updatedAt: '2026-09-18 11:20' },
  { id: 3, name: '采购审批', key: 'purchase_approval', category: '行政管理', status: 'draft', updatedAt: '2026-09-17 16:45' },
  { id: 4, name: '合同审批', key: 'contract_approval', category: '业务管理', status: 'draft', updatedAt: '2026-09-17 10:10' },
  { id: 5, name: '出差申请', key: 'travel_request', category: '人事管理', status: 'published', updatedAt: '2026-09-16 09:30' },
  { id: 6, name: '用印申请', key: 'seal_request', category: '行政管理', status: 'draft', updatedAt: '2026-09-15 15:00' },
  { id: 7, name: '入职办理', key: 'onboarding', category: '人事管理', status: 'published', updatedAt: '2026-09-15 11:40' },
  { id: 8, name: '付款申请', key: 'payment_request', category: '财务管理', status: 'draft', updatedAt: '2026-09-14 13:20' },
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
