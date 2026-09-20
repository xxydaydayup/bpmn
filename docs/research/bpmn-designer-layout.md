# 业务卡片与 BPMN 自动布局

调研日期：2026-09-20。用途：确定设计器扩大任务卡片后，哪些布局能力可以复用。

本记录来自官方文档、版本化源码与 npm 元数据核查；未安装或运行 `bpmn-auto-layout`，没有验证它与当前项目的实际整合。

## 结论

`bpmn-auto-layout` 可以作为布局方案的参考或组成部分，但不能直接通过公开参数设置本项目的任务卡片尺寸、节点间距。它的公共入口处理 XML，不能把它返回的完整 XML 直接视作无损的业务模型替代品。

本次实现最终采用 `elkjs@0.12.0`，允许传入自定义卡片尺寸，并直接返回几何图。布局数据按稳定元素 ID 应用到原设计模型，保留名称、类型、逻辑连接、条件及业务扩展；布局变化只涉及 DI 几何。没有安装 `bpmn-auto-layout`。

## 本项目实测补充

2026-09-20：真实 ELK 与 bpmn-moddle 测试覆盖默认流程、六个模板和服务任务。已检查统一尺寸、节点不重叠、正交连线、含回路时开始节点位于左侧、业务 XML 保留及一次整体撤销/重做。实现和复现命令见 `tests/bpmn-layout.test.mjs`（`pnpm test`）。Worker 通过 Vite 输出独立静态文件，实际浏览器中也验证了导入自动整理。

浏览器实测还验证了手动移动后的已适配 XML 回导保持几何，泳道文件保留原几何并禁用整理，显式颜色与一个未知扩展样本保留。此结果只说明这些前端读写样本通过，不证明第三方引擎执行兼容。更多维护说明见 [设计器样式说明](../designer-styling.md)。

## 已核实的版本事实

查询时 [npm 元数据](https://registry.npmjs.org/bpmn-auto-layout) 的 `latest` 为 `1.3.0`，`next` 为 `2.0.0-alpha.2`。不能将 GitHub main 的能力与稳定发布版混用。

| 版本 | 参考提交 | 公开调用与结果 |
| --- | --- | --- |
| `1.3.0` | `50b69fe91732a64916fd09a90d24f749430d5858` | `await layoutProcess(xml)` 返回 XML 字符串 |
| `2.0.0-alpha.2` | `75a7f30958c7050474d48db09afd4cc7d352ccad` | 返回 `{ xml, warnings }`；部分无效或不支持的输入抛出 `LayoutError` |
| 查询时 main | `9eaa3b13532691b36f75d23806a84ccf53a91979` | 已采用不同的 TypeScript 模块结构；不作为发布版接入依据 |

入口依据：[稳定版源码](https://github.com/bpmn-io/bpmn-auto-layout/blob/v1.3.0/lib/index.js)、[alpha.2 文档](https://github.com/bpmn-io/bpmn-auto-layout/blob/v2.0.0-alpha.2/README.md)。

## 卡片尺寸

两版公开函数均只接收 XML，没有任务尺寸或布局间距参数。

- 稳定版任务尺寸固定为 `100×80`，网格单元为 `150×140`，见 [DiUtil.js](https://github.com/bpmn-io/bpmn-auto-layout/blob/v1.3.0/lib/di/DiUtil.js) 与 [layoutUtil.js](https://github.com/bpmn-io/bpmn-auto-layout/blob/v1.3.0/lib/utils/layoutUtil.js)。
- alpha.2 默认任务尺寸仍为 `100×80`，布局文档列出水平间隔 `100px`、垂直间隔 `80px`，属于内部常量，见 [尺寸源码](https://github.com/bpmn-io/bpmn-auto-layout/blob/v2.0.0-alpha.2/lib/di/DiUtil.js) 与 [布局契约](https://github.com/bpmn-io/bpmn-auto-layout/blob/v2.0.0-alpha.2/docs/LAYOUT.md)。
- alpha.2 会重建坐标、尺寸、连线路径和标签位置；从旧 DI 读取子流程展开状态，不意味着沿用输入的任务尺寸。

因此不能承诺“先把输入 XML 的任务扩大，再调用此库，就会按大卡片正确重排”。直接放大最终图也需要处理事件与网关尺寸、附着关系、连接边界和标签，不能只缩放几个坐标。

## 复杂 BPMN 的支持范围

稳定版 [README](https://github.com/bpmn-io/bpmn-auto-layout/blob/v1.3.0/README.md#limitations) 明确：协作图只布局第一个 participant 引用的 process；不布局分组、文本注释、关联和消息流。

稳定版有 [边界事件实现](https://github.com/bpmn-io/bpmn-auto-layout/blob/v1.3.0/lib/handler/attachersHandler.js)。子流程方面，README 写折叠布局，但 [Layouter.js](https://github.com/bpmn-io/bpmn-auto-layout/blob/v1.3.0/lib/Layouter.js) 包含展开状态、递归和展开网格逻辑；在未实测前不能据此承诺展开子流程效果。核查资料没有提供可直接引用的稳定版完整泳道支持契约。

alpha.2 的 [布局契约](https://github.com/bpmn-io/bpmn-auto-layout/blob/v2.0.0-alpha.2/docs/LAYOUT.md) 声明支持水平及嵌套泳道、展开和折叠子流程、事件子流程、边界事件、多参与者、黑盒池和消息流，同时约束泳道成员归属、宿主关系和跨作用域连接。不支持的视觉元素或无法正确路由的情况可能报错。它仍是预发布版，官方声明不代表这些场景已在本项目验证。

## 业务扩展保留

alpha.2 的 [Layouter 构造器](https://github.com/bpmn-io/bpmn-auto-layout/blob/v2.0.0-alpha.2/lib/Layouter.js) 内部创建 `new BpmnModdle()`；公开调用没有注入本项目 `wf` descriptor 的参数。因此没有足够依据保证将返回 XML 整体替换原文能保留所有扩展语义。

候选集成方式是读取布局结果中的 DI，按元素 ID 写回原设计模型。这个方式需要验证完整的节点、连线及标签映射，而且仍须解决自定义尺寸问题。它保留的是业务模型语义，不承诺重新序列化的 XML 在字节层面完全一致。

## 产品决策与后续验证

用户已决定统一扩大任务卡片并调整布局和连线。具体支持范围、复杂文件处理方式和再次导入行为，记录在本地 [样式改造规格](../../.scratch/designer-styling/spec.md)。该规格按仓库约定仅保存在本机，不随 Git 分发。

接入前至少验证：现有默认流程与六个模板；新增服务任务；分支汇合与回退连线；长中文标签；业务字段与未知扩展的导入警告及往返差异；布局失败恢复。针对明确支持的范围验证几何结果，不能以“生成了 XML”代替布局或业务语义验收。
