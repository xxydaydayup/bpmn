# Job 重试与 Incident 演示

## 样本与依据

- BPMN 样本：[camunda-job-retry-demo.bpmn](./examples/camunda-job-retry-demo.bpmn)，SHA-256：`8350d6c1ee70484b2ca6f2dede90e006b3b63e08c7cb0e91e4f84972d6ba9637`。
- 目标引擎：Camunda Platform 7.20.0；实测日期：2026-09-29。
- 官方依据：[Job Executor 的活动重试配置](https://docs.camunda.org/manual/7.20/user-guide/process-engine/the-job-executor/#use-a-custom-job-retry-configuration-for-activities)。该示例同样使用 `camunda:asyncBefore` 和扩展元素 `camunda:failedJobRetryTimeCycle`。

流程是“开始 → 故意失败的异步服务任务 → 结束”。服务任务引用一个不存在的 Java 类，执行时一定报错；`R3/PT30S` 让引擎按约 30 秒间隔重试。异步边界使启动实例能先成功提交，随后由 Job Executor 执行任务。仅用于开发引擎。

## 自动验证

```powershell
$env:CAMUNDA_TEST_BASE_URL = 'http://192.168.124.202:8085/engine-rest'
node scripts/camunda-job-retry-demo.mjs
```

脚本解析 BPMN 并重新导出导入，检查 Camunda 属性、连线和 DI；随后为本次运行生成唯一流程 key，部署、启动并轮询 Job 和 Incident。它核对 Job ID 不变、剩余次数依次为 2、1、0，以及次数耗尽后出现 Incident。脚本只级联删除自己创建且名称核对一致的测试部署，并确认删除结果。引擎必须启用 Job Executor；运行期间不要中断脚本，否则自动清理可能无法执行。

## 实测结果

| Job ID | 剩余 retries | Incident 数 |
| --- | ---: | ---: |
| `a21ed185-bbb1-11f1-ae30-c6afcf6df3d1` | 2 | 0 |
| 同上 | 1 | 0 |
| 同上 | 0 | 1 |

本次测试部署 `a217576f-bbb1-11f1-ae30-c6afcf6df3d1` 已级联清理，部署计数核对为 0。`pnpm test` 49 项通过，`pnpm build` 通过。验证范围包括 BPMN XML 往返与真实引擎执行；未在浏览器中逐次截图验证管理台卡片。

也可在 `/camunda-console` 上传样本文件部署，再到 `/camunda` 启动该流程，回到管理台的“Job / Incident”页按间隔刷新，记录同一 Job ID 的 retries。手动部署会留下测试流程和故障实例，结束后需按部署 ID 清理；上面的脚本不清理手动创建的部署。
