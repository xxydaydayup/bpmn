import { onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRaw, type Ref } from 'vue'
import type { PageQuery, PageResult } from '@/types/table'

interface UseTableOptions<F> {
  initialFilters: F
  pageSize?: number
  immediate?: boolean
}

type TableFetcher<T, F> = (query: PageQuery<F>, signal: AbortSignal) => Promise<PageResult<T>>

export function useTable<T, F extends object>(
  fetcher: TableFetcher<T, F>,
  options: UseTableOptions<F>,
) {
  const initialFilters = structuredClone(toRaw(options.initialFilters))
  const filters = ref(structuredClone(initialFilters)) as Ref<F>
  const rows = shallowRef<T[]>([])
  const loading = ref(false)
  const error = shallowRef<Error | null>(null)
  const pagination = reactive({ page: 1, pageSize: options.pageSize ?? 10, total: 0 })
  let activeController: AbortController | undefined
  let requestId = 0

  async function refresh(): Promise<void> {
    const currentRequestId = ++requestId
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller
    loading.value = true
    error.value = null

    try {
      const result = await fetcher(
        {
          page: pagination.page,
          pageSize: pagination.pageSize,
          filters: structuredClone(toRaw(filters.value)),
        },
        controller.signal,
      )
      // 即使 fetcher 没有响应取消，也不让旧请求覆盖最新结果。
      if (currentRequestId === requestId && !controller.signal.aborted) {
        rows.value = result.list
        pagination.total = result.total
      }
    } catch (cause: unknown) {
      if (currentRequestId === requestId && !controller.signal.aborted) {
        error.value = cause instanceof Error ? cause : new Error(String(cause))
      }
    } finally {
      if (currentRequestId === requestId) {
        loading.value = false
        activeController = undefined
      }
    }
  }

  function search(): Promise<void> {
    pagination.page = 1
    return refresh()
  }

  function reset(): Promise<void> {
    filters.value = structuredClone(initialFilters)
    return search()
  }

  function changePage(page: number): Promise<void> {
    pagination.page = page
    return refresh()
  }

  function changePageSize(pageSize: number): Promise<void> {
    pagination.pageSize = pageSize
    return search()
  }

  onMounted(() => {
    if (options.immediate !== false) void refresh()
  })

  onBeforeUnmount(() => {
    requestId += 1
    activeController?.abort()
    loading.value = false
  })

  return {
    rows,
    loading,
    error,
    pagination,
    filters,
    search,
    reset,
    refresh,
    changePage,
    changePageSize,
  }
}
