const items = [...document.querySelectorAll('[data-check-item]')]
const progress = document.querySelector('[data-quiz-progress]')

function updateProgress() {
  if (!progress) return
  const correct = items.filter((item) => item.querySelector('select')?.value === item.dataset.answer)
  progress.textContent = `已答对 ${correct.length} / ${items.length}`
}

for (const item of items) {
  const select = item.querySelector('select')
  const feedback = item.querySelector('[data-feedback]')
  if (!select || !feedback) continue

  select.addEventListener('change', () => {
    const isCorrect = select.value === item.dataset.answer
    feedback.className = `feedback ${isCorrect ? 'correct' : 'incorrect'}`
    feedback.textContent = isCorrect
      ? `判断正确。${item.dataset.reason}`
      : '再想想：这个动作由谁负责，是否会修改真实业务数据？'
    updateProgress()
  })
}

document.querySelector('[data-quiz-reset]')?.addEventListener('click', () => {
  for (const item of items) {
    const select = item.querySelector('select')
    const feedback = item.querySelector('[data-feedback]')
    if (select) select.value = ''
    if (feedback) {
      feedback.className = 'feedback'
      feedback.textContent = ''
    }
  }
  updateProgress()
  items[0]?.querySelector('select')?.focus()
})

updateProgress()
