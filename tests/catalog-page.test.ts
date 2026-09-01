import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  activeTerm: 'fall' as const,
  choices: [] as any[],
  profile: {
    discipline: '计算机科学与技术',
    programKind: 'academic',
    trainingUnit: '计算机科学与技术学院',
  } as any,
  planEntries: [] as any[],
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

  it('专业学位课程将一级学科标为关联推断结果', () => {
    store.choices[0].course.professionalProgramCourse = true
    const wrapper = mount(CatalogPage)
    expect(wrapper.get('.course-discipline').text()).toBe('所属学科：计算机科学与技术关联一级学科（推断）：计算机科学与技术')
    wrapper.unmount()
  })

  it('移动端虚拟列表使用与课程卡片一致的行高，后一门课程不会提前覆盖', () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    store.choices.push({
      ...store.choices[0],
      id: 'course-2',
      course: { ...store.choices[0].course, id: 'course-2', baseCode: 'TEST-2', name: '第二门测试课程' },
    })

    const wrapper = mount(CatalogPage)
    expect(wrapper.get('.virtual-spacer').attributes('style')).toContain('height: 744px')
    expect(wrapper.findAll('.course-row')[1].attributes('style')).toContain('translateY(372px)')
    wrapper.unmount()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  })

  it('移动端按额外上课时段增加单行高度', () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    store.choices[0].offering = {
      name: '四时段课程', campus: '雁栖湖', capacity: 50, enrolled: 0, teachers: [], leadProfessor: '', examMethod: '',
      meetings: Array.from({ length: 4 }, (_, index) => ({ rawTime: `周一(${index + 1}-${index + 1})`, rawWeeks: '第1-16周', room: '教一楼101' })),
    }

    const wrapper = mount(CatalogPage)
    expect(wrapper.get('.virtual-spacer').attributes('style')).toContain('height: 504px')
    expect(wrapper.get('.course-row').attributes('style')).toContain('height: 504px')
    wrapper.unmount()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  })
})
