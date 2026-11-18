# SDK 工单04：当前后端问题与历史诊断

## 最新结论（2026-11-17 17:12 复验）

用户提供的 [模型 Schema](http://192.168.124.202:8085/bpmn/json-schema)、配套 [/bpmn/spec](http://192.168.124.202:8085/bpmn/spec) 和 [Swagger](http://192.168.124.202:9000/swagger/index.html#/) 已读取。Schema 描述流程定义，不是每个模板或任务的运行参数。新运行规范明确人工单人意见、会签个人意见使用 `{节点id}_passed:Boolean`；服务 passed 由 worker 写入，服务会签为只读汇总。此前要求后端恢复 approved 的建议已被新版正式契约取代，**无需后端为此恢复旧字段**。

SDK 已适配新规则并兼容旧定义的 approved/vote。真实单人同意和拒绝均通过发布、启动、complete、实际路径、历史终态及结束 worker；拒绝直接 end，不进入 accepted/archive，原 key 表单与 false 保留。旧失败证据保留如下历史，不再列为当前审批映射阻塞。

当前仍需后端处理的是：**入口条件网关的非默认路径，仍被要求提供未选中默认路径的办理人**。两种流程均复现：

| 决策与实际最小输入 | 实际结果 | 对照 |
| --- | --- | --- |
| `state=ready`，仅传 `ready_assignee` | HTTP400 / VARIABLE_VALIDATION_FAILED，要求 `fallback_assignee` | `state=unknown` 仅传 fallback_assignee 可完成，缺 fallback 仍400 |
| `amount=101`，表达式 `${amount > 100}`，仅传 `large_assignee` | HTTP400 / VARIABLE_VALIDATION_FAILED，要求 `small_assignee` | `amount=0` 仅传 small_assignee 可完成 |

精确请求：

```http
POST /api/v1/task/instances/start
Content-Type: application/json

{
  "templateKey": "sdk_5a47d8d7ad284b58860863a8e546da7d_status",
  "businessKey": "sdk_5a47d8d7ad284b58860863a8e546da7d_status_ready",
  "variables": { "state": "ready", "ready_assignee": "sdk-status" }
}
```

返回消息：`流程变量校验失败（start）- 【fallback】fallback_assignee：未传（String），【fallback】审批人`。金额实例仅带 `{ "amount": 101, "large_assignee": "sdk-amount" }` 时，对应消息要求 small_assignee。

同时，Swagger 明确 `GET /api/v1/template/{key}/start-variables` 支持 query 决策值过滤路径；本轮 `?state=ready`/`?state=unknown` 均返回 ready 与 fallback 两项，`?amount=101`/`?amount=0` 均返回 large 与 small 两项。SDK 已保留提示边界，没有把候选集合全部作为本地必填，也没有遗漏 query 或修改状态名。

请后端核对决策值是否用于 start-variables 与 start 的实际选路、非默认条件是否先于 default 求值、校验路径与编译后执行路径是否一致。这里确认的是接口现象，未修改或取得当前后端源码，不能确认内部函数或算法原因。不能通过要求前端补齐所有分支或取消选中路径必填来解决。

另做了只编译、不部署的[XML交叉核对](../../.scratch/workflow-function-sdk/verification/05-04-compiled-routing-crosscheck.json)：状态条件实际为 `${state == 'ready'}`，金额条件为 `${amount > 100}`（XML内转义为 &gt;），与SDK保留的模型表达式一致。未发现前端将条件或变量名改写。

[本轮完整证据](../../.scratch/workflow-function-sdk/verification/sdk_5a47d8d7ad284b58860863a8e546da7d.json) 保存 requests 中的 query/body/HTTP status/完整返回、各分支路径、变量和资源标识。状态定义ID `efa55fb7-e266-11f1-93d2-00155d21c8ae`，金额定义ID `f0b410b2-e266-11f1-93d2-00155d21c8ae`。四个UUID部署已清理，ID可查日志，重放需重新发布。契约原件、抓取时间及SHA见 [契约摘要](../../.scratch/workflow-function-sdk/verification/05-current-contract-2026-11-17T09-07-04.213Z.json)。

04仍为in-progress，05/09仍等待04；没有降低验收标准。下面保留收到正式新契约前的原始诊断。

---

2026-11-17。环境：开发代理 `http://localhost:5171`，tenant-a，Camunda 7.24.0。编译超时已恢复，本记录只涉及审批分支及动态参数；未修改后端代码。

## 历史1：单人审批与旧 approved 契约的差异（已由新协议适配解除）

流程：开始→单人审批 review→条件分支；同意进入 accepted，拒绝直接结束。发布、启动均成功，review 任务已经生成。

`GET /api/v1/tasks/{taskId}/required-variables` 返回的 `currentComplete`、`gatewayDecision`、`nextGateway.decisionVariable` 均声明：

```json
{
  "name": "review_passed",
  "nodeId": "review",
  "nodeType": "approval",
  "type": "Boolean",
  "source": "complete",
  "required": true
}
```

但现有编译器规范快照与SDK规格约定：单人审批由业务提交 `review_approved=true/false`；会签/服务的 `passed` 为引擎或worker结果，业务不写入。当前模板的 globalVariables 也返回review_passed，不能仅靠更换前端字段名解决契约一致性。

预期：单人approval的规则、编译XML中的pass/reject条件以及complete参数校验统一使用approved语义；同意和拒绝对应的请求分别为：

```http
POST /api/v1/tasks/{taskId}/complete
Content-Type: application/json

{ "variables": { "review_approved": { "value": false }, "comment": { "value": "拒绝原因" } } }
```

同意时将false改为true，并在同一次请求中携带实际下一节点的办理参数，例如 `accepted_assignee: { "value": "next-user" }`。拒绝直接结束时，不应要求accepted节点的参数。

请后端核对：参数规则生成、网关条件表达式生成、任务完成校验是否采用了同一份节点语义。上述是定位方向，尚未拿到当前后端源码，不能确认具体出错类或函数。若后端已正式决定将单人输入统一改名passed，请提供新版契约并明确与会签/服务只读passed的区别，前端再评估SDK适配；目前不能把已有规则漂移直接当作已确认的协议升级。

实际任务ID：`d09de2e5-e25d-11f1-93d2-00155d21c8ae`；实例ID：`d09dbbd0-e25d-11f1-93d2-00155d21c8ae`；定义ID：`d06a28af-e25d-11f1-93d2-00155d21c8ae`。测试资源已清理，ID用于查日志，不能直接重放。

证据：[原始报告](../../.scratch/workflow-function-sdk/verification/sdk_f4d2537e54d04287a2e86fed49d9c2ed.json) → scenarios[name=reject/approval-agree]。本次SDK在参数阶段返回PARAMETER_MAPPING_UNAVAILABLE，effect=none，**没有发送complete请求**；不要将此描述为本次后端complete返回400。更早报告曾有完成校验要求passed的失败，历史与当前证据分开保留。

## 历史2：启动时校验未选中分支（本轮仍复现，以上文为准）

流程：开始→route条件网关，`statusVariable=state`；`state=ready`进入ready人工任务，其他值走default进入fallback人工任务，随后合流结束。两个节点均为运行时指定办理人。

实际调用标准启动接口，SDK只传当前选中路径参数：

```http
POST /api/v1/task/instances/start
Content-Type: application/json

{
  "templateKey": "sdk_f4d2537e54d04287a2e86fed49d9c2ed_status",
  "businessKey": "sdk_f4d2537e54d04287a2e86fed49d9c2ed_status_ready",
  "variables": { "state": "ready", "ready_assignee": "sdk-status" }
}
```

实际返回HTTP400，code=VARIABLE_VALIDATION_FAILED，消息：

```text
流程变量校验失败（start）
- 【fallback】fallback_assignee：未传（String），【fallback】审批人
```

预期：该请求仅进入ready，不应要求fallback_assignee；state=unknown时则只要求fallback_assignee。选中路径缺少自身办理人仍应拒绝，不能以取消所有必填检查修复。

`GET /api/v1/template/{key}/start-variables?state=ready` 返回了ready/fallback的候选集合；前端保留提示，不把候选集合全部设为必填。最终start校验仍需后端根据真实入口路径处理。若该查询端点只支持静态候选，请在契约中明确说明，并提供后端选择实际路径所需参数和最终校验规则。通用表达式的求值仍由后端完成，不要求前端复制EL解释器。

请核对入口网关的选路结果是否用于start必填校验，默认分支是否只在其他条件均不匹配时选中。此处只确认“实际要求未选中参数”，尚未确认内部算法原因。

证据：同一 [原始报告](../../.scratch/workflow-function-sdk/verification/sdk_f4d2537e54d04287a2e86fed49d9c2ed.json) → scenarios[name=status-default]。定义ID：`d1563677-e25d-11f1-93d2-00155d21c8ae`。资源已清理，重测需发布新UUID模板和业务键。

## 收到新契约前拟定的复验（历史；当前以文首结果为准）

1. 新发布隔离模板，核对模板规则、task required-variables与实际XML的审批变量一致。
2. 同意只进入accepted及后续archive；拒绝直接结束，不进入accepted/archive；原key表单字段和false值保留。
3. state=ready只传ready办理人，未知state只传fallback办理人；缺少选中路径必填参数时拒绝。
4. 继续核对金额表达式、默认路径、历史终态及结束worker，并清理本次资源；编译或HTTP成功不能代替真实路径验收。

已有运行脚本：`packages/workflow-sdk/scripts/check-runtime.mjs`，场景reject、approval-agree、status-default、amount。04所有必需项通过后再completed并解锁05/09，02的跳过授权不扩展到这里。
