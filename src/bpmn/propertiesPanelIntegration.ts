import type { Element } from 'bpmn-js/lib/model/Types'

type PropertyGroup = { id?: string; label?: string; [key: string]: unknown }
type PropertiesPanel = {
  registerProvider(priority: number, provider: {
    getGroups(element: Element): (groups: PropertyGroup[]) => PropertyGroup[]
  }): void
}
type TemplateService = { get(element: Element): unknown; getAll?(element: Element): unknown[] }

const ENGLISH_TRANSLATIONS: Record<string, string> = {
  General: '基本信息', Documentation: '说明', Forms: '表单', 'Form fields': '表单字段',
  Assignee: '办理人', 'Candidate users': '候选用户', 'Candidate groups': '候选组',
  'Assignment type': '分配方式', 'User task': '人工任务',
  'Form key': '表单标识', 'Form reference': '表单引用', 'Camunda Form': 'Camunda 表单',
  'Camunda Forms': 'Camunda Forms', 'Custom form key': '自定义表单标识',
  'Execution listeners': '执行监听器', 'Task listeners': '任务监听器', Implementation: '实现',
  'User assignment': '任务分配', 'Asynchronous continuations': '异步执行', 'Job execution': '作业执行',
  'Task definition': '任务定义', 'Input / output': '输入 / 输出映射', 'Input parameters': '输入参数',
  'Candidate starter groups': '候选发起组', 'Candidate starter users': '候选发起用户',
  'Start initiator': '流程发起人', 'Job priority': '作业优先级',
  'Process variables': '流程变量', 'History cleanup': '历史清理',
  'Output parameters': '输出参数', 'Header properties': '请求头属性', Error: '错误', Errors: '错误',
  Compensation: '补偿', Link: '链接', Message: '消息', Signal: '信号', Escalation: '升级', Timer: '定时器',
  Properties: '扩展属性', Variables: '流程变量',
  Template: '业务模板', 'Change template': '更换业务模板', 'Remove template': '移除业务模板',
  'Unlink template': '解除业务模板关联', 'No template': '未选择模板', Process: '流程', Id: '标识',
  Name: '名称', Executable: '可执行', 'Version tag': '版本标签', Condition: '条件', 'Default flow': '默认连线',
  'Called element': '被调用流程',
  'Create new ...': '新建…', 'External form reference': '外部表单引用',
  'Form ID': '表单标识', 'Decision ID': '决策表标识', 'Decision reference': '决策表引用',
  'Execution listeners documentation': '执行监听器说明', 'Error event documentation': '错误事件说明',
  'Is interrupting': '是否中断', 'Sequence flow': '顺序流', 'Asynchronous before': '异步前',
  'Asynchronous after': '异步后', Exclusive: '排他执行', Topic: 'Topic', 'Custom properties': '业务配置',
  'Choose element template': '选择业务模板', Search: '搜索模板',
}

function translate(value: string): string {
  return ENGLISH_TRANSLATIONS[value]
    ?? value.replace(/^(.*?): (.+)$/, (_match, _type: string, label: string) => ENGLISH_TRANSLATIONS[label] ?? label)
}

function hasBusinessTemplate(element: Element, templates: TemplateService): boolean {
  const businessObject = element.businessObject
  return Boolean(businessObject?.get?.('camunda:modelerTemplate') || templates.get(element))
}

/**
 * The official template provider runs at priority 300. Filter its final groups
 * afterwards so business fields stay visible and technical fields are advanced.
 */
export function registerBusinessTemplatePanelProvider(
  panel: PropertiesPanel,
  templates: TemplateService,
  state: { isAdvanced: () => boolean },
) {
  panel.registerProvider(1500, {
    getGroups(element) {
      return (groups) => {
        const hasAppliedTemplate = hasBusinessTemplate(element, templates)
        const availableTemplates = templates.getAll?.(element) ?? []
        if (!hasAppliedTemplate && availableTemplates.length === 0) return groups
        const translatedGroups = groups.map((group) => {
          if (group.id === 'ElementTemplates__Template') group.label = '业务模板'
          else if (group.id === 'ElementTemplates__CustomProperties') group.label = '业务配置'
          else if (group.label) group.label = translate(group.label)
          const hasBusinessFields = group.id?.startsWith('ElementTemplates__CustomProperties')
            || group.id === 'ElementTemplates__Input'
          if (hasBusinessFields) group.label = group.id?.includes('CustomProperties') ? '业务配置' : '业务参数'
          return group
        })
        if (hasAppliedTemplate) {
          return state.isAdvanced()
          ? translatedGroups
          : translatedGroups.filter(group => group.id?.startsWith('ElementTemplates__')
            || group.id === 'general' || group.id === 'documentation')
        }
        return translatedGroups.map(group => {
          if (!group.id?.startsWith('ElementTemplates__')) return group
          if (group.id === 'ElementTemplates__Template') {
            return { ...group, label: '业务模板' }
          }
          return {
            ...group,
            id: `BusinessTemplate__${group.id.replace('ElementTemplates__', '')}`,
          }
        })
      }
    },
  })
}

type ModelerLike = {
  get<T>(name: string): T
  on(type: string, callback: () => void): void
  off(type: string, callback: () => void): void
}

type PanelIntegrationOptions = {
  getHost(): HTMLElement | undefined
  getVisibility(): boolean
  isAdvanced(): boolean
  setAdvanced(value: boolean): void
}

const PANEL_EVENTS = [
  'selection.changed', 'element.changed', 'commandStack.changed', 'elementTemplates.changed',
  'elementTemplates.apply', 'elementTemplates.update', 'propertiesPanel.rendered',
]

export function createBusinessTemplatePanelIntegration(options: PanelIntegrationOptions) {
  let modeler: ModelerLike | undefined
  let attachedHost: HTMLElement | undefined
  let observer: MutationObserver | undefined
  let removeClickListener: (() => void) | undefined
  let reconcilePending = false
  let expandBusinessFields = false

  const reconcile = () => {
    reconcilePending = false
    const instance = modeler
    const host = options.getHost()
    if (!instance || !host) return
    const panel = instance.get<{
      attachTo(parent: HTMLElement): void
      detach(): void
    }>('propertiesPanel')
    if (options.getVisibility()) {
      if (attachedHost !== host || !host.querySelector('.bio-properties-panel-container')) {
        panel.attachTo(host)
        attachedHost = host
      }
    } else if (attachedHost) {
      panel.detach()
      attachedHost = undefined
    }
    const selected = instance.get<{ get(): Element[] }>('selection').get()
    const selectedElement = selected.length === 1 ? selected[0] : undefined
    const elementTemplates = instance.get<TemplateService>('elementTemplates')
    const selectedHasTemplate = Boolean(selectedElement && hasBusinessTemplate(
      selectedElement,
      elementTemplates,
    ))
    const hasBusinessPropertyGroup = host.querySelector<HTMLElement>(
      '.bio-properties-panel-group[data-group-id^="group-ElementTemplates__CustomProperties"]',
    )
    if (expandBusinessFields && selectedHasTemplate && hasBusinessPropertyGroup) {
      const businessFields = host.querySelector<HTMLElement>(
        '.bio-properties-panel-group[data-group-id^="group-ElementTemplates__CustomProperties"]',
      )
      const collapsedArrow = businessFields?.querySelector<HTMLElement>(
        '.bio-properties-panel-arrow-right',
      )
      if (collapsedArrow) {
        businessFields?.querySelector<HTMLButtonElement>(
          '.bio-properties-panel-group-header-button',
        )?.click()
      }
      expandBusinessFields = false
    }
    const templateGroup = selectedHasTemplate
      ? (host.querySelector<HTMLElement>(
        '.bio-properties-panel-group[data-group-id="group-ElementTemplates__CustomProperties"], .bio-properties-panel-group[data-group-id="group-ElementTemplates__Output"], .bio-properties-panel-group[data-group-id="group-ElementTemplates__Error"], .bio-properties-panel-group[data-group-id="group-ElementTemplates__Input"], .bio-properties-panel-group[data-group-id^="group-ElementTemplates__CustomProperties-"]',
      ) || host.querySelector<HTMLElement>('.bio-properties-panel-group[data-group-id^="group-BusinessTemplate__CustomProperties"], .bio-properties-panel-group[data-group-id^="group-BusinessTemplate__Input"], .bio-properties-panel-group[data-group-id="group-ElementTemplates__Template"]'))
      : host.querySelector<HTMLElement>('.bio-properties-panel-group[data-group-id="group-ElementTemplates__Template"]')
    const templates = selectedElement
      ? elementTemplates.getAll?.(selectedElement) ?? []
      : []
    if (!selectedElement || (!selectedHasTemplate && templates.length === 0) || !templateGroup) {
      host.querySelector('.designer-advanced-toggle')?.remove()
      options.setAdvanced(false)
    } else if (!host.querySelector('.designer-advanced-toggle')) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'designer-advanced-toggle'
        button.setAttribute('aria-label', '展开或收起高级设置')
        button.textContent = options.isAdvanced() ? '收起高级设置' : '高级设置'
        button.setAttribute('aria-expanded', String(options.isAdvanced()))
        templateGroup.after(button)
    }
    const toggle = host.querySelector<HTMLButtonElement>('.designer-advanced-toggle')
    if (toggle) {
      const expanded = options.isAdvanced()
      const label = expanded ? '收起高级设置' : '高级设置'
      if (toggle.textContent !== label) toggle.textContent = label
      if (toggle.getAttribute('aria-expanded') !== String(expanded)) {
        toggle.setAttribute('aria-expanded', String(expanded))
      }
      const groups = host.querySelectorAll<HTMLElement>('.bio-properties-panel-group[data-group-id]')
      for (const group of groups) {
        if (!group.id && group.dataset.groupId) group.id = `designer-${group.dataset.groupId}`
      }
      toggle.setAttribute('aria-controls', Array.from(groups).map(group => group.id).filter(Boolean).join(' '))
      const visibleGroupIds = new Set(['group-general', 'group-documentation'])
      for (const group of groups) {
        if (group.dataset.groupId?.startsWith('group-ElementTemplates__')
          || group.dataset.groupId?.startsWith('group-BusinessTemplate__')) visibleGroupIds.add(group.dataset.groupId)
        if (expanded && group.dataset.groupId) visibleGroupIds.add(group.dataset.groupId)
      }
      for (const group of groups) {
        const shouldShow = visibleGroupIds.has(group.dataset.groupId ?? '')
        if (group.hidden === shouldShow) group.hidden = !shouldShow
      }
    }
  }

  const requestReconcile = () => {
    if (reconcilePending) return
    reconcilePending = true
    queueMicrotask(reconcile)
  }

  const closeAdvancedSettings = () => {
    expandBusinessFields = true
    options.setAdvanced(false)
    modeler?.get<{ fire(type: string): void }>('eventBus').fire('propertiesPanel.providersChanged')
    requestReconcile()
  }

  return {
    mount(instance: ModelerLike) {
      modeler = instance
      const host = options.getHost()
      if (host) {
        observer = new MutationObserver(requestReconcile)
        observer.observe(host, { childList: true, subtree: true })
      }
      const click = (event: Event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        const button = target.closest<HTMLButtonElement>('.designer-advanced-toggle')
        if (!button) return
        event.preventDefault()
        options.setAdvanced(!options.isAdvanced())
        instance.get<{ fire(type: string): void }>('eventBus').fire('propertiesPanel.providersChanged')
        requestReconcile()
      }
      host?.addEventListener('click', click)
      removeClickListener = () => host?.removeEventListener('click', click)
      for (const event of PANEL_EVENTS) {
        if (event !== 'elementTemplates.apply' && event !== 'elementTemplates.update') {
          instance.on(event, requestReconcile)
        }
      }
      instance.on('elementTemplates.apply', closeAdvancedSettings)
      instance.on('elementTemplates.update', closeAdvancedSettings)
      requestReconcile()
      return () => host?.removeEventListener('click', click)
    },
    unmount() {
      const instance = modeler
      if (instance) {
        for (const event of PANEL_EVENTS) {
          if (event !== 'elementTemplates.apply' && event !== 'elementTemplates.update') {
            instance.off(event, requestReconcile)
          }
        }
        instance.off('elementTemplates.apply', closeAdvancedSettings)
        instance.off('elementTemplates.update', closeAdvancedSettings)
        if (attachedHost) instance.get<{ detach(): void }>('propertiesPanel').detach()
      }
      removeClickListener?.()
      removeClickListener = undefined
      observer?.disconnect()
      observer = undefined
      attachedHost = undefined
      modeler = undefined
    },
    refresh: requestReconcile,
  }
}
