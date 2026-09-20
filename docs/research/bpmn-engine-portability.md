# BPMN 前端与未来引擎的可迁移边界

调研日期：2026-09-20。本文区分官方文档/源码事实、本仓库实测与尚未实现的方案建议，不作为已经确定的引擎选型或 ADR。

## 结论

1. **建议继续使用 bpmn-js，自定义画布样式并保留标准 BPMN 模型。** `saveXML()` 保存模型及 DI 布局，`saveSVG()` 保存当前图形；只改绘制方法通常不会把自定义 SVG 图标写进 BPMN XML。修改 businessObject、DI 或保存事件钩子的扩展则可能改变 XML。[S1][S2]
2. **LogicFlow 可以通过官方插件生成和导入 BPMN XML。** 当前官方源码提供两组不同的 BPMN 插件，较完整的一组有并行网关、边界事件和子流程等预设，不能概括成“只能导出几种简单节点”。但源码中的节点/转换支持不等于任意 BPMN 文件无损往返或跨引擎执行验证。[S3][S4]
3. **BPMN 2.0 标准 XML 与跨引擎可执行是两件事。** Flowable、Camunda 7、Camunda 8 都在标准结构上增加自己的任务分配、服务调用与其他执行配置；条件表达式语言也需要明确选择。[S5]–[S12]
4. **Go 业务后端可以调用独立部署的这些引擎。** 业务 API、业务数据与 worker 使用 Go，不要求流程引擎本身也用 Go；如果约束是“必须原生 Go 库、同一进程运行”，则需要重新评估 Go 引擎及其支持的 BPMN 子集。[S7][S9][S13][S14]
5. **最值得预先固定的是设计契约、支持范围与对接接口。** 保存设计 XML 原文；发布时由目标引擎适配器生成部署 XML；运行时再由另一层适配器统一任务和实例 API。先选一套引擎完成端到端验证，再按实际需求增加第二套，避免提前实现一个未经验证的“万能转换器”。

## 1. 自定义 bpmn-js 后的 XML

### 官方源码事实

bpmn-js 使用 diagram-js 处理图形交互，使用 bpmn-moddle 读写 BPMN 元模型。[S1] 本仓库安装的 bpmn-js 18.28.0 与官方相同版本源码核对如下：[S2]

- `BaseViewer.js` 的 `saveXML()` 调用 `this._moddle.toXML(definitions, options)`。
- `saveXML.start` 和 `saveXML.serialized` 允许扩展在序列化前后改动内容，因此不能承诺任何插件都不会改 XML。
- `saveSVG()` 另行读取画布 SVG 内容并序列化。
- `BpmnRenderer.drawShape()` 处理形状的绘制。图标、圆角、字体等纯渲染实现不是 BPMN 任务的执行定义。

因此，即使把人工任务画成自定义的审批卡片，只要模型类型仍是 `bpmn:UserTask`，XML 仍可包含下面的任务和布局结构。以下为说明片段，完整文件见[设计样本](./examples/portable-approval-design.bpmn)：

```xml
<bpmn:userTask id="Task_Approve" name="经理审批"
  wf:assignee="manager"
  wf:formKey="approval-form">
  <bpmn:incoming>Flow_Start_Approve</bpmn:incoming>
  <bpmn:outgoing>Flow_Approve_End</bpmn:outgoing>
</bpmn:userTask>

<!-- 同一个 definitions 下，DI 部分引用上面的任务 ID -->
<bpmndi:BPMNShape id="Task_Approve_di" bpmnElement="Task_Approve">
  <dc:Bounds x="200" y="132" width="220" height="96" />
</bpmndi:BPMNShape>
```

完整文档中的命名空间应分别绑定 BPMN 模型、BPMN DI、DC 等标准 URI，以及本仓库的 `wf` URI。片段中的 `wf:*` 是自有设计扩展，**Flowable 或 Camunda 不会因为它叫 assignee 就自动按办理人配置执行**。XML 前缀可以不同，识别扩展应以命名空间 URI 与本地名称为准。现有 `wf` URI 是 `https://bpmn-workspace.local/schema/workflow`，不得静默改掉旧契约。

可以把文件内容理解为三个部分：

| 内容 | 示例 | 对迁移的影响 |
| --- | --- | --- |
| 流程结构 | `userTask`、`sequenceFlow`、网关、标准多实例结构 | 优先保留 BPMN 标准建模；仍需核对目标引擎支持的元素 |
| 编辑布局 | `BPMNShape`、`Bounds`、`BPMNEdge`、`waypoint` | 用来还原位置、尺寸和线条，通常不是业务执行规则 |
| 扩展契约 | `wf:assignee`、`wf:approval`、`wf:formKey` | 由发布适配器解释并生成目标执行绑定 |

自定义图标通常随前端应用发布。其他编辑器打开 XML 时可以按标准类型展示自己的图标；需要分享当前视觉效果时另导出 SVG。若未来要逐节点保存可选图标、配色或展示密度，建议单独定义展示配置，避免与审批执行字段混用。

### 本仓库实测

2026-09-20 执行：

```powershell
node docs/research/probes/bpmn-xml-roundtrip.mjs
```

复现材料：

- 输入：[portable-approval-design.bpmn](./examples/portable-approval-design.bpmn)。包含开始事件、经理审批、结束事件、完整连线与 DI；设计样本为 `isExecutable="false"`。
- 脚本：[bpmn-xml-roundtrip.mjs](./probes/bpmn-xml-roundtrip.mjs)。
- 序列化产物：`output/bpmn-portability/portable-approval-serialized.bpmn`。
- 结果：`output/bpmn-portability/roundtrip-results.json`；输出可由保留的样本和脚本重新生成。

环境为 Node v24.19.0、bpmn-js 18.28.0、bpmn-moddle 10.2.0。首次导入及重新导入警告均为 0；模型类型、节点 ID、连线引用、`wf` 字段及 DI 坐标/尺寸/waypoint 保留，任务尺寸为 220 × 96。

**上述 roundtrip 实验仅验证 moddle 的 XML 读写。** 另外执行了独立的 XSD 结构校验：

```powershell
.\docs\research\probes\bpmn-xsd-validation.ps1
```

该脚本在运行 roundtrip 脚本后执行，使用 bpmn-moddle 10.2.0 随包的 BPMN20、BPMNDI、DC、DI、Semantic XSD 和 .NET XML 校验器。结果记录在 `output/bpmn-portability/schema-results.json`，其中也记录了样本及各 XSD 的哈希：**0 个 Error、2 个 Warning**。两项警告均因为未注册自有 `wf` XSD，无法检查 `wf:assignee` 与 `wf:formKey` 的类型。基础 BPMN/DI 结构通过该次 XSD 校验，自有扩展类型与执行语义未由它验证。

本次没有在浏览器中安装新的自定义 Renderer，没有执行 LogicFlow 往返测试，也没有进行任何引擎部署/运行测试。moddle“没有解析警告”及基础 XSD 检查通过，都不能提升为“引擎兼容”。

本地源码与配置 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| bpmn-js 18.28.0 `lib/BaseViewer.js`，与官方同版本源码一致 | `ab25795cf314a5348727b006f394f6ad4632c0ca480a6ea50ebeeb5da0731276` |
| bpmn-js 18.28.0 `lib/draw/BpmnRenderer.js` | `24daf4e28dada4063c9335966524f5c778e280461b5881766a5725daa9df6e46` |
| 本仓库 `src/bpmn/workflow-moddle.json` | `45066c01d26dc395346ebce09c0d9cbdc49c38ef541604a93d16d2357954ff21` |

## 2. LogicFlow 生成 BPMN XML 是否方便

### 官方源码事实

核对的是 LogicFlow 官方仓库提交 `698019f1ef6dd322afbbb0b4e82b9d31e198adac`；该提交的 `@logicflow/extension/package.json` 版本字段为 `2.3.1`。这只是本次核对的源码快照，不表示已经验证所有同名 npm 发布包。[S3][S4]

导出名称的大小写有实际区别：

| 插件组 | 绘制插件 | JSON 转换 | XML 转换 | 核对到的预设范围 |
| --- | --- | --- | --- | --- |
| `bpmn` / `bpmn-adapter` | `BpmnElement` | `BpmnAdapter` | `BpmnXmlAdapter` | 开始/结束、排他网关、人工任务、服务任务、顺序流 |
| `bpmn-elements` / `bpmn-elements-adapter` | `BPMNElements` | `BPMNBaseAdapter` | `BPMNAdapter` | 在开始/结束、人工/服务任务和顺序流外，包含中间捕获/抛出、边界事件、并行/包容/排他网关、子流程的预设 |

后者的 `BPMNAdapter` 将 LogicFlow 的 `adapterIn`、`adapterOut` 分别绑定到 XML 导入和导出；扩展参数有 `transformer`、`mapping`、`excludeFields`、`retainedAttrsFields`。转换源码显式处理条件表达式、计时事件和子流程等内容。[S4]

按这些官方导出与注册接口，可使用下面的最小组合；它是据源码整理的用法示意，**本次未安装或运行 LogicFlow**，不代表所有目标流程已验证：[S3][S4]

```ts
import LogicFlow from '@logicflow/core'
import { BPMNElements, BPMNAdapter } from '@logicflow/extension'

const lf = new LogicFlow({
  container,
  plugins: [BPMNElements, BPMNAdapter],
})

lf.render(bpmnXml)
const exportedBpmnXml = lf.getGraphData()
```

这里不要把旧的 `BpmnAdapter` 与新的 `BPMNAdapter` 混为一谈。自定义卡片如果在 LogicFlow 中使用业务类型名称，还需要明确映射到 `bpmn:userTask` 等标准类型，并为属性提供转换。

### 选型建议

如果范围是插件已覆盖的受控流程，LogicFlow 提供了现成起点，生成 BPMN XML 不必完全从零手写。如果要求导入用户提供的任意 BPMN、保存未知厂商扩展、处理多流程/泳道/消息流/复杂事件/多实例并保证再次导出不丢失，则需要按选定版本逐项做兼容性测试。

特别要验证：

- 自定义节点是否准确映射为目标 BPMN 元素；节点“画得出来”与属性“正确转成执行配置”分别验收。
- `extensionElements`、厂商属性、正式表达式的语言信息是否往返保留。
- 子流程嵌套、边界事件绑定、并行汇合与多实例语义是否完整。
- ID、跨元素引用、DI 布局与命名空间是否正确；不能只检查 XML 字符串格式。
- 选用 Adapter 能否保留需要但前端不编辑的外部信息；不能默认接受后静默丢弃。

本仓库已经围绕 bpmn-js 建立 moddle、审批设计契约与往返测试，仅因图标不合适而切换编辑器，会增加第二套图模型到 BPMN 模型的转换维护。因此建议优先自定义 bpmn-js 的渲染与工具栏。

## 3. Flowable、Camunda 7、Camunda 8 的执行契约差异

以下是官方文档/源码事实的代表性比较；引擎版本与已启用能力必须进入发布目标配置。Flowable 来源是调研日官网快照，Camunda 文档分别固定为 7.24 和 8.8，不宣称覆盖所有版本。[S6]–[S14]

| 维度 | Flowable | Camunda 7.24 | Camunda 8.8 |
| --- | --- | --- | --- |
| 人工任务办理人 | 常见 `flowable:assignee` / `candidateUsers` / `candidateGroups` | 常见 `camunda:assignee` / `candidateUsers` / `candidateGroups` | `extensionElements` 内 `zeebe:assignmentDefinition`；Camunda user task 使用 `zeebe:userTask` |
| 条件表达式 | 文档中的条件表达式使用 UEL，如 `${amount > 1000}` | UEL/JUEL 常见，如 `${amount > 1000}`；7.24 也有 FEEL 条件与输入输出支持，需明确配置 | 使用 FEEL，如 `= amount > 1000` |
| 外部服务任务 | `flowable:type="external-worker"` 和 `flowable:topic`；还存在 Java delegate、HTTP 等不同任务实现 | `camunda:type="external"` 和 `camunda:topic`；外部 worker 获取、锁定并完成任务 | `zeebe:taskDefinition` 指定 job `type`、`retries`，job worker 处理工作 |
| 远程接入 | Flowable REST API；具体 worker 接口和任务类型按目标版本确认 | REST API；external-task 官方明确支持非 Java worker | Orchestration Cluster REST API；另有 Zeebe gRPC API |

Flowable 与 Camunda 7 也支持部分标准 BPMN 资源分配结构，表格展示的是其官方常见扩展写法，不表示办理人只能写厂商属性。[S6][S8] Camunda 7 的 FEEL 支持范围和声明方式不应与 Camunda 8 假定一致。[S10][S11]

相同的设计任务可以在发布时产生不同的执行片段。下面是**待适配与实测的示意片段，不是已部署产物**；省略了共同的 `definitions`、命名空间声明、流程、连线和 DI：

```xml
<!-- 设计 XML：本仓库的静态用户标识契约 -->
<bpmn:userTask id="Task_Review" wf:assignee="manager-001" />

<!-- Flowable 部署 XML -->
<bpmn:userTask id="Task_Review" flowable:assignee="manager-001" />

<!-- Camunda 7 部署 XML -->
<bpmn:userTask id="Task_Review" camunda:assignee="manager-001" />

<!-- Camunda 8.8 部署 XML -->
<bpmn:userTask id="Task_Review">
  <bpmn:extensionElements>
    <zeebe:assignmentDefinition assignee="manager-001" />
    <zeebe:userTask />
  </bpmn:extensionElements>
</bpmn:userTask>
```

这些例子不能推广成简单的命名空间替换。身份系统中的实际用户 ID、候选组定义、表单引用、输入输出变量、重试、事务边界、错误处理及 API 都有差异。Camunda 8.8 的候选组值和任务可见性还会受身份配置以及所用 Tasklist 版本影响；业务前端应通过自己的后端执行授权，不能把候选人字段当成完整权限实现。[S12]

本仓库的[审批设计契约](../adr/0001-human-approval-design.md)需要完整保留：

- `wf:assignee` 当前仅表示静态单人用户标识。
- `wf:approval version="1"` 保存有顺序的参与人名单与会签/或签策略。
- 标准多实例数量不等于人员绑定；“完成”不等于“同意”。
- 环节结果汇总、并发原子结算、剩余待办结束及退回重提由后端实现并验证。

因此不能将 `policy="any"` 草率转换成“任意实例完成即完成环节”。必须按已有语义区分个人拒绝、全员拒绝、任一同意与退回结果。本次不修改既有 ADR，也不声称已完成三种引擎的审批执行适配。

## 4. Go 后端的两种约束

### Go 业务服务，流程引擎可以独立运行

这种架构可行。Flowable 提供可独立部署的 REST 应用；Camunda 7 的外部任务文档明确说明 worker 可以运行在其他进程、机器并使用其他语言，通过 REST 获取/锁定/完成任务；Camunda 8.8 提供 REST 与跨平台 gRPC。[S7][S9][S13][S14]

建议边界：

```text
Vue + bpmn-js
     │ 自有流程设计、发布、任务与实例 API
     ▼
Go 业务服务
     ├─ 设计版本存储：原始设计 XML + 表单/规则版本
     ├─ 发布适配器：设计校验 → 目标引擎 XML → 部署
     └─ 运行适配器：实例/待办/完成任务/历史/事件等
                   │ REST 或适用的 gRPC
                   ▼
            独立流程引擎服务
                   │ 可获取、锁定、完成的外部任务/job
                   ▼
             Go 业务 worker
```

发布适配与运行 API 适配是两个独立责任：仅仅成功生成 XML，仍没有统一“查询待办”“提交意见”“获取轨迹”。Go worker 接口选择以实际引擎版本为准；不要把某个 Go SDK 的存在当作维护状态、API 覆盖或执行正确性的证明。

服务任务建议使用稳定的业务操作标识，例如 `order.validate`，由适配器将其绑定到 Flowable/Camunda 7 的 topic 或 Camunda 8 的 job type。不要在引擎未定时，把 Java 类名、Spring bean 或某个平台连接器配置当作业务设计契约。

### 必须是原生 Go 库、同一进程、不能运行外部引擎

这是另一项架构约束。通过 REST/gRPC 使用 Flowable 或 Camunda 不会把它们变成原生 Go 嵌入库。如果该约束成立，需要先验证候选 Go 引擎的 BPMN 支持范围、持久化、恢复、并发和人工任务能力，再据此限制设计器可编辑的元素。不能因为都写了“支持 BPMN”便假定现有设计能直接执行。

本仓库已有 [gobpm 兼容性报告](./gobpm-compatibility.md)，其中的版本、实验范围与复现限制继续有效；本次没有重新运行该引擎或扩大旧报告的结论。

## 5. 现在可确定的设计契约与实施顺序

以下全部是方案建议，除明确引用现有文件的部分外尚未实现。

### 保存一种设计源，生成目标部署产物

以现有 BPMN XML + DI + 版本化 `wf` 契约作为可编辑的设计源。每次发布记录：设计版本/内容哈希、目标引擎及版本、适配器版本、生成的执行 XML、引擎部署/定义 ID，以及元素 ID 的对应关系。执行产物不反向覆盖设计原文。

保留节点 ID 有利于前端高亮；若转换新增技术节点，应保存设计节点到执行节点的映射，并在轨迹展示中区分业务节点与技术节点。运行实例必须关联它启动时的部署版本，不能用最新草稿解释历史运行。

这个分离降低未来迁移成本，**不承诺跨引擎迁移正在运行的实例**。运行实例迁移、历史归档和新旧引擎并行运行需要单独方案。

### 定义受支持的 BPMN 子集与分层校验

先列明第一阶段允许的元素与用法，例如开始/结束、人工任务、服务任务、排他/并行网关、受控多实例；复杂事件、嵌套子流程、补偿等按需求增加。目标引擎能力必须参与发布校验，不能靠工具栏能放出节点来推断支持。

分开报告三类结果：

1. 设计结构检查：引用、开始/结束、连线、DI 与基础完整性。
2. 自有业务契约检查：参与人名单、审批策略、表单、变量、退回规则。
3. 目标引擎检查：受支持元素、表达式语言、任务执行绑定、身份映射及部署结果。

`isExecutable="true"` 只是一项声明，不能代替第 3 层验证。本次新增的设计样本使用 `false`，部署产物在适配与验证通过后再按目标引擎要求生成。

### 条件规则、身份与变量

当前项目的 `conditionExpression` 保存原文，**尚未绑定统一的表达式语言，也没有跨引擎表达式编译器**。以后可在常见业务条件上提供受限的结构化规则，例如字段、运算符、类型化值与 AND/OR 组合，由适配器生成 UEL 或 FEEL；高级原文表达式则显式标记所属语言和引擎能力。

不建议靠替换 `${...}` 与 `= ...` 转换任意表达式。空值、布尔/数字/日期、集合、属性访问与函数调用语义都要有测试，超出可转换子集应提示需要人工处理。

流程变量契约应明确定义字段名、类型、空值/缺失、枚举、时间与业务标识。办理人/候选组采用稳定业务标识，再映射到引擎或身份系统标识；表单保存可版本化的业务引用，不提前绑定某一家表单运行时。

### 最小端到端验证

先只选一套目标引擎，完成“生成部署 XML → 部署 → 发起 → 查询待办 → 提交意见 → 条件流转 → 查看历史”。然后验证现有审批契约的关键场景：

- 单人审批与身份/表单绑定。
- 会签中任一拒绝、全部同意；或签中任一同意、全员拒绝；退回语义。
- 并行分支汇合与分支结果汇总，避免只验证单线程顺序流。
- 任务重复提交、worker 重试、超时重新获取与业务幂等；防止引擎重试重复产生业务副作用。
- 发布新版本后，已有实例继续使用原定义，并能在原设计图上还原轨迹。

再把同一套验收用例用于第二套引擎，才能判断“切换成本”与实际可迁移范围。本次没有安装、启动或部署任何引擎，因此这些场景均待验证。

## 6. 一手资料与版本记录

下列来源均访问于 **2026-09-20**。网页哈希为本次响应正文的 SHA-256；动态官网可能更新，哈希用于说明本次观测快照。没有把网络搜索摘要或第三方文章作为事实来源。LogicFlow 官网页面本次连接失败，因此相关结论直接依据固定提交的官方源码。

| 编号 | 官方来源与适用范围 | 版本/提交或 SHA-256 |
| --- | --- | --- |
| S1 | [bpmn-js Walkthrough](https://bpmn.io/toolkit/bpmn-js/walkthrough/)，diagram-js 与 bpmn-moddle 的责任、BPMN XML 读写 | SHA-256 `2ec4ce54459ba2b72c5b3ca98ecf6ec2ac72490ac791d6b2100b15b3b18cb813` |
| S2 | [bpmn-js BaseViewer.js](https://github.com/bpmn-io/bpmn-js/blob/v18.28.0/lib/BaseViewer.js)，XML 与 SVG 保存实现 | `v18.28.0`；SHA-256 `ab25795cf314a5348727b006f394f6ad4632c0ca480a6ea50ebeeb5da0731276` |
| S3 | [LogicFlow extension 导出](https://github.com/didi/LogicFlow/blob/698019f1ef6dd322afbbb0b4e82b9d31e198adac/packages/extension/src/index.ts)、[旧 BPMN 绘制插件](https://github.com/didi/LogicFlow/blob/698019f1ef6dd322afbbb0b4e82b9d31e198adac/packages/extension/src/bpmn/index.ts)、[旧 Adapter](https://github.com/didi/LogicFlow/blob/698019f1ef6dd322afbbb0b4e82b9d31e198adac/packages/extension/src/bpmn-adapter/index.ts) | 固定提交 `698019f1ef6dd322afbbb0b4e82b9d31e198adac`；extension 包版本字段 `2.3.1` |
| S4 | [BPMNElements](https://github.com/didi/LogicFlow/blob/698019f1ef6dd322afbbb0b4e82b9d31e198adac/packages/extension/src/bpmn-elements/index.ts)、[新 Adapter](https://github.com/didi/LogicFlow/blob/698019f1ef6dd322afbbb0b4e82b9d31e198adac/packages/extension/src/bpmn-elements-adapter/index.ts)、[事件预设](https://github.com/didi/LogicFlow/blob/698019f1ef6dd322afbbb0b4e82b9d31e198adac/packages/extension/src/bpmn-elements/presets/Event/index.ts)、[网关预设](https://github.com/didi/LogicFlow/blob/698019f1ef6dd322afbbb0b4e82b9d31e198adac/packages/extension/src/bpmn-elements/presets/Gateway/index.ts)、[任务预设](https://github.com/didi/LogicFlow/blob/698019f1ef6dd322afbbb0b4e82b9d31e198adac/packages/extension/src/bpmn-elements/presets/Task/index.ts) | 同上固定提交；新 Adapter SHA-256 `9dfeb6226dfe2f167f2a50dc576009c5b8d47f7ee0c75d18f32b19aa165ceae2` |
| S5 | [OMG BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/About-BPMN)，正式规范与 BPMN/DI 等机器可读模式 | `2.0.2`；SHA-256 `1e3bb321b07d322ee61087bb8787a69c9acf885d8b43ba4672ad0db34b2152a5` |
| S6 | [Flowable BPMN Constructs](https://www.flowable.com/open-source/docs/bpmn/ch07b-BPMN-Constructs)，扩展、条件、人工分配、External Worker Task | 官网未在 URL 固定版本；SHA-256 `17946f5f5a54137ab1c45d1528cfe612538d92e751d5e5263c370f9e8a303b7a` |
| S7 | [Flowable REST API](https://www.flowable.com/open-source/docs/bpmn/ch14-REST)，独立 REST 应用、部署、任务与实例接口 | 官网未在 URL 固定版本；SHA-256 `7ec90a490704f6ad14cc4fb212251b8b0bb33b2b2260d9a6e050eaadfde44617` |
| S8 | [Camunda 7 User Task](https://docs.camunda.org/manual/7.24/reference/bpmn20/tasks/user-task/)，标准资源分配与 Camunda 扩展 | `7.24`；SHA-256 `0557692ae704d78a2263d34a0da352cd5452d46194ddcff365b1e612e1336f27` |
| S9 | [Camunda 7 External Tasks](https://docs.camunda.org/manual/7.24/user-guide/process-engine/external-tasks/)，topic、锁定、完成与跨语言 REST worker | `7.24`；SHA-256 `2c0c561416878f432ae46fb74a8f86f597f5ee6465a4afd81c2acf45f9d85dc2` |
| S10 | [Camunda 7 UEL](https://docs.camunda.org/manual/7.24/user-guide/process-engine/expression-language/unified-expression-language/)、[FEEL](https://docs.camunda.org/manual/7.24/user-guide/process-engine/expression-language/friendly-enough-expression-language/) | `7.24`；UEL SHA-256 `221b67059b602db1acef8b455bbcc33508955d167be1961dc74d9fbb6c363cc6`；FEEL SHA-256 `c2438e198cdc72cf1c8fdee2406907b4787ac0a679c849c177ce3f8d412194f3` |
| S11 | [Camunda 8 Expressions](https://docs.camunda.io/docs/8.8/components/concepts/expressions/)，FEEL 及 `=` 表达式前缀 | `8.8`；SHA-256 `ed1fa3b248f8ac63a1ed9a15cc41e136611ecfdd6892a70d11457d1aa1ee6887` |
| S12 | [Camunda 8 User Tasks](https://docs.camunda.io/docs/8.8/components/modeler/bpmn/user-tasks/)、[Service Tasks](https://docs.camunda.io/docs/8.8/components/modeler/bpmn/service-tasks/) | `8.8`；User Tasks SHA-256 `5a97b713d7d02331dbd475ed34d05f791ac19d5d6271ef0b80c552a87c0a4442`；Service Tasks SHA-256 `f0ef3785ee8317f209dc32c7f22e28b0bc2642d203bf893607e527566a89b4a5` |
| S13 | [Camunda 8 Orchestration Cluster REST API](https://docs.camunda.io/docs/8.8/apis-tools/orchestration-cluster-api-rest/orchestration-cluster-api-rest-overview/)，部署、实例、人工任务、变量与 OpenAPI | `8.8`；SHA-256 `3e54c0e184d5eb39dcbaf8179b10c711820c92dcea77a5e1fd5cbd068b596bec` |
| S14 | [Camunda 8 Zeebe gRPC 概览](https://docs.camunda.io/docs/8.8/apis-tools/zeebe-api/overview/)、[Gateway Service](https://docs.camunda.io/docs/8.8/apis-tools/zeebe-api/gateway-service/)，ActivateJobs、DeployResource、CompleteJob 等 RPC | `8.8`；概览 SHA-256 `4adf10816f14ea2f149fb2cb303710b2657b5847bde379dccf5916d7da5f76cd`；RPC SHA-256 `8c3c18f698753c35eea291c54fff56ffe208c6109ae79a5ff69726b7262a3eb5` |
