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

1. 设计器把画布导出为约定好的业务 JSON（如 `project_approval_json`）：节点含 id、type、name 和 x/y 坐标，连线可带 branch。新建节点使用 `节点类型_32位UUID` 标识，例如 `approval_937c1a82933b42b492a7ed676c3de0fc`；UUID 不含连字符，以便后端按节点标识生成的 Camunda EL 变量名（如 `${approval_..._assignee}`）保持合法。导入旧版 `节点类型_UUID` 标识时会自动移除 UUID 连字符，并同步更新连线和节点间引用。
2. 宿主 compile 回调把业务 JSON 提交后端 `/v1/bpmn/json2xml`，编译为 Camunda 标准 BPMN XML（如 `docs/examples/立项申请/立项申请.bpmn`）。
3. 宿主 deploy 回调发布任务模板，由后端部署到流程引擎。部署时引擎后端从编译产物推导全局变量 `params_rules`，确定流程进行到某一节点时需要的传参。变量名按节点标识与属性扩充生成（如 `apply_assignee`、`managers_approverList`）。每条规则包含 `name`、`type`、`description`、`value`、`source`、`required`，并带有 `nodeId`、`nodeName`、`nodeType` 三个节点元数据：分别是所属节点的标识、显示名称和业务类型；它们用于说明变量对应哪个节点，不是流程启动时要提交的变量值。`source` 分三类：
   - `start`：启动流程实例时传入，如办理人、会签名单；
   - `complete`：完成该节点任务时传入，如审批结果、会签表决；
   - `engine`：流程定义已固化，无需传入，如会签审批模式。
4. 启动流程时根据 `params_rules` 中 `source: 'start'` 的规则组装 `variables`，连同业务键等提交启动接口；`nodeId`、`nodeName`、`nodeType` 等规则元数据不放入 `variables`。

`docs/examples/立项申请/` 是该链路的完整对照示例：`立项申请.js` 含业务 JSON、params_rules 与启动传参 start_payload，`立项申请.bpmn` 是后端编译产物，`立项申请流程图.png` 为流程图截图。内置流程模板还包括后端已部署的 `msg-wait:1:31189f2a-d9ae-11f1-b314-00155d21c8ae`（固定消息名 `msg_wait_name`）和 `timer01:1:32ead321-d9a4-11f1-b314-00155d21c8ae`（固定等待时长 `PT1M`）。模板选择器会显示这两个来源流程定义；应用时复制节点及连线并重新生成节点标识。

服务节点可选择启用 `countersign: true` 的多服务调用，并在节点业务 JSON 上配置 `approveMode`（ALL / ANY / VOTE）、`sequential`（缺省 false，即并行）和 VOTE 专用 `passRate`。`serviceName` 与 `serviceUrl` 仍是旧单服务配置，并可作为多服务清单项目的缺省值；具体服务集合属于流程实例启动输入，不保存在设计稿中。未带 `countersign` 的旧服务节点保持单服务语义。

审批和多人审批节点可配置 `reminder` 超时策略：`action` 支持 `notify`（到期发送提醒并继续等待，缺省）、`return`（中断当前审批并退回 `target` 节点）和 `end`（中断当前审批并结束流程）；退回目标必须是流程中其他审批、多人审批或服务节点。`duration` 填入 ISO-8601 时长后固化为流程配置，留空时可在启动变量中传 `{节点id}_reminderDuration`，后端缺省为 `P1D`。`name` 用作提醒文案。超时派生节点由后端编译器生成，不进入前端画布。

消息等待节点使用 `type: 'receive'` 与可选 `messageName`。消息名填写后由后端固化到流程模板；留空则业务流程启动表单提供 `{节点id}_messageName`，仍留空时后端回退到节点 ID。节点到达后等待业务方通过消息接口发送匹配消息再继续，不创建人工待办。定时等待节点使用 `type: 'timer'`、`timerType`（`duration` / `date` / `cycle`）和可选 `timerValue`；新节点默认为 `duration` + `PT30M`，切换类型会更新相应格式的示例。时间值留空时业务启动表单要求填写 `{节点id}_timerValue`；引擎到期自动继续，不创建人工待办。启动表单值映射到真实 `variables` 请求，同时可在启动变量 JSON 中编辑。

所有内置节点都可在通用属性面板设置可选字符串 `bizType`，用于记录宿主业务系统解释的节点级业务标识。该值随业务工作流模型及设计稿导入导出，并传入宿主 `compile(model)` 回调；设计器不校验其格式或唯一性，也不将它映射到 BPMN XML 或 `params_rules`。bizType 是 WorkflowModel v1 的已知字段，空值会从节点记录移除。

## 扩展能力

设计器支持 `type: 'subProcess'` 的嵌入式子流程节点。选择节点属性中的片段后，设计稿保存片段库来源 key/name 与 `process` 内容快照；宿主提交编译前会剔除来源字段和片段画布宽高，只发送后端 `/bpmn/spec` 规定的递归流程字段。编译器按规范展开完整子流程（包括逐层前缀化内部节点与连线 ID，并重写同层提醒目标）。设计器片段编辑模式允许不含开始或结束节点，保存前要求至少一个节点；管理页面和 API 仍由宿主提供。片段库后续修改不会自动改变已保存节点快照。

设计器后续会持续新增节点类型和节点属性来扩展能力。按 ADR-0005 的契约，新增影响编译的节点或字段时，须先升级正式业务 JSON 契约并实现后端编译能力，再同步 schema 副本、前端类型与映射；未升级前，未知业务字段/节点保持原样并阻止编译。`subProcess.process` 的正式编译字段以 [业务 JSON 规范](http://192.168.124.202:8085/bpmn/spec) 为准，Schema 副本的来源说明也应引用该后端规范。

标准模型类型、Schema 与协议校验由独立 [@workflow/sdk](../workflow-sdk/README.md) 提供，基线为后端 `/bpmn/spec` version 1 的 2026-11-16 快照。`schema/workflow-model-v1.schema.json` 为 SDK Schema 的同步下载副本，使用 `pnpm --filter @workflow/designer sync:schema` 更新，不单独维护；真实立项审批 fixture 位于 `src/fixtures/project-approval.json`。后端执行契约仍由编译器维护方负责。

SDK 允许省略名称、坐标和 flows；设计器补齐编辑默认值，并继续检查唯一开始/结束、名称、普通回路和连接策略。标准字段/会签/分支/等待/提醒/子流程语义交由 SDK 检查，诊断通过 path 与 scope 映射到画布；扩展校验仍可追加。SDK 支持 parallel 及旧类型警告透传，当前画布尚不支持这些节点的编辑，导入后保留并禁止编译。

宿主可从 `@workflow/designer` 导入 `toWorkflowCompilerJson(model)`：它只剥离已知流程画布宽高与片段来源元数据，再调用 SDK 的校验/导出。节点 x/y/width/height 保留，未知业务字段不剥离。视口、主题和路由继续留在设计稿信封中。需要单独使用模型能力的接入方安装 SDK 即可，完整流程见 [接入指南](../workflow-sdk/docs/integration.md)。

根仓库 /workflow-designer 是集成示例：提供 JSON 查看/粘贴或文件导入、JSON 转 XML、BPMN XML 结果查看、基础流程检查和显式确认的业务任务模板发布。设计器库不假定部署 API；在此宿主中，compile 回调使用 /api/v1/bpmn/json2xml，deploy 回调复用 /api/v1/template，并在不确定的网络结果时允许查询模板状态。示例流程坐标预先排成适合首次展示的纵向布局；页面首次打开和导入模型时保留已有节点坐标，只有用户主动选择“自动布局”时才运行 ELK 重排。保存的编辑器视口仍会在打开时恢复。/designer 继续提供 BPMN/XML 直接建模与引擎部署。

## 业务表单目录扩展

宿主通过 extensions.businessForms 注入 WorkflowFormDataSource：list({ nameLike, firstResult, maxResults }) 返回 WorkflowFormOption[]，get(key) 返回当前目录详情；选项包含 key、name、version、status。宿主负责只返回已发布且可用项、鉴权及 API，包不直接请求后端。

审批和多人审批属性面板显示选择器，新选择保存 bizFormKey: "form:<key>@<version>"。既有无版本、@latest、route: 引用按原值保留并说明语义；旧 form 字段独立保留。固定版本的存在及可用性由宿主在编译/发布前校验。本仓库示例宿主复用表单 gateway，实际变量/任务读取及使用步骤见 [业务人工任务表单](../../docs/business-forms.md)。
