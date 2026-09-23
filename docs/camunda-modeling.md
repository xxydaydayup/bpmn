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

因此：

```text
moddle 定义“字段和类型”
behaviors 维护“编辑时的联动规则”
```

当前右侧面板是自定义 Vue 面板，不依赖 `bpmn-js-properties-panel`。面板新增或修改 Camunda 字段时，应同时检查 moddle 描述、行为联动、XML 导出再导入，以及后端实际支持范围。
