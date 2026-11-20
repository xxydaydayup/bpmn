# 函数 SDK 0.2.0 验证记录

> 最终包、SHA-256、本轮9个部署清理及160个历史deploymentId的只读复核结果以[本期交付记录](../../../docs/handoffs/2026-11-19-workflow-function-sdk-delivery.md)为准；下方7部署/158个deploymentId保留为最终包重验前的时点记录。

## 2026-11-19 宿主接入与范围复核（最新）

- 07/10按用户调整后的范围完成证据复核；服务实际worker执行、NATS送达不计真实通过，嵌套end仅结束内部而外层仍ACTIVE的差异未修复。08仅businessKey、12仅无候选直接userId范围完成；其余后端错误保留。
- 新增 SDK Gateway 和页面 SDK 启动/个人同意拒绝入口，保留所有旧 variables/按节点及原始 XML 路径。页面实测退回后同任务重派给 sdk-host-bob；单人同意完成；ALL会签首票同意后保留第二人，发布v3后按旧v2快照提交拒绝，历史走 rejected 并COMPLETED，未串用新模型。
- 末尾v1任务缺少个人意见规则：SDK拒绝猜测，草稿保留；通过旧variables入口完成。匹配快照不会制造后端未声明的意见规则。
- 本地证据：`.scratch/workflow-function-sdk/verification/2026-11-19-host-runtime.json`；5个隔离部署全部清理，清理后定义查询为空。业务行/模板历史可能按后端契约保留。该文件及原始日志位于本地忽略目录，跨机交付需另行保留。
- 本轮全量 `pnpm test`：SDK52、designer128、forms12、根目录93，合计285通过；忙碌互斥、409草稿、实际任务版本、请求取消及旧结果/卸载隔离均有回归。此前并发执行的默认forms超时失败日志保留，不改写为通过；本次独立完整重跑通过。生产构建通过（既有大chunk警告）。
- 14独立tgz组合验收通过：两层子流程 + ALL会签 + 分支/并行 + businessKey消息 + PT1S定时 + archive，分别覆盖通过和拒绝，真实历史COMPLETED且结束worker完成。服务任务及服务会签仅编译验证，不计worker执行通过。
- 仓库外ESM/Schema/无DOM模型类型/client类型/浏览器构建通过，零运行时依赖。本轮7部署已清理；对有保存资源ID的历史报告共158个deploymentId逐一只读查询，剩余定义均为空；历史早期落盘失败且无法恢复ID的两资源仍不算已逐一核实。
- 独立消费与最终清理记录：`2026-11-19-package-final.log`、`2026-11-19-final-combination.json`、`2026-11-19-final-cleanup-audit.json`（同一本地verification目录）。最终交付索引另见仓库 `docs/handoffs/2026-11-19-workflow-function-sdk-delivery.md`。以下旧状态/数量保留历史，不作为最新验收结论。


## 2026-11-19 消息关联范围调整与交接

08本期仅验收businessKey关联，复用既有真实消息/三种定时格式及错误证据，按调整范围completed。processInstanceId关联仍有ENGINE-13028后端bug，未修复、不计passed、不自动回退。当前待收口07/10，待实施13及最终14；本次仅更新文档和交接，未重跑测试、构建或真实引擎。

## 2026-11-19 直接指定用户重派按调整范围完成

用户确认本期任务可以不带候选用户/组。12复用无候选任务退回待重派、直接指定userId、新旧办理人筛选、同一任务完成与历史终态，以及受限/未授权和错误无自动重试证据，按调整范围completed。候选场景下游405未修复、未记passed，不再阻塞本期。13的05/11/12前置已满足，页面迁移与真实验收尚未执行。本次仅文档核对，未重新运行测试、构建或引擎；以下先前08/12未关闭描述为本次调整前历史。

## 2026-11-19 用户调整本期验收边界

用户接受07暂无真实服务，本期按已有离线定义/映射/保护及包消费证据核对，不强制真实服务调用与worker观测。用户接受10暂无NATS接收证据，以及嵌套审批超时end只终止内部作用域、外层并行仍ACTIVE。以上属于本期验收豁免/已接受差异，原始未验证与失败报告不变，未声称通知送达、服务真实执行或后端修复。07/10保持in-progress待按调整范围核对收口；08/12仍未关闭。本次仅更新范围记录，未重新执行测试、构建或真实引擎。

## 2026-11-18 用户接受差异后继续

用户确认接受状态入口缺所选办理人以500/INTERNAL_ERROR拒绝启动；400及提示属于后端待优化项，未修复。SDK保留真实500、unknown和资源上下文。04其余正常路径/映射/终态已通过，按调整口径completed，继续05和09。下列原始失败报告及等待记录保留历史。

新增真实报告 `sdk_9ab5539796a04030918bf3377078619f.json` 的8个多人结算和2个子流程复用场景通过；状态缺参按接受口径通过，并显式记录 acceptedDiscrepancy/fixed=false，原始错误仍500/unknown。11部署cleaned。随后 `sdk_b3d53a692a6544668111a5eff3998e25.json` 在SDK修正后重新通过8个多人结算、2个子流程组合及2个专用消费者，12部署cleaned，环境仍localhost:5171、tenant-a、Camunda7.24.0。

多人矩阵覆盖ALL/ANY/VOTE及顺序ALL通过/拒绝，3名参与人、逐票Boolean、原key表单/false/0与后续配置在一次complete提交；ANY首拒仍等待、VOTE达到2/3才通过、结算后未提交的并行任务取消，历史任务/实际分支/COMPLETED及结束worker均核对。递归场景在两个容器复用同名局部节点，其中一个两层嵌套，交叉验证内部choice通过/拒绝、parallel汇合及内部end后回外层resume/archive；按完整活动ID核对不同办理人。

SDK另修正个人会签意见被当成汇总分支的提前必填判断，并识别任务规则provided=true的已供启动配置；个人意见仍每票必填，显式清空仍校验。先复现回归失败再修正，SDK49项通过。源码引擎报告与实际安装包消费者分别记录，不互相替代。

追加审计修正：会签不预测汇总分支时，仍对调用者显式提交的必需启动配置执行非空检查；空字符串、null和名单空数组在发送前拒绝，省略未结算分支配置仍允许。回归先失败再通过，新增完整嵌套活动的运行时reminderDuration映射、类型和固定值保护，当前SDK **50/50** 与 `pnpm build` 通过，保留既有大chunk提示；根目录全量测试本轮未运行。源码报告 `sdk_9ac0ce6f61cd4eb5817bf09b4e6c61c4.json` 的延后配置ALL通过；该报告同时保留10的失败，不能整体称为passed。

07离线补齐服务结果保护：原先已知service的数字索引result仍可作为业务变量写入，回归确认失败后，现按已知完整服务activityId保护 `{activityId}_result_数字`，覆盖嵌套、start及complete的fields/variables，普通业务key保持可写。补齐服务对象数组/false/0、准确fieldKey别名及模板固定配置只读检查，SDK当前 **52/52** 通过。真实服务环境未具备，07不标完成。后续构建/包与真实安装消费见07交付账目；此前包与报告原件保留。

`sdk_13e6df7e344442869a534c3a00be3880.json` 从审计服务结果修正前的包 `ce1c6b19cf1f06fc2b9fc554b78c19de1404c66d963a254536d650a2fc69e399` 仓库外安装运行多人、子流程及5个超时通过场景，7项通过、7部署cleaned。此报告不覆盖07真实服务调用，也不把嵌套end失败改写通过。

`sdk_4d14813828384e8a8885aa46b644cc02.json` 补齐延后配置并行/顺序ALL及递归已交付节点编译；`sdk_e71be0e5c95b43029701ead29a1cd0fd.json` 从仓库外实际安装包运行多人/子流程消费者通过，包SHA为 `f1b11c4bf3008a8a4ea03a8df6f89dbaa75bd0b1e29d8745e32deaca72dded75`。此为审计追加修正前的包，后续包另行记录，不覆盖历史tgz。05、09验收完成。

## 2026-11-18 超时动作补验

最终当前包位于本地 `artifacts/service-protection-final-2026-11-18/workflow-sdk-0.2.0.tgz`（verification同级目录），SHA256为 `53a24fc0e16e4259e38551a0c9b44df5db81d6ed8e777090e1709836360b1268`。SDK52项及最终生产构建通过；仓库外 `workflow-sdk-consumer-PFkGwK` 的离线ESM、零运行依赖、无DOM模型/定义类型、client类型和浏览器构建通过，另在安装包校验了显式空会签配置与服务索引结果保护。`sdk_8693b4f56ed64b0e94642194726e07fe.json` 真实执行多人/子流程消费者通过。最终账目 `07-approval-subprocess-timeouts-delivery.json` 索引9份报告、45个不同部署，逐一只读复核模板/部署404及定义为空；业务行/模板历史可能按后端契约保留。一次早期路径错误导致报告落盘失败的2个临时部署单独记录，未恢复逐资源ID，未计入这45个已复核资源或独立安装证据。

`sdk_fcf3581f5ff94f5ca9cf1f90e683f829.json` 的运行时PT4S退回、两层子流程内部同层退回、子流程容器退回、会签退回及顶层子流程容器end共5项通过。退回核对原任务取消、新任务ID、原key/false/0、实例ACTIVE、后续尚未执行、重新进入并正常COMPLETED及结束worker；容器退回取消全部内部并行任务，会签退回取消全部个人任务。派生事件从后端XML核对，业务模型未预填。

同一报告的两层子流程内部审批end失败：内部review/legal取消，但外层sibling仍等待，实例ACTIVE。后续 `sdk_9ac0ce6f61cd4eb5817bf09b4e6c61c4.json` 以及 `sdk_e16c12fc108d4aa7b6dbb01b2d38c94f.json` 在timeoutEnd结束后继续约7秒有限观察仍失败；后者同时保存原生引擎任务和历史实例，状态一致、endTime=null、无待处理external task。后端生成的terminateEventDefinition位于内部subProcess，仅结束所在作用域，未满足正式规范“整个实例终止”。这是后端待处理差异，未修复；SDK不伪造终态或另发终止请求。

用户明确表示当前没有NATS提醒观察连接或接收查询，notify保留待验收。10仍in-progress，不把已完成的提醒活动或部分end成功当作全部验收完成；[后端复现说明](../../../docs/handoffs/2026-11-18-workflow-sdk-timeout-end-backend-issue.md)。三份超时相关报告共9个部署均记录cleaned，失败实例也只清理本次隔离资源。当前总账以本地 `07-approval-subprocess-timeouts-delivery.json` 为准。

## 2026-11-18 接续复验（用户接受差异前的历史）

用户要求等待其验证后再继续；05/09 未实施。02 当前发布协议已调整：multipart 不发送 startable，保留响应字段；旧 true 选项弃用兼容，false 在网络前拒绝。正式 Swagger 已不再声明该请求字段，来源、时间及原文 SHA 见 [发布契约](../contract/backend-publish-2026-11-18.json)。

环境为 localhost:5171、tenant-a、Camunda 7.24.0。三个原始报告位于本地 verification，旧报告保留：

| 报告 | 实际结果 |
| --- | --- |
| sdk_fcebc692bd094f05b8b9988919f1da55.json | 最小发布版本/名称/display-json/部署定义及无自动启动通过；agree/reject、金额101/0只传所选办理人及终态通过。状态负向检查在500处中断，该报告未执行正常状态路径。 |
| sdk_2b54634c6dfb4bd99c7aa03c9c96bcfa.json | ready/unknown只传所选办理人、实际节点/办理人/历史终态通过；金额两路径缺参均400/VARIABLE_VALIDATION_FAILED。状态两路径缺参仍500/INTERNAL_ERROR、effect=unknown，精确业务键运行实例为空。timer-required通过；实例ID消息仍ENGINE-13028，候选重派仍500/下游405。 |
| sdk_334d792d888a4da9a0621cb66a1df35c.json | 仅含timer的duration/date/cycle均发布执行成功，到期前ACTIVE/无人工任务，到期后COMPLETED/结束worker通过，旧命名空间失败本轮不复现；带真实候选用户/组的refuse仍500/下游405。 |

15个隔离部署均已cleaned。状态start-variables带决策query仍返回两分支候选，SDK保守作为hints并保留诊断，不本地求值。04保持in-progress；08仍缺实例ID消息成功链路，12仍缺带候选分配的完整成功链路。见 [本轮待验证记录](../../../docs/handoffs/2026-11-18-workflow-function-sdk-validation-followup.md)。

本轮SDK47项及pnpm build通过，保留既有大chunk提示；未重跑根目录全量测试。最终包SHA/消费者/检查账目见本地06-resume-delivery.json。以下2026-11-17内容均为历史证据。

日期：2026-11-17（Asia/Shanghai）。Windows、Node.js 24.19.0、pnpm 9.9.0。模型兼容基线仍为后端 /bpmn/spec v1 的 2026-11-16 快照。

## 2026-11-17 新运行契约适配

模型Schema、/bpmn/spec及Swagger均HTTP200，原件和SHA在本地verification/05-current-contract-2026-11-17T09-07-04.213Z.json。模型Schema描述流程定义；运行规范将人工审批与会签个人意见统一为passed:Boolean。SDK按明确规则适配，旧approved/vote兼容，engine与服务结果仍只读。模型基线未替换，新增bizJson模型字段未实现。旧映射失败保留，其“后端应恢复approved”的判断已被正式协议更新取代。

SDK44项通过。真实报告verification/sdk_5a47d8d7ad284b58860863a8e546da7d.json的单人reject及agree完成，原key/false、下一办理人、提前结束、COMPLETED/endTime及worker均核对。ready和101只传选中参数仍400要求默认分支参数；unknown与0默认路径完成，缺少选中fallback仍400。4部署cleaned。04仍in-progress，05/09仍被阻塞；旧超时保留，02例外未扩大。最终构建/实际包/消费者证据见本地ticket-audit-delivery.json的currentContractAdaptation。

## 真实环境证据

使用现有 `http://localhost:5171` 开发代理与已配置鉴权，租户 tenant-a，Camunda 7.24.0。网关/编译器未暴露构建版本，不推测其版本号。所有定义、发布、启动、办理与业务查询经 SDK 公开入口发起，原生引擎接口用于交叉核对历史终态及清理本次资源。

上一轮完整报告：`.scratch/workflow-function-sdk/verification/sdk_7614e448c057442dafc29d7e6072c9a4.json`。报告包含 UUID 隔离前缀、模型 SHA-256、模板版本、deploymentId、processDefinitionId、processInstanceId、任务 ID、实际活动轨迹、历史终态及逐资源清理结果。13 个 passed 表示脚本当时的断言通过，不能替代新子工单更完整的组合要求；具体逐项证据与缺口已记录在 02—14 各单 Validation。

## 编译恢复后的前一轮结果（新契约适配前历史）

2026-11-17 用户报告编译恢复后，使用同一 SDK 公开入口重新编译此前失败的四种形状，耗时分别28/16/17/22ms，模型及XML摘要保存在本地报告 sdk_c04ca4e55d514bbb8062414612b8f0e1.json。旧超时报告 sdk_de3d85288e84487eaaea0b199212ddc3.json、sdk_7b3e0f…、sdk_ccf568… 与 03-compiler-unavailable.json 保留原件；此前超时是历史失败，当前不再作为阻塞。

编译恢复后重新执行了真实发布、启动、流转、查询及历史核对。当前03、06、11 completed；02、04、08、12 in-progress；05、07、09、10、13、14 pending。02 startable=false 沿用用户的局部跳过授权，跳过未计通过；其余依赖和验收范围保持。

| 工单 | 当前实际结果与证据 |
| --- | --- |
| 03/11 | c04ca4… 的 serial-write-recovery 通过：网关实际执行start/complete后由验收transport丢弃响应，SDK保留unknown与资源，只读查询真实任务/变量/历史，不重试；重复业务键仍失败，最终COMPLETED与结束worker完成。规定的串行JSON及新旧版本隔离继续复用旧报告。真实发布丢失响应未执行，发布竞争/丢失响应仍为公开协议替身证据。 |
| 04 | f4d253… 保存真实review任务规则，currentComplete/gatewayDecision/nextGateway均声明review_passed，SDK按approved及引擎passed只读契约拒绝映射，未发送complete。动态status=ready只传ready办理人仍被后端要求fallback_assignee/400。6005ac… 的固定状态/default两路径已完成，不能代替动态最小参数或agree/reject验收。 |
| 06 | c04ca4… 的嵌套并行真实通过：finance/legal的inner join完成才有manager，manager与audit的outer join完成才有archive；每步核对任务集合、历史及结束worker。f9aa7a… 从实际tgz仓库外安装目录运行完整runParallelWorkflow通过。最终包复验另单记录摘要与资源，见本地交付索引。全部必需项已满足。 |
| 08 | c04ca4… 的消息→5秒定时完整通过：无人工任务仍ACTIVE、错误消息不推进、正确消息携带true/false/0、到期前等待与之后archive/终态。1a5a59… 的真实歧义/未授权不推进通过；59db8d… 的运行messageName/timerValue、false/0关联键、对象消息变量通过；07f93… 的入口缺timerValue诊断和timer→archive执行通过。processInstanceId关联仍400/ENGINE-13028。单timer原始拓扑发布仍500：派生serviceTask的camunda:type前缀未绑定，不以timer→archive成功替代。 |
| 12 | c04ca4… 无候选身份基线完成同任务退回/重派/新旧办理人筛选/终态；f4d253… 固定allowTransfer=false的真实重派403且任务不变；d7574b… 两操作真实未授权401且任务不变。6005ac… 在实际候选用户与组存在时，两操作均500/下游405/unknown；失败后分配和候选仍在、ACTIVE，完整成功链未通过。 |

本轮修复SDK参数诊断丢失上下文的问题：任务映射错误保留任务/实例/定义/节点，启动参数错误保留模板/业务键/映射定义；不提交引擎汇总值、不增加第二次写入。SDK40项公开测试通过，生产构建通过（既有大chunk提示）。实际tgz的离线ESM、零运行依赖、无DOM模型/定义类型、client类型和浏览器构建通过。旧全量212项是复用证据，未称为本轮全量重跑。

验收脚本曾错误预期allowTransfer=false禁止refuse，也曾将后续timer提示当作入口必填；这两份原始失败保留，修正后分别补真实403与入口timer必填验证，不将脚本错误列为后端故障。

九份恢复后报告共25个UUID隔离部署全部cleaned。单timer的publish/unknown另用精确key及故障时间窗只读核对：模板404、定义与实例历史为空、未发现对应部署。最终安装包消费者复验资源另单登记。准确包SHA、仓库外消费者目录、全部报告及清理总数以本地 `.scratch/workflow-function-sdk/verification/ticket-audit-delivery.json` 为准；后端差异复现与解除条件在同目录 `04-08-12-backend-followup.md`。

04阻塞05/09，12与05阻塞13；09阻塞10。07还缺用户已确认暂时没有的worker可访问且可观测测试服务。没有跨依赖实施或扩大02例外。

## 先前逐单核验记录（编译恢复前历史）

2026-11-17 按已发布的 13 张纵向工单从 02 开始核验。02 的发布选项补验发现：请求 multipart 明确发送 `startable=false`，网关 POST 201 与后续 GET 均返回 `startable=true`。名称、displayJson、定义/租户归属和无自动启动均核对成功。用户随后明确授权跳过这一项的真实复验并继续后续步骤；02 仍保持 in-progress，跳过不计通过。

复现证据：`.scratch/workflow-function-sdk/verification/sdk_a19241e774084a668182f6bda60ec083.json` 保存原始请求/返回；`sdk_7b85dad3a0784e5684349d844a5b14e1.json` 证明新增 `PUBLISH_OPTIONS_MISMATCH` 保留 HTTP 201、phase=publish、effect=confirmed、实际模板和部署/定义标识，未重试发布。

固定配置补验 `sdk_3e5ad8f831d64e55993322d91893fdbe.json` 的 fixed-assignee-start 与 fixed-assignee-next 均通过：无需传固定办理人即可真实完成，结束通知 worker 和历史 COMPLETED/endTime 可核对。旧固定 assignee 差异在当前环境已不复现。三个新增报告共 5 个隔离部署全部 cleaned。

本轮核验另确认旧报告的覆盖限制：parallel 未测嵌套 fork/join；多人场景未完整覆盖拒绝结算路径；timeout-notify 只观察提醒活动完成，无通知接收方证据；超时未覆盖子流程/并行全活动；旧脚本不代表现有页面验收。各缺口保留所属子工单。

接续后 SDK 39 项公开测试通过：补齐查询过滤/编码/分页/取消、start/complete 要求和写入阶段的取消/超时、业务失败/缺字段、发布/启动/完成执行后响应丢失的只读核对、消息错误矩阵、退回重派错误/不确定结果，以及嵌套并行结构。生产构建通过，保留既有大 chunk 提示。旧 212 项全量回归仍为复用证据，本轮未重跑全量。

03 已 completed：规定的真实串行/JSON/历史/结束 worker 与固定配置复用先前报告，缺少的协议检查、串行消费者和实际包核验已补齐。11 已 completed：规定的真实版本隔离复用 versions，公开入口模拟发布/启动/完成已执行而响应丢失后核对查询和不重试，并在仓库外安装包执行。协议模拟不称为真实响应丢失试验。

04、06、08、12 已进入 in-progress，补齐消费者和公开检查，真实验收仍有未通过项。最新报告 `.scratch/workflow-function-sdk/verification/sdk_de3d85288e84487eaaea0b199212ddc3.json` 的 reject、nested-parallel、message-timer-observation、reassignment-identity 均在 compile 超时，尚未部署，resources/cleanup 为空。03 的两次补充真实恢复尝试也在 compile 超时，报告为 sdk_7b3e0f… 与 sdk_ccf568…。没有把这些补充尝试记为真实通过。

故障核对：模板列表及引擎版本 GET 为 HTTP 200，但 localhost 和 127.0.0.1 代理的编译 POST 均在约 30 秒后返回 HTTP 500 / INTERNAL_ERROR，消息显示网关调用 `http://localhost:8085/bpmn/json2xml` 等待响应头超时。详情在本地 `verification/03-compiler-unavailable.json`。此次新增尝试没有创建任何部署或业务实例，未改动后端配置。05/07/09/10/13/14 继续等待相应前置；服务环境条件仍未满足。

包内增加 [只读写结果核对](../examples/write-recovery.mjs)、[分支](../examples/branch-client.mjs)、[嵌套并行](../examples/parallel-client.mjs)、[消息定时](../examples/wait-client.mjs) 和 [退回重派](../examples/reassignment-client.mjs) 消费者。实际 tgz 的无网络导入、三种响应丢失模拟核对、零运行依赖、无 DOM 模型/定义类型、客户端类型与浏览器构建通过；最新消费者目录、SHA-256、日志和每单状态以本地 `verification/ticket-audit-delivery.json` 为准。

| 场景 | 结果与观察 |
| --- | --- |
| 串行人工、原 key 表单、JSON 类型 | 通过；false/0/字符串/数组/对象/null 保留，下一节点办理人正确，历史 COMPLETED 且结束 worker 活动已完成 |
| 退回待重派、重派、任务表单读取 | 通过；任务保留、分配清空后重新指定，未绑定表单返回 none |
| 一次表决 + 原字段 + 下一节点参数 | 通过；会签 agree 与 fields、archive.assignee 在一次 complete 提交，后续变量及办理人一致 |
| 金额表达式和默认分支 | 通过；101 进入 large，0 进入 small，生成排他汇合节点的唯一出口为 default，历史终态核对 |
| ALL / ANY / VOTE / 顺序会签 | 通过；ALL 两票，ANY 一票；VOTE=.5 在两人中一票即达标；顺序初始只有一任务，剩余任务按引擎规则取消/继续 |
| 并行 fork/join | 通过；一分支完成后归档未创建，两分支完成后才创建归档 |
| 两层子流程、同名内部节点、消息、定时 | 通过；outer_inner_review 与 other_review 互不串参数；业务键关联消息后经 PT2S 定时到下一任务 |
| 超时 notify / return / end | 原脚本通过；notify 后任务仍在且提醒服务活动完成，尚无通知接收方证据；return 重入，end 顶层路径结束。未覆盖子流程/并行组合 |
| v2 发布后 v1 会签任务 | 通过；新版本替换节点后，v1 仍返回旧节点公共 vote 规则，以匹配历史快照办理并完成 |
| 布尔拒绝分支 | 未通过：后端 required-variables 宣告 review_approved，但 complete 另要求 review_passed，并要求未选中 accepted 的参数 |
| processInstanceId 消息定位 | 未通过：网关同时向 Camunda 提交 tenant-id 和单实例关联，返回 ENGINE-13028；businessKey 定位通过 |
| 服务 / 服务会签 | 未验收：未配置 worker 可访问的真实测试 serviceUrl。已提供 WORKFLOW_SMOKE_SERVICE_URL 配置入口，不手动完成 external task 冒充 worker 执行 |

初次完整报告含 17 个场景：13 个 passed、两个因后端差异 failed、两个因缺少服务配置 failed（未验收）。用户已确认暂时没有测试服务。该报告16个验证部署均已核对前缀、引擎定义、key和租户后清理。业务实例记录、模板历史依照后端删除语义可能保留；未直接清库、未触碰既有业务实例。恢复后新增报告单独见上节。

## 新契约适配前的差异诊断（历史）

普通人工任务没有结果分支时，后端不声明 approved，SDK 的 decision 返回 PARAMETER_MAPPING_UNAVAILABLE；此类填写任务应只提交 fields。当前单人结果分支规则声明 review_passed，仍与约定的 approved 和引擎 passed 只读边界冲突；SDK拒绝映射并保留任务资源，不生成或提交引擎汇总值，也不静默切换端点。

旧报告中的固定 assignee 必填差异已通过固定启动/后续办理人场景复验解除；不推断其他固定配置均可运行。按实例ID发送消息在编译恢复后仍复现ENGINE-13028，SDK不自动改用业务键重发。带候选用户/组的分配操作下游405与单timer发布命名空间错误也保留未通过。startable=false历史报告保存为true，当前按用户授权跳过复验，SDK保留已生效写入信息并明确报错。

## 本地及分发验证

SDK 公开入口测试覆盖确定性、不可变性、分支终结/并行结构、重复与保留 ID、字段适用性、multipart、参数冲突/阶段/只读、公共 vote、JSON、版本、分页、取消/超时、业务/协议错误与不确定写入。协议错误保留实际 HTTP 状态、操作阶段、任务/实例等资源上下文，成功写响应畸形时保留 confirmed，不自动重试。

| 验证 | 最终结果 |
| --- | --- |
| `pnpm test` | 212 项通过：SDK 28、设计器 88、表单及 request adapter 6、宿主 90 |
| `pnpm typecheck` / `pnpm build` | 通过；保留既有大 chunk 提示 |
| 实际 tgz 的 ESM 消费 | 仓库外临时项目离线安装、三入口、无导入网络、零运行依赖通过 |
| 实际 tgz 的类型与浏览器构建 | 根模型和 definition 在无 DOM 类型环境检查通过；client 类型及 Vite 浏览器构建通过 |

包由 `pnpm --dir packages/workflow-sdk pack --pack-destination ../../.scratch/workflow-function-sdk/artifacts` 生成，并以 `pnpm --filter @workflow/sdk verify:package -- ../../.scratch/workflow-function-sdk/artifacts/workflow-sdk-0.2.0.tgz` 验证。仅交付 ESM tgz，未发布 registry。

第一次全量 pnpm test 在并行构建期间有两项旧 form-js 组件测试触发默认 5 秒超时；独立重跑通过，随后按项目默认配置的完整回归也全部通过，未放宽默认超时或断言。未进行浏览器端人工交互验收；宿主迁移由类型、组件和构建验证覆盖。

## 复现

```powershell
# 在仓库根执行；先启动已配置开发代理的 pnpm dev。
pnpm --filter @workflow/sdk build
node packages/workflow-sdk/scripts/check-runtime.mjs
# 默认跑全部场景、写 JSON 报告并清理。--keep 可明确保留新建资源。
# 可选：WORKFLOW_SMOKE_BASE_URL、WORKFLOW_SMOKE_TENANT、WORKFLOW_SMOKE_SCENARIOS（逗号列表）
# 服务场景：WORKFLOW_SMOKE_SERVICE_URL 必须能由后端 worker 访问。
```

因为上述后端差异和服务条件，完整父工单仍为 in-progress。SDK 编码、离线/协议测试、实际包消费与部分真实引擎通过，不等于全部规格验收完成。
