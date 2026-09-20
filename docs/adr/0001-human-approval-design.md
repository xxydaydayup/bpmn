# 人工审批先保存设计语义，执行绑定留给引擎适配

2026-09-20，第二批方案已由用户确认。引擎尚未确定，而用户需要比较、编辑和重新导入 XML。保留标准 BPMN 的并行网关、多实例及顺序流结构，用 `extensionElements/wf:approval` 逐项记录固定参与人和审批策略；旧 `wf:assignee` 继续表示单人静态用户标识。名单采用结构化子元素，便于比较并避免把 JSON 转义文本嵌进任务属性。

标准多实例数量不等于实际人员分配，实例完成也不等于审批同意。因此不生成依赖未知引擎变量的 `completionCondition`。该选择需要后端适配自有协议，但避免将某个引擎的表达式或“任一完成即通过”固化为业务语义。

## XML 契约 v1

命名空间 URI 保持 `https://bpmn-workspace.local/schema/workflow`。多人任务使用如下结构，`policy` 为 `all` 或 `any`，参与人顺序有业务含义：

```xml
<bpmn:userTask id="Task_Review" name="审批">
  <bpmn:extensionElements>
    <wf:approval version="1" policy="all">
      <wf:participant userId="alice" />
      <wf:participant userId="bob" />
    </wf:approval>
  </bpmn:extensionElements>
  <bpmn:multiInstanceLoopCharacteristics isSequential="false">
    <bpmn:loopCardinality xsi:type="bpmn:tFormalExpression">2</bpmn:loopCardinality>
  </bpmn:multiInstanceLoopCharacteristics>
</bpmn:userTask>
```

- `all`：全员同意才通过，任一拒绝即不通过。`any`：任一同意即通过，全员拒绝才不通过。
- 环节结果未确定时，任一退回使本环节退回。环节结果确定后结束其剩余待办；后续意见不得改变已结算结果。并发提交的原子结算由后端负责。
- `isSequential` 决定同时办理或按名单顺序办理；数量等于名单长度，名单至少一人，不允许空白和重复用户。多人任务不同时填写 `wf:assignee`，表单引用仍可空。
- `version="1"` 绑定上述固定规则。修改既有规则含义需要协议版本及迁移，不能静默改变旧 XML 的解释。
- 单人、多人的模式切换会同步标准标记、名单和办理人。单人转多人沿用原办理人作为首项；多人转单人时，仅一人的名单自动带入，否则要求重填。关联修改在一个命令中提交，支持整体撤销。
- 原生菜单也可切多实例标记；标记、名单、数量或单人字段冲突时提示错误，可通过“同步多人配置”修复。无自有名单的普通多实例可在面板选择策略后配置；带外部绑定、完成表达式或未知版本的配置由 XML 编辑，避免丢失原数据。

## 并行结果与退回

本批支持一层并行。分支中的环节不通过或退回时，应通过显式结果路径跳过该分支尚未开始的后续审批并到达汇合；其余分支继续完成。各分支最终结果中，有不通过则终止申请，否则有退回则修改重提，全部通过才继续。这里比较的是分支汇总结果，不是或签中个人的拒绝意见。

退回路径位于并行汇合之后，重提后重新走全部审批。单独从一个并行分支连回申请节点不会取消其他分支，因此禁止将这种图形当作已支持的立即中断；嵌套并行、子流程中断等另行设计。

模板中的 `reviewOutcome`、`financeReviewOutcome`、`financeOutcome`、`legalOutcome`、`managerOutcome`、`directorOutcome` 是结果绑定示例；值约定为 `approved`、`rejected`、`returned`。例如财务会签未通过时不启动财务主管审批，其结果直接作为财务分支结果；会签通过后以主管结果作为分支结果。后端须在路由前提供有效结果，重提时清空上一轮结果，绑定真实办理人并执行结算与待办结束。前端不求值，默认退回路径也不代替运行时的数据有效性检查。

新复杂模板标记 `isExecutable="false"`，因为它们是设计样本。实际部署需完成映射和执行验证后再生成部署产物，设计 XML 原文继续独立保存。

## 验证范围

`tests/bpmn-approval.test.mjs` 与 `tests/bpmn-validation.test.mjs` 使用本仓库已安装的 bpmn-moddle 做真实导入、修改、保存、重新导入；覆盖名单/策略、未知配置保留、一层并行结构及错误路径。此结果只证明前端设计与 XML 读写，不证明任何后端引擎兼容或审批执行。
