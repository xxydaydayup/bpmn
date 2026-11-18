import type { ParameterIssue } from './client-types.js'
export type WriteEffect = 'none' | 'unknown' | 'confirmed'
export interface WorkflowErrorContext {
  operation: string; phase?: string; httpStatus?: number; cause?: unknown; issues?: ParameterIssue[];
  resources?: Record<string, unknown>; effect?: WriteEffect
}
export class WorkflowClientError extends Error {
  readonly code: string
  readonly operation: string
  readonly phase: string
  readonly httpStatus?: number
  readonly issues: ParameterIssue[]
  readonly resources: Record<string, unknown>
  readonly effect: WriteEffect
  constructor(code: string, message: string, context: WorkflowErrorContext) {
    super(message, { cause: context.cause })
    this.name = 'WorkflowClientError'
    this.code = code; this.operation = context.operation; this.phase = context.phase ?? context.operation
    this.httpStatus = context.httpStatus; this.issues = context.issues ?? []; this.resources = context.resources ?? {}; this.effect = context.effect ?? 'none'
  }
}
export const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
export function parameterError(operation: string, code: string, message: string, path?: string): never {
  throw new WorkflowClientError(code, message, { operation, phase: 'parameters', issues: [{ code, message, path }] })
}
export function requireText(value: unknown, operation: string, path: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) parameterError(operation, 'INVALID_ARGUMENT', `${path} 必须是非空字符串。`, path)
}
