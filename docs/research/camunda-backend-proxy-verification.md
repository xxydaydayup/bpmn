# 后端流程接口与 Camunda 代理验证

验证日期：2026-09-29。后端地址：`http://192.168.124.202:9000`。引擎版本：Camunda 7.20.0。认证使用 HTTP Basic Auth，凭据只通过进程环境变量传入，没有写入仓库或浏览器构建变量。

## 两类接口不是同一层

| 通道 | 当前用途 | 前端 Interface | 已确认范围 |
| --- | --- | --- | --- |
| `/api/v1` 业务接口 | 面向业务用户的稳定语义 | `BusinessWorkflowGateway` | 发布/查询任务模板、启动业务任务实例、查询和完成人工任务 |
| `/engine-rest` Camunda 代理 | 开发测试、管理和一致性观察 | `WorkflowGateway` | 保持 Camunda 官方 REST 语义；已验证读操作与关键写操作 |
| Camunda 官方 REST 直连 | 开发基准通道 | `WorkflowGateway` | 用来对照代理结果，生产普通用户不应访问 |

后端“可以透传 Camunda 官方 API”的说法对本次实测范围成立，但不应据此把业务接口理解为完整 Camunda API。业务接口仍然只有 Swagger 已发布的操作，未提供的业务能力不能由前端臆造。

## Swagger 中的业务操作

- `GET /api/v1/task/deployments`：查询任务模板。
- `POST /api/v1/task/deployments`：发布任务模板。
- `GET /api/v1/task/deployments/{key}`：读取指定模板。
- `POST /api/v1/task/instances/start`：启动业务任务实例。
- `GET /api/v1/tasks`：查询业务人工任务。
- `POST /api/v1/tasks/{id}/complete`：完成业务人工任务。

当前没有业务侧的模板删除、业务实例删除、领取、转办、委派、用户/组管理、表单定义、业务历史查询或审计查询接口。Camunda 代理即使能执行部分同名引擎操作，也不能替代这些业务语义和权限规则。

## 实测结果

只读对照中，使用后端 Basic Auth 身份查询部署、流程定义、实例、任务、历史、Job、Incident、External Task、XML、活动树和变量，与官方 REST 加 `tenantIdIn` 的结果一致。

脚本 `scripts/camunda-proxy-smoke.mjs` 进一步将所有写操作发往后端 `/engine-rest`，官方 REST 只做观察，验证通过：

1. 未认证请求返回 401/403，未知路径保持 404。
2. 代理和官方 REST 返回相同的 Camunda 版本。
3. 通过代理执行带租户的 multipart 部署，官方 REST 读取到相同部署和流程定义。
4. 通过代理挂起/恢复流程定义和流程实例，官方 REST 状态同步。
5. 通过代理启动实例，官方 REST 可读取相同实例、变量、活动树和人工任务。
6. 通过代理完成人工任务，代理和官方 REST 的历史实例、历史任务一致。
7. `finally` 中确认部署名称后，经代理级联删除本次 UUID 测试部署；部署计数恢复为 0。

本次验证部署 ID 为 `d366fd70-bbdb-11f1-ae30-c6afcf6df3d1`，流程实例 ID 为 `d39141c3-bbdb-11f1-ae30-c6afcf6df3d1`，均已随测试部署清理。

## 复查命令

```powershell
$env:CAMUNDA_DIRECT_BASE_URL = 'http://192.168.124.202:8085/engine-rest'
$env:CAMUNDA_PROXY_BASE_URL = 'http://192.168.124.202:9000/engine-rest'
$env:CAMUNDA_PROXY_AUTH = '<username>:<password>'
$env:CAMUNDA_TEST_TENANT = '<tenant-id>'
node scripts/camunda-proxy-smoke.mjs
```

脚本不读取 `VITE_` 凭据变量，不输出 Authorization 头，只清理自己创建且名称核对成功的唯一测试部署。

## 界面与环境边界

- 设计器保留“部署流程”作为官方 REST/代理的引擎验证，同时增加“发布任务模板”作为业务发布；两者结果分开显示。
- `/workflow-business` 提供模板浏览、业务实例启动、任务查询与完成。启动后，开发工具开启时可以用 Camunda 状态核对部署、定义、实例、任务、变量、活动和历史。
- `VITE_WORKFLOW_DEVTOOLS=false` 时隐藏并拦截引擎联调、流程验证和 Camunda 管理台路由；普通业务入口只使用业务 Interface。
- `VITE_CAMUNDA_ACCESS_MODE`、`VITE_CAMUNDA_TENANT` 只用于来源和租户提示。Basic Auth 必须放在 `API_PROXY_AUTH` / `CAMUNDA_PROXY_AUTH` 或生产服务器密钥配置中。

## 仍需后端补齐

- 明确每个业务接口的错误码、幂等键、业务键唯一性和前置约束语义。
- 提供业务测试数据清理或归档能力；当前自动脚本只能安全清理 Camunda 测试部署，不能删除后端业务记录。
- 补齐角色权限、变量白名单/脱敏、租户边界、平台审计和生产代理限流。
- 若要把更多 Camunda 管理能力开放给业务用户，应新增受控业务接口，而不是让浏览器直接调用通用 `/engine-rest`。
