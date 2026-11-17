import { writeFile } from 'node:fs/promises'
import { workflowModelSchema } from '@workflow/sdk'

// Compatibility download path. Contract changes are made in the SDK only.
await writeFile(new URL('../schema/workflow-model-v1.schema.json', import.meta.url), JSON.stringify(workflowModelSchema, null, 2) + '\n')
