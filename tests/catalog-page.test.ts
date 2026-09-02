import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  activeTerm: 'fall' as const,
  catalog: { termConfig: { fall: { label: '2026 秋季', weeks: 22, hasSchedule: true }, spring: { label: '2027 春季', weeks: 20, hasSchedule: false } } },
  choices: [] as any[],
  profile: {
    discipline: '计算机科学与技术',
    programKind: 'academic',
    trainingUnit: '计算机科学与技术学院',
  } as any,
  planEntries: [] as any[],
  formalEntries: [] as any[],
  conflicts: [] as any[],
  index: { courses: new Map<string, any>(), offerings: new Map<string, any>() },
  duplicateReason: vi.fn(),
  addChoice: vi.fn(),
  removeEntry: vi.fn(),
  formalAddBlockReason: vi.fn(),
}))

vi.mock('../src/stores/planner', () => ({ usePlannerStore: () => store }))

import CatalogPage from '../src/pages/CatalogPage.vue'

describe('课程目录默认筛选', () => {
  beforeEach(() => {
    sessionStorage.clear()
    store.planEntries = []
    store.formalEntries = []
    store.conflicts = []
    store.index.courses.clear()
    store.index.offerings.clear()
    store.choices = [{
      id: 'course-1', offering: null,
      course: {
        id: 'course-1', term: 'fall', baseCode: 'TEST-1', name: '测试课程', englishName: '', department: '测试学院',
        campuses: ['雁栖湖'], attribute: '专业课', level: '硕博通用课程', subject: '计算机科学与技术',
        firstLevelDiscipline: '计算机科学与技术', sharedSubjects: [], sharedFirstLevels: [], sharedAttributes: [], sharedLevels: [],
        hours: 32, credits: 2, professionalProgramCourse: false, isBenYan: false, sourceKinds: ['test'],
      },
    }]
  })

  it('首次进入默认勾选只看本学科和雁栖湖校区', () => {
    const wrapper = mount(CatalogPage)
    expect(wrapper.get<HTMLInputElement>('.switch-filter input').element.checked).toBe(true)
    expect(wrapper.get<HTMLSelectElement>('select[aria-label="校区"]').element.value).toBe('雁栖湖')
    expect(wrapper.get('.catalog-table-head').text()).toContain('上课安排/考核方式')
    expect(wrapper.get('.course-discipline').text()).toBe('所属学科：计算机科学与技术所属一级学科：计算机科学与技术')
    expect(wrapper.get('.course-exam').text()).toBe('考核方式待定')
    wrapper.unmount()
  })

  it('首次打开课程目录默认进入边选边看，实时课表默认显示总表', () => {
    const wrapper = mount(CatalogPage)

    expect(wrapper.get('.catalog-selection-workspace').classes()).toContain('live-mode')
    expect(wrapper.get('.live-schedule-view-switch button:first-child').classes()).toContain('active')
    expect(wrapper.find('.live-total-table-wrap').exists()).toBe(true)

    wrapper.unmount()
  })

  it('专业学位课程将一级学科标为关联推断结果', () => {
    store.choices[0].course.professionalProgramCourse = true
    const wrapper = mount(CatalogPage)
    expect(wrapper.get('.course-discipline').text()).toBe('所属学科：计算机科学与技术关联一级学科（推断）：计算机科学与技术')
    wrapper.unmount()
  })

  it('移动端虚拟列表使用与课程卡片一致的行高，后一门课程不会提前覆盖', async () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    store.choices.push({
      ...store.choices[0],
      id: 'course-2',
      course: { ...store.choices[0].course, id: 'course-2', baseCode: 'TEST-2', name: '第二门测试课程' },
    })

    const wrapper = mount(CatalogPage)
    await wrapper.get('.catalog-view-switch button:first-child').trigger('click')
    expect(wrapper.get('.virtual-spacer').attributes('style')).toContain('height: 744px')
    expect(wrapper.findAll('.course-row')[1].attributes('style')).toContain('translateY(372px)')
    wrapper.unmount()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  })

  it('移动端按额外上课时段增加单行高度', async () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    store.choices[0].offering = {
      name: '四时段课程', campus: '雁栖湖', capacity: 50, enrolled: 0, teachers: [], leadProfessor: '', examMethod: '',
      meetings: Array.from({ length: 4 }, (_, index) => ({ rawTime: `周一(${index + 1}-${index + 1})`, rawWeeks: '第1-16周', room: '教一楼101' })),
    }

    const wrapper = mount(CatalogPage)
    await wrapper.get('.catalog-view-switch button:first-child').trigger('click')
    expect(wrapper.get('.virtual-spacer').attributes('style')).toContain('height: 504px')
    expect(wrapper.get('.course-row').attributes('style')).toContain('height: 504px')
    wrapper.unmount()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  })

  it('可以切换到边选边看模式，并显示当前学期的教学周选择器', async () => {
    const wrapper = mount(CatalogPage)
    await wrapper.get('.catalog-view-switch button:nth-child(2)').trigger('click')
    await wrapper.get('.live-schedule-view-switch button:last-child').trigger('click')

    expect(wrapper.get('.catalog-selection-workspace').classes()).toContain('live-mode')
    expect(wrapper.get('.live-schedule-panel').text()).toContain('实时课表')
    expect(wrapper.findAll('.live-week-dots button')).toHaveLength(22)
    expect(wrapper.get('.live-week-dots button.active').text()).toBe('1')
    expect(wrapper.get('.live-course-facts').text()).toContain('32 学时')
    expect(wrapper.get('.live-fact-exam').text()).toContain('考核 · 待定')
    expect(wrapper.get('.live-fact-affiliation').text()).toContain('计算机科学与技术')
    expect(wrapper.get('.course-staff').text()).toContain('主讲待定')
    expect(wrapper.get('.course-staff').text()).toContain('首席待定')

    wrapper.unmount()
  })

  it('正式方案课程会显示在实时课表对应教学周中', async () => {
    const currentCourse = store.choices[0].course
    const currentOffering = {
      id: 'offering-1', courseId: currentCourse.id, term: 'fall', offeringCode: 'TEST-1-01', name: '测试课程班',
      campus: '雁栖湖', capacity: 50, enrolled: 0, teachingMethod: '课堂讲授', examMethod: '闭卷考试', leadProfessor: '', teachers: ['测试教师'],
      meetings: [{ weeks: [1], weekday: 2, periods: [3, 4], room: '教一楼101', rawWeeks: '第1周', rawTime: '周二(3-4)' }],
    }
    const currentEntry = { id: 'entry-1', courseId: currentCourse.id, offeringId: currentOffering.id, status: 'formal', isDegreeCourse: false, approvalState: 'none', retake: false, retakeReason: '', createdAt: '2026-09-01' }
    store.index.courses.set(currentCourse.id, currentCourse)
    store.index.offerings.set(currentOffering.id, currentOffering)
    store.planEntries = [currentEntry]
    store.formalEntries = [currentEntry]

    const wrapper = mount(CatalogPage)
    await wrapper.get('.catalog-view-switch button:nth-child(2)').trigger('click')
    await wrapper.get('.live-schedule-view-switch button:last-child').trigger('click')

    expect(wrapper.findAll('.live-schedule-block')).toHaveLength(1)
    expect(wrapper.get('.live-schedule-block').text()).toContain('测试课程班')
    expect(wrapper.get('.live-schedule-block .schedule-card-fit-code').text()).toBe('TEST-1-01')
    expect(wrapper.get('.live-schedule-block .schedule-card-fit-weeks').text()).toBe('第1周')
    expect(wrapper.get('.live-schedule-block .schedule-card-fit-time').text()).toBe('周二(3-4)')
    expect(wrapper.get('.live-schedule-block').attributes('style')).toContain('grid-column: 3')
    expect(wrapper.find('.live-schedule-block .schedule-remove-button').exists()).toBe(true)

    wrapper.unmount()
  })

  it('实时课表可以切换到包含全部教学安排的总表', async () => {
    const currentCourse = store.choices[0].course
    const currentOffering = {
      id: 'offering-total', courseId: currentCourse.id, term: 'fall', offeringCode: 'TEST-TOTAL-01', name: '总表测试课程',
      campus: '雁栖湖', capacity: 50, enrolled: 0, teachingMethod: '课堂讲授', examMethod: '闭卷考试', leadProfessor: '', teachers: ['测试教师'],
      meetings: [
        { weeks: [1], weekday: 2, periods: [3, 4], room: '教一楼101', rawWeeks: '第1周', rawTime: '周二(3-4)' },
        { weeks: [8], weekday: 5, periods: [5, 6], room: '教一楼102', rawWeeks: '第8周', rawTime: '周五(5-6)' },
      ],
    }
    const currentEntry = { id: 'entry-total', courseId: currentCourse.id, offeringId: currentOffering.id, status: 'formal', isDegreeCourse: false, approvalState: 'none', retake: false, retakeReason: '', createdAt: '2026-09-01' }
    store.index.courses.set(currentCourse.id, currentCourse)
    store.index.offerings.set(currentOffering.id, currentOffering)
    store.planEntries = [currentEntry]
    store.formalEntries = [currentEntry]

    const wrapper = mount(CatalogPage)
    await wrapper.get('.catalog-view-switch button:nth-child(2)').trigger('click')
    await wrapper.get('.live-schedule-view-switch button:first-child').trigger('click')

    expect(wrapper.find('.live-week-dots').exists()).toBe(false)
    expect(wrapper.get('.live-total-table-wrap').text()).toContain('研究生课表总表')
    expect(wrapper.findAll('.live-total-table-wrap .schedule-weekly-block')).toHaveLength(2)
    expect(wrapper.findAll('.live-total-table-wrap .schedule-remove-button')).toHaveLength(2)
    expect(wrapper.get('.live-total-table-wrap').text()).toContain('第8周')

    wrapper.unmount()
  })
})
