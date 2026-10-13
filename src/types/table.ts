export interface PageQuery<F> {
  page: number;
  pageSize: number;
  filters: F;
}

export interface PageResult<T> {
  list: T[];
  total: number;
}

export enum TableColumnWidth {
  Id = 72,
  Compact = 120,
  Month = 120,
  Owner = 100,
  Date = 140,
  Code = 110,
  Medium = 130,
  Actions = 130,
  ProcessNameMin = 140,
  Wide = 150,
  UpdatedAtMin = 175,
  DescriptionMin = 180,
}
