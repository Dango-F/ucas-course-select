import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  activeTerm: 'fall' as const,
  catalog: { termConfig: { fall: { weeks: 22 }, spring: { weeks: 20 } } },
  profile: undefined as any,
  planEntries: [] as any[],
  formalEntries: [] as any[],
  conflicts: [] as any[],
  index: { courses: new Map<string, any>(), offerings: new Map<string, any>() },
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

  it('将存在时间冲突的教学周标红，并在选中时保持红色', async () => {
    const entries = [
      { id: 'entry-a', courseId: 'course-a', offeringId: null },
      { id: 'entry-b', courseId: 'course-b', offeringId: null },
    ]
    store.planEntries = entries
    store.formalEntries = entries
    store.index.courses.set('course-a', { term: 'fall', name: '课程 A', baseCode: 'A', credits: 2 })
    store.index.courses.set('course-b', { term: 'fall', name: '课程 B', baseCode: 'B', credits: 2 })
    store.conflicts = [{ entryA: 'entry-a', entryB: 'entry-b', weekday: 1, periods: [1, 2], weeks: [3, 21] }]

    const wrapper = mount(SchedulePage)
    const weekButtons = wrapper.findAll('.week-dots button')

    expect(weekButtons.at(2)?.classes()).toContain('conflict')
    expect(weekButtons.at(20)?.classes()).toContain('conflict')
    expect(weekButtons.at(2)?.attributes('aria-label')).toContain('存在时间冲突')

    await weekButtons.at(20)?.trigger('click')
    expect(weekButtons.at(20)?.classes()).toEqual(expect.arrayContaining(['active', 'conflict']))

    wrapper.unmount()
    store.planEntries = []
    store.formalEntries = []
    store.conflicts = []
    store.index.courses.clear()
  })

  it('打印时克隆当前预览，确保预览与 PDF 使用同一份页面结构', async () => {
    const entry = { id: 'entry-1', courseId: 'course-1', offeringId: 'offering-1', bucket: 'formal', isDegreeCourse: true, approvalState: 'approved', isRetake: false }
    store.profile = { name: '测试学生', studentId: '20260001', trainingUnit: '计算机学院', major: '计算机应用技术', category: 'academic_master' }
    store.planEntries = [entry]
    store.formalEntries = [entry]
    store.index.courses.set('course-1', { id: 'course-1', term: 'fall', name: '矩阵分析与应用', baseCode: 'TEST-001', attribute: '专业课', level: '硕博通用课程', hours: 40, credits: 2, campuses: ['雁栖湖'] })
    store.index.offerings.set('offering-1', { id: 'offering-1', name: '矩阵分析与应用', offeringCode: 'TEST-001H', teachers: ['测试教师'], leadProfessor: '测试首席', campus: '雁栖湖', capacity: 100, enrolled: 20, teachingMethod: '课堂讲授', examMethod: '闭卷考试', meetings: [{ weeks: [1, 2], weekday: 1, periods: [1, 2], room: '教一楼101', rawWeeks: '第1-2周', rawTime: '周一(1-2)' }] })
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    const wrapper = mount(SchedulePage, { attachTo: document.body })

    await wrapper.get('.schedule-header-actions > button').trigger('click')
    await nextTick()
    const preview = document.querySelector<HTMLElement>('.schedule-table-preview .schedule-table-print')
    const printButton = document.querySelector<HTMLButtonElement>('.schedule-export-header-actions .button.primary')
    expect(preview).not.toBeNull()
    expect(printButton).not.toBeNull()

    printButton!.click()
    await flushPromises()
    const clone = document.querySelector<HTMLElement>('body > .schedule-table-print.schedule-print-clone')
    expect(printSpy).toHaveBeenCalledOnce()
    expect(clone?.innerHTML).toBe(preview?.innerHTML)

    window.dispatchEvent(new Event('afterprint'))
    await nextTick()
    expect(document.querySelector('body > .schedule-print-clone')).toBeNull()
    expect(document.body.classList.contains('schedule-printing')).toBe(false)

    wrapper.unmount()
    printSpy.mockRestore()
    store.profile = undefined
    store.planEntries = []
    store.formalEntries = []
    store.index.courses.clear()
    store.index.offerings.clear()
  })
})
