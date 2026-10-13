export enum RenderFunctionType {
  Money = 'money',
  DateTime = 'dateTime',
  Date = 'date',
  Month = 'month',
  Time = 'time',
  Tag = 'tag',
  Link = 'link',
  Select = 'select',
  Tooltip = 'tooltip',
  Status = 'status',
  Enum = 'enum',
}

export interface TableOption {
  value?: string | number
  label: string
  color?: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}

export type TableOptionMap = Record<string, string | TableOption>

export interface TableContext<T extends object> {
  row: T
  value: unknown
  column: DataTableColumn<T>
  rowIndex: number
}

export interface TableButton<T extends object> {
  key: string
  label: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  disabled?: boolean | ((context: TableContext<T>) => boolean)
  hidden?: boolean | ((context: TableContext<T>) => boolean)
  onClick?: (context: TableContext<T>) => void
}

export interface DataTableColumn<T extends object> {
  key: string
  label: string
  prop?: Extract<keyof T, string>
  width?: string | number
  minWidth?: string | number
  align?: 'left' | 'center' | 'right'
  fixed?: 'left' | 'right' | false
  showOverflowTooltip?: boolean
  type?: RenderFunctionType
  options?: TableOption[] | TableOptionMap
  linkAction?: (context: TableContext<T>) => void
  tooltipOptions?: Record<string, unknown>
  formatter?: (context: TableContext<T>) => string | number | boolean | null | undefined
  buttons?: TableButton<T>[]
}
