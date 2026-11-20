# 函数 SDK 本期交付记录（2026-11-19）

## 当前状态

02—14 已按用户确认的本期范围完成，父01 completed。07/10本轮复核既有证据，13完成宿主迁移和真实页面验收，14完成独立tgz真实组合验收。completed不表示获准排除的能力已经验证，也不表示已知后端bug已经修复。未提交、推送或发布registry；原有工作区改动与历史失败证据保留。

## 实现与兼容

- `src/api/workflow/sdkGateway.ts`：详情/任务/启动/意见/退回重派复用SDK，保留宿主字段别名。任务实际定义ID匹配历史快照，错配/读取失败不提交，不回退latest。历史查找当前为顺序读取，有大量模板时可后续优化。
- 业务页面增加SDK启动、SDK同意/拒绝；旧variables/按节点、原始XML、模板列表删除与独立动态表单提交保留。完成JSON可作为SDK附加变量；重复意见字段会被冲突校验拒绝。
- 后端未声明个人意见变量的末尾任务，SDK不会构造passed；保留草稿和variables兼容入口。不是“提供快照即可适配所有空规则”。

## 本轮验证

| 层次 | 实际结果 |
| --- | --- |
| 全量 pnpm test | SDK52 + designer128 + forms12 + root93 = **285通过** |
| pnpm build | 通过，既有大chunk警告保留 |
| 宿主真实页面 | 退回后同任务直接重派；单人同意完成；ALL首票同意保留第二人；发布v3后旧v2第二人拒绝且COMPLETED |
| 独立安装tgz | ESM/Schema/导入无请求/无DOM模型类型/client类型/浏览器构建通过，零运行时依赖 |
| 独立包真实组合 | 两层子流程 + ALL会签 + 分支/并行 + businessKey消息 + PT1S定时 + archive，pass/reject两条均COMPLETED，历史含结束worker完成 |
| 服务/服务会签 | 独立包真实编译通过；没有执行业务服务worker，不计运行通过 |
| 清理 | 本轮宿主5 + 首次组合2 + 最终包重验2 = **9个部署清理**；已保存报告ID共**160个deploymentId**逐一只读查询，剩余定义均为空 |

真实组合实例：
- 通过：`de067530-e3ca-11f1-b049-00155d21c8ae`，定义 `ddcd3cbe-e3ca-11f1-b049-00155d21c8ae`。
- 拒绝：`e2b4939b-e3ca-11f1-b049-00155d21c8ae`，定义 `e27f2bb9-e3ca-11f1-b049-00155d21c8ae`。

## 包及证据

最终包：`.scratch/workflow-function-sdk/artifacts/final-2026-11-19/workflow-sdk-0.2.0.tgz`（0.2.0，未发布）。

SHA-256：`6384ae47c2bd42d67c5ed8bd9dadb9cb74be8d637da9926e9c7ba1f63eb038b2`。

原始证据均在本地 `.scratch/workflow-function-sdk/verification/`：

- `2026-11-19-full-tests-final.log`、`2026-11-19-build-final.log`。
- `2026-11-19-host-runtime.json`：页面操作、原始映射失败、最终状态和5部署清理。
- `2026-11-19-package-final.log`：最终包独立安装目录及类型/浏览器结果。
- `2026-11-19-final-combination.json`：最终SHA、实例、每票规则/任务、进度/历史、原key字段false/0和清理。
- `2026-11-19-final-combination-initial.json`：文档整理前包的首次组合，独立保留，不冒充最终SHA运行。
- `2026-11-19-scope-audit.json`：07/10调整口径复核；`07-approval-subprocess-timeouts-delivery.json`：既有完整矩阵及45部署旧账。
- `2026-11-19-scenario-index.json`：历史各报告逐场景原始状态索引，不覆盖failed记录。
- `2026-11-19-final-cleanup-audit.json`：160部署只读复核。历史早期报告写盘失败、ID不可恢复的两资源仍未计入逐一核实数量。

上述目录可能被Git忽略，跨机请连同tgz/工单/脚本一起保留；这里不是声称所有证据已跟踪入库。包内验证文档记录的是最终重验前时点的7部署/158定义审计，最后两部署增量和最终SHA以本文件及最终原件为准。

此前并发全量forms超时、错误相对路径导致的包验证失败等日志保留；最终独立完整全量及正确包路径均重跑通过。没有把原失败报告修改为成功。

## 未修复或未覆盖范围

1. 服务实际worker执行、服务会签执行和NATS通知送达按用户授权排除，不能计passed。
2. processInstanceId消息关联仍ENGINE-13028；本期只使用businessKey，不自动换目标重试。
3. 候选用户/组重派仍下游405；本期只验收无候选、直接userId。
4. 嵌套审批timeout end仅结束内部，外部sibling仍ACTIVE；整实例终止没有修复，有限观察不等于证明通知未送达。
5. 状态入口漏传所选办理人仍可能500，为已接受后端差异；未绕过租户或权限。
6. 清理只对唯一前缀资源执行，业务行/模板历史可按后端契约保留；未触碰既有业务数据。

## 后续

本期无未完成前置或交付项。若扩展上述边界，应另行确定后端修复与服务/NATS可观测环境，再补对应真实验收；不要重开所有已完成切片，也不要把本期完成解释成生产后端所有能力已通过。
