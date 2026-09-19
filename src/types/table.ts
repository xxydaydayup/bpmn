export interface PageQuery<F> {
  page: number
  pageSize: number
  filters: F
}

export interface PageResult<T> {
  list: T[]
  total: number
}
