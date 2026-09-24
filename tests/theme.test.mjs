import assert from 'node:assert/strict'
import test from 'node:test'
import { load } from './bpmn-test-utils.mjs'

const { createThemeStore, diagramCSSVariables, themePresets } = await load('theme')

test('主题 store 默认使用青雾预设并保留固定几何参数', () => {
  const store = createThemeStore('mist')
  const snapshot = store.getSnapshot()

  assert.equal(snapshot.id, 'mist')
  assert.equal(snapshot.card.width, 184)
  assert.equal(snapshot.card.height, 88)
  assert.deepEqual(snapshot.layout, { nodeGap: 64, layerGap: 76, edgeGap: 24, padding: 40 })
})

test('切换主题只更新视觉快照，并通知订阅者一次', () => {
  const store = createThemeStore('mist')
  const initial = store.getSnapshot()
  let calls = 0
  let received
  const unsubscribe = store.subscribe((snapshot) => {
    calls += 1
    received = snapshot
  })

  const next = store.setTheme('contrast')

  assert.equal(calls, 1)
  assert.equal(received.id, 'contrast')
  assert.equal(next.id, 'contrast')
  assert.notEqual(next.canvas.background, initial.canvas.background)
  assert.equal(next.card.width, initial.card.width)
  assert.equal(next.card.height, initial.card.height)
  assert.deepEqual(next.layout, initial.layout)
  assert.equal(themePresets.contrast.card.width, initial.card.width)

  unsubscribe()
  store.setTheme('mist')
})

test('CSS 变量跟随主题快照变化', () => {
  const store = createThemeStore('mist')
  const mist = diagramCSSVariables(store.getSnapshot())
  store.setTheme('slate')
  const slate = diagramCSSVariables(store.getSnapshot())

  assert.equal(mist['--diagram-background'], themePresets.mist.canvas.background)
  assert.equal(slate['--diagram-background'], themePresets.slate.canvas.background)
  assert.notEqual(mist['--diagram-accent'], slate['--diagram-accent'])

  store.setTheme('mist')
})

test('重复设置主题不会重复通知，非法初始主题会明确失败', () => {
  const store = createThemeStore('mist')
  let calls = 0
  const unsubscribe = store.subscribe(() => { calls += 1 })

  const snapshot = store.setTheme('mist')

  assert.equal(snapshot.id, 'mist')
  assert.equal(calls, 0)
  assert.throws(() => createThemeStore('unknown'), /未知的设计器主题/)
  unsubscribe()
})
