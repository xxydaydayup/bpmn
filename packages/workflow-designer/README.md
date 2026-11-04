# @workflow/designer

独立 Vue 3 / Vue Flow 业务工作流设计器 workspace 包。采用当前包隔离加回调的架构，目标是让设计器可整体移植到其他系统复用。包编辑 WorkflowModel v1，并由宿主传入 compile(model) 回调生成后端 BPMN XML；可选的 deploy(model) 回调由宿主接入业务任务模板发布接口，设计器不直接持有 API 或鉴权能力。Vue 和 @vue-flow/core 是 peer dependencies，elkjs 作为包运行依赖。生产产物为 dist/index.js 与隔离的 dist/style.css，不包含全局 reset。

~~~ts
import { WorkflowDesigner, type WorkflowInput, type WorkflowModel } from '@workflow/designer'
import '@workflow/designer/style.css'

const document = ref<WorkflowInput>(legacyWorkflowModel)
const compile = (model: WorkflowModel) => hostApi.post('/v1/bpmn/json2xml', model)
~~~

宿主需提供 Vue 3 和 @vue-flow/core。组件通过 v-model 交换版本化设计稿；旧裸 v1 模型可直接导入。未知业务字段/节点会原样保留并阻止编译；无法识别的未来设计稿以只读方式导出原对象。可通过 extensions 提供已知节点的默认值、画布节点组件、属性编辑器、连接规则、校验、节点库过滤和主题，并通过插槽定制工具栏、节点库页脚、画布覆盖层及属性面板页脚。

## 端到端链路

流程画完后，从业务 JSON 到引擎部署的链路是：业务 JSON → 后端编译为 Camunda 标准 XML → 部署 → params_rules。

1. 设计器把画布导出为约定好的业务 JSON（如 `project_approval_json`）：节点含 id、type、name 和 x/y 坐标，连线可带 branch。
2. 宿主 compile 回调把业务 JSON 提交后端 `/v1/bpmn/json2xml`，编译为 Camunda 标准 BPMN XML（如 `docs/examples/立项申请/立项申请.bpmn`）。
3. 宿主 deploy 回调发布任务模板，由后端部署到流程引擎。部署时引擎后端从编译产物推导全局变量 `params_rules`，确定流程进行到某一节点时需要的传参。变量名按节点标识与属性扩充生成（如 `apply_assignee`、`managers_approverList`）。每条规则包含 `name`、`type`、`description`、`value`、`source`、`required`，并带有 `nodeId`、`nodeName`、`nodeType` 三个节点元数据：分别是所属节点的标识、显示名称和业务类型；它们用于说明变量对应哪个节点，不是流程启动时要提交的变量值。`source` 分三类：
   - `start`：启动流程实例时传入，如办理人、会签名单；
   - `complete`：完成该节点任务时传入，如审批结果、会签表决；
   - `engine`：流程定义已固化，无需传入，如会签审批模式。
4. 启动流程时根据 `params_rules` 中 `source: 'start'` 的规则组装 `variables`，连同业务键等提交启动接口；`nodeId`、`nodeName`、`nodeType` 等规则元数据不放入 `variables`。

`docs/examples/立项申请/` 是该链路的完整对照示例：`立项申请.js` 含业务 JSON、params_rules 与启动传参 start_payload，`立项申请.bpmn` 是后端编译产物，`立项申请流程图.png` 为流程图截图。

服务节点可选择启用 `countersign: true` 的多服务调用，并在节点业务 JSON 上配置 `approveMode`（ALL / ANY / VOTE）、`sequential`（缺省 false，即并行）和 VOTE 专用 `passRate`。`serviceName` 与 `serviceUrl` 仍是旧单服务配置，并可作为多服务清单项目的缺省值；具体服务集合属于流程实例启动输入，不保存在设计稿中。未带 `countersign` 的旧服务节点保持单服务语义。

审批和多人审批节点可配置 `reminder` 超时策略：`action` 支持 `notify`（到期发送提醒并继续等待，缺省）、`return`（中断当前审批并退回 `target` 节点）和 `end`（中断当前审批并结束流程）；退回目标必须是流程中其他审批、多人审批或服务节点。`duration` 填入 ISO-8601 时长后固化为流程配置，留空时可在启动变量中传 `{节点id}_reminderDuration`，后端缺省为 `P1D`。`name` 用作提醒文案。超时派生节点由后端编译器生成，不进入前端画布。

## 扩展能力

设计器后续会持续新增节点类型和节点属性来扩展能力。按 ADR-0005 的契约，新增影响编译的节点或字段时，须先升级正式业务 JSON 契约并实现后端编译能力，再同步 schema 副本、前端类型与映射；未升级前，未知业务字段/节点保持原样并阻止编译。

当前契约副本和真实立项审批 fixture 分别见 schema/workflow-model-v1.schema.json 与 src/fixtures/project-approval.json。它们基于 D:/Code/github.com/xxydaydayup/workflow/src/api/workflowModel.ts 和该仓库的业务样例，于 2026-11-03 迁移；后端编译器维护方发布正式 Schema 后应以其为准更新此副本。

根仓库 /workflow-designer 是集成示例：提供 JSON 查看/粘贴或文件导入、JSON 转 XML、BPMN XML 结果查看、基础流程检查和显式确认的业务任务模板发布。设计器库不假定部署 API；在此宿主中，compile 回调使用 /api/v1/bpmn/json2xml，deploy 回调复用 /api/v1/template，并在不确定的网络结果时允许查询模板状态。初始自动布局由宿主通过 autoLayoutOnInit 显式启用，传入视口或导入的模型坐标均保持不变。/designer 继续提供 BPMN/XML 直接建模与引擎部署。
