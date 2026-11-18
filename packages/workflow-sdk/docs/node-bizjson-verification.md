# 节点 bizJson 验证记录

日期：2026-11-18（Asia/Shanghai）。本次范围为前端编辑、模型保存、SDK 契约、请求适配与后端 XML 编译。没有发布模板、部署、启动实例或修改变量。

模型基线采用正式 /bpmn/spec 与 /bpmn/json-schema 的 2026-11-18 原件。来源、抓取时间和 SHA-256 见 [来源清单](../contract/backend-model-2026-11-18.provenance.json)，活动摘要见 workflowSdkCompatibility；2026-11-16 旧快照仍保留。SDK 0.2.0、模型 v1 和设计稿信封 v1 均保持原版本。

本地公共测试覆盖十种 SDK 节点与九种画布内置节点、可选值、显式空字符串、纯空白、多行中文及特殊字符、非法类型和未知字段保护；覆盖函数构造、设计稿/画布往返、v-model、清空与历史、只读及宿主自定义编辑器优先级。片段测试通过公开导出及已有数据源完成内部编辑、引用快照、库变更隔离、取消/确认刷新、撤销重做和编译回调；两层嵌套与 ID 复制保持原文。宿主适配测试核对编译请求体和 multipart display-json，发布请求使用替身。

最终 pnpm test 全部通过：SDK 47 项、设计器 97 项、宿主/表单 7 项、根 Node 测试 90 项，共 241 项。pnpm build 通过，包含 SDK、设计器、宿主类型检查和 Vite 产物；Vite 提示现有较大 chunk。SDK Schema 已生成并经 designer sync:schema 同步，两份一致性检查通过。

agent-browser 使用独立 node-bizjson session 在 /workflow-designer 验证多行中文、引号、XML 特殊字符与首尾空格的编辑、清空后撤销重做、自动布局及业务 JSON 导出；在 /sub-processes?editor=1&new=1 验证片段多行编辑、清空撤销重做、bizType 隐藏和垂直调整。通过页面内临时挂载同一公开组件，确认 readonly 下 bizJson disabled=true 且原值可读，随后卸载。片段截图保存于本地 .scratch/node-bizjson/validation/fragment-browser.png；没有向共享片段库写入数据。

后端核对脚本在仓库根目录显式运行：

    $env:WORKFLOW_COMPILER_URL = 'http://192.168.124.202:8085/bpmn/json2xml'
    node scripts/check-node-bizjson.mjs
    node scripts/check-node-bizjson.mjs --nested
    node scripts/check-node-bizjson.mjs --padded

脚本使用 SDK 校验后提交请求，以 XML namespace 和 BPMN 层级定位 camunda:property(name=bizJson)，比较 XML 解析后的属性值；结果及请求/XML 保存到本地 .scratch/node-bizjson/validation/。第三条为首尾空白的严格回归检查，当前后端会失败。

| 正式编译场景 | HTTP | XML 结构与逐值核对 |
| --- | --- | --- |
| 普通审批节点 | 200 | review 保留中文、换行、引号、XML 特殊字符和非 JSON 文本 |
| 两层嵌套 | 200 | outer、outer_inner、outer_inner_review 各自属性正确；SDK 输入保留局部 ID |
| 普通节点首尾空白 | 200 | **未通过**：后端去掉字符串首尾空格；前端与 SDK 请求保留原值 |

例如请求值为「两个空格 + 中文内容 + 两个空格」时，响应 XML 的 value 只含中文内容。无首尾空格的同一多行内容完全一致，因此首尾空白差异发生在编译服务边界。本仓库不通过加引号或二次编码规避，避免改变业务值。该后端缺口修复前，不能声称 XML 对所有字符串无损。

后端声明实例变量 {activityId}_bizJson 优先于模板默认值，删除实例变量后回退；嵌套变量名应使用编译后 activityId，例如 outer_inner_review_bizJson。本次未对运行时覆盖、回退、NATS 事件或任务详情进行执行验收。
