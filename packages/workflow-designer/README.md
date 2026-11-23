# @workflow/designer

独立 Vue 3 / Vue Flow 业务工作流设计器 workspace 包。采用当前包隔离加回调的架构，目标是让设计器可整体移植到其他系统复用。包编辑 WorkflowModel v1，并由宿主传入 compile(model) 回调生成后端 BPMN XML；可选的 deploy(model) 回调由宿主接入业务任务模板发布接口，设计器不直接持有 API 或鉴权能力。Vue 和 @vue-flow/core 是 peer dependencies，elkjs 作为包运行依赖。生产产物为 dist/index.js 与隔离的 dist/style.css，不包含全局 reset。

~~~ts
import { WorkflowDesigner, type WorkflowInput, type WorkflowModel } from '@workflow/designer'
import '@workflow/designer/style.css'

const document = ref<WorkflowInput>(legacyWorkflowModel)
const compile = (model: WorkflowModel) => hostApi.post('/v1/bpmn/json2xml', model)
~~~

宿主需提供 Vue 3 和 @vue-flow/core。组件通过 v-model 交换版本化设计稿；旧裸 v1 模型可直接导入。未知业务字段/节点会原样保留并阻止编译；无法识别的未来设计稿以只读方式导出原对象。可通过 extensions 提供已知节点的默认值、画布节点组件、属性编辑器、连接规则、校验、节点库过滤和主题，并通过插槽定制工具栏、节点库页脚、画布覆盖层及属性面板页脚。

## 只读业务流程预览

`WorkflowPreview` 是独立的单向展示入口，可接收已发布快照的 `displayJson` 对象或 JSON 字符串。组件不取数、不编译、不保存，也不改变输入对象；宿主负责加载、鉴权、版本解析以及同一定义版本的 BPMN XML 备用视图。

```vue
<WorkflowPreview
  :model="template.displayJson"
  :metadata="{ name: template.name, key: template.key, version: template.version, processDefinitionId: template.processDefinitionId }"
  :node-states="{ approval: 'active' }"
  @error="handleUnavailableModel"
/>
```

从 `@workflow/designer` 导入 `WorkflowPreview`，并沿用 `@workflow/designer/style.css`。`metadata` 和 `nodeStates` 均可省略；节点状态支持 `active`、`completed`、`canceled`，以文字和颜色同时区分。`ready` 事件提供 `{ nodeIds: string[] }`，`error` 与 `warning` 事件提供中文说明字符串。无法匹配外层节点的活动会显示提示，不推断连线执行轨迹。子流程只展示容器与步骤数量，不提供内部导航。

预览沿用已有坐标，缺少坐标时仅为内部副本生成临时布局；未知类型保留名称、原始类型和连接，并提示能力限制。空/重复定义 ID、悬空连线、无节点或不支持的结构会清除旧图并报告错误。查看交互限于缩放、平移与适应画布；切换输入或卸载后，迟到布局不会覆盖新图。此入口验证业务模型的显示行为，不生成或修改 XML，也不代表后端执行、身份代理或租户授权已通过验证。

画布提供 Vue Flow 点阵背景与小地图，小地图可点击定位并拖动视口，窄屏时隐藏。选中顺序流时显示轻量方向动画，尊重系统减少动态效果设置；动画不进入 WorkflowModel 或编译输入。应用流程模板后会清除先前视口，并在新图渲染后适应完整流程。内置分支示例坐标用于展示既有通过、驳回和回流关系，不改变业务拓扑。

## 端到端链路

流程画完后，从业务 JSON 到引擎部署的链路是：业务 JSON → 后端编译为 Camunda 标准 XML → 部署 → params_rules。

1. 设计器把画布导出为约定好的业务 JSON（如 `project_approval_json`）：节点含 id、type、name 和 x/y 坐标，连线含 id、source、target，可带 branch。新建节点使用 `节点类型_32位UUID` 标识，例如 `approval_937c1a82933b42b492a7ed676c3de0fc`，新建连线使用 `flow_32位UUID`；UUID 不含连字符，以便后端按节点标识生成的 Camunda EL 变量名（如 `${approval_..._assignee}`）保持合法。导入旧版 `节点类型_UUID` 标识时会自动移除 UUID 连字符，并同步更新连线和节点间引用。
2. 宿主 compile 回调把业务 JSON 提交后端 `/v1/bpmn/json2xml`，编译为 Camunda 标准 BPMN XML（如 `docs/examples/立项申请/立项申请.bpmn`）。
3. 宿主 deploy 回调发布任务模板，由后端部署到流程引擎。部署时引擎后端从编译产物推导全局变量 `params_rules`，确定流程进行到某一节点时需要的传参。变量名按节点标识与属性扩充生成（如 `apply_assignee`、`managers_approverList`）。每条规则包含 `name`、`type`、`description`、`value`、`source`、`required`，并带有 `nodeId`、`nodeName`、`nodeType` 三个节点元数据：分别是所属节点的标识、显示名称和业务类型；它们用于说明变量对应哪个节点，不是流程启动时要提交的变量值。`source` 分三类：
   - `start`：启动流程实例时传入，如办理人、会签名单；
   - `complete`：完成该节点任务时传入，如审批结果、会签表决；
   - `engine`：流程定义已固化，无需传入，如会签审批模式。
4. 启动流程时根据 `params_rules` 中 `source: 'start'` 的规则组装 `variables`，连同业务键等提交启动接口；`nodeId`、`nodeName`、`nodeType` 等规则元数据不放入 `variables`。

`docs/examples/立项申请/` 是该链路的完整对照示例：`立项申请.js` 含业务 JSON、params_rules 与启动传参 start_payload，`立项申请.bpmn` 是后端编译产物，`立项申请流程图.png` 为流程图截图。内置流程模板还包括后端已部署的 `msg-wait:1:31189f2a-d9ae-11f1-b314-00155d21c8ae`（固定消息名 `msg_wait_name`）和 `timer01:1:32ead321-d9a4-11f1-b314-00155d21c8ae`（固定等待时长 `PT1M`）。模板选择器会显示这两个来源流程定义；应用时递归复制节点及连线并重新生成它们的定义 ID。

设计器要求整个业务工作流模型中的节点 ID 和连线 ID 共用一个唯一命名空间，包含全部嵌套 `subProcess.process`。新建元素、应用模板和引用子流程片段时分配 ID；复制片段会逐层重写 `source`、`target`、`reminder.target`，保证引用仍指向当前层对应节点。后续编辑、撤销重做和保存沿用已分配的 ID。导入已有模型时保留稳定节点 ID，递归补齐省略的连线 ID；重复的定义 ID 保留并报错，阻止编译和发布，不自动替换冲突节点。`processId` 继续由用户填写，不参与这项唯一性检查，由后端最终校验。`bizJson`、`conditionExpression` 等自定义文本保持原文；文本中如含节点 ID，由宿主或使用者维护。

服务节点可选择启用 `countersign: true` 的多服务调用，并在节点业务 JSON 上配置 `approveMode`（ALL / ANY / VOTE）、`sequential`（缺省 false，即并行）和 VOTE 专用 `passRate`。`serviceName` 与 `serviceUrl` 仍是旧单服务配置，并可作为多服务清单项目的缺省值；具体服务集合属于流程实例启动输入，不保存在设计稿中。未带 `countersign` 的旧服务节点保持单服务语义。

审批和多人审批节点可配置 `reminder` 超时策略：`action` 支持 `notify`（到期发送提醒并继续等待，缺省）、`return`（中断当前审批并退回 `target` 节点）和 `end`（中断当前审批并结束流程）；退回目标必须是流程中其他审批、多人审批或服务节点。`duration` 填入 ISO-8601 时长后固化为流程配置，留空时可在启动变量中传 `{节点id}_reminderDuration`，后端缺省为 `P1D`。`name` 用作提醒文案。超时派生节点由后端编译器生成，不进入前端画布。

消息等待节点使用 `type: 'receive'` 与可选 `messageName`。消息名填写后由后端固化到流程模板；留空则业务流程启动表单提供 `{节点id}_messageName`，仍留空时后端回退到节点 ID。节点到达后等待业务方通过消息接口发送匹配消息再继续，不创建人工待办。定时等待节点使用 `type: 'timer'`、`timerType`（`duration` / `date` / `cycle`）和可选 `timerValue`；新节点默认为 `duration` + `PT30M`，切换类型会更新相应格式的示例。时间值留空时业务启动表单要求填写 `{节点id}_timerValue`；引擎到期自动继续，不创建人工待办。启动表单值映射到真实 `variables` 请求，同时可在启动变量 JSON 中编辑。

所有内置节点都可在通用属性面板设置可选字符串 `bizType`，用于记录宿主业务系统解释的节点级业务标识。该值随业务工作流模型及设计稿导入导出，并传入宿主 `compile(model)` 回调；设计器不校验其格式或唯一性，也不将它映射到 BPMN XML 或 `params_rules`。bizType 是 WorkflowModel v1 的已知字段，空值会从节点记录移除。

所有内置节点也支持「业务数据（bizJson）」多行编辑，片段模式同样可用；原有 bizType 在片段模式中隐藏。bizJson 是可选字符串，允许非 JSON 文本，内容不解析、不格式化、不 trim。未填写时保持缺省；UI 提交空字符串会删除字段，导入显式空字符串和纯空白字符串则保留。对象、数组、null、数字和布尔值保留原输入并报 field-type，禁止编译。宿主完整自定义属性编辑器继续优先于默认面板。

bizJson 随 v-model、设计稿、模型、模板复制、片段快照和 compile 回调保留。子流程容器及每层内部节点分别设置，复制新 ID 不修改字符串内容。后端将其写为 camunda:property(name=bizJson) 模板默认值，并声明实例变量 {activityId}_bizJson 优先，删除后回退默认值；新契约下内部 activityId 沿用该节点原 ID。2026-11-18 旧契约编译核对发现后端会去掉首尾空白，详见 [bizJson 验证记录](../workflow-sdk/docs/node-bizjson-verification.md)。该记录仅验证编辑与编译，未验收实例变量覆盖/回退。

## 扩展能力

设计器支持 `type: 'subProcess'` 的嵌入式子流程节点。选择节点属性中的片段后，设计稿保存片段库来源 key/name 与 `process` 内容快照，并以 `subProcessSourceJson` 保存分配新 ID 前的来源快照，用于判断片段库内容是否变化；宿主提交编译前会剔除来源字段和片段画布元数据，嵌入式 `process` 发送 `nodes`、可选 `flows` 和可选业务表单引用 `bizFormKey`。旧设计稿的内部 `processId`、`processName` 可作为编辑元数据保留，编译时剥离；内部 `bizFormKey` 和节点本身的业务属性仍按契约保留。2026-11-20 后端契约不再为内部节点和连线添加父节点 ID 前缀，编译时沿用前端传入的唯一 ID；`source`、`target`、`reminder.target` 仍只能引用同层节点。设计器片段编辑模式允许不含开始或结束节点，保存前要求至少一个节点；管理页面和 API 仍由宿主提供。片段库后续修改不会自动改变已保存节点快照。

设计器后续会持续新增节点类型和节点属性来扩展能力。按 ADR-0005 的契约，新增影响编译的节点或字段时，须先升级正式业务 JSON 契约并实现后端编译能力，再同步 schema 副本、前端类型与映射；未升级前，未知业务字段/节点保持原样并阻止编译。`subProcess.process` 的正式编译字段以 [业务 JSON 规范](http://192.168.124.202:8085/bpmn/spec) 为准，Schema 副本的来源说明也应引用该后端规范。

标准模型类型、Schema 与协议校验由独立 [@workflow/sdk](../workflow-sdk/README.md) 提供，ID 与嵌入式流程字段按 2026-11-20 后端 `/bpmn/spec` 契约同步，先前的 2026-11-18 等快照保留作历史依据。`schema/workflow-model-v1.schema.json` 为 SDK Schema 的同步下载副本，使用 `pnpm --filter @workflow/designer sync:schema` 更新，不单独维护；真实立项审批 fixture 位于 `src/fixtures/project-approval.json`。后端执行契约仍由编译器维护方负责。

SDK 允许省略名称、坐标和 flows；设计器补齐编辑默认值，并继续检查唯一开始/结束、名称、普通回路和连接策略。标准字段/会签/分支/等待/提醒/子流程语义交由 SDK 检查，诊断通过 path 与 scope 映射到画布；扩展校验仍可追加。设计器支持 SDK 的 parallel 并行网关，可从流程控制节点库添加。属性按入出线说明分流、汇合或先汇合再分流，不创建待办、不代表审批通过。并行出线禁止新增 branch/conditionExpression；非法导入保留字段并阻止编译。旧兼容类型继续保留并提示画布能力限制。基本编辑、嵌套检查、片段复用、真实编译与三次隔离实例汇合已验证，分层结果记录在 [并行网关验证说明](docs/parallel-gateway-verification.md)。

宿主可从 `@workflow/designer` 导入 `toWorkflowCompilerJson(model)`：它剥离已知流程画布宽高、片段来源及嵌入式流程的旧 `processId`、`processName` 元数据，保留内部 `bizFormKey`，递归补齐省略的连线 ID，并经 SDK 校验整个模型的节点与连线定义 ID 唯一性后导出。节点 x/y/width/height 保留，未知业务字段不剥离。SDK 标准模型、函数定义与设计器均遵循 2026-11-20 后端契约，要求节点和连线定义 ID 在整个模型中唯一。视口、主题和路由继续留在设计稿信封中。需要单独使用模型能力的接入方安装 SDK 即可，完整流程见 [接入指南](../workflow-sdk/docs/integration.md)。

根仓库 /workflow-designer 是集成示例：提供 JSON 查看/粘贴或文件导入、JSON 转 XML、BPMN XML 结果查看、基础流程检查和显式确认的业务任务模板发布。设计器库不假定部署 API；在此宿主中，compile 回调使用 /api/v1/bpmn/json2xml，deploy 回调复用 /api/v1/template，并在不确定的网络结果时允许查询模板状态。默认立项审批示例的坐标与随包 fixture 一致；“多人会签”和“比例投票”示例侧向展开结束节点，以清楚显示驳回回流与通过路径；金额分支和并行审批保留现有清晰布局。页面首次打开和导入模型时保留已有节点坐标，只有用户主动选择“自动布局”时才运行 ELK 重排。应用流程模板会清除先前视口，在新图渲染后适应整张图；保存的编辑器视口仍会在重新打开设计稿时恢复。/designer 继续提供 BPMN/XML 直接建模与引擎部署。

## 业务表单目录扩展

宿主通过 extensions.businessForms 注入 WorkflowFormDataSource：list({ nameLike, firstResult, maxResults }) 返回 WorkflowFormOption[]，get(key) 返回当前目录详情；选项包含 key、name、version、status。宿主负责只返回已发布且可用项、鉴权及 API，包不直接请求后端。

审批和多人审批属性面板显示选择器，新选择保存 bizFormKey: "form:<key>@<version>"。既有无版本、@latest、route: 引用按原值保留并说明语义；旧 form 字段独立保留。固定版本的存在及可用性由宿主在编译/发布前校验。本仓库示例宿主复用表单 gateway，实际变量/任务读取及使用步骤见 [业务人工任务表单](../../docs/business-forms.md)。
