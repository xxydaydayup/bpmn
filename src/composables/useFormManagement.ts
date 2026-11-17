import { computed, reactive, ref } from 'vue'
import { emptyForm, formError, formGateway, uncertainWrite, type BusinessForm, type FormGateway, type FormHistory, type FormSchema } from '@/api/workflow/forms'

export function useFormManagement(gateway: FormGateway = formGateway) {
  const rows = ref<BusinessForm[]>([])
  const loading = ref(false)
  const detailLoading = ref(false)
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')
  const filters = reactive({ nameLike: '', status: '' })
  const applied = ref({ nameLike: '', status: '' })
  const offset = ref(0)
  const hasNext = ref(false)
  const current = ref<BusinessForm>()
  const editing = ref(false)
  const draft = reactive({ formKey: '', formName: '', description: '' })
  const schema = ref<FormSchema>(emptyForm())
  const baseline = ref('')
  const history = ref<FormHistory[]>([])
  const historyLoading = ref(false)
  const historyOffset = ref(0)
  const historyHasNext = ref(false)
  const historyPreview = ref<FormHistory>()
  const pendingWrite = ref<{ key: string; version: number; action: 'publish' | 'rollback' }>()
  let revision = 0
  let detailRevision = 0
  let historyRevision = 0
  let disposed = false
  let controller: AbortController | undefined
  let detailController: AbortController | undefined
  let historyController: AbortController | undefined
  const snapshot = () => JSON.stringify({ ...draft, schema: schema.value })
  const dirty = computed(() => editing.value && snapshot() !== baseline.value)

  function accept(form: BusinessForm) {
    current.value = form
    Object.assign(draft, { formKey: form.formKey, formName: form.formName, description: form.description || '' })
    schema.value = JSON.parse(JSON.stringify(form.formJson)) as FormSchema
    baseline.value = snapshot()
  }
  async function load() {
    const requestRevision = ++revision
    controller?.abort()
    controller = new AbortController()
    loading.value = true
    error.value = ''
    try {
      const data = await gateway.list({ ...applied.value, firstResult: offset.value, maxResults: 21 }, controller.signal)
      if (disposed || requestRevision !== revision) return
      rows.value = (data ?? []).slice(0, 20)
      hasNext.value = (data ?? []).length > 20
    } catch (cause) { if (!disposed && requestRevision === revision && !controller.signal.aborted) error.value = formError(cause) }
    finally { if (!disposed && requestRevision === revision) loading.value = false }
  }
  function search(reset = false) {
    if (reset) Object.assign(filters, { nameLike: '', status: '' })
    applied.value = { nameLike: filters.nameLike.trim(), status: filters.status }
    offset.value = 0
    return load()
  }
  function page(direction: number) { offset.value = Math.max(0, offset.value + direction * 20); return load() }
  function create() {
    ++detailRevision; detailController?.abort(); detailLoading.value = false
    ++historyRevision; historyController?.abort(); historyLoading.value = false
    current.value = undefined
    Object.assign(draft, { formKey: '', formName: '', description: '' })
    schema.value = emptyForm()
    editing.value = true
    history.value = []
    historyPreview.value = undefined
    error.value = ''; notice.value = ''
    baseline.value = snapshot()
  }
  async function open(key: string, showEditor = true) {
    if (busy.value || pendingWrite.value) return
    const requestRevision = ++detailRevision
    detailController?.abort()
    detailController = new AbortController()
    detailLoading.value = true
    error.value = ''
    try {
      const form = await gateway.get(key, detailController.signal)
      if (disposed || requestRevision !== detailRevision) return
      ++historyRevision; historyController?.abort(); historyLoading.value = false
      accept(form); editing.value = showEditor; history.value = []; historyPreview.value = undefined
    } catch (cause) { if (!disposed && requestRevision === detailRevision && !detailController.signal.aborted) error.value = formError(cause) }
    finally { if (!disposed && requestRevision === detailRevision) detailLoading.value = false }
  }
  async function save() {
    if (busy.value || pendingWrite.value) return false
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(draft.formKey)) { error.value = '表单 key 须以字母开头，只包含字母、数字、下划线或连字符'; return false }
    if (!draft.formName.trim()) { error.value = '请填写表单名称'; return false }
    const input = { formName: draft.formName.trim(), description: draft.description, formJson: JSON.parse(JSON.stringify(schema.value)) as FormSchema }
    busy.value = true; error.value = ''; notice.value = ''
    try {
      const form = current.value
        ? await gateway.update(current.value.formKey, input)
        : await gateway.create({ ...input, formKey: draft.formKey })
      if (disposed) return false
      accept(form)
      notice.value = '草稿已保存，尚未发布；已有发布快照不变。'
      await load(); return true
    } catch (cause) { if (!disposed) error.value = formError(cause); return false }
    finally { if (!disposed) busy.value = false }
  }
  async function loadHistory(reset = true) {
    const key = current.value?.formKey
    if (!key) return
    if (reset) { historyOffset.value = 0; historyPreview.value = undefined }
    const requestRevision = ++historyRevision
    historyController?.abort(); historyController = new AbortController()
    historyLoading.value = true
    try {
      const data = await gateway.history(key, { firstResult: historyOffset.value, maxResults: 21 }, historyController.signal)
      if (disposed || requestRevision !== historyRevision || current.value?.formKey !== key) return
      history.value = (data ?? []).slice(0, 20); historyHasNext.value = (data ?? []).length > 20
    } catch (cause) { if (!disposed && requestRevision === historyRevision && !historyController.signal.aborted) error.value = formError(cause) }
    finally { if (!disposed && requestRevision === historyRevision) historyLoading.value = false }
  }
  function historyPage(direction: number) { historyOffset.value = Math.max(0, historyOffset.value + direction * 20); return loadHistory(false) }
  async function verifyWrite() {
    const pending = pendingWrite.value
    if (!pending || busy.value) return
    busy.value = true; error.value = ''
    try {
      const [form, versions] = await Promise.all([gateway.get(pending.key), gateway.history(pending.key, { firstResult: 0, maxResults: 20 })])
      if (disposed) return
      accept(form); history.value = (versions ?? []).slice(0, 20)
      // A version increase may belong to another writer: never infer this request succeeded.
      notice.value = `已核对：当前 v${form.version}，操作前 v${pending.version}。请查看快照确认结果。`
      error.value = '原请求的执行结果仍需人工核对；确认后可以解除锁定，但重新操作可能再生成一个版本。'
    } catch (cause) { if (!disposed) error.value = formError(cause) }
    finally { if (!disposed) busy.value = false }
  }
  async function action(kind: 'publish' | 'rollback' | 'enable' | 'disable' | 'delete', version?: number) {
    const form = current.value
    if (!form || busy.value || pendingWrite.value || dirty.value) return
    busy.value = true; error.value = ''; notice.value = ''
    try {
      if (kind === 'delete') {
        await gateway.delete(form.formKey)
        if (!disposed) { editing.value = false; current.value = undefined; notice.value = '表单主记录已删除，历史发布快照保留。' }
      } else {
        const result = kind === 'rollback' ? await gateway.rollback(form.formKey, version!) : await gateway[kind](form.formKey)
        if (!disposed) { accept(result); notice.value = kind === 'publish' || kind === 'rollback' ? `已生成发布版本 v${result.version}，旧快照保持不变。` : '表单状态已更新，已有发布快照保持不变。' }
      }
      if (!disposed) { await load(); if (kind === 'rollback') await loadHistory() }
    } catch (cause) {
      if (disposed) return
      error.value = formError(cause)
      if ((kind === 'publish' || kind === 'rollback') && uncertainWrite(cause)) {
        pendingWrite.value = { key: form.formKey, version: form.version, action: kind }
        error.value += '；结果尚未确认，已锁定重复发布/回滚。请先核对服务器状态。'
      }
    } finally { if (!disposed) busy.value = false }
    if (pendingWrite.value) await verifyWrite()
  }
  function close() {
    if (busy.value || pendingWrite.value) return
    ++detailRevision; ++historyRevision
    detailController?.abort(); historyController?.abort()
    detailLoading.value = false; historyLoading.value = false; editing.value = false; historyPreview.value = undefined
  }
  function dispose() { disposed = true; ++revision; ++detailRevision; ++historyRevision; controller?.abort(); detailController?.abort(); historyController?.abort() }
  return { rows, loading, detailLoading, busy, error, notice, filters, offset, hasNext, current, editing, draft, schema, dirty, history, historyLoading, historyOffset, historyHasNext, historyPreview, pendingWrite, load, search, page, create, open, save, loadHistory, historyPage, action, verifyWrite, close, dispose }
}
