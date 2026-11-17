# SDK 0.1.0 验证记录

日期：2026-11-16。环境：Windows，Node.js 24.19.0，pnpm 9.9.0。

## 本地验证

- `pnpm typecheck`：通过。SDK 编译仅启用 ES2022，无 DOM 类型。
- `pnpm test`：194 项通过，其中 SDK 公开接口 12 项、设计器 88 项、form-js 组件 4 项、宿主 Node 测试 90 项。
- `pnpm build`：通过；Vite 仍有大型 chunk 提示，不影响生成产物。
- `pnpm pack:sdk`：生成 `.scratch/workflow-model-sdk/artifacts/workflow-sdk-0.1.0.tgz`，包含 ESM、声明、标准 Schema、快照、14 个 JSON 模型与指南，不发布 registry。
- `verify:package`：在仓库外临时项目离线安装实际 tgz，通过公开函数、Schema JSON 子路径和类型入口消费；消费项目 lib 仅 ES2022、types 为空。10 个合法示例通过公开 WorkflowModel 类型检查。运行时没有 document，并将 fetch 替换为抛错函数，校验和导出正常。安装时禁用脚本，不依赖临时编译；包无运行时和 peer 依赖。

表单组件第一次全量检查中，form-js 的动态加载超过默认 expect.poll 等待时间；独立复核后将 test:forms 的等待上限调整为 15 秒，保留原断言和实际组件，全量通过。

设计器通过 SDK 复用协议校验，覆盖未来信封、未知数据保护、表单、片段、编辑历史、compile/deploy 回调、嵌套定位和不可编辑 parallel 的保留。未开展本轮真实浏览器手工验收，自动化组件边界使用现有 Vue Flow 测试宿主；不将其视为真实引擎证据。

## 真实后端编译

对 `http://192.168.124.202:8085/bpmn/json2xml` 执行显式 compile-only 检查，10 个合法示例全部返回 HTTP 200 和 BPMN XML：

| 示例 | XML 字符数 |
| --- | ---: |
| boolean-branches | 3856 |
| countersign | 3397 |
| nested | 15882 |
| parallel | 4267 |
| serial | 2858 |
| service-countersign | 3049 |
| service | 2354 |
| state-branches | 4008 |
| timeouts | 7688 |
| waits | 4331 |

编译服务直接返回 XML；对外网关返回 JSON 包装。本次使用的脚本能识别两种返回格式。

网关 `http://192.168.124.202:9000/api/v1/bpmn/json2xml` 未携带鉴权，返回 HTTP 401 / UNAUTHORIZED（缺少或错误的 Basic Auth 凭证）。SDK 不内置凭据。

## 未验证的执行范围

本轮未取得经确认的测试租户/鉴权配置，没有创建真实模板、启动实例、提交人工任务或执行清理。编译成功证明标准模型可转换为 XML，不证明网关发布、监听器、worker、消息、定时或 Camunda 任务流转已验收。后续由测试环境操作者按接入指南提供鉴权后进行可追踪的临时部署、最小任务流转和清理。
