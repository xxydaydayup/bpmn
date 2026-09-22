# OpenCodeReview CLI 使用与双供应商审查

调研日期：2026-09-21  
上游仓库：<https://github.com/alibaba/open-code-review>  
核对提交：`cf64e7080f600d507888a26785ad6a8b7a13ab6a`（2026-09-20）

## 官方能力

- `ocr review` 读取 Git diff；默认工作区模式审查 staged、unstaged 和 untracked 变更，也支持 `--from/--to` 区间和 `--commit`。
- `ocr scan` 不依赖 diff，读取工作树中的完整文件；可用 `--path` 指定目录或文件。
- 配置文件是 `~/.opencodereview/config.json`。命名 provider 保存在 `providers` 或 `custom_providers` 中，顶层 `provider`/`model` 只是当前默认选择。
- `review` 和 `scan` 都支持 `--provider <name>`、`--model <name>`，仅覆盖当前调用，不修改保存的默认配置。
- `--format json --output <file>` 可保存机器可读结果；JSON 中包含实际解析的 provider/model、summary、comments 和 session_id。
- `ocr delegate preview` 与 `ocr delegate rule` 只负责文件筛选和规则解析，由宿主编码 Agent 执行实际审查；它不调用 OCR 配置的 LLM。

## 双供应商结论

可以对同一项目分别扫描。当前 CLI 的一次运行只解析一个 provider，因此应使用两个独立运行，并为每次运行显式传 `--provider`，为结果使用不同的 `--output` 文件。为保证输入完全一致，区间/提交审查应使用固定的 commit SHA 或固定的 `--from/--to`，全量扫描应确保两次运行期间工作树不变。

官方 CLI 参考没有提供“多 provider 一次运行、自动合并结果”命令；结果合并、去重和仲裁需要由脚本、人工或第三个 Agent 完成。

## 对抗性审查建议

仓库没有名为 adversarial/red-team/debate 的独立 CLI 模式。内置的 reflection/review-filter 是单次审查内部的评论定位和事实过滤，不等于两个供应商之间的相互质询。

可组合出以下流程：

1. Provider A 对固定 diff/文件做独立审查，保存 JSON。
2. Provider B 对同一固定输入独立审查，或将 A 的 JSON 作为“不可信候选发现”注入 `--background-file`，要求逐条证伪并寻找遗漏。
3. 使用脚本按 `path + 行号 + 规范化内容` 去重，保留两方都确认的发现；对只有一方提出的发现交给人工或第三个模型仲裁。

`--background-file` 目前属于 `ocr review`；`ocr scan` 只有 `--background` 字符串参数，可通过包装脚本读取 Markdown 后传入，或用项目级 `rule.json` 固化对抗性检查清单。

## 一手来源

- 中文 README：<https://github.com/alibaba/open-code-review/blob/main/docs/i18n/README.zh-CN.md>
- 配置文档：<https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/zh/configuration.md>
- CLI 参考：<https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/zh/cli-reference.md>
- 评审规则：<https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/zh/review-rules.md>
- 委托模式：<https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/zh/integrations/delegate.md>
- provider 运行时覆盖：`cmd/opencodereview/shared_flags.go`、`review_cmd.go`、`scan_cmd.go`
- 评论事实过滤提示词：`internal/config/template/prompts/review_filter_task_system.md`、`review_filter_task_user.md`
