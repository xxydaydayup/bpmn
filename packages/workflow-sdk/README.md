# @workflow/sdk

独立于 UI 框架的业务工作流模型 SDK，供第三方设计器和 Node.js 服务生成本平台的标准业务 JSON。接入方负责把自己的 XML / JSON 转成该模型；平台维护标准协议、公共校验和后端执行能力。

第一版提供模型类型、JSON Schema 2020-12、离线校验和编译 JSON 导出，无运行时依赖，不请求网络，不需要 Vue、DOM 或浏览器存储。ESM，支持 Node.js 20.19+ / 22.12+ 和现代浏览器；不提供 CommonJS。

## 安装与使用

```sh
npm install ./workflow-sdk-0.1.0.tgz
```

```ts
import { validateWorkflowModel, toBpmnCompilerJson, type WorkflowModel } from '@workflow/sdk'

const model: WorkflowModel = {
  processId: 'expense_review',
  nodes: [
    { id: 'start', type: 'start' },
    { id: 'review', type: 'approval', allowTransfer: false },
    { id: 'end', type: 'end' },
  ],
  flows: [
    { source: 'start', target: 'review' },
    { source: 'review', target: 'end' },
  ],
}
const result = validateWorkflowModel(model)
if (result.valid) {
  const payload = toBpmnCompilerJson(model)
  // 交给宿主请求后端 JSON 编译接口。payload 是独立副本。
  console.log(payload)
} else {
  console.error(result.issues)
}
```

这里的办理人未固定，后续由业务系统根据后端参数规则在启动时传入。名称、布局和 flows 可选，SDK 不补默认配置、不生成 XML。

## 公开入口

| 导出 | 用途 |
| --- | --- |
| `WorkflowModel`、`WorkflowNode`、`WorkflowFlow`、`WorkflowSubProcessModel`、`WorkflowReminder` 等类型 | 编译输入；旧 `*Record` 类型名也有导出 |
| `validateWorkflowModel(input: unknown)` | 返回 `{ valid, issues }`，普通输入错误不抛异常 |
| `toBpmnCompilerJson(input: unknown)` | 完整校验后返回独立模型副本；失败抛 `WorkflowModelError`，其 `issues` 包含结构化诊断 |
| `workflowModelSchema` | 标准结构 Schema；不涵盖全部跨字段规则 |
| `workflowSdkCompatibility` | SDK / 模型 / 后端版本、快照来源、日期、SHA-256 |
| `WORKFLOW_NODE_TYPES`、`LEGACY_WORKFLOW_NODE_TYPES` | 当前语义节点与旧类型清单 |

诊断包含稳定 `code`、`severity: 'error' | 'warning'`、`message`、RFC 6901 JSON Pointer `path`，可附 `nodeId`、`edgeId`、由外到内的子流程 `scope`。例如 `/nodes/1/process/nodes/0/passRate`。有 error 时禁止导出；warning 可以继续。提示文本可能调整，调用者应使用 code 和 path 关联 UI。

标准 Schema 可通过 `@workflow/sdk/schema/workflow-model-v1.schema.json` 获取，其他语言也可使用。包内 [examples](./examples/) 有完整合法/非法模型，[接入指南](./docs/integration.md) 包含编译、发布和运行时流程，[验证记录](./docs/verification.md) 说明本地与真实后端编译的证据范围。

## 兼容与边界

| 对象 | 当前版本 | 管理方式 |
| --- | --- | --- |
| SDK | 0.1.0 | 独立 npm 包版本，本次只交付 tgz |
| 业务模型 / 后端规范 | 隐式 v1 / version 1 | 编译输入不增加 version、schemaVersion |
| 设计稿信封 | workflow-designer version 1 | 属于设计器，须先取裸模型并去除已知编辑元数据 |
| 规范快照 | 2026-11-16 | `contract/backend-spec-v1.json`；摘要见 `workflowSdkCompatibility` |

后端 `/bpmn/spec` 是自定义描述，并非 JSON Schema。本包的 Schema、类型和校验是它的兼容副本。执行契约仍以后端为准；升级后端时比较快照、字段与语义、示例和真实编译结果，再升级 SDK，运行时不会自动拉取新规范。

支持十种语义节点：start、approval、countersign、condition、parallel、service、receive、timer、subProcess、end。服务会签使用 `type: 'service', countersign: true`。旧 startEvent、userTask、exclusiveGateway、parallelGateway、endEvent、receiveTask 仅带兼容警告透传，不自动升级。当前 Vue 设计器没有 parallel 的画布编辑能力，导入后保留并限制编译；外部系统可直接使用 SDK 提交。

未知节点或字段会阻止导出，原数据不被修改。此策略比后端忽略展示字段更严格，用于避免丢失未支持的业务语义。已知画布元数据的整理属于设计器边界；SDK 不猜测或删除字段。不提供合作方适配器、HTTP 客户端、链式 builder、部署或运行时 API。

SDK 保留 ID、顺序、表达式、相对坐标、未填写的运行时配置和显式 false；不加子流程前缀、不生成超时派生节点或 params_rules。完整 EL、cron/时区、编译与引擎依赖仍需后端确认。本地通过、后端编译通过、真实引擎执行通过分别验证。

## 仓库维护

```sh
pnpm --filter @workflow/sdk test
pnpm build
pnpm pack:sdk
pnpm --filter @workflow/sdk verify:package -- ../../.scratch/workflow-model-sdk/artifacts/workflow-sdk-0.1.0.tgz
```

`verify:package` 在系统临时目录安装实际 tgz 并验证公开函数、类型与 Schema，保留路径供排查。后端编译检查为显式运行的 `test:backend`，环境配置见接入指南；安装和日常测试不访问私网或部署流程。
