# 嵌套审批超时 end 未终止整个实例

2026-11-18，开发代理 `http://localhost:5171`，tenant-a，Camunda 7.24.0。网关/编译器构建版本未暴露。该差异未修复，10保持in-progress，与用户已接受的04状态缺参500分别记录。

后端正式规范承诺 reminder.action=end 终止整个流程实例，包括并行/子流程活动；来源为本地快照 `.scratch/workflow-function-sdk/verification/05-compiler-spec-2026-11-18T07-55-38.845Z.json` 的reminder及validationRules说明。SDK仅构造业务模型，通过公开publish/start及查询操作验证，未写监听器、派生节点、引擎汇总或补偿终止请求。

复现定义：

```js
sequence(
  parallel('work', [
    subProcess('outer_box', subProcess('inner_zone', parallel('teams', [
      approval('review', { reminder: { action: 'end' } }),
      approval('legal'),
    ]))),
    approval('sibling'),
  ]),
  approval('archive'),
)
```

通过SDK启动，所有approval提供独立办理人，并传运行参数：

```js
nodes: {
  outer_box_inner_zone_review: { assignee: 'sdk-review', reminderDuration: 'PT4S' },
  outer_box_inner_zone_legal: { assignee: 'sdk-legal' },
  sibling: { assignee: 'sdk-sibling' },
  archive: { assignee: 'sdk-archive' },
}
```

启动时实际有review、legal和sibling三个人工任务。超时后，后端派生的 `outer_box_inner_zone_review_reminderTimer` 和 `outer_box_inner_zone_review_timeoutEnd` 均完成，review/legal被取消；sibling仍等待，外层join等待其分支。timeoutEnd完成后连续有限观察约7秒，SDK进度一直ACTIVE。原生引擎 `GET /task?processInstanceId=...` 同样返回sibling，历史实例state=ACTIVE、endTime=null，external-task为空，archive未执行。

后端部署XML中，`outer_box_inner_zone_review_timeoutEnd` 的 `terminateEventDefinition` 位于inner_zone的subProcess中。标准BPMN终止事件结束所在作用域，与实际局部终止行为一致；要实现规范承诺的整个实例终止，需要后端处理跨作用域终止语义。SDK目前准确保留实际进度。

对照：将end提醒挂在顶层outer_box容器上，已真实取消内部review/legal及外部sibling，实例和结束worker完成。不能以此对照结果代替内部审批end的验收。

原始证据：

- [首轮完整超时矩阵](../../.scratch/workflow-function-sdk/verification/sdk_fcf3581f5ff94f5ca9cf1f90e683f829.json)：5项通过、嵌套审批end失败，6部署cleaned。
- [有限收尾复验](../../.scratch/workflow-function-sdk/verification/sdk_9ac0ce6f61cd4eb5817bf09b4e6c61c4.json)：约7秒观察仍ACTIVE；同报告的ALL配置回归通过，2部署cleaned。
- [原生引擎交叉核对](../../.scratch/workflow-function-sdk/verification/sdk_e16c12fc108d4aa7b6dbb01b2d38c94f.json)：同一失败重现，保存部署XML、原生任务/实例/external-task查询与时间，1部署cleaned。

最后一份报告的资源：模板 `sdk_e16c12fc108d4aa7b6dbb01b2d38c94f_timeout_nested_approval_end`，deploymentId `64c78377-e333-11f1-b049-00155d21c8ae`，processDefinitionId `64c8bbf9-e333-11f1-b049-00155d21c8ae`，processInstanceId `650aa6fb-e333-11f1-b049-00155d21c8ae`，外层任务ID `650af53f-e333-11f1-b049-00155d21c8ae`。资源已清理，复验须用新UUID模板和业务键；后端业务实例行/模板历史可能按契约保留。

复验入口为 `packages/workflow-sdk/scripts/check-runtime.mjs`，设置 `WORKFLOW_SMOKE_SCENARIOS=timeout-nested-approval-end`，有限等待并自动清理本轮资源。期望外部sibling同步取消、实例进入真实终态、结束worker完成且archive不执行；仅内部timeoutEnd完成不计通过。notify另缺通知接收记录，用户已明确保留待验收。
