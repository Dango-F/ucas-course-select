import { describe, expect, it } from 'vitest'
import { fitScheduleCardNow } from '../src/directives/fitScheduleCard'

describe('课表课程卡片文字自适应', () => {
  it('根据卡片可用高度缩小内容，并保留尽可能大的可读字号', () => {
    const card = document.createElement('article')
    const content = document.createElement('div')
    content.className = 'schedule-card-fit-content'
    card.style.padding = '5px'
    card.appendChild(content)
    document.body.appendChild(card)

    Object.defineProperty(card, 'clientWidth', { configurable: true, value: 120 })
    Object.defineProperty(card, 'clientHeight', { configurable: true, value: 50 })
    Object.defineProperty(content, 'scrollWidth', { configurable: true, get: () => 100 })
    Object.defineProperty(content, 'scrollHeight', {
      configurable: true,
      get: () => 78 * Number.parseFloat(card.style.getPropertyValue('--schedule-card-scale') || '1'),
    })

    fitScheduleCardNow(card, { minScale: 0.4 })
    const scale = Number.parseFloat(card.style.getPropertyValue('--schedule-card-scale'))

    expect(scale).toBeGreaterThanOrEqual(0.4)
    expect(scale).toBeLessThan(1)
    expect(78 * scale).toBeLessThanOrEqual(40.75)
    expect(card.dataset.fitOverflow).toBe('false')
    card.remove()
  })

  it('卡片空间充足时在可读范围内放大内容', () => {
    const card = document.createElement('article')
    const content = document.createElement('div')
    content.className = 'schedule-card-fit-content'
    card.style.padding = '0px'
    card.appendChild(content)
    document.body.appendChild(card)

    Object.defineProperty(card, 'clientWidth', { configurable: true, value: 180 })
    Object.defineProperty(card, 'clientHeight', { configurable: true, value: 120 })
    Object.defineProperty(content, 'scrollWidth', { configurable: true, get: () => 120 })
    Object.defineProperty(content, 'scrollHeight', {
      configurable: true,
      get: () => 60 * Number.parseFloat(card.style.getPropertyValue('--schedule-card-scale') || '1'),
    })

    fitScheduleCardNow(card, { minScale: 0.4, maxScale: 1.16 })

    expect(card.style.getPropertyValue('--schedule-card-scale')).toBe('1.160')
    expect(card.dataset.fitOverflow).toBe('false')
    card.remove()
  })
})
