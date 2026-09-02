import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  conflicts: [] as any[],
  planEntries: [] as any[],
  formalEntries: [] as any[],
  backupEntries: [] as any[],
  profile: {
    name: '测试学生', studentId: '20260001', trainingUnit: '测试学院', major: '测试专业',
    category: 'academic_master', programKind: 'academic', discipline: '测试学科', professionalField: '',
    campusPreference: '雁栖湖', english: { masterMethod: 'exempt', doctorEnglishRequired: false }, createdAt: '2026-08-31',
  } as any,
  index: { courses: new Map<string, any>(), offerings: new Map<string, any>() },
  lastNotice: '',
  moveEntry: vi.fn(async () => true),
  setDegreeCourse: vi.fn(async () => {}),
  removeEntry: vi.fn(async () => {}),
  clearPlanEntries: vi.fn(async () => {}),
}))

vi.mock('../src/stores/planner', () => ({ usePlannerStore: () => store }))

import PlanPage from '../src/pages/PlanPage.vue'

function mountPlanPage() {
  return mount(PlanPage, { global: { stubs: { RouterLink: true } } })
}

function course(id: string, name = `课程 ${id}`) {
  return {
    id, term: 'fall', baseCode: id.toUpperCase(), name, englishName: '', department: '测试学院', campuses: ['雁栖湖'],
    attribute: '专业课', level: '硕士课程', subject: '测试学科', firstLevelDiscipline: '测试学科',
    sharedSubjects: [], sharedFirstLevels: [], sharedAttributes: [], sharedLevels: [], hours: 32, credits: 2,
    professionalProgramCourse: false, isBenYan: false, sourceKinds: ['test'],
  }
}

function offering(id: string, courseId: string, examMethod = '闭卷考试') {
  return {
    id, courseId, term: 'fall', offeringCode: `${id}-01`, name: '测试课程班', campus: '雁栖湖', capacity: 50, enrolled: 0,
    teachingMethod: '课堂讲授', examMethod, leadProfessor: '', teachers: ['测试教师'],
    meetings: [{ weeks: [1, 2], weekday: 1, periods: [1, 2], room: '教一楼101', rawWeeks: '第1-2周', rawTime: '周一(1-2)' }],
  }
}

function entry(id: string, courseId: string, offeringId: string) {
  return { id, courseId, offeringId, status: 'formal', isDegreeCourse: false, approvalState: 'none', retake: false, retakeReason: '', createdAt: '2026-08-31' }
}

function resetStore() {
  store.conflicts = []
  store.planEntries = []
  store.formalEntries = []
  store.backupEntries = []
  store.index.courses.clear()
  store.index.offerings.clear()
}

describe('选课方案课程信息和分组', () => {
  beforeEach(() => resetStore())

  it('无冲突时隐藏普通课程分组标题，并显示考核方式', () => {
    const currentCourse = course('course-a')
    const currentOffering = offering('offering-a', currentCourse.id)
    const currentEntry = entry('entry-a', currentCourse.id, currentOffering.id)
    store.index.courses.set(currentCourse.id, currentCourse)
    store.index.offerings.set(currentOffering.id, currentOffering)
    store.planEntries = [currentEntry]
    store.formalEntries = [currentEntry]

    const wrapper = mountPlanPage()

    expect(wrapper.find('.plan-subgroup-label').exists()).toBe(false)
    expect(wrapper.get('.plan-catalog-head').text()).toContain('上课安排/考核方式')
    expect(wrapper.get('.course-exam').text()).toBe('考核方式闭卷考试')

    wrapper.unmount()
  })

  it('方案筛选只过滤结果，不改变原有排序规则', async () => {
    const ownCourse = course('course-own', '本学科课程')
    const otherCourse = { ...course('course-other', '非本学科课程'), firstLevelDiscipline: '其他学科', subject: '其他学科' }
    const ownOffering = offering('offering-own', ownCourse.id)
    const otherOffering = offering('offering-other', otherCourse.id)
    ownOffering.name = ownCourse.name
    otherOffering.name = otherCourse.name
    store.index.courses.set(ownCourse.id, ownCourse)
    store.index.courses.set(otherCourse.id, otherCourse)
    store.index.offerings.set(ownOffering.id, ownOffering)
    store.index.offerings.set(otherOffering.id, otherOffering)
    store.planEntries = [entry('entry-other', otherCourse.id, otherOffering.id), entry('entry-own', ownCourse.id, ownOffering.id)]
    store.formalEntries = store.planEntries

    const wrapper = mountPlanPage()
    expect(wrapper.findAll('.plan-catalog-row')).toHaveLength(2)
    expect(wrapper.findAll('.plan-catalog-row')[0].text()).toContain('本学科课程')

    await wrapper.get('input[placeholder="搜索课程、编码、教师或上课安排"]').setValue('非本学科课程')
    expect(wrapper.findAll('.plan-catalog-row')).toHaveLength(1)
    expect(wrapper.get('.plan-catalog-row').text()).toContain('非本学科课程')
    expect(wrapper.get('.plan-filter-result').text()).toContain('1 / 2')

    wrapper.unmount()
  })

  it('筛选冲突课程一侧时仍保留匹配到的课程', async () => {
    const firstCourse = course('course-first', '第一门冲突课')
    const secondCourse = course('course-second', '第二门冲突课')
    const firstOffering = offering('offering-first', firstCourse.id)
    const secondOffering = offering('offering-second', secondCourse.id)
    firstOffering.name = firstCourse.name
    secondOffering.name = secondCourse.name
    store.index.courses.set(firstCourse.id, firstCourse)
    store.index.courses.set(secondCourse.id, secondCourse)
    store.index.offerings.set(firstOffering.id, firstOffering)
    store.index.offerings.set(secondOffering.id, secondOffering)
    store.planEntries = [entry('entry-first', firstCourse.id, firstOffering.id), entry('entry-second', secondCourse.id, secondOffering.id)]
    store.formalEntries = store.planEntries
    store.conflicts = [{ entryA: 'entry-first', entryB: 'entry-second', weekday: 1, periods: [1], weeks: [1] }]

    const wrapper = mountPlanPage()
    await wrapper.get('input[placeholder="搜索课程、编码、教师或上课安排"]').setValue('第一门冲突课')

    expect(wrapper.findAll('.plan-catalog-row')).toHaveLength(1)
    expect(wrapper.get('.plan-catalog-row').text()).toContain('第一门冲突课')

    wrapper.unmount()
  })

  it('有冲突时保留其他正式课程分组标题', () => {
    const courses = ['a', 'b', 'c'].map((id) => course(`course-${id}`))
    const offerings = courses.map((item, index) => offering(`offering-${index}`, item.id))
    const entries = courses.map((item, index) => entry(`entry-${index}`, item.id, offerings[index].id))
    courses.forEach((item) => store.index.courses.set(item.id, item))
    offerings.forEach((item) => store.index.offerings.set(item.id, item))
    store.planEntries = entries
    store.formalEntries = entries
    store.conflicts = [{ entryA: 'entry-0', entryB: 'entry-1', weekday: 1, periods: [1], weeks: [1] }]

    const wrapper = mountPlanPage()

    expect(wrapper.find('.conflict-subgroup-label').exists()).toBe(true)
    expect(wrapper.find('.regular-subgroup-label').text()).toContain('其他正式课程')

    wrapper.unmount()
  })
})
