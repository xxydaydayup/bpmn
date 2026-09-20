# Issue tracker: Local Markdown

本仓库的需求规格和工单保存在 `.scratch/`。以下路径均相对于仓库根目录；该目录已被 Git 忽略，内容默认仅保存在本机。

## 文件约定

- 每项功能使用独立目录：`.scratch/<feature-slug>/`。
- 需求规格：`.scratch/<feature-slug>/spec.md`。
- 实施工单：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`。每张工单一个文件，同一功能内从 `01` 顺序编号。
- 常规工单在文件顶部用 `Status:` 记录分诊状态，具体值见 [状态映射](./triage-labels.md)。分诊后的工单用 `Category: bug` 或 `Category: enhancement` 记录类别。
- 评论和讨论按时间追加到文件底部的 `## Comments`，保留已有记录。

## 技能操作映射

- “发布到事项跟踪系统”：在对应功能目录创建需求规格或独立工单文件。
- “获取相关工单”：读取用户提供的路径；只有编号时，在当前功能的 `issues/` 中定位。同号工单属于多个功能且上下文无法区分时，确认所属功能。
- “添加评论”：追加到工单的 `## Comments`。
- “修改分诊标签”：更新工单的 `Status:`；类别更新到 `Category:`。

## Wayfinding 操作

`/wayfinder` 使用探索地图和子工单：

- 地图：`.scratch/<effort>/map.md`，包含 Notes、Decisions-so-far 和 Fog。
- 子工单：`.scratch/<effort>/issues/<NN>-<slug>.md`，正文记录待回答的问题；`Type:` 为 `research`、`prototype`、`grilling` 或 `task`。
- 探索工单的 `Status:` 表示执行状态：`open`、`claimed` 或 `resolved`。它与常规工单的分诊状态分开；探索工单需要分诊时，用 `Triage-Status:` 保存五个分诊状态之一。
- 依赖：在文件顶部用 `Blocked by: NN, NN` 引用同一 effort 内的工单。列出的工单全部为 `resolved` 时解除阻塞。
- 下一项工作：按编号选择状态为 `open` 且无未解决依赖的工单。
- 认领：开始工作前将 `Status:` 改为 `claimed` 并保存。
- 完成：在 `## Answer` 下追加答案，将 `Status:` 改为 `resolved`，并在地图的 Decisions-so-far 中追加结论摘要与工单链接。
