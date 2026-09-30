import type { ValidationIssue } from './types'

export interface DeploymentProcess {
  id: string
  name: string
  isExecutable: boolean
}

export interface DesignerDeploymentSnapshot {
  xml: string
  processes: DeploymentProcess[]
  issues: ValidationIssue[]
}

// Deployment has a narrower contract than XML editing and export.
export function validateDeploymentProcesses(processes: DeploymentProcess[]): ValidationIssue[] {
  if (processes.length !== 1) return [{
    severity: 'error', code: 'deployment-process-count', elementId: '',
    message: '设计器部署目前支持单个流程，请保留一个可执行流程后再部署。',
  }]
  const process = processes[0]!
  return process.isExecutable ? [] : [{
    severity: 'error', code: 'deployment-not-executable', elementId: process.id,
    message: '当前流程未声明 isExecutable="true"，仅可作为设计稿。请确认执行配置后在 XML 中启用执行，再应用到画布。',
  }]
}
