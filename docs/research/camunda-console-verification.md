# Camunda 管理台 REST 验证

验证日期：2026-09-28。实测引擎：Camunda 7.20.0。真实接口页面为 `/camunda-console`；`/workflow-prototype` 保留为静态设计预览。

## 接口契约依据

- 对照 [Camunda 7.20.0 ProcessInstanceResource.java](https://github.com/camunda/camunda-bpm-platform/blob/7.20.0/engine-rest/engine-rest/src/main/java/org/camunda/bpm/engine/rest/sub/runtime/ProcessInstanceResource.java)：单实例 DELETE 只传 `skipCustomListeners`、`skipIoMappings`、`skipSubprocesses`、`failIfNotExists`。部署删除的 `cascade` 不复用到单实例删除。
- 对照 [Camunda 7.20.0 IncidentDto.java](https://github.com/camunda/camunda-bpm-platform/blob/7.20.0/engine-rest/engine-rest/src/main/java/org/camunda/bpm/engine/rest/dto/runtime/IncidentDto.java)：运行时 Incident 时间字段是 `incidentTimestamp`。
- 实测运行实例返回 `definitionId`；用户操作历史提供 `operationId` 和按对象类型区分的资源 ID。页面不依赖不存在的通用 `entityId`。
- 实例、任务及历史变量读取使用 `deserializeValues=false`；没有引入不存在的单个 External Task 变量查询端点。

## 只读验证

对开发引擎的定义、实例、任务、External Task、Incident、Job、历史变量和用户操作历史执行管理台使用的分页/排序请求，均返回 HTTP 200。历史实例、任务、活动、变量计数请求均返回 HTTP 200。定义按 `processDefinitionId` 精确筛选分别验证存在和不存在的 ID，结果为 1 和 0。

这些结果证明当前引擎接受已用请求参数；空列表不证明异常恢复或外部 Worker 行为已通过验收。

## 隔离生命周期验证

脚本：`scripts/camunda-console-smoke.mjs`。必须显式设置 `CAMUNDA_TEST_BASE_URL`（包含 `/engine-rest`），脚本生成 UUID 测试名称，部署两条最小流程（人工任务、一天后触发的定时器），并只清理名称与本次记录相符的测试部署。

```powershell
$env:CAMUNDA_TEST_BASE_URL = 'http://192.168.124.202:8085/engine-rest'
node scripts/camunda-console-smoke.mjs
```

实际结果全部通过：

1. 读取版本，部署测试 BPMN，查询定义、原始 XML 和部署资源。
2. 挂起/恢复定义，核对定义状态。
3. 启动实例，核对变量、活动树、人工任务及未结束历史记录。
4. 挂起/恢复实例，核对运行状态。
5. 查询测试定时器 Job，修改 retries 并读回验证。
6. 终止人工任务实例，核对运行实例消失及历史结束时间。
7. 在 `finally` 中级联删除本次测试部署，并验证部署计数为 0。

本次测试部署 ID：`a1787227-badd-11f1-ae30-c6afcf6df3d1`，清理成功。测试 BPMN 的 TTL 为 1 天，仅用于测试数据；管理台部署沿用缺省 30 天。未修改已有业务流程。

## 前端与构建验证

- `pnpm build`：通过，包含 TypeScript 检查与生产构建。
- `pnpm test`：49 项通过，其中新增 11 项覆盖查询取消与旧结果隔离、部分失败、版本失败清空连接状态、详情切换、分页/筛选/重置、External Task 筛选、未结束历史、卸载保护、活动节点映射和 Gateway 请求契约。
- 查询测试运行真实 Vue setup 与响应式逻辑，使用模拟 Gateway；不是浏览器端到端测试。
- BPMN 只读查看器读取部署 XML，保留其布局，并按活动树标记当前活动或异步等待节点；导入警告会显示，不回写部署 XML。

## 未覆盖项与接入边界

- 浏览器工具返回 `Codex auth token is unavailable`，本轮无法完成实际图形渲染、点击交互及桌面/窄屏视觉验收。构建和 HTTP 可访问不能代替这些检查。
- 当前 Incident、异常 Job、External Task 列表为空；未创建真实执行失败、未执行 External Worker。Job retries 在隔离定时器上验证，不代表失败 Incident 的恢复链路已验收。
- 当前手动刷新；不提供持续告警，也不提供历史执行路径高亮。
- 引擎操作日志受历史级别和认证上下文影响，不等同于完整平台审计。
- Go/BFF、登录权限、租户隔离、变量脱敏、幂等和业务审批语义未实现。开发代理仅供联调，生产环境不能把管理员凭据放入浏览器。
- `historyTimeToLive` 缺省补齐沿用前端逻辑；实际历史清理调度由引擎配置决定。
