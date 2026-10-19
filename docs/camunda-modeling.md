# Camunda 7 建模依赖说明

本文说明设计器中 `camunda-bpmn-moddle` 和 `camunda-bpmn-js-behaviors` 的职责边界。它们只负责前端模型编辑和 BPMN XML 往返，不负责调用 Camunda REST、执行流程或解析 UEL/JUEL。

## 两个依赖的分工

| 依赖 | 作用 |
| --- | --- |
| `camunda-bpmn-moddle` | 定义 Camunda 命名空间、属性和扩展元素，让 bpmn-js 能按类型读写 Camunda XML。 |
| `camunda-bpmn-js-behaviors` | 监听 bpmn-js 建模命令，维护 Camunda 属性之间的联动、清理和复制粘贴约束。 |

项目在 `src/composables/useBpmnDesigner.ts` 中同时注册两者：

```ts
import camundaModdleDescriptor from 'camunda-bpmn-moddle/resources/camunda.json'
import camundaPlatformBehaviors from 'camunda-bpmn-js-behaviors/lib/camunda-platform'

const modeler = new Modeler({
  moddleExtensions: { camunda: camundaModdleDescriptor },
  additionalModules: [ camundaPlatformBehaviors ]
})
```

`camunda-bpmn-moddle` 让下面的字段成为可识别的模型属性：

```xml
<bpmn:userTask
  id="Task_1"
  camunda:assignee="requester"
  camunda:formKey="requirement-submit" />
```

代码可以通过 `businessObject.get()` 读取这些字段；项目编辑一律使用 `modeling.updateProperties()` 或其他建模命令，才能保留撤销和 behaviors 联动。直接 `set()` 只适合演示底层 moddle 能力，会绕过这些机制。导出时仍会生成 `camunda:` XML 属性。项目初始流程见 `src/bpmn/requirement-process.bpmn`。

## 为什么需要同时注册

### 只有 moddle：能读写字段，但不会维护联动

假设导入的人工任务已有 Camunda 表单引用：

```xml
<bpmn:userTask
  id="Task_1"
  camunda:formRef="approvalForm"
  camunda:formRefBinding="latest" />
```

只注册 moddle 后执行：

```ts
modeling.updateProperties(task, {
  'camunda:formKey': 'approval-form'
})
```

模型可能同时保留 `formRef` 和 `formKey`。moddle 只知道这些字段存在，不会判断两种表单配置互斥。

注册 behaviors 后，`UserTaskFormsBehavior` 会在同一条建模命令中清理 `formRef`、`formRefBinding` 和 `formRefVersion`，留下单一的 `formKey` 配置。

### 只有 behaviors：缺少 Camunda 类型，类型相关行为无法工作

以外部服务任务为例：任务从 `camunda:type="external"` 改为配置 `camunda:class="..."` 后，Camunda behaviors 应清理只适用于外部任务的错误事件扩展。

`DeleteErrorEventDefinitionBehavior` 需要识别 `camunda:ExternalCapable` 和 `camunda:ErrorEventDefinition`。没有 `camunda-bpmn-moddle` 时，bpmn-js 不知道这些 Camunda 类型，行为中的类型判断无法可靠命中；其他依赖类型判断的异步、输入输出和复制粘贴规则也一样。

导入文件时，moddle 可识别的 Camunda 配置即使暂未提供专用编辑控件，也会留在模型中。属性面板会列出当前元素尚未覆盖的 Camunda 属性、扩展元素和其他命名空间属性，并提供完整 XML 编辑入口。修改面板已支持的字段时应使用局部 modeling.updateProperties() patch；不得重建 extensionElements 或循环特征来保存单个字段，否则会删除其他监听器、未知扩展、完成条件或多实例数据项。

当前属性面板支持人工任务和开始事件的 Camunda formKey、formRef/formRefBinding/formRefVersion 互斥/依赖切换，以及嵌入式 FormData 的表单字段、枚举选项、约束和 Camunda 字段扩展属性增删编辑。表单控件只编辑这些明确列出的属性；字段或嵌套对象上其他 Camunda/厂商扩展仍留在 XML 中，局部命令更新不会重建它们。前端检查表单字段 ID 唯一性、枚举选项 ID 唯一性与非空，以及表单引用绑定依赖；不解释表单运行时、约束配置或表达式。

Camunda 原始 moddle 描述未声明表单字段的通配子元素属性，moddle-xml 因此不会序列化直接挂在已知 camunda:FormField 上的 $children。设计器使用的 Camunda 描述副本为 FormField 增加 otherElements: Element[] 通配收纳口；字段内未知命名空间元素经此属性导入、局部编辑、导出和重新导入后保留。

因此：

```text
moddle 定义“字段和类型”
behaviors 维护“编辑时的联动规则”
```

当前右侧面板是自定义 Vue 面板，不依赖 `bpmn-js-properties-panel`。面板新增或修改 Camunda 字段时，应同时检查 moddle 描述、行为联动、XML 导出再导入，以及后端实际支持范围。
