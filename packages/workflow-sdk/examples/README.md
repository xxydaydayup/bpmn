# 业务工作流模型示例

外部系统接入可先看[采购系统分请求示例](./purchase-system.md)与[工厂源码](./purchase-system.mjs)，覆盖独立安装、鉴权请求注入、发布、发起、经理审批、采购登记和实际版本绑定。

函数运行示例还包括 [多人审批](./countersign-client.mjs) 与 [递归子流程复用](./subprocess-client.mjs)。导入无请求，显式调用才发布并启动；宿主提供鉴权request、唯一key/businessKey及资源清理。多人结算交由引擎，子流程运行参数使用后端完整activityId。

本目录的正向 JSON 示例按 [后端业务流程 Schema](http://192.168.124.202:8085/bpmn/json-schema) 编写，同时满足本仓库业务设计器的发布前流程检查，可作为裸业务模型导入。`invalid-*.json` 是供校验测试使用的反例。

Schema 允许省略名称与布局；设计器发布还要求流程名、节点名、顶层唯一开始和结束节点、完整连线，以及条件节点至少两条出线。因此正向示例均带名称；状态与审批结果分支通过各自办理节点连接同一个结束节点，不使用只有一条出线的 condition 作为汇合节点。parallel 汇合仅用于并行路径。

## 状态、金额分支缺少办理人

- [status-missing-selected.json](./status-missing-selected.json)：`state=ready` 选择 ready，其他状态选择 fallback。
- [amount-missing-selected.json](./amount-missing-selected.json)：`amount>100` 选择 high，其余选择 low。

在业务设计器中导入相应 JSON，执行流程检查并发布任务模板，模板 key 使用 JSON 的 processId。通过接口发布时，先编译模型得到 XML；multipart 的 file 与 display-json 必须对应同一模型，template-key 与 processId 一致。按当前发布协议不传 startable。

对状态模板调用 `POST /api/v1/task/instances/start`，缺参请求如下：

```json
{
  "templateKey": "manual_status_missing_20261118",
  "businessKey": "manual-ready-missing-001",
  "variables": {
    "state": "ready"
  }
}
```

正常对照请求换一个唯一 businessKey，并在 variables 中增加 `ready_assignee: "测试用户标识"`。默认路径使用 `state: "unknown"`，对应办理人变量为 fallback_assignee。只传实际选中分支的办理人，避免同时补齐所有分支而掩盖缺参问题。模型中不要固定 assignee，否则不会触发该验证场景。

金额对照使用模板 key `manual_amount_missing_20261118`，variables 传 `{"amount":101}` 或 `{"amount":0}`，分别省略 high_assignee 或 low_assignee；正常请求补上对应变量。每次启动使用新的 businessKey；启动 variables 传普通值，无需 `{"value":...}` 包装。

缺少选中分支办理人时，2026-11-18 复验状态场景仍返回 HTTP 500 / INTERNAL_ERROR，包含 Cannot resolve identifier 'ready_assignee' 或 'fallback_assignee'；金额场景返回 HTTP 400 / VARIABLE_VALIDATION_FAILED。用户已接受状态场景现阶段以报错拒绝启动，400和提示列为后端待优化项，未标记修复。SDK保留真实500及effect=unknown，历史失败报告不改写。

示例通过 Schema、设计器检查或 XML 编译不代表已发布或完成运行验收。serial.json 引用了示例业务表单 form:request@3，发布前需替换为当前环境中真实可用的表单，或移除该可选字段。服务、消息、定时和审批节点仍需按实际参数规则提供运行配置。

## 生产级错误处理与恢复

[resilient-client.mjs](./resilient-client.mjs) 演示接入方的重试与恢复分层：只读请求全量重试（429/5xx/网络失败）、写请求仅连接未建立时安全重试、`effect=unknown` 用查询核对恢复（幂等启动按业务键对账、办理后核对原任务是否消失）、`describeWorkflowError` 错误分类。该示例为适配参考，未记录真实验收，重试边界不得超出文件头注释的契约。
