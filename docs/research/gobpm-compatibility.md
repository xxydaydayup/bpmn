# gobpm 与 Camunda BPMN XML 兼容性调研

调研日期：2026-09-19。核查 gobpm 提交 `94f307e265c519d2f93bd283e0e7019701fea699`（提交日期 2026-09-07）。本报告替换此前未获得仓库源码时的通用分析；以下明确区分源码事实、实际实验和方案建议。

## 结论

**gobpm 可以作为 Go 审批与业务编排的引擎基础，但不是 Camunda 7 的完整替代平台。它已经实现部分 Camunda 7 扩展的导入，不能无损读写 camunda-bpmn-moddle 生成的完整 XML，也不能按 Camunda 语义执行所有扩展。**

前端可以使用 `bpmn-js + camunda-bpmn-moddle`，但必须限制为后端已验证的能力子集，并为动态办理人等功能增加适配。最关键的架构选择是：**设计 XML 原文按版本保存，另行解析为执行模型；不要使用 gobpm 的 Export 重建用户的设计文件。**

项目自述为“active development, not yet production-ready”。其独立服务器仍是占位程序，业务 API、待办、表单和身份接入需要宿主应用实现。[README](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/README.md#L9-L18) · [服务器入口](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/runtime/cmd/gobpm-server/main.go#L17-L42)

## 它有哪些可用的流程能力

以下是实际代码已存在的能力，不是把开发规划当成实现；本次没有全面验证其运行正确性或生产稳定性。

| 能力 | 当前实现与边界 |
| --- | --- |
| 人工任务 | 提供 Take、Complete、Claim、Unclaim、Reassign；办理人、候选人/组、等待与完成后推进均有模型和 API |
| 服务任务 | 可绑定 Go 操作；支持 external worker topic，宿主仍需配置执行器/分发器 |
| 流程控制 | 有条件、并行、包容、事件等网关以及定时器；运行模型能力不等于 XML 导入/导出覆盖范围 |
| 表达式 | 默认使用 gobpm:lite 和 gobpm:goexpr；转换器可翻译部分 JUEL 条件，但没有完整 Java/JUEL 运行时 |
| 持久化恢复 | 已有检查点和 PostgreSQL/SQLite 适配器；需要显式配置，重启时提供相同流程版本和稳定节点 ID；SQLite 适配器注明非集群安全 |
| 对外平台 | 默认任务分发器为 no-op，HTTP/gRPC 独立服务器仍是占位；待办、组织权限、表单、业务接口由应用建设 |

依据：[人工任务 API](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/thresher/tasks.go#L148-L208)、[认领和转派](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/thresher/tasks.go#L298-L390)、[默认分发器](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/interactor/distributor.go#L5-L31)、[服务任务](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/model/activities/service_task.go#L82-L163)、[默认表达式引擎](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/thresher/thresher.go#L281-L290)、[恢复实现](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/thresher/recovery.go#L17-L41)、[恢复约束](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/docs/guides/operating/persistence.md#L162-L227)、[SQLite 适配器](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/adapters/sqlite/sqlite.go#L1-L11)。

## Camunda 扩展的实际支持范围

gobpm 使用命名空间感知的手写 XML token 解析器。`dialect.go` 明确识别 `http://camunda.org/schema/1.0/bpmn`，不是仅凭普通 Go 结构体猜测行为。[方言识别及映射源码](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/convert/bpmn/dialect.go#L15-L182)

| 前端 XML 内容 | 导入行为 | 重要限制 |
| --- | --- | --- |
| `camunda:assignee="john"` | 映射成静态办理人 | 已实测；Export 不回写 |
| `camunda:candidateUsers` / `candidateGroups` | 逗号分隔的静态用户/组列表 | 不能假定表达式列表也会求值 |
| `camunda:assignee="${manager}"` | **把 `${manager}` 当成字面用户 ID** | 已实测；XML 映射调用 WithAssignee，没有调用 WithAssigneeExpr |
| `camunda:type="external"` + `camunda:topic="charge"` | 映射成外部 worker 的 topic | 已实测 topic=charge；不等于外部 worker 已配置或 HTTP 协议与 Camunda 相同 |
| `camunda:decisionRef` | 业务规则任务读取决策引用 | 交给宿主规则引擎，不等于内置执行 Camunda DMN |
| `camunda:class` / `delegateExpression` / 监听器 / 表单 / inputOutput / async 等 | 未支持的已识别配置被报告后丢弃 | 部分文件仍可导入成功；不能用 err==nil 证明兼容 |
| `camunda:properties` | 报告并丢弃 | 已实测，不保留自定义键值 |
| BPMN DI 布局 | 导入时跳过，导出不生成 | 所有六份样本均验证导出无 BPMNDiagram |
| 未知外部命名空间，例如 `app:` 或 Zeebe | 静默跳过 | Dropped 为空也不能证明没有信息丢失；自有扩展也需要单独适配 |

动态办理人的直接证据：[WithAssignee 与 WithAssigneeExpr 是两种独立配置](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/model/activities/user_task_options.go#L105-L128)；[静态 Assignment.Resolve 直接返回字符串](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/model/hinteraction/assignment.go#L114-L132)。本次通过公开 Assignments()/Resolve() 接口验证，结果包含字面值 `${manager}`。

条件表达式需要单独看：转换器的 `juel.go` 会把一部分 JUEL 条件翻译为自己的表达式语言，无法翻译的语法拒绝导入；这条路径没有用于上述办理人属性。因此既不能说“所有 JUEL 都不支持”，也不能说“识别 ${...} 就能全面兼容”。[JUEL 翻译范围](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/convert/bpmn/juel.go#L12-L67)

### 重试配置有 XML 形态不兼容

转换器读取的是属性形式：

```xml
<bpmn:serviceTask camunda:failedJobRetryTimeCycle="R3/PT5M" />
```

但实际下载的 camunda-bpmn-moddle 描述把它定义为带 body 的扩展元素。使用本项目安装的 `bpmn-moddle 10.2.0` 加载该描述后，成功读写且没有警告的形式是：

```xml
<bpmn:serviceTask camunda:type="external" camunda:topic="charge">
  <bpmn:extensionElements>
    <camunda:failedJobRetryTimeCycle>R3/PT5M</camunda:failedJobRetryTimeCycle>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

实测结果：topic 映射成功，但 `IncidentRetryPolicy()` 为 nil，`Dropped` 包含 `camunda:failedJobRetryTimeCycle`。原因是扩展子元素走了报告并跳过的路径，而不是属性映射路径；不能根据仓库内“属性形式”的测试通过就声称真实 Camunda 重试 XML 兼容。

依据：[属性映射](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/convert/bpmn/dialect.go#L151-L157)、[扩展元素跳过路径](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/convert/bpmn/importer.go#L1944-L1975)、[现有属性测试](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/convert/bpmn/dialect_test.go#L357-L410)、[Camunda 官方扩展描述](https://github.com/camunda/camunda-bpmn-moddle/blob/master/resources/camunda.json)。

## “能读”和“能写回”并不对称

`convert.Export` 从执行模型重新生成标准 BPMN XML。源码明确不输出 Diagram Interchange，节点写出结构也没有 Camunda 办理人、主题、重试或扩展字段。因此即便输入字段成功进入执行模型，再导出也会丢失它们。[导出契约](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/convert/bpmn/exporter.go#L27-L39) · [写出节点字段](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/convert/bpmn/exporter.go#L183-L198)

此外，导出覆盖的节点类型比导入少；例如导入器已有业务规则任务等处理，而导出节点 switch 不支持这些类型，会返回 UnsupportedElementError。不要将“可以导入的流程”视为“一定可以重新导出”。[导出节点分派](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/convert/bpmn/exporter.go#L333-L381)

## 已完成的验证

1. 运行现有转换器中 7 个针对性测试（含子测试），全部通过：Camunda 映射报告、未知命名空间、未知 Camunda 配置、属性形式重试、Export MVP、JUEL 翻译后运行、普通 Import 不返回报告。
2. 准备并检查六份样本：标准流程、Camunda 扩展、同 URI 换前缀，以及经真实 bpmn-moddle + Camunda 描述读写生成的静态办理人、动态办理人、外部任务重试三个文件。
3. 对六份样本调用公开 `convert.ImportDocument`、任务属性读取和 `convert.Export`。结果见本目录 [gobpm-compatibility-results.json](./gobpm-compatibility-results.json)。

| 样本 | 解析结果 | 核心观测 |
| --- | --- | --- |
| standard.bpmn | 成功 | 原图包含 DI；导出无 DI |
| camunda.bpmn | 成功 | 动态办理人为字面值，properties 被报告并丢弃 |
| camunda-alternate-prefix.bpmn | 成功 | 更换 camunda 前缀不改变结果，按 URI 识别 |
| moddle-static.bpmn | 前端无警告，Go 导入成功 | assignee=john，candidateGroups=managers；导出不回写 |
| moddle-dynamic.bpmn | 前端无警告，Go 导入成功 | assignee 为字面 `${manager}`；不是动态变量求值 |
| moddle-external-retry.bpmn | 前端无警告，Go 导入成功 | worker_topic=charge；retry_policy_present=false，重试元素列在 Dropped 中 |

六份样本的导出 XML 均不含 Camunda namespace 或 BPMNDiagram；带 properties 标记的样本导出后标记消失。上述检查验证的是格式转换和模型映射，未验证完整审批界面、所有运行节点、数据库恢复或生产可靠性，也未启动浏览器做 bpmn-js 画布回显测试。

以下命令保留本次在 gobpm checkout 中选择的现有测试范围。需先检出上述提交并准备 Go 工具链与依赖；它不包含六份自定义样本的 probe 验证：

```bash
go test ./pkg/convert/bpmn \
  -run 'Test(CamundaDialectIsMappedAndReported|UnrecognizedNamespacesStaySilent|AnUnknownDialectConstructIsStillReported|RetryCycleBecomesARetryPolicy|ExportMVP|TranslatedJUELIsRunnable|ImportIsUnchangedByReporting)$' \
  -count=1
```

自定义样本、前端模型读写脚本、Go probe 和完整导出 XML 未随本仓库保存；本目录 JSON 仅记录本次实验观测，不能单独用于复现这些样本验证。

Camunda 描述于本次从官方仓库 master 下载，不对应锁定的 npm 包版本；所测 JSON 的 SHA-256 为 `038012f9faf07d45692c9599932aed261543ed2727ee73461f4b78e14dac6ec1`。前端模型库取自本项目已安装的 bpmn-moddle 10.2.0。该兼容性实验未向项目安装 Camunda 包或修改前端业务代码。

## 对当前项目的建议

前端现已提供“开始 → 提交需求 → 确认需求 → 结束”的最小例子，注册自定义 `wf` moddle，以 `wf:assignee` 和 `wf:formKey` 保存办理人与表单配置；未注册 Camunda moddle。导入/导出仍是本地文件操作，尚未接入 Go 后端，gobpm 也不会自动识别这些自有属性。[设计器](../../src/views/DesignerView.vue) · [自定义 moddle](../../src/bpmn/workflow-moddle.json)

建议采用以下边界：

```text
前端 bpmn-js + 受限属性面板
              │ BPMN XML
              ▼
Go 业务后端
  ├─ 原文按流程版本保存 → 编辑、下载时返回原件
  └─ ImportDocument + 能力校验 + 显式扩展适配 → gobpm 执行模型
                                                    │
                                           注册流程、启动、完成任务
```

部署使用 `convert.ImportDocument(ctx, convert.BPMN, reader)`，并导入转换器注册包 `github.com/dr-dobermann/gobpm/pkg/convert/bpmn`。检查返回的 `Dropped`，对影响执行而未支持的配置拒绝部署或要求用户修正。普通 `Import` 不把报告返回给调用方。[报告接口](https://github.com/dr-dobermann/gobpm/blob/94f307e265c519d2f93bd283e0e7019701fea699/pkg/convert/document.go#L11-L69)

`Dropped` 还需要配合能力校验：未知 namespace 静默跳过，动态办理人又可能被当静态值成功映射，所以 `Dropped == 0` 不是兼容性证明。

如果继续使用 camunda-bpmn-moddle，应隐藏或禁止未适配的 Camunda 属性，优先只开放已验证的静态分配、简单流程和外部任务主题。若改用自有 moddle，也必须编写 Go 扩展解析与执行映射；仅把 `camunda:` 换成 `app:` 不会让 gobpm 自动理解。

发起流程、查询待办、审批完成仍由业务 HTTP/JSON 接口承接，Go 后端调用 gobpm API。XML 负责设计和部署定义，不需要在每次审批时重新提交。
