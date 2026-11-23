# 流程只读预览接入

工作台与嵌入页共用业务流程预览。嵌入入口不显示工作台导航，只显示流程结构、版本和可用活动状态，不读取或显示流程变量及业务表单。预览不编辑、编译、发布、启动或办理流程。

## 地址契约

一次只传入一种目标，值使用 `URLSearchParams` 编码：

```text
/workflow/workflow-preview?templateKey=leave
/workflow/workflow-preview?processInstanceId=instance-id
```

`/workflow/` 为示例部署前缀。根路径部署时地址是 `/workflow-preview`。两个参数同时出现、同名参数重复、空值或出现其他参数时，页面显示地址错误且不请求目标数据。切换目标时更新 iframe 的 `src` 即可，刷新保留当前目标，不依赖 postMessage。

模板使用同一次模板详情响应中的 `displayJson`、XML 和元信息。实例依据实际 `processDefinitionId` 解析精确的历史模板版本；无法取得该版业务图时，只允许查看相同定义 ID 的 XML 备用图。模板 key 与实例 ID 仅用于定位，不是访问凭据。

URL 只接受上述定位参数，不接受 token、账号、密码、任意 API 地址、来源授权或完整模型。嵌入来源由响应头配置决定。示例 [index.html](../examples/workflow-preview/index.html) 提供模板/实例切换表单，可放到业务系统同源页面运行。

## 构建与子路径

在部署环境设置以下公开构建变量，再执行 `pnpm build`：

```dotenv
VITE_APP_BASE_PATH=/workflow/
VITE_API_BASE_URL=/workflow/api
```

`VITE_APP_BASE_PATH` 必须是以 `/` 开头的同源绝对子路径，构建会统一补齐末尾 `/`。Vue Router、脚本、样式和懒加载资源均使用该前缀。`VITE_API_BASE_URL` 为独立配置；默认 `/api`，不会根据静态前缀自动推断。嵌入页拒绝跨源 API 配置。同源浏览器请求自动带上适用的会话 Cookie，不在前端注入服务账号。

本地使用这两个变量执行 `pnpm dev` 时，Vite 将 `/workflow/api/v1/...` 转发为后端 `/api/v1/...`，将 `/workflow/api/camunda/...` 转发为 `/engine-rest/...`。后者仅适用于开发；生产应将这两类只读请求都交给受控业务网关。开发用 `API_PROXY_AUTH` / `CAMUNDA_PROXY_AUTH` 不构成当前用户授权验收，也不应复制为生产共享管理员认证。

## 同源代理与授权

推荐由业务系统域名提供静态资源、HTML 路由回退和受控数据接口。示例 [nginx.conf](../examples/workflow-preview/nginx.conf) 将 `/workflow/api/` 交给已经实现当前用户/租户授权的业务网关，传递原请求 Cookie 与 Authorization。它不把浏览器请求直接转发到带管理员身份的引擎。

网关需要满足以下只读查询契约，并对每一跳保留真实访问者授权：

| 浏览器请求（位于 API 前缀下） | 用途 | 授权边界 |
| --- | --- | --- |
| `GET /v1/template/{key}` | 模板详情的同一快照 | 当前用户可见模板及租户 |
| `GET /v1/template` | 可见模板索引及分页 | 仅返回可见租户与模板 |
| `GET /v1/template/{key}/history` | 按 `processDefinitionId` 匹配历史版本 | 同模板历史读取权限 |
| `GET /v1/template/{key}/history/{version}` | 精确版本的业务图快照 | 当前用户可见版本 |
| `GET /camunda/process-instance/{id}` | 运行实例身份及定义版本 | 当前用户可见实例 |
| `GET /camunda/history/process-instance/{id}` | 历史实例及状态 | 当前用户可见历史实例 |
| `GET /camunda/process-instance/{id}/activity-instances` | 当前活动树 | 同实例授权 |
| `GET /camunda/history/activity-instance?processInstanceId={id}` | 接口明确记录的历史活动 | 同实例授权及查询过滤 |
| `GET /camunda/process-definition/{id}` | 精确流程定义的名称、key 和版本 | 按当前实例/模板权限授权该定义 |
| `GET /camunda/process-definition/{id}/xml` | 相同定义 ID 的备用 XML | 按当前实例/模板权限授权该定义 |

不要仅因请求含模板 key、实例 ID、流程定义 ID 或租户参数就放行；租户必须来自可信用户身份，不能由浏览器选择任意租户。无会话返回 401、无权返回 403、记录不可见或不存在按系统策略返回 404。网关须防止绕过受控前缀直接访问管理员引擎接口，并可只开放上述必要的只读路径。

上表是当前前端使用的接口契约。未来可用一个后端聚合接口替代实例预览的多请求版本查找和状态组装，但它尚未实现，不能作为当前部署依赖；建议方案见[后端聚合接口优化建议](workflow-preview-backend-optimization.md)。

## 嵌入来源

生产静态 HTML 响应应配置 `Content-Security-Policy: frame-ancestors 'self'`，同源示例同时配置 `X-Frame-Options: SAMEORIGIN`。`frame-ancestors` 必须作为 HTTP 响应头发送，写入 HTML meta 不生效。若将来显式允许其他来源，由部署方维护精确的 HTTPS 来源白名单，并协调 X-Frame-Options；当前实现不提供跨域身份桥接。URL 参数、Referer 或前端判断都不能授予数据权限。

示例 nginx 配置需要部署方替换域名、证书、静态目录与业务网关地址。网关若使用登录 Cookie，应确保 Path 覆盖 `/workflow/api/`，使用 HTTPS、HttpOnly 及合适的 SameSite 策略。示例将 API 响应设为 `Cache-Control: no-store`，避免用户/租户切换后缓存敏感快照；最终缓存策略由部署方保持同样的身份隔离。

## 验证范围

仓库自动测试可验证嵌入页互斥参数、实际业务图、加载/错误/重试、迟到响应隔离和实例组件复用。子路径构建可验证资源前缀，浏览器可验证桌面与窄屏图形及导航隔离。

本仓库没有生产网关、登录服务、租户系统和 TLS 部署。以下项目须在业务系统部署环境验收，示例配置或模拟 API 通过不能作为完成证据：

- 已登录与未登录用户的会话透传，401/403/404 状态行为。
- 两个不同用户、不同租户对模板、实例、历史和 XML 的访问隔离，包含直接请求 API。
- 同源父页面正常嵌入，未授权站点被实际 CSP 响应头阻止。
- 子路径首次打开、刷新及切换目标时，静态资源和数据路径均命中正确代理。
- 精确历史模板与实例定义 ID 的真实接口关联，以及活动接口实际提供的字段和分页范围。
