# 工作区代码审查与 AI 修复清单

- 审查日期：2026-09-30（Asia/Shanghai）。
- 基线：`main`，HEAD `e18e9cd4b077f07153d0d83823bd3b84bec5851c`。
- 对象：相对 HEAD 的未提交修改及新增业务代码，不是全仓库历史审计。
- 完成状态：OCR 单并发审查、源码复核、补充复现及结果归并均已完成。
- 结论：17 项 P2 / medium 问题；没有确认的 P0/P1 问题。每项包含触发条件、证据、修复方向及验收标准。
- 本次只审查并生成文档，没有修复应用代码，也没有提交 Git。

> 提交前复查补记（2026-09-30）：用户随后要求按功能拆分提交当前工作区。此时测试目录已不同于本报告的审查快照；下文的 79/79 仅代表审查时结果，当前提交状态以本节补记为准。本次提交操作没有修复应用代码。

## 提交前工作区复查

- 当前 `pnpm test` 共 49 项：41 通过、8 失败。8 项均在管理台测试加载阶段报 `ERR_INVALID_URL`，输入为 `vue-router`；现有 `tests/camunda-console.test.mjs` 的 data URL 加载夹具没有适配管理台新增的路由依赖。
- 当前 `pnpm build` 通过（退出码 0）；仍有大于 500 kB 的 chunk 警告。
- 审查时的 7 个新增测试文件当前不在工作区：`backend-workflow.test.mjs`、`business-workflow-view.test.mjs`、`camunda-proxy-smoke.test.mjs`、`designer-deployment.test.mjs`、`designer-task-template.test.mjs`、`workflow-consistency.test.mjs`、`workflow-runtime-config.test.mjs`。管理台测试文件也已不同于当时快照；本次按当前状态提交，没有恢复这些变化。
- 后续 AI 修复前应先适配管理台测试加载夹具，并为当前功能补齐相应回归覆盖；不能以本报告历史的 79/79 作为当前提交已通过测试的证据。
- 本次复查日志：`output/code-review/2026-09-30-commit-tests.log`、`output/code-review/2026-09-30-commit-build.log`。

## 范围与方法

遵循根目录 `Agent.md`、`CONTEXT.md`、`docs/agents/domain.md` 和 ADR-0002；按用户指定的 `open-code-review` 技能运行 OCR，提供项目背景，保存 JSON 结果，并逐条用源码和本地模拟请求核实。用户要求降低并发后，停止初始 `--concurrency 4` 运行，改为 `--concurrency 1`；后续没有启动其他并行审查。

主要覆盖业务 Gateway、业务实例启动与任务办理、设计器部署与任务模板发布、开发工具配置和路由、管理台定义深链接、代理配置、新增烟测脚本及对应测试。读取关联旧代码是为了验证调用链，发现列表只记录本次变更引入的问题。仓库不存在 `.codegraph/`，因此未使用 CodeGraph。

不纳入本次产品代码结论：`assets/`、`reference/`、`learning-records/`、`lessons/`、`pelican*`、`MISSION.md`、`RESOURCES.md`。审查输出目录也从 OCR 输入排除。没有连接、部署或写入真实 Camunda/业务后端；历史调研文档仅作为项目背景，不视为本次联调结果。

### OCR 完成记录

- CLI：`v1.12.11`；运行 ID：`89cb46d2-0fe7-4a4e-b660-fb050c2ef9f6`。
- 参数：工作区模式、`--audience agent`、项目背景、`--format json`、`--concurrency 1`；使用上述排除范围。
- 最终进程退出码 0，`status=complete`；选中 32 个代码/测试文件，完成 32，失败 0，豁免 0，共 7 组；耗时 42 分 57 秒。
- 3 个请求遇到临时限流/超时后自动重试并恢复；最终没有模型请求失败。运行中两次依赖候选路径读取失败不是选定源文件漏审；补充复现通过实际包解析加载了所需依赖，测试和构建也已通过。
- OCR 产出 23 条候选：21 条采纳或部分采纳并归并为下列 17 项；2 条保留为非阻断观察。工具数量不等于独立缺陷数量。

| 分组 | 已完成的选定文件 |
| --- | --- |
| 业务 API 与一致性（6） | `src/api/workflow/{consistency,gateway,index,types}.ts`；`tests/{backend-workflow,workflow-consistency}.test.mjs` |
| 业务页面与导航（5） | `src/composables/useBusinessWorkflow.ts`；`src/views/BusinessWorkflowView.vue`；`src/layouts/AppLayout.vue`；`src/router/index.ts`；`tests/business-workflow-view.test.mjs` |
| 设计器部署（7） | `src/bpmn/deployment.ts`；`src/components/designer/DesignerDeployment.vue`；`src/composables/{useBpmnDesigner,useDesignerDeployment}.ts`；`src/views/DesignerView.vue`；`src/styles/designer.css`；`tests/designer-deployment.test.mjs` |
| 设计器业务模板发布（3） | `src/components/designer/DesignerTaskTemplate.vue`；`src/composables/useDesignerTaskTemplate.ts`；`tests/designer-task-template.test.mjs` |
| 管理台与重试演示（5） | `src/views/{CamundaConsoleView,CamundaRuntimeView,CamundaValidationView}.vue`；`tests/camunda-console.test.mjs`；`scripts/camunda-job-retry-demo.mjs` |
| 运行配置（3） | `src/env.d.ts`；`src/config/workflowRuntime.ts`；`tests/workflow-runtime-config.test.mjs` |
| 开发代理与代理烟测（3） | `vite.config.ts`；`scripts/camunda-proxy-smoke.mjs`；`tests/camunda-proxy-smoke.test.mjs` |

关联配置、约定和现有实现另作上下文读取，不计入上述 32 个选定文件。

## 已执行验证

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| `pnpm test` | 79/79 通过，0 失败、0 跳过 | 现有自动化测试，包含源码加载和 mock |
| `pnpm build` | 通过，退出码 0 | 包含 vue-tsc 和 Vite 构建；存在大于 500 kB 的 chunk 警告 |
| 本地补充复现 | 已验证下列异常路径 | 不发送网络请求；加载实际 TS 实现，设计器入口使用实际模板编译的 VNode |
| 烟测异常模拟 | 两份实际脚本 × 两类失败，共四个断言通过 | fetch 完全替换为本地模拟，无外部读写 |
| 源码完整性 | 41 个锁定文件的 SHA-256 均未变化 | 文档及被忽略的审查证据不在锁定范围内 |
| 浏览器交互 | 未执行完整浏览器验收 | 弹窗路径结合 Vue 状态和组件配置确认，修复后仍需浏览器回归 |
| 真实引擎与后端 | 未执行 | 不据此声明发布、租户隔离或真实任务流转通过 |

现有测试与构建通过不能排除下列问题：对应异常返回、跨弹窗时序、功能开关与大列表边界尚未被现有测试覆盖。

## 修复顺序

当前条目均按 P2 / medium 记录，表示有明确触发条件的正确性问题；修复顺序按功能边界和误导结果的影响排列。没有证据证明服务端越权，因此不把前端开关或租户提示问题升级为安全漏洞。

| ID | 优先级 | 分类 | 问题 | 建议先改位置 |
| --- | --- | --- | --- | --- |
| CR-01 | P2 / medium | bug | 关闭开发工具后仍可从设计器部署到引擎 | `src/views/DesignerView.vue:216` |
| CR-02 | P2 / medium | bug | 任务查询失败被当作空列表，核对误报通过 | `src/api/workflow/consistency.ts:77-81` |
| CR-03 | P2 / medium | bug | 模板与实例绑定错误时仍可报告整体一致 | `src/api/workflow/consistency.ts:63-75` |
| CR-04 | P2 / medium | bug | 旧任务响应关闭新任务办理弹窗 | `src/composables/useBusinessWorkflow.ts:155-157` |
| CR-05 | P2 / medium | bug | 任务模板超过 100 条后无法访问后续模板 | `src/composables/useBusinessWorkflow.ts:71` |
| CR-06 | P2 / medium | bug | 直连模式下误称操作已被后端按租户隔离 | `src/views/CamundaRuntimeView.vue:226` |
| CR-07 | P2 / medium | bug | ACTIVE 历史记录掩盖运行态不匹配，并误称实例已结束 | `src/api/workflow/consistency.ts:71-75,104-108` |
| CR-08 | P2 / medium | bug | 用前 100 条任务推断完整集合一致，遗漏后续页差异 | `src/api/workflow/consistency.ts:54-57` |
| CR-09 | P2 / medium | bug | 用启动变量快照校验当前变量，正常更新被误判失败 | `src/api/workflow/consistency.ts:83-90` |
| CR-10 | P2 / medium | bug | 未配置环境租户时，业务与引擎租户不一致仍通过 | `src/api/workflow/consistency.ts:64-75` |
| CR-11 | P2 / medium | bug | 实例切换后仍展示上一个实例的一致性结果 | `src/views/BusinessWorkflowView.vue:30-44` |
| CR-12 | P2 / medium | bug | 任务办理失败原因显示在弹窗外，弹窗内无反馈 | `src/views/BusinessWorkflowView.vue:58,93` |
| CR-13 | P2 / medium | bug | 路由重进丢失部署/发布的待核对状态，允许直接重提 | `src/composables/useDesignerDeployment.ts:21,97` |
| CR-14 | P2 / medium | bug | 历史同名局部变量覆盖流程变量，结果依赖返回顺序 | `src/api/workflow/consistency.ts:88` |
| CR-15 | P2 / medium | bug | 对象变量仅键顺序不同也被判为值不一致 | `src/api/workflow/consistency.ts:30-32` |
| CR-16 | P2 / medium | bug | 烟测部署已提交但响应丢失时，跳过清理且不提供核对标识 | `scripts/camunda-job-retry-demo.mjs:56-57` |
| CR-17 | P2 / medium | bug | 烟测清理异常覆盖原始验证异常 | `scripts/camunda-job-retry-demo.mjs:86-92` |

## CR-01：关闭开发工具后，设计器仍暴露引擎部署

**位置**：`src/views/DesignerView.vue:216-217`；调用链为 `DesignerDeployment.vue:52-53` → `useDesignerDeployment.ts:56-65` → `camundaGateway.deploy()`。

**触发**：设置 `VITE_WORKFLOW_DEVTOOLS=false`，启用业务功能，访问仍开放的 `/designer`。

**实际行为**：菜单和路由已禁用引擎管理台，但 `DesignerDeployment` 无条件渲染，按钮仍可用，可向 `/api/camunda/deployment/create` 提交 XML。部署成功或结果不确定时，其管理台核对链接又会被路由拦截。

**证据**：将实际设计器 header 编译并在 `developerToolsEnabled=false` 的上下文生成 VNode，仍得到 `{ type: 'DesignerDeployment', disabled: false }`。业务发布组件有业务开关条件，引擎部署组件没有开发工具开关条件。

**影响**：普通业务模式保留直接操作引擎的入口，绕过业务任务模板发布流程，且部署结果恢复入口不可用。这是前端功能边界失效；后端是否允许操作取决于真实认证和代理配置。

**建议**：统一使用 `developerToolsEnabled` 控制引擎部署及上次结果入口；业务发布继续单独由 `businessEnabled` 控制。不要把隐藏按钮当作服务端授权，也不要为修复本项开放管理台路由。

**验收**：覆盖两个开关的四种组合；开发工具关闭时没有引擎部署入口且不会发起 Camunda 请求，业务发布按原业务开关工作；开启时部署、上次结果和超时核对路径仍可用。

## CR-02：任务查询失败时，一致性核对仍显示通过

**位置**：`src/api/workflow/consistency.ts:38-39,77-81,111-115,142-143`。

**触发**：业务或引擎任务查询因 403、503、网络错误失败；另一侧同样失败或正常返回空列表。

**实际行为**：`settledValue()` 丢弃 rejected 原因，随后 `?? []` 把失败转为空数组。两个数组相等，任务项显示“通过／当前无活动任务”；其他核对成功时，最终 `ok` 为 `true`。

**本地复现**：其余 Gateway 响应匹配，仅让业务 `listTasks` 抛出 `HTTP 403`、引擎 `listTasks` 抛出 `HTTP 503`。实际返回：

```json
{"ok":true,"tasks":{"status":"passed","detail":"业务接口与引擎任务 ID 一致：当前无活动任务"}}
```

**影响**：认证错误或服务不可用被当作一致性验证成功，报告无法可靠用于发布后的验收。

**建议**：只在两侧请求均成功时比较 ID；查询失败保留来源和错误，标记失败或“无法核实”，总结果不能为“一致”。已结束实例的合理回退应与任意查询失败分开处理。

**验收**：分别覆盖业务失败、引擎失败、两侧失败、两侧成功且均为空；只有最后一种才允许显示“无活动任务且一致”。

## CR-03：模板与实例之间缺少绑定核对

**位置**：`src/api/workflow/consistency.ts:63-75`；上游模板选择为 `src/views/BusinessWorkflowView.vue:31-37`。

**触发**：业务实例返回的 `processDefinitionId` 与所用任务模板不一致，但该错误实例在引擎中确实存在；或模板列表刷新成新版本后仍核对旧实例。

**实际行为**：定义检查只比较“模板 ↔ 引擎定义”，实例检查只比较“业务实例 ↔ 引擎实例”，未检查模板与业务实例是否属于同一执行版本。两条各自正确但彼此断开的链路可同时通过。

**本地复现**：模板定义为 `Process_1:2:def`，业务实例与引擎实例均指向 `Other_Process:1:other`，其余响应匹配；报告仍返回 `ok: true`。

**影响**：业务实例启动到错误流程定义时可能漏报。按 `taskKey` 从当前模板列表取首条，也不能可靠代表旧实例启动时使用的版本。

**建议**：使用实例的 `taskTemplateId`、`processDefinitionId` 对齐启动时版本；保留启动时模板快照，或明确显示无法核实对应版本，不能拿最新版本替代。没有后端接口支持时不要臆造接口。

**验收**：正确绑定通过；不同流程定义、不同模板 ID 失败；模板更新后，旧实例仍与其实际启动版本核对，不误报也不默认放行。

## CR-04：旧任务响应会关闭新打开的办理弹窗

**位置**：`src/composables/useBusinessWorkflow.ts:140-157`；界面为 `src/views/BusinessWorkflowView.vue:90-93`。

**触发步骤**：

1. 提交任务 A 的完成请求，并让响应延迟。
2. 使用弹窗右上角关闭或 Escape 退出；当前仅禁用了遮罩关闭。
3. 打开任务 B，填写完成变量。
4. 让任务 A 成功返回。

**实际行为**：A 的回调无条件执行 `selectedTask.value = undefined`，关闭 B 的弹窗。重新打开 B 又把草稿重置为 `{}`。A 失败时，也可能把旧错误放入 B 的当前上下文。

**本地复现**：用 deferred promise 模拟 A 在途，切换到 B 后完成 A，`selectedTask` 从 B 变成 `undefined`。

同一异步保护还遗漏卸载路径：完成请求在 `dispose()` 后成功，仍进入 `loadTasks()` 并创建新的、未取消的读取请求。本地 mock 观察到卸载后新增一次查询，`signal.aborted=false`。本次将这项相关生命周期修复合并在 CR-04，不另计一个问题。

**影响**：新的任务办理上下文被旧响应覆盖，输入可能丢失。

**建议**：提交时保存 task ID 和操作版本，只允许仍属于当前任务的响应修改弹窗；同时统一处理中关闭、Escape、再次打开任务的策略。取消请求不能视为撤销后端完成操作。

**验收**：延迟 A 的成功及失败响应，均不得覆盖 B；遮罩、Escape、关闭按钮和页脚按钮的关闭策略一致；离开页面后不再由旧完成响应发起新刷新。

## CR-05：第 101 个任务模板无法在业务页面访问

**位置**：`src/composables/useBusinessWorkflow.ts:64-74`；模板表格为 `src/views/BusinessWorkflowView.vue:60-65`。

**触发**：后端按 `firstResult/maxResults` 分页，模板超过 100 条。

**实际行为**：每次请求固定 `maxResults: 100`，没有下一页、搜索或按 key 读取入口。刷新仍是同一批 100 条，其他模板无法选择和发起。`TaskTemplateQuery` 和 Gateway 已定义分页及 `getTemplate()` 能力，但页面未使用。

**本地复现**：mock 提供 101 个模板，两次刷新均请求 `{ maxResults: 100 }`；列表只有 100 条，选择第 101 个 key 后 `selectedTemplate` 仍为 `undefined`。

**影响**：业务入口存在静默容量上限。人工任务列表同样固定取 100 条，修复时应一并核对可达性。

**建议**：用已声明参数增加分页或“加载更多”，也可补充明确的搜索/按 key 入口。不要只扩大常量或假设存在 count 接口；无总数时设计可用的下一页判断。

**验收**：用至少 101 条模板验证最后一条可见、可选、可启动；翻页/搜索保留取消和旧结果隔离，覆盖空页及最后一页。

## CR-06：直连模式显示了并不存在的租户隔离保证

**位置**：`src/views/CamundaRuntimeView.vue:226`、`src/views/CamundaValidationView.vue:367`；默认配置为 `.env.example:13-14`。

**触发**：按示例同时设置 `VITE_CAMUNDA_ACCESS_MODE=direct` 和 `VITE_CAMUNDA_TENANT=tenant-a`，直连官方引擎。

**实际行为**：联调页仍提示“查询和操作由后端代理执行租户隔离”，验证页仍提示“验证结果仅覆盖该租户”。这里的 `tenantId` 仅是展示配置：定义查询未附该租户过滤，部署表单未写入 `tenant-id`，实际通道由 Vite 代理配置决定。

**证据**：两个告警只判断 `tenantId`，不判断 `engineMode`。`CamundaRuntimeView.vue:99` 与 `src/api/camunda/gateway.ts:48-55` 的请求参数均不包含此标签。README 也说明这两个 VITE 配置仅用于来源提示。

**影响**：用户会把未按标签限定的操作、部署或验证结果误认为租户隔离后的结果。本项确认界面承诺与调用不一致，不是服务端隔离漏洞的实测结论。

**建议**：区分直连和后端代理模式；直连时说明租户标签不执行隔离。只有经确认的代理认证上下文才可表述隔离边界。不要为迎合文案改变部署语义，或让前端标签代替认证身份。

**验收**：覆盖 direct/backend-proxy、有/无 tenant 的组合；直连时不得承诺已由后端代理隔离或仅覆盖该租户。

## CR-07：活动历史记录掩盖运行态不匹配

**位置**：`src/api/workflow/consistency.ts:71-75,104-108`；对应现有测试 `tests/workflow-consistency.test.mjs` 的完成场景沿用了 `state: 'ACTIVE'` 的历史夹具。

**触发**：运行实例查询失败或返回了 businessKey/定义不匹配的实例，同时存在标识匹配但尚未结束的历史记录。

**实际行为**：`historicMatches` 不检查结束时间或终态。`liveMatches || historicMatches` 让历史结果覆盖运行态异常，并显示“运行实例已结束”。

**本地复现**：运行实例 businessKey 返回错误值，历史记录仍为 `ACTIVE` 且业务键匹配；报告 `ok: true`，实例项显示“运行实例已结束”。

**影响**：真实运行态的不一致或不可用被隐藏，还把进行中的实例错误解释为已结束。

**建议**：区分运行态查询失败、成功但不匹配、成功且确认实例已结束。只有历史 `endTime` 或约定终态能证明结束时才能使用完成态回退；修正现有测试的完成夹具。

**验收**：ACTIVE 历史不能覆盖运行态不匹配；运行态 403/超时应报告无法核实；真正已结束且历史匹配的实例仍支持回退核对。

## CR-08：截取第一页后仍声称完整任务集合一致

**位置**：`src/api/workflow/consistency.ts:54-57,77-88`。

**触发**：同一实例具有超过 100 个活动任务，差异位于后续页；或两侧第一页的排序不同。

**实际行为**：业务和引擎均只读取 `maxResults: 100`，没有继续翻页，却将读取结果当作完整集合比较。相同集合的不同分页可能误报，不同集合的相同第一页可能漏报。结束后的历史变量也仅取前 100 条。

**本地复现**：两侧各有 101 条任务，前 100 条相同，最后一条分别为 `business-only` 和 `engine-only`。实际只调用第一页，报告 `ok: true`、任务项 `passed`。

**影响**：多实例或较大的并行流程中，真实差异可能被错误的通过结果掩盖。

**建议**：按稳定顺序读取完整分页，或在达到上限时明确标记数据不完整并禁止给出完整一致的结论。与 CR-05 共享分页能力可以减少重复逻辑，但不能把 UI 翻页本身当作修复了全量核对。

**验收**：覆盖第 101 条存在差异、相同集合但响应顺序不同、分页边界和分页途中失败；超过 100 条的历史变量也不能被静默忽略。

## CR-09：启动时变量快照被当作当前状态

**位置**：`src/api/workflow/consistency.ts:83-90`，`src/views/BusinessWorkflowView.vue:31-37`，`src/composables/useBusinessWorkflow.ts:102,155-157`。

**触发**：以 `amount=8` 启动实例，通过业务完成人工任务时提交 `amount=9`，再点击“用引擎状态核对”。

**实际行为**：`lastInstance` 保留启动响应，完成操作只刷新任务列表。核对把启动快照中的 8 与当前引擎值 9 比较，报告不一致；流程节点自行修改变量时也有同样问题。

**本地复现**：实际调用业务 composable 的启动、完成操作，模拟引擎按完成参数更新金额。此后启动快照为 8、引擎当前值为 9，变量项返回 `failed`。

**影响**：合法业务更新引发错误告警，使核对功能无法可靠用于持续流转后的实例。

**建议**：明确启动快照与当前状态的时间语义。未有“读取当前业务实例变量”的后端能力时，将该部分作为启动观察或不可核实项，不用旧快照断言当前一致性；不要臆造刷新接口或简单覆盖旧值掩盖差异。

**验收**：完成任务修改已存在变量不再误报；仍能验证真正相同时点的数据差异；说明启动校验、当前状态校验各自覆盖范围。

## CR-10：业务记录自带的租户没有参与核对

**位置**：`src/api/workflow/consistency.ts:48,64-75`。

**触发**：不配置 `VITE_CAMUNDA_TENANT`，业务实例和模板的 `tenantId` 为 tenant-a，但其引用的引擎定义、实例属于 tenant-b。

**实际行为**：检查只依赖可选的环境展示标签 `tenantId`，既不比较 `instance.tenantId`，也不比较 `template.tenantId`；标签为空时直接放过租户检查。历史分支没有租户比较。

**本地复现**：业务记录为 tenant-a、引擎记录为 tenant-b、环境标签为空，其他标识一致；报告仍为 `ok: true`。

**影响**：该核对不能识别业务元数据与实际执行资源的跨租户关联错误。本项是验证器漏检，不是已经证明真实后端可被跨租户访问。

**建议**：以实例和对应模板的业务租户为一致性基准，环境标签只作额外约束；明确无租户资源的语义，并让运行态与历史态采用一致规则。它不能替代服务端授权。

**验收**：没有环境标签也必须检出业务/引擎租户不匹配；模板与实例租户不一致、无租户资源、完成态历史分别覆盖。

## CR-11：新实例沿用旧实例的一致性报告

**位置**：`src/views/BusinessWorkflowView.vue:30-44,74-83`。

**触发**：核对实例 A 期间启动实例 B；或 A 的核对已经完成后再启动 B。

**实际行为**：`consistencyReport` 没有随 `lastInstance` 切换清空，异步返回时也未核对报告所属实例。页面显示 B 的实例信息，却继续显示 A 的“一致”状态。

**本地复现**：加载实际 Vue SFC 的 setup，调用实际启动方法创建 A，触发延迟核对，启动 B 后再返回 A 的核对结果。最终 `currentInstance=pi-B`，`reportInstance=pi-A`，页面报告仍为 `ok=true`。

**影响**：用户可能把其他实例的通过结果当作当前实例的验收，属于结果归属错误。

**建议**：实例切换时清空或显式隔离历史报告；请求捕获实例 ID 与请求序号，返回时检查当前实例、最新请求和卸载状态。展示报告自带的 `businessInstanceId/processInstanceId`，避免结果归属不明。

**验收**：覆盖“A 核对在途→启动 B→A 返回”和“A 已核对→启动 B”两种顺序；B 未核对前不能展示 A 的通过状态，离开页面后旧结果不能更新界面。

## CR-12：办理失败的反馈没有显示在办理弹窗内

**位置**：`src/views/BusinessWorkflowView.vue:58,93`，`src/composables/useBusinessWorkflow.ts:149-150,158-159`。

**触发**：滚动到任务列表并打开办理弹窗，输入非法 JSON，或让完成接口返回拒绝/网络错误。

**实际行为**：错误写入共享 `workflow.error`，唯一的 `ElAlert` 位于页面顶部；弹窗仍打开，但弹窗内容没有错误提示。页面顶部可能已在视口外，用户在当前操作中无法获知失败原因。请求封装也不会另行弹出通知。

**证据等级**：由错误赋值、模板结构和请求封装确认；本次没有执行浏览器视觉验收。

**影响**：用户难以修正 JSON 或理解任务失败，可能反复提交；共享错误也难以区分列表查询、启动与完成操作。

**建议**：给完成操作独立错误状态，在弹窗内显示，保留输入供修正；不要让无关列表刷新清除完成错误。

**验收**：非法 JSON 时不发请求且弹窗内展示原因；403/409/超时分别展示明确反馈；失败后变量草稿保留、可修正重试，成功后清理该任务的错误。

## CR-13：离开再返回可绕过超时后的结果核对

**位置**：`src/composables/useDesignerDeployment.ts:21,33-36,97`；业务发布有同构问题：`src/composables/useDesignerTaskTemplate.ts:21,34-36,102`。

**触发**：部署或发布请求超时，进入 `uncertain=true`；未完成核对时离开设计器，再从路由返回。

**实际行为**：快照和待核对状态只属于组件实例，卸载后新实例从 `uncertain=false` 开始，可再次提交。`disposed` 只忽略回包，不会撤销服务器已收到的写请求。原有“关闭弹窗再打开必须先核对”测试没有覆盖组件卸载重建。

**本地复现**：两种 composable 均模拟超时，销毁再创建新实例。原实例 `uncertain=true`，新实例 `uncertain=false` 且 `canSubmit=true`，未经过核对确认。

**影响**：网络结果不明时可能重复部署/发布。改变部署名称或资源名后不能依赖现有重复过滤保持相同结果；本次未向真实引擎提交重复请求。

**建议**：提交中或结果不确定时增加明确的路由离开保护，或保存可跨组件恢复的待核对操作记录。分别定义 SPA 路由切换与整页重载的恢复范围；后端幂等能力另行按真实契约处理，不能凭前端状态保证 exactly-once。

**验收**：覆盖两条通道的“提交中离开”和“超时后离开再进入”；返回后不能静默当作新请求，能识别原快照/名称并完成核对；已确定失败或已成功的正常返回流程不受阻断。

## CR-14：历史同名变量丢失作用域

**位置**：`src/api/workflow/consistency.ts:85-88`；现有 `CamundaHistoricVariableInstance` 已定义 `executionId` 和 `activityInstanceId`，但合并时未使用。

**触发**：已结束实例同时存在流程级 `amount=8` 和子执行局部 `amount=9`，查询返回两条同名历史变量。

**实际行为**：`Object.fromEntries` 仅按 name 建表，最后一条覆盖前面的值。核对流程级变量时混入局部变量，甚至同一组历史数据只改变顺序就产生不同结论。

**本地复现**：根执行记录在前、局部记录在后时为 `failed`；同两条记录逆序后为 `passed`。

**影响**：多实例或其他拥有执行作用域的流程，结束后的变量核对不稳定，也可能碰巧通过。

**建议**：对齐实时流程级变量的作用域后再比较。无法明确作用域时应标记歧义，不能采用最后一条覆盖；分页完整性同时按 CR-08 处理。

**验收**：有同名局部变量时不覆盖流程级变量；响应顺序变化不影响结果；根作用域缺失或有歧义时不能报告已确认一致。

## CR-15：对象属性顺序被误当作语义差异

**位置**：`src/api/workflow/consistency.ts:30-32,90`。

**触发**：两侧变量均以对象值返回，业务值为 `{a:1,b:2}`，引擎值为 `{b:2,a:1}`；嵌套对象也同样受影响。现有接口类型允许对象值。

**实际行为**：`JSON.stringify` 结果受对象键插入顺序影响，语义相同的值被判为不同。

**本地复现**：将匹配夹具中的 payload 按上述顺序交换，变量项返回 `failed`。

**影响**：对象值经过序列化、存储或重建后可产生无实际差异的失败告警。

**建议**：对象比较忽略键顺序，但保留数组顺序与值类型差异。真实 Camunda `deserializeValues=false` 可能涉及序列化字符串，相关类型归一化须按真实接口契约另行确认，不能盲目对全部字符串做 JSON 解析。

**验收**：普通和嵌套对象键重排仍相等；数组换序、数值/字符串差别仍不相等；对象与序列化字符串的规则必须明确且有契约依据。

## CR-16：烟测部署结果不确定时无法清理或核对

**位置**：`scripts/camunda-job-retry-demo.mjs:56-57,86-87`；`scripts/camunda-proxy-smoke.mjs:102-103,167-168`。

**触发**：引擎已提交测试部署，但客户端收到完整响应前超时或断连。此时部署创建的 await 抛错，`deploymentId` 尚未赋值。

**实际行为**：两份脚本的 finally 都只在已获得 ID 时清理，因而完全跳过核对和清理；异常输出也没有本次唯一的 `deploymentName`，操作者难以精确定位遗留部署。

**本地复现**：替换全局 fetch，模拟服务器记录部署后抛出传输错误；实际执行两份脚本。均只有创建调用，没有后续部署查询/删除，捕获日志中也不包含生成的部署名称。没有访问真实网络。

**影响**：烟测失败后可能遗留部署；重复执行会累积测试资源。无法根据客户端错误判断写操作是否已提交。

**建议**：在发送写请求前记录唯一部署名称；对不确定结果使用精确名称、租户及来源等已支持条件核对归属，再决定清理。恢复请求失败时必须输出足够的人工核对信息，并保留原始异常。不能仅凭名称前缀批量删除，也不能绕过现有归属检查；代理烟测的写操作继续经代理完成。

**验收**：覆盖“提交后响应丢失”“明确未提交”“查询恢复失败”和“不匹配的部署归属”；能精确恢复或留下可操作的核对信息，不删除其他运行的数据。增加本地 mock 回归，不要求为了复现而污染真实引擎。

## CR-17：烟测清理失败掩盖主流程失败

**位置**：`scripts/camunda-job-retry-demo.mjs:86-92`；`scripts/camunda-proxy-smoke.mjs:167-173`。

**触发**：已成功取得部署 ID，后续启动、查询或断言失败；finally 中的归属查询、删除或清理确认随后也失败。

**实际行为**：finally 抛出的第二个异常替换第一个异常，最终输出只剩清理失败，原始验证失败原因丢失。

**本地复现**：两份脚本分别制造 `MOCK_PRIMARY_VALIDATION_FAILURE` 和后续 `MOCK_CLEANUP_FAILURE`。最终抛出的错误均只有后者，没有 cause 或聚合错误保留前者。

**影响**：失败日志无法说明本来未通过哪项验证；处理清理问题后仍需重新运行才能重新取得原始故障证据。

**建议**：分别保存主流程和清理结果；两者都失败时使用聚合错误或分段日志报告，附本次部署 ID/名称。主流程成功但清理失败仍应返回失败；归属核对失败仍禁止删除。

**代理脚本补充**：当前清理归属查询只经过 direct 观察端；该端不可达时，即使代理仍可达也不会尝试删除。可评估通过代理执行等价、可信的归属核对后恢复清理；未确认归属时输出核对标识并保持禁止删除，不要为提高烟测通过率放宽删除条件。本条采纳 OCR 候选中的异常保留部分，代理回退能力作为同一清理流程的增强建议。

**验收**：覆盖仅主流程失败、仅清理失败、两者同时失败、全部成功四种组合；双失败包含两项原因及恢复标识，退出状态准确，删除范围保持受控。

## 给后续修复 AI 的要求

1. 先读 `Agent.md`；保留当前未提交代码和新增文件，不 reset、覆盖或清理用户工作区。
2. 先处理 CR-01/13；同一验证模块的 CR-02/03/07/08/09/10/14/15 一起设计并逐项回归；CR-04/11/12 一起检查业务页状态与错误隔离；再处理 CR-05/06，最后处理烟测 CR-16/17。每项先补覆盖触发路径的回归用例，再做局部修复。
3. 本报告不是后端规格。不新增未经确认的 API，不把通用引擎 API 当作业务接口，不推断生产权限已经完成。
4. 保留命令栈、设计稿与部署产物区分，以及快照、超时核对、查询取消机制。
5. 运行 `pnpm test`、`pnpm build`，在 `/designer`、`/workflow-business` 验证相关入口、弹窗、取消和切换。真实后端联调仅在实际执行后记录通过。
6. 每项记录修复位置、回归测试、实际验证结果和剩余限制。行号针对本次工作区，修复前按符号重新定位。

## 不作为本次阻断项的观察

- OCR 候选 09：业务启动成功后更新实例筛选但不自动刷新任务表，旧查询也可能稍后返回；页面有手动查询入口，尚未明确输入条件变更即代表已应用筛选，因此保留为交互改进，未计入 17 项。若产品要求启动后自动切换列表，则应清空旧结果、使旧请求失效并重查。
- OCR 候选 23：`scripts/camunda-proxy-smoke.mjs:85-86` 只测“缺失凭据被拒绝”，没有错误密码负例；`tests/camunda-proxy-smoke.test.mjs` 也仅检查配置、编码和 BPMN 生成。这是认证测试覆盖缺口，不是已证明后端接受错误密码。建议在本地模拟和真实联调中增加正确用户名/随机错误密码应返回 401/403 的检查；不要把当前烟测通过解释为完整认证验收。
- 真实业务对象与 Camunda `deserializeValues=false` 的序列化契约未联调；CR-15 确认对象值比较本身有误，不代表已经验证了真实 API 的所有对象/字符串转换规则。
- 构建 chunk 大小警告作为性能观察，不等于已发现用户可感知的性能回归。

## 候选归并索引

以下编号对应 OCR JSON 中 comments 数组的 1-based 顺序，便于后续 AI 对照，不能重复建修复项。

| OCR 候选 | 本报告处理 |
| --- | --- |
| 01 / 02 / 03 / 04 | CR-02 / CR-03 / CR-07 / CR-08 |
| 05 / 06 / 07 / 08 | CR-15 / CR-14 / CR-09 / CR-10 |
| 09 | 非阻断观察：启动后的列表刷新语义 |
| 10 + 11 | CR-04：卸载后的回调与跨弹窗回调统一处理 |
| 12 / 13 / 14 / 15 | CR-11 / CR-05 / CR-12 / CR-01 |
| 16 + 17 | CR-13：两条发布通道的跨路由待核对状态 |
| 18 | CR-06 |
| 19 + 21 | CR-16：两份烟测脚本的创建结果不确定 |
| 20 + 22 | CR-17：两份烟测脚本的异常保留；22 的代理回退为增强建议 |
| 23 | 非阻断观察：认证错误密码负例缺失 |

## 审查产物

- 精简 OCR 记录：`output/code-review/2026-09-30/ocr-summary.json`（完成状态、覆盖文件、候选及本报告归并映射）。
- OCR 原始 JSON：`output/code-review/2026-09-30/ocr-single.json`（已生成；后续修复优先使用本报告与精简记录）。
- 本地复现脚本及结果：`output/code-review/2026-09-30/reproduce.mjs`、`reproduction-results.json`。
- 烟测异常复现：`output/code-review/2026-09-30/smoke-failure-probes.mjs`、`smoke-failure-results.json`（两份实际脚本 × 两类失败，共四个断言通过）。
- 日志：`output/code-review/2026-09-30-tests.log`、`output/code-review/2026-09-30-build.log`。

`output/` 已被 Git 忽略；后续修复不应依赖临时文件一定存在，本报告的触发条件和验收标准可独立使用。OCR 原始候选必须与复核结论区分，不能按工具评论数量当作已确认缺陷数。
