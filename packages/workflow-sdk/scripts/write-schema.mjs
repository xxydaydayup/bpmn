import { mkdir, writeFile } from 'node:fs/promises'
import { workflowModelSchema } from '../dist/index.js'
await mkdir(new URL('../schema/', import.meta.url), { recursive: true })
await writeFile(new URL('../schema/workflow-model-v1.schema.json', import.meta.url), JSON.stringify(workflowModelSchema, null, 2) + '\n')
