import type { WorkflowFlow, WorkflowModel, WorkflowNode, WorkflowReminder, WorkflowSubProcessModel, WorkflowValidationIssue } from './types.js'
import { toBpmnCompilerJson, WorkflowModelError } from './validation.js'

/** Reserved within each local scope. Generated IDs are stable within an SDK version. */
export const WORKFLOW_RESERVED_PREFIX = '__wf_'
const bodyBrand: unique symbol = Symbol('WorkflowBody')
type NodeKind = 'approval' | 'countersign' | 'service' | 'receive' | 'timer' | 'end'
type CommonOptions = Pick<WorkflowNode, 'name' | 'bizType' | 'bizJson' | 'x' | 'y' | 'width' | 'height'>
export interface ApprovalOptions extends CommonOptions { assignee?: string; form?: string; bizFormKey?: string; allowTransfer?: boolean; reminder?: WorkflowReminder }
export interface CountersignOptions extends CommonOptions { mode?: 'ALL' | 'ANY' | 'VOTE'; passRate?: string; sequential?: boolean; allowTransfer?: boolean; allowAddSigner?: boolean; form?: string; bizFormKey?: string; reminder?: WorkflowReminder }
export type ServiceOptions = CommonOptions & { serviceName?: string; serviceUrl?: string } & (
  { countersign?: false; mode?: never; passRate?: never; sequential?: never } |
  { countersign: true; mode?: 'ALL' | 'ANY' | 'VOTE'; passRate?: string; sequential?: boolean }
)
export interface ReceiveOptions extends CommonOptions { messageName?: string }
export interface TimerOptions extends CommonOptions { timerType?: 'duration' | 'date' | 'cycle'; timerValue?: string }
export interface SubProcessOptions extends CommonOptions { bizFormKey?: string; reminder?: WorkflowReminder }
export interface WorkflowMetadata { key: string; name?: string; bizFormKey?: string }
export interface WorkflowDefinition { toJSON(): WorkflowModel }
export interface ChoiceBranch { branch?: string; conditionExpression?: string; body: WorkflowBody }
export interface ChoiceOptions extends CommonOptions { statusVariable?: string; branches: readonly ChoiceBranch[] }

type Description =
  | { kind: 'node'; node: Readonly<WorkflowNode> }
  | { kind: 'sequence'; children: readonly WorkflowBody[] }
  | { kind: 'choice'; id: string; options: Omit<ChoiceOptions, 'branches'>; branches: readonly ChoiceBranch[] }
  | { kind: 'parallel'; id: string; children: readonly WorkflowBody[] }
  | { kind: 'subProcess'; id: string; options: SubProcessOptions; body: WorkflowBody }
export type WorkflowBody = Readonly<Description & { [bodyBrand]: true }>

export class WorkflowDefinitionError extends WorkflowModelError {
  constructor(code: string, message: string, path = '', scope: string[] = []) {
    super([{ code, message, path, scope, severity: 'error' }])
    this.name = 'WorkflowDefinitionError'
    this.message = message
  }
}
const fail = (code: string, message: string, path = '', scope: string[] = []): never => { throw new WorkflowDefinitionError(code, message, path, scope) }
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
function immutable<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child)
    Object.freeze(value)
  }
  return value
}
function identifier(id: string) {
  if (typeof id !== 'string' || !id.trim()) fail('definition-id-required', '结构和节点必须提供非空标识。', '/id')
  if (id.startsWith(WORKFLOW_RESERVED_PREFIX)) fail('definition-reserved-id', `标识不能使用保留前缀 ${WORKFLOW_RESERVED_PREFIX}。`, '/id')
}
function optionsRecord(value: unknown, allowed: readonly string[], path = '/options'): Record<string, unknown> {
  if (!isRecord(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('definition-options', '配置必须是普通对象。', path)
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.includes(key)) fail('unknown-field', `不适用或未知的配置字段：${key}。`, `${path}/${key}`)
    if (item === undefined) continue
    // Node and reminder contracts contain only scalar values and a reminder object.
    if (key === 'reminder') {
      Object.defineProperty(output, key, { value: optionsRecord(item, ['duration', 'action', 'target', 'name'], `${path}/reminder`), enumerable: true })
    } else if (!['string', 'number', 'boolean'].includes(typeof item) || (typeof item === 'number' && !Number.isFinite(item))) {
      fail('field-type', `字段 ${key} 必须符合节点配置类型。`, `${path}/${key}`)
    } else Object.defineProperty(output, key, { value: item, enumerable: true })
  }
  return output
}
const common = ['name', 'bizType', 'bizJson', 'x', 'y', 'width', 'height']
const allowed: Record<NodeKind, string[]> = {
  approval: [...common, 'assignee', 'form', 'bizFormKey', 'allowTransfer', 'reminder'],
  countersign: [...common, 'mode', 'passRate', 'sequential', 'allowTransfer', 'allowAddSigner', 'form', 'bizFormKey', 'reminder'],
  service: [...common, 'serviceName', 'serviceUrl', 'countersign', 'mode', 'passRate', 'sequential'],
  receive: [...common, 'messageName'], timer: [...common, 'timerType', 'timerValue'], end: common,
}
function describe(value: Description): WorkflowBody { return immutable({ ...value, [bodyBrand]: true as const }) }
function assertBody(body: WorkflowBody): void {
  if (!body || body[bodyBrand] !== true || !Object.isFrozen(body)) fail('definition-body', '请使用 SDK 结构函数构造流程体。')
}
function node(kind: NodeKind, id: string, options: CommonOptions): WorkflowBody {
  identifier(id)
  const fields = optionsRecord(options, allowed[kind])
  if (kind === 'service' && fields.countersign !== true && ['mode', 'passRate', 'sequential'].some(key => key in fields)) fail('definition-service-mode', '仅服务会签可以配置 mode、passRate 和 sequential。')
  const { mode, ...rest } = fields
  const value = { id, type: kind, ...rest, ...(mode !== undefined ? { approveMode: mode } : {}) } as WorkflowNode
  // Reference-sensitive reminder validation is deferred until the whole local scope exists.
  const { reminder: _reminder, ...check } = value
  toBpmnCompilerJson({ processId: 'definition_check', nodes: [check] })
  return describe({ kind: 'node', node: value })
}
export const approval = (id: string, options: ApprovalOptions = {}): WorkflowBody => node('approval', id, options)
export const countersign = (id: string, options: CountersignOptions = {}): WorkflowBody => node('countersign', id, options)
export const service = (id: string, options: ServiceOptions = {}): WorkflowBody => node('service', id, options)
export const receive = (id: string, options: ReceiveOptions = {}): WorkflowBody => node('receive', id, options)
export const timer = (id: string, options: TimerOptions = {}): WorkflowBody => node('timer', id, options)
export const end = (id: string, options: CommonOptions = {}): WorkflowBody => node('end', id, options)
export function sequence(...children: WorkflowBody[]): WorkflowBody {
  if (!children.length) fail('definition-empty-sequence', 'sequence 至少需要一个流程体。')
  children.forEach(assertBody)
  return describe({ kind: 'sequence', children: [...children] })
}
export function choice(id: string, options: ChoiceOptions): WorkflowBody {
  identifier(id)
  if (!isRecord(options)) fail('definition-choice', 'choice 需要 branches 配置。')
  const { branches, ...rest } = options
  const fields = optionsRecord(rest, [...common, 'statusVariable'])
  if (!Array.isArray(branches) || branches.length < 2) fail('definition-choice-branches', 'choice 至少需要两条分支。')
  const copied = branches.map((branch, index) => {
    if (!isRecord(branch)) fail('definition-choice-branch', '分支必须是对象。', `/branches/${index}`)
    const { body, ...config } = branch
    assertBody(body)
    const branchFields = optionsRecord(config, ['branch', 'conditionExpression'], `/branches/${index}`)
    if (!String(branchFields.branch ?? '').trim() && !String(branchFields.conditionExpression ?? '').trim()) fail('definition-choice-condition', '每条分支需要 branch 或 conditionExpression。', `/branches/${index}`)
    return { ...branchFields, body } as ChoiceBranch
  })
  const values = copied.filter(branch => !branch.conditionExpression?.trim()).map(branch => branch.branch)
  if (new Set(values).size !== values.length) fail('definition-duplicate-branch', '同一网关的分支值不能重复。')
  if (copied.filter(branch => branch.branch === 'default').length > 1) fail('default-branch-duplicate', '最多允许一条默认分支。')
  return describe({ kind: 'choice', id, options: fields, branches: copied })
}
export function parallel(id: string, branches: readonly WorkflowBody[]): WorkflowBody {
  identifier(id)
  if (!Array.isArray(branches) || branches.length < 2) fail('definition-parallel-branches', 'parallel 至少需要两条分支。')
  branches.forEach(assertBody)
  return describe({ kind: 'parallel', id, children: [...branches] })
}
export function subProcess(id: string, body: WorkflowBody, options: SubProcessOptions = {}): WorkflowBody {
  identifier(id); assertBody(body)
  return describe({ kind: 'subProcess', id, body, options: optionsRecord(options, [...common, 'bizFormKey', 'reminder']) })
}

interface Fragment { entry: string; exits: string[]; earlyEnd: boolean }
function compileScope(body: WorkflowBody, owner: string, scope: string[]): WorkflowSubProcessModel {
  const nodes: WorkflowNode[] = []
  const flows: WorkflowFlow[] = []
  const ids = new Set<string>()
  const add = (value: WorkflowNode) => {
    if (ids.has(value.id)) fail('definition-duplicate-id', `同一作用域的标识重复：${value.id}。`, '/id', scope)
    ids.add(value.id); nodes.push(value)
    return value.id
  }
  const generated = (suffix: string) => `${WORKFLOW_RESERVED_PREFIX}${owner}_${suffix}`
  const connect = (source: string, target: string, fields: Partial<WorkflowFlow> = {}) => {
    const id = generated(`flow_${flows.length}`)
    if (ids.has(id)) fail('definition-duplicate-id', `生成标识冲突：${id}。`, '/flows', scope)
    // A merge has one unconditional exit. Mark it default so backend inference
    // does not turn that exit into a state condition.
    const mergeExit = nodes.some(node => node.id === source && node.id.startsWith(WORKFLOW_RESERVED_PREFIX) && node.id.endsWith('_merge'))
    ids.add(id); flows.push({ id, source, target, ...(mergeExit ? { branch: 'default' } : {}), ...fields })
  }
  const visit = (value: WorkflowBody): Fragment => {
    switch (value.kind) {
      case 'node': {
        add({ ...value.node })
        return { entry: value.node.id, exits: value.node.type === 'end' ? [] : [value.node.id], earlyEnd: value.node.type === 'end' }
      }
      case 'subProcess': {
        const process = compileScope(value.body, value.id, [...scope, value.id])
        add({ id: value.id, type: 'subProcess', ...value.options, process })
        return { entry: value.id, exits: [value.id], earlyEnd: false }
      }
      case 'sequence': {
        let result: Fragment | undefined
        for (const child of value.children) {
          if (result && !result.exits.length) fail('definition-after-end', '已结束的流程体后不能继续串接活动。', '/body', scope)
          const fragment = visit(child)
          result?.exits.forEach(source => connect(source, fragment.entry))
          result = { entry: result?.entry ?? fragment.entry, exits: fragment.exits, earlyEnd: !!result?.earlyEnd || fragment.earlyEnd }
        }
        return result!
      }
      case 'choice': {
        add({ id: value.id, type: 'condition', ...value.options })
        const exits: string[] = []
        let earlyEnd = false
        for (const { body: branchBody, ...fields } of value.branches) {
          const fragment = visit(branchBody)
          connect(value.id, fragment.entry, fields)
          exits.push(...fragment.exits); earlyEnd ||= fragment.earlyEnd
        }
        if (exits.length > 1) {
          const join = `${WORKFLOW_RESERVED_PREFIX}${value.id}_merge`
          add({ id: join, type: 'condition' })
          exits.forEach(source => connect(source, join))
          return { entry: value.id, exits: [join], earlyEnd }
        }
        return { entry: value.id, exits, earlyEnd }
      }
      case 'parallel': {
        add({ id: value.id, type: 'parallel' })
        const join = `${WORKFLOW_RESERVED_PREFIX}${value.id}_join`
        const branches = value.children.map(visit)
        if (branches.some(branch => branch.earlyEnd || !branch.exits.length)) fail('definition-parallel-end', '并行体每条路径都必须到达 join，不能提前 end；子流程内部的正常结束不受限制。', '/body', scope)
        add({ id: join, type: 'parallel' })
        for (const branch of branches) { connect(value.id, branch.entry); branch.exits.forEach(source => connect(source, join)) }
        return { entry: value.id, exits: [join], earlyEnd: false }
      }
    }
  }
  const start = add({ id: generated('start'), type: 'start' })
  const fragment = visit(body)
  connect(start, fragment.entry)
  if (fragment.exits.length) {
    const finish = add({ id: generated('end'), type: 'end' })
    fragment.exits.forEach(source => connect(source, finish))
  }
  return { nodes, flows }
}

export function defineWorkflow(metadata: WorkflowMetadata, body: WorkflowBody): WorkflowDefinition {
  const fields = optionsRecord(metadata, ['key', 'name', 'bizFormKey'], '/metadata')
  identifier(fields.key as string); assertBody(body)
  const model = toBpmnCompilerJson({
    processId: fields.key,
    ...(fields.name !== undefined ? { processName: fields.name } : {}),
    ...(fields.bizFormKey !== undefined ? { bizFormKey: fields.bizFormKey } : {}),
    ...compileScope(body, fields.key as string, []),
  })
  immutable(model)
  return Object.freeze({ toJSON: () => toBpmnCompilerJson(model) })
}

/** Definition errors and model errors share the existing structured issue shape. */
export type WorkflowDefinitionIssue = WorkflowValidationIssue
