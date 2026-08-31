import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  activeTerm: 'fall' as const,
  catalog: { termConfig: { fall: { weeks: 22 }, spring: { weeks: 20 } } },
  planEntries: [],
  formalEntries: [],
  conflicts: [],
  index: { courses: new Map(), offerings: new Map() },
}))

vi.mock('../src/stores/planner', () => ({ usePlannerStore: () => store }))

import SchedulePage from '../src/pages/SchedulePage.vue'

describe('周课表教学周选择器', () => {
  it('显示到第 22 周并允许选择', () => {
    const wrapper = mount(SchedulePage)
    const weekButtons = wrapper.findAll('.week-dots button')

    expect(weekButtons).toHaveLength(22)
    expect(weekButtons.at(-1)?.text()).toBe('22')
    expect(wrapper.find('.week-control button:last-child').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
