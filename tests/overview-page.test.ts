import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  activeTerm: 'fall',
  report: { items: [], warnings: [] },
  profile: {
    name: '测试学生', studentId: '20260001', trainingUnit: '测试学院', major: '测试专业',
    category: 'academic_master', programKind: 'academic', discipline: '计算机科学与技术', professionalField: '',
    campusPreference: '雁栖湖', english: { masterMethod: 'offline', doctorEnglishRequired: false }, createdAt: '2026-09-01',
  } as any,
  conflicts: [] as any[],
  formalEntries: [] as any[],
  index: { courses: new Map<string, any>(), offerings: new Map<string, any>() },
}))

vi.mock('../src/stores/planner', () => ({ usePlannerStore: () => store }))

import OverviewPage from '../src/pages/OverviewPage.vue'

function course(name: string, overrides: Record<string, unknown> = {}) {
  return {
    id: name, term: 'fall', baseCode: name, name, englishName: '', department: '', campuses: [], attribute: '专业课',
    level: '硕博通用课程', subject: '计算机科学与技术', firstLevelDiscipline: '计算机科学与技术',
    sharedSubjects: [], sharedFirstLevels: [], sharedAttributes: [], sharedLevels: [], hours: 32, credits: 2,
    professionalProgramCourse: false, isBenYan: false, sourceKinds: ['test'], ...overrides,
  }
}

function entry(id: string, courseId: string) {
  return { id, courseId, offeringId: null, status: 'formal', isDegreeCourse: false, approvalState: 'none', retake: false, retakeReason: '', createdAt: '2026-09-01' }
}

describe('培养概览', () => {
  beforeEach(() => {
    store.formalEntries = []
    store.conflicts = []
    store.index.courses.clear()
    store.index.offerings.clear()
  })

  it('恢复完整培养概览，并将正式方案放在培养要求右侧', () => {
    const wrapper = mount(OverviewPage, { global: { stubs: { MathMotif: true, RouterLink: true } } })
    expect(wrapper.find('.requirement-list-panel').exists()).toBe(true)
    expect(wrapper.find('.compact-requirements').exists()).toBe(true)
    expect(wrapper.find('.page-header').exists()).toBe(true)
    expect(wrapper.find('.identity-banner').exists()).toBe(true)
    expect(wrapper.find('.next-panel').exists()).toBe(true)
    expect(wrapper.find('.overview-carousel').exists()).toBe(false)
    wrapper.unmount()
  })
})
