import { workflowModelSchema, type ModelSchema } from './schema.js'
import { LEGACY_WORKFLOW_NODE_TYPES, type WorkflowModel, type WorkflowValidationIssue, type WorkflowValidationResult } from './types.js'

type Data = Record<string, unknown>
type Report = (code: string, message: string, path: string, context?: Partial<WorkflowValidationIssue>) => void
const record = (value: unknown): value is Data => value !== null && typeof value === 'object' && !Array.isArray(value)
const pointer = (value: string) => value.replaceAll('~', '~0').replaceAll('/', '~1')
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const durationPattern = /^P(?=\d|T\d)(?:(?:\d+(?:[.,]\d+)?Y)?(?:\d+(?:[.,]\d+)?M)?(?:\d+(?:[.,]\d+)?W)?(?:\d+(?:[.,]\d+)?D)?)(?:T(?=\d)(?:\d+(?:[.,]\d+)?H)?(?:\d+(?:[.,]\d+)?M)?(?:\d+(?:[.,]\d+)?S)?)?$/

function validateStructure(input: unknown, report: Report) {
  type Work = { value: unknown; schema: ModelSchema; path: string; context: Partial<WorkflowValidationIssue>; leave?: boolean }
  const stack: Work[] = [{ value: input, schema: workflowModelSchema, path: '', context: { scope: [] } }]
  const ancestors = new Set<object>()
  while (stack.length) {
    const current = stack.pop()!
    const { value, path } = current
    let { schema, context } = current
    if (current.leave) { ancestors.delete(value as object); continue }
    if (schema.$ref) schema = workflowModelSchema.$defs[schema.$ref.split('/').pop()! as keyof typeof workflowModelSchema.$defs]
    if (record(value) && schema === workflowModelSchema.$defs.node) context = { ...context, nodeId: typeof value.id === 'string' ? value.id : undefined, edgeId: undefined }
    if (record(value) && schema === workflowModelSchema.$defs.flow) context = { ...context, nodeId: undefined, edgeId: typeof value.id === 'string' ? value.id : undefined }
    if (schema.type) {
      const correct = schema.type === 'object' ? record(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
        : schema.type === 'array' ? Array.isArray(value)
          : schema.type === 'integer' ? typeof value === 'number' && Number.isInteger(value)
            : typeof value === schema.type
      if (!correct) { report('field-type', `字段应为 ${schema.type}。`, path, context); continue }
    }
    if (schema.enum && !schema.enum.includes(value as string)) report(schema === workflowModelSchema.$defs.node.properties.type ? 'unknown-node-type' : 'field-enum', '字段值不在当前协议允许的范围内。', path, context)
    if (typeof value === 'string' && schema.minLength && value.length < schema.minLength) report('field-required', '字段不能为空。', path, context)
    if (value && typeof value === 'object') {
      if (ancestors.has(value)) { report('cyclic-input', '模型必须是可序列化的 JSON，不能包含循环引用。', path, context); continue }
      ancestors.add(value)
      stack.push({ ...current, leave: true })
    }
    if (Array.isArray(value) && schema.items) {
      if (schema.minItems && value.length < schema.minItems) report('nodes-empty', '流程至少需要一个节点。', path, context)
      for (let i = value.length - 1; i >= 0; i--) stack.push({ value: value[i], schema: schema.items, path: `${path}/${i}`, context })
    } else if (record(value) && schema.type === 'object') {
      const required = new Set(schema.required ?? [])
      for (const rule of schema.allOf ?? []) {
        if (Object.entries(rule.if.properties ?? {}).every(([key, test]) => value[key] === test.const)) for (const key of rule.then.required ?? []) required.add(key)
      }
      for (const key of required) if (!Object.hasOwn(value, key) || value[key] === undefined) report('field-required', '缺少必需字段。', `${path}/${pointer(key)}`, context)
      for (const key of Object.keys(value).reverse()) {
        const propertyPath = `${path}/${pointer(key)}`
        const propertySchema = schema.properties && Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined
        if (!propertySchema) { report('unknown-field', '当前协议未声明此字段；保留原始数据并阻止导出。', propertyPath, context); continue }
        if (value[key] === undefined && !required.has(key)) continue
        const childContext = key === 'process' && typeof value.id === 'string'
          ? { scope: [...(context.scope ?? []), value.id] } : context
        stack.push({ value: value[key], schema: propertySchema, path: propertyPath, context: childContext })
      }
    }
  }
}

function validateNode(node: Data, nodes: Data[], path: string, report: Report) {
  const legacy = (LEGACY_WORKFLOW_NODE_TYPES as readonly unknown[]).includes(node.type)
  if (legacy) {
    report('legacy-node-type', '旧节点类型原样透传；后端不自动补齐办理人、会签或分支配置。', `${path}/type`, { severity: 'warning' })
  }
  if (node.allowTransfer !== undefined && !['approval', 'countersign'].includes(node.type as string)) report('allow-transfer-node-type', 'allowTransfer 仅支持审批和多人审批。', `${path}/allowTransfer`)
  if (node.allowAddSigner !== undefined) {
    if (node.type !== 'countersign') report('allow-add-signer-node-type', 'allowAddSigner 仅支持多人审批。', `${path}/allowAddSigner`)
    else if (node.sequential === true && node.allowAddSigner === true) report('allow-add-signer-sequential', '串行会签不支持启用加签。', `${path}/allowAddSigner`)
  }
  const multi = node.type === 'countersign' || (node.type === 'service' && node.countersign === true)
  if (multi && node.approveMode === 'VOTE' && !text(node.passRate)) report('pass-rate-required', '模板 VOTE 模式必须同时填写通过比例。', `${path}/passRate`)
  if (multi && typeof node.passRate === 'string' && text(node.passRate)) {
    const rate = Number(node.passRate)
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text(node.passRate)) || !Number.isFinite(rate) || rate <= 0 || rate > 1) report('pass-rate-range', '通过比例必须是 (0,1] 范围内的数字字符串。', `${path}/passRate`)
  }
  if (node.type === 'timer' && typeof node.timerValue === 'string' && text(node.timerValue)) {
    const value = text(node.timerValue), kind = node.timerType ?? 'duration'
    if (kind === 'duration' && !durationPattern.test(value)) report('timer-value-format', '定时时长必须使用 ISO-8601 格式，例如 PT30M。', `${path}/timerValue`)
    if (kind === 'date') {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))?$/.exec(value)
      const valid = match && Number(match[2]) >= 1 && Number(match[2]) <= 12 && Number(match[3]) >= 1 && Number(match[3]) <= new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate() && Number(match[4]) <= 23 && Number(match[5]) <= 59 && Number(match[6]) <= 59 && (!match[7] || (Number(match[7]) <= 23 && Number(match[8]) <= 59))
      if (!valid) report('timer-value-format', '定时时间点必须使用有效的 ISO-8601 日期时间。', `${path}/timerValue`)
    }
    if (kind === 'cycle') {
      const repeat = /^R\d*\/(.+)$/.exec(value)
      if (repeat ? !durationPattern.test(repeat[1]!) : !/^(?:[\w*?,/#L-]+\s+){4,6}[\w*?,/#L-]+$/.test(value)) report('timer-value-format', '定时周期应为 R3/PT10H 形式的重复间隔或 cron。', `${path}/timerValue`)
      else if (!repeat) report('timer-cycle-backend', '这里只检查 cron 字段外形，完整 cron 与时区语义须由后端确认。', `${path}/timerValue`, { severity: 'warning' })
    }
  }
  if (record(node.reminder)) {
    const reminder = node.reminder, action = reminder.action ?? 'notify'
    if (!['approval', 'countersign', 'subProcess'].includes(node.type as string)) report('reminder-node-type', '超时处理仅支持 approval、countersign 和 subProcess。', `${path}/reminder`)
    if (typeof reminder.duration === 'string' && text(reminder.duration) && !durationPattern.test(text(reminder.duration))) report('reminder-duration', '超时时长必须使用 ISO-8601 格式。', `${path}/reminder/duration`)
    if (action === 'return') {
      const target = nodes.find(candidate => candidate.id === reminder.target)
      if (!text(reminder.target)) report('reminder-target-required', '超时退回需要同层目标。', `${path}/reminder/target`)
      else if (!target || target.id === node.id || !['approval', 'countersign', 'service', 'subProcess', 'userTask'].includes(target.type as string)) report('reminder-target-invalid', '退回目标必须是同层已存在的其他人工任务、服务或子流程活动。', `${path}/reminder/target`)
    } else if ((action === 'notify' || action === 'end') && reminder.target !== undefined) report('reminder-target-unexpected', '只有超时退回可以配置 target。', `${path}/reminder/target`)
  }
}

function validateFlows(rawNodes: unknown[], rawFlows: unknown[], base: string, scope: string[], report: Report) {
  const nodeEntries = rawNodes.flatMap((node, index) => record(node) ? [{ node, index }] : [])
  const flowEntries = rawFlows.flatMap((flow, index) => record(flow) ? [{ flow, index }] : [])
  const nodes = nodeEntries.map(({ node }) => node)
  const flows = flowEntries.map(({ flow }) => flow)
  const byId = new Map(nodes.map(node => [node.id, node]))
  flowEntries.forEach(({ flow, index }) => {
    const path = `${base}/flows/${index}`
    const context = { edgeId: typeof flow.id === 'string' ? flow.id : undefined, scope }
    const add: Report = (code, message, field, extra) => report(code, message, field, { ...context, ...extra })
    for (const key of ['source', 'target']) if (typeof flow[key] === 'string' && !byId.has(flow[key])) add('flow-reference', '连线只能引用当前层已存在的节点，不能跨越子流程。', `${path}/${key}`)
    const source = byId.get(flow.source)
    if (!source) return
    if (source.type === 'parallel' && (flow.branch !== undefined || flow.conditionExpression !== undefined)) add('parallel-outgoing-condition', '并行网关出边不能包含 branch 或 conditionExpression。', flow.branch !== undefined ? `${path}/branch` : `${path}/conditionExpression`)
    if (flow.branch === 'default' && source.type !== 'condition') add('default-branch-node-type', 'default 仅可用于 condition 网关。', `${path}/branch`)
    if (flow.branch === 'default' && text(flow.conditionExpression)) add('default-branch-expression', '默认分支不能包含条件表达式。', `${path}/conditionExpression`)
    if (text(flow.conditionExpression)) return // Explicit EL takes precedence over branch inference.
    if (['pass', 'reject'].includes(flow.branch as string) && !['approval', 'countersign', 'service', 'condition'].includes(source.type as string)) add('boolean-branch-node-type', 'pass/reject 只能用于审批、会签、服务或 condition 网关。', `${path}/branch`)
    if (text(flow.branch) && !['pass', 'reject', 'default'].includes(flow.branch as string) && source.type !== 'condition' && source.type !== 'parallel') add('state-branch-node-type', '状态分支只可用于 condition 网关。', `${path}/branch`)
  })
  for (const { node } of nodeEntries.filter(({ node }) => node.type === 'condition')) {
    const outgoing = flowEntries.filter(({ flow }) => flow.source === node.id)
    const defaults = outgoing.filter(({ flow }) => flow.branch === 'default')
    for (const { flow, index } of defaults.slice(1)) report('default-branch-duplicate', 'condition 网关最多一条默认分支。', `${base}/flows/${index}/branch`, { edgeId: typeof flow.id === 'string' ? flow.id : undefined, scope })
    const inferred = outgoing.filter(({ flow }) => flow.branch !== 'default' && !text(flow.conditionExpression))
    const boolean = inferred.filter(({ flow }) => ['pass', 'reject'].includes(flow.branch as string))
    const state = inferred.filter(({ flow }) => text(flow.branch) && !['pass', 'reject'].includes(flow.branch as string))
    if (boolean.length && (state.length || inferred.length !== boolean.length || inferred.length >= 3)) report('condition-branch-mixed', '状态分支不能混用 pass/reject。', `${base}/nodes/${rawNodes.indexOf(node)}`, { nodeId: node.id as string, scope })
    if (boolean.length && boolean.length === inferred.length && inferred.length < 3) {
      const upstream = flows.filter(flow => flow.target === node.id).map(flow => byId.get(flow.source))
      if (upstream.length !== 1 || !upstream[0] || !['approval', 'countersign', 'service'].includes(upstream[0].type as string)) report('condition-boolean-upstream', '布尔分支需要且只能有一个直接上游审批、会签或服务节点。', `${base}/nodes/${rawNodes.indexOf(node)}`, { nodeId: node.id as string, scope })
    }
    if (!boolean.length && state.length) {
      const values = new Set<string>()
      for (const { flow, index } of inferred) {
        const value = text(flow.branch)
        if (!value) report('condition-state-required', '状态分支须全部填写唯一状态值，或全部省略由后端生成。', `${base}/flows/${index}/branch`, { scope })
        else if (values.has(value)) report('condition-state-duplicate', '同一网关的状态值不能重复。', `${base}/flows/${index}/branch`, { scope })
        values.add(value)
      }
    }
  }
}

export function validateWorkflowModel(input: unknown): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = []
  const report: Report = (code, message, path, context) => issues.push({ code, severity: 'error', message, path, ...context })
  validateStructure(input, report)
  // Every occurrence contributes definitions; only ancestor cycles stop traversal.
  const ancestors = new Set<object>()
  const ids = new Map<string, 'node' | 'flow'>()
  const register = (id: unknown, kind: 'node' | 'flow', path: string, context: Partial<WorkflowValidationIssue>) => {
    if (typeof id !== 'string') return
    const previous = ids.get(id)
    if (previous) report(previous === kind ? `duplicate-${kind}-id` : 'duplicate-definition-id', '节点与显式连线标识必须在整个流程中唯一。', path, context)
    else ids.set(id, kind)
  }
  type Work = { value: unknown; base: string; scope: string[]; leave?: boolean }
  const stack: Work[] = [{ value: input, base: '', scope: [] }]
  while (stack.length) {
    const current = stack.pop()!
    const { value, base, scope } = current
    if (!record(value)) continue
    if (current.leave) { ancestors.delete(value); continue }
    if (ancestors.has(value)) continue
    ancestors.add(value)
    stack.push({ ...current, leave: true })
    const rawNodes = Array.isArray(value.nodes) ? value.nodes : []
    const nodes = rawNodes.filter(record)
    const children: Work[] = []
    for (const [index, node] of rawNodes.entries()) {
      if (!record(node)) continue
      const path = `${base}/nodes/${index}`
      const context = { nodeId: typeof node.id === 'string' ? node.id : undefined, scope }
      register(node.id, 'node', `${path}/id`, context)
      validateNode(node, nodes, path, (code, message, field, extra) => report(code, message, field, { ...context, ...extra }))
      if (node.type === 'subProcess' && record(node.process)) children.push({ value: node.process, base: `${path}/process`, scope: [...scope, String(node.id)] })
    }
    if (Array.isArray(value.flows)) {
      value.flows.forEach((flow, index) => {
        if (record(flow)) register(flow.id, 'flow', `${base}/flows/${index}/id`, { edgeId: typeof flow.id === 'string' ? flow.id : undefined, scope })
      })
      // Missing flow IDs are generated and disambiguated by the backend.
      validateFlows(rawNodes, value.flows, base, scope, report)
    }
    stack.push(...children.reverse())
  }
  return { valid: !issues.some(issue => issue.severity === 'error'), issues }
}

export class WorkflowModelError extends Error {
  readonly issues: WorkflowValidationIssue[]
  constructor(issues: WorkflowValidationIssue[]) {
    super('业务工作流模型未通过校验，无法导出编译 JSON。')
    this.name = 'WorkflowModelError'
    this.issues = issues
  }
}

export function toBpmnCompilerJson(input: unknown): WorkflowModel {
  const result = validateWorkflowModel(input)
  if (!result.valid) throw new WorkflowModelError(result.issues)
  // Copy iteratively, omitting only optional undefined values as JSON does.
  const output: Data = {}
  const stack: { source: Data | unknown[]; target: Data | unknown[] }[] = [{ source: input as Data, target: output }]
  while (stack.length) {
    const { source, target } = stack.pop()!
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue
      const copy = value && typeof value === 'object' ? (Array.isArray(value) ? [] : {}) : value
      Object.defineProperty(target, key, { value: copy, enumerable: true, writable: true, configurable: true })
      if (value && typeof value === 'object') stack.push({ source: value as Data, target: copy as Data })
    }
  }
  return output as unknown as WorkflowModel
}
