/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_CAMUNDA_ACCESS_MODE?: 'direct' | 'backend-proxy'
  readonly VITE_CAMUNDA_TENANT?: string
  readonly VITE_BUSINESS_WORKFLOW_ENABLED?: 'true' | 'false'
  readonly VITE_WORKFLOW_DEVTOOLS?: 'true' | 'false'
}
