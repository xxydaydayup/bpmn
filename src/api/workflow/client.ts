import { createWorkflowClient, type WorkflowRequester } from '@workflow/sdk/client'
import { requestWithStatus } from '@/utils/request'

export const workflowRequest: WorkflowRequester = ({ method, path, query, headers, body, signal }) => requestWithStatus({
  method, url: '/v1' + path, params: query, headers, data: body, signal,
})

export const workflowClient = createWorkflowClient({ request: workflowRequest })
