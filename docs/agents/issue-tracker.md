# Issue tracker: Local Markdown

本仓库的方案和工单保存在 `.scratch/`，按功能建立目录。

- 方案：`.scratch/<feature-slug>/spec.md`。
- 工单：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`；从 01 开始按依赖顺序编号，每单一个文件。
- `Blocked by` 列出阻塞工单编号和标题；无依赖写 `None (can start immediately)`。
- `Status` 表示分流标签，名称见 [triage-labels.md](triage-labels.md)。
- 实施进度用 `Progress: pending | in-progress | completed` 单独记录；验收项和验证结果随实施更新。
- 只有阻塞工单已完成的工单可以进入实施；子任务并行时可提前协作，整体按依赖验收。
- 讨论和实施记录追加到工单末尾的 `## Comments`。

技能要求“发布工单”时创建本地文件；要求“读取工单”时读取对应文件及 Comments。
