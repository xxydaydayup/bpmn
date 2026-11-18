# @workflow/sdk

独立于 UI 框架的业务工作流模型 SDK，供第三方设计器和 Node.js 服务生成本平台的标准业务 JSON。接入方负责把自己的 XML / JSON 转成该模型；平台维护标准协议、公共校验和后端执行能力。

0.2.0 保留模型类型、JSON Schema 2020-12、离线校验和编译 JSON 导出，新增函数定义与业务网关客户端。三个入口均无运行时依赖，导入不请求网络；模型和定义保持离线，不需要 DOM 类型。客户端仅在调用操作时通过宿主注入的 request 请求网络，需要标准 AbortController、FormData 和 Blob。ESM，支持 Node.js 20.19+ / 22.12+ 和现代浏览器。

## 安装与使用

```sh
npm install ./workflow-sdk-0.2.0.tgz
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

| 子路径 | 用途 |
| --- | --- |
| `@workflow/sdk` | 兼容既有模型、Schema、校验、导出 |
| `@workflow/sdk/definition` | `defineWorkflow`、`sequence`、`approval`、`countersign`、`choice`、`parallel`、`service`、`receive`、`timer`、`subProcess`、`end` |
| `@workflow/sdk/client` | `createWorkflowClient`、请求/结果类型与 `WorkflowClientError` |

函数与运行接入见 [函数 SDK 指南](./docs/function-sdk.md)，实际后端差异和证据见 [0.2 验证记录](./docs/function-sdk-verification.md)。下表为兼容的根入口。

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
| SDK | 0.2.0 | 独立 npm 包版本，本次只交付 tgz |
| 业务模型 / 后端规范 | 隐式 v1 / version 1 | 编译输入不增加 version、schemaVersion |
| 设计稿信封 | workflow-designer version 1 | 属于设计器，须先取裸模型并去除已知编辑元数据 |
| 规范快照 | 2026-11-18 | `contract/backend-spec-2026-11-18.json` 与正式 JSON Schema；来源、抓取时间和 SHA-256 见 `workflowSdkCompatibility` 及 `contract/backend-model-2026-11-18.provenance.json`；旧快照保留 |

后端 `/bpmn/spec` 是自定义描述，并非 JSON Schema。本包的 Schema、类型和校验是它的兼容副本。执行契约仍以后端为准；升级后端时比较快照、字段与语义、示例和真实编译结果，再升级 SDK，运行时不会自动拉取新规范。

支持十种语义节点：start、approval、countersign、condition、parallel、service、receive、timer、subProcess、end。服务会签使用 `type: 'service', countersign: true`。旧 startEvent、userTask、exclusiveGateway、parallelGateway、endEvent、receiveTask 仅带兼容警告透传，不自动升级。当前 Vue 设计器没有 parallel 的画布编辑能力，导入后保留并限制编译；外部系统可直接使用 SDK 提交。

未知节点或字段会阻止导出，原数据不被修改。已知画布元数据的整理属于设计器边界；SDK 不猜测或删除字段。不提供合作方适配器、任意 JavaScript 流程执行器或任意图到函数定义的逆向转换。

SDK 保留 ID、顺序、表达式、相对坐标、未填写的运行时配置和显式 false；不加子流程前缀、不生成超时派生节点或 params_rules。完整 EL、cron/时区、编译与引擎依赖仍需后端确认。本地通过、后端编译通过、真实引擎执行通过分别验证。

节点公共字段 bizJson 为可选字符串，十种标准语义节点均支持。SDK 不要求合法 JSON，不解析、不 trim、不重写字符串内 ID。缺省不补值，显式空字符串和纯空白字符串保留；对象、数组、null、数字或布尔值会产生 field-type 并禁止编译。设计器 UI 清空会删除字段。容器和任意层内部节点独立保存，函数入口的通用配置也支持同一字段。后端声明实例变量 {activityId}_bizJson 覆盖 XML 模板默认值，删除变量后回退；嵌套 activityId 使用后端展开结果。本次未验收运行时覆盖/回退。2026-11-18 编译发现后端会去掉首尾空白，详见 [验证记录](docs/node-bizjson-verification.md)。

## 仓库维护

```sh
pnpm --filter @workflow/sdk test
pnpm build
pnpm pack:sdk
pnpm --filter @workflow/sdk verify:package -- ../../.scratch/workflow-model-sdk/artifacts/workflow-sdk-0.2.0.tgz
```

`verify:package` 在系统临时目录安装实际 tgz 并验证公开函数、类型与 Schema，保留路径供排查。后端编译检查为显式运行的 `test:backend`，环境配置见接入指南；安装和日常测试不访问私网或部署流程。

2026-11-17 运行协议已适配人工 passed:Boolean，并按任务规则兼容旧 approved/vote；[运行契约来源](contract/backend-runtime-spec-2026-11-17.provenance.json) 与模型校验基线分别记录。单人同意/拒绝已通过真实引擎，入口动态分支参数仍有后端差异，见验收边界。
