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
    expect(wrapper.get('.course-discipline').text()).toBe('一级学科：计算机科学与技术')
    wrapper.unmount()
  })
})
