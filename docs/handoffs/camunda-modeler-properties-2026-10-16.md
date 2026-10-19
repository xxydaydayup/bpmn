# Handoff: Camunda Modeler 属性面板后续工作

日期：2026-10-16（Asia/Shanghai）

## 下次会话目标

继续完成 .scratch/camunda-modeler-properties/ 中 01–13 工单，让流程设计器逐步支持 Camunda Modeler 常用 Camunda 7 属性。优先保证当前 /designer 页面能加载，再按工单依赖推进。

## 已确认的产品决策

- 目标覆盖 Camunda 7 常用属性面板，不局限于会签；未支持的 XML 配置需要保留并说明。
- executionListener、taskListener 与 camunda:script 纳入支持范围；用户确认目标环境支持 JavaScript。
- 表达式、脚本等原文保存，不由前端求值；最终部署/执行由目标引擎/API 验证。
- 属性更新经 bpmn-js modeling 命令，保持撤销/重做；模型对象留在 composable，面板只用快照。
- 详细范围、依赖和验收以 .scratch/camunda-modeler-properties/spec.md 及 issues 为准。

## 最近修复与验证

- 用户报告打开流程设计器时报错：Identifier 'readRuntimeAttributes' has already been declared。
- 已删除 useBpmnDesigner.ts 中重复 import；同时移除了未实现的 readCamundaForm 快照引用、修复 readUnsupportedConfiguration 多传一个参数导致的类型错误，并整理 types.ts 重复字段与 camundaRuntime.ts 未闭合函数。
- 已通过：pnpm.cmd typecheck、pnpm.cmd build、XML/监听器专项测试 14/14。
- 全量 pnpm.cmd test 有 8 个 Camunda 控制台用例失败：测试加载器把带相对导入的 TS 模块从 data: URL 加载，触发模块解析错误；本次修复未涉及这些测试。
- 浏览器交互验收尚未完成。Computer Use 初始化曾被物理 Escape 中止；没有通过鼠标验证页面。下次若确需桌面自动化，先按 computer-use skill 流程操作；也可先使用可用的浏览器自动化/页面测试。

## 工单概况

截至 2026-10-15 的工单记录显示完整验收 0/13。进行中：01、02、04、05、06、10；未开始：03、07、08、09、11、12、13。各工单 Comments 已注明部分实现和未完成的验收范围。不要因为有代码或子测试通过就将工单设为 completed。

关键未完成项：
- 01：真实 bpmn-js 命令栈中的局部编辑/撤销重做，以及无效 XML 恢复验收。
- 02：监听器 CRUD/实现切换范围与命令栈验收，JavaScript 在目标 Camunda 部署和执行。
- 04：多实例输入/输出数据项编辑及完整命令栈/引擎验证。
- 05：async/retry 面板控件、循环配置范围、Camunda behavior 联动和引擎验证。
- 06：逐项确认 Camunda 7 人工任务字段语义，并补 XML 往返/撤销/引擎验证。
- 10：isExecutable、流程级 jobPriority、属性更新及部署校验。

## 下次开工检查

1. 读取仓库 Agent.md；新增/调整属性时再读 docs/camunda-modeling.md、Camunda moddle descriptor、src/bpmn/types.ts、NodePropertiesPanel.vue 和 useBpmnDesigner.ts。
2. 查看 git status --short，保留已有用户改动，不要覆盖或清理。上次工作区中还有无关的 docs/countersign-approval.md、docs/handoffs/ 和 pelican-bike.html；新会话务必重新确认。
3. 查看 .scratch/camunda-modeler-properties/issues/ 和 spec，按依赖推进；进度文件最近在 2026-10-15 更新，代码状态以新会话检查为准。
4. 属性/XML 改动运行 pnpm.cmd typecheck、pnpm.cmd test 与 pnpm.cmd build；解释已知全量测试失败，并继续跑 BPMN 专项测试。按仓库规则验证 /designer 交互、XML 往返、撤销/重做。
5. 不提交 Git，除非用户之后明确要求提交。

## 建议后续技能

- implement：继续按 issue 实施与验证。
- computer-use：仅当需要真实 Windows 浏览器界面操作/检查时使用，先读完整 skill 指引；如果有稳定浏览器自动化则优先评估。

## 交接文档之外的记录

工单范围与部分实现见 .scratch/camunda-modeler-properties/spec.md 和 .scratch/camunda-modeler-properties/issues/01–13。此前会签讨论见 docs/handoffs/countersign-template-followup.md。

## 2026-10-16 后续续作记录

- 用户明确不使用 computer-use；本轮也未使用 implement skill。
- 上轮新增的 async/retry、流程级属性及真实命令栈回归通过复核：专项 21/21；pnpm.cmd typecheck 与 pnpm.cmd build 通过。spec 曾记录的“23/23”不正确，已更正。
- 继续工单 03：新增 camundaForms.ts 的表单快照与局部 patch；面板支持 User Task/Start Event 表单引用与内嵌 FormData 字段。属性命令栈测试最初 8/8 通过；随后发现 moddle-xml 不会往返已知 FormField 上未声明的 $children，已为应用的 Camunda moddle descriptor 添加 FormField.otherElements wildcard 收纳口。最新命令栈专项 8/8 通过，测试覆盖未知表单子元素的 XML 导入、局部编辑、撤销/重做、导出再导入和继续编辑。headless Chrome 又发现空表单引用编辑会被单向 prop 覆盖，已切到节点级草稿并在浏览器验证 formRef/formKey 输入、提交及切换后保留未选模式。合并 BPMN 专项 22/22 通过；pnpm.cmd typecheck 与 pnpm.cmd build 通过。pnpm.cmd test 共 75 项，66 项通过，9 项因现有 Node/data: URL 相对模块导入问题失败。
- 尚需重跑合并 BPMN 专项、typecheck/build 与全量测试，并用普通浏览器自动化检查 /designer；无效 XML 恢复和目标引擎表单验证仍未完成。工作区现有未提交内容全部保留，不提交 Git。

## 2026-10-16 会签模板阶段记录

- 用户将近期目标限定为先能在属性面板配置并核对会签模板，分阶段推进其他属性工单；明确不使用 implement 和 computer-use。
- `Process_Countersign` 用户 XML 已在隔离 headless Chrome 页面实际导入并选中 `Task_MultiReview`。表单、Camunda execution listeners、多实例集合/并行顺序、完成条件均正确呈现。新增会签配置检查卡，只对会签人工任务显示，逐项检查集合/元素变量/并行、全员完成条件、agree/reject 选项、投票计数和总人数记录监听器。选中普通提交评审节点时不显示检查卡。
- 面板真实编辑 `elementVariable` 后经撤销和重做正确往返；没有导出或覆盖用户 XML。`pnpm.cmd typecheck` 通过；BPMN/布局/验证/监听器/命令栈专项 49/49 通过；`pnpm.cmd build` 和 `git diff --check` 通过。构建有既存大 chunk 警告。
- `.scratch/camunda-modeler-properties/issues/03-camunda-forms.md`、`spec.md` 已记录本次 UI 验收；工单保持 in-progress。目标 Camunda 对用户 XML 的部署/运行验收、无效 XML 恢复仍未完成，未尝试引擎部署。
- 已在本轮重跑全量测试：75 项中 66 项通过、9 项失败，仍为 8 个 Camunda 管理台用例和 DataTable 用例的 data: URL 相对 TS 模块导入解析错误，与 BPMN 属性改动无关。未处理该测试加载器问题。

