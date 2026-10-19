# 会签模板使用说明

流程为：开始 → 提交评审 → 多人并行会签 → 全员同意结束，否则退回提交评审。每轮等待所有评审人完成，不会在第一票拒绝时立即退回。

## 给已有 XML 增加自动清零

在设计器打开需要修改的需求评审，点击“编辑 XML”。找到名称为“提交评审”、办理人为 `${assigneeStart}` 的 `bpmn:userTask`，在它的 `incoming` 和 `outgoing` 之前增加下面的扩展。以目前需求评审的节点标识为例：

```xml
<bpmn:userTask id="Activity_0045b6i" name="提交评审" camunda:assignee="${assigneeStart}">
  <bpmn:extensionElements>
    <camunda:executionListener event="end" expression="${execution.setVariable('agreeCount', 0)}" />
  </bpmn:extensionElements>
  <bpmn:incoming>Flow_0m9c4mf</bpmn:incoming>
  <bpmn:incoming>Flow_16wvepo</bpmn:incoming>
  <bpmn:outgoing>Flow_1m9b0mj</bpmn:outgoing>
</bpmn:userTask>
```

如果提交任务已有 `bpmn:extensionElements`，只将 `camunda:executionListener` 加到现有扩展内，保留其他配置，不再增加第二个扩展容器。放在提交任务的 `end` 事件上，才能在首次提交和每次退回重提后各清零一次；不要放到多实例任务的每个实例上。

点击“应用到画布”，再导出保存设计稿并“发布任务模板”。使用相同流程标识会产生新版本；只有新启动的实例使用新版本，已有实例不会自动更新。EL 表达式监听器由 Camunda 执行，设计器只保存 XML。

## 使用内置会签模板

1. 在 `/designer` 打开“流程模板”，选择“会签审批”，点击“使用模板”。该操作替换本地画布并重置撤销记录，先导出需要保留的设计稿。
2. 新模板默认标识为 `Process_Countersign`。如需继续发布已有需求评审，可在“流程属性”中将标识改为 `Process_02m4omj`，并核对名称与执行配置。
3. 点击“发布任务模板”，完成后到 `/workflow-business` 刷新并选择相应模板。
4. 输入唯一业务键，启动变量示例：

```json
{
  "assigneeStart": "user1",
  "approverList": ["user2", "user3", "user4"]
}
```

`agreeCount` 由提交任务监听器初始化，无需在启动变量中提供。`approverList` 必须非空；办理人标识按实际业务填写。

5. `user1` 完成“提交评审”时，完成变量填写 `{}`。
6. 每位评审人完成“多人会签”时，提交审批意见：

```json
{
  "vote": {
    "value": "agree",
    "type": "String"
  }
}
```

`agree` 是同意，`reject` 是拒绝。“退回待重派”只改变人员分配，不能用来提交拒绝意见。

7. 本轮有人拒绝，等待全员完成后退回 `user1`；重新提交时仍填写 `{}`，监听器自动清零计数。再次三人全部同意后通过。

## 验证边界

模板声明 `isExecutable="true"`，使用 Camunda 7 EL 表达式执行清零和计数，不依赖脚本引擎。自动清零在提交任务完成时执行一次；内置模板保留独立流程标识，并使用默认退回分支。原有模板的 `reviewers` / `reviewer` / `reviewOutcome` 协议已替换为 `approverList` / `assignee` / `vote` 及自动计数，重新使用模板时按上面的变量启动；已有设计文件和已部署实例不会被自动转换。

内置模板直接连接结束事件。当前后端业务发布可能注入 Topic 为 `task_finish` 的结束通知任务；没有人工待办不一定等于流程结束，还需后台 worker 完成通知，并核对实例为 `COMPLETED`。

本轮在目标 Camunda 后端用隔离 key 验证了 EL 监听器：空变量完成提交任务后创建三条会签待办，两票同意/一票拒绝后退回；再次以 `{}` 重提后 `agreeCount` 变为 0；新一轮三票同意后业务状态为 `COMPLETED`、待办列表为空。设计器导出的 XML 也单独发布并通过全员同意。JavaScript 和 Groovy 脚本引擎当前均不可用，因此模板采用成功执行过的 Camunda EL 表达式。多人同时提交时的共享计数更新、幂等和重试策略，仍需业务后端另行验证。
