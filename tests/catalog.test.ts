import { describe, expect, it } from 'vitest'
import { mergeCatalog, normalizeCatalog, normalizeCourseName } from '../src/domain/catalog'
import type { Catalog, Course, CourseOffering, Meeting } from '../src/types'

const course = (overrides: Partial<Course> = {}): Course => ({
  id: 'fall:C1', term: 'fall', baseCode: 'C1', name: '基础名称', englishName: '', department: '计算机学院', campuses: ['雁栖湖'],
  attribute: '学科核心课', level: '硕博通用课程', subject: '计算机科学与技术', firstLevelDiscipline: '计算机科学与技术',
  sharedSubjects: [], sharedFirstLevels: [], sharedAttributes: [], sharedLevels: [], hours: 32, credits: 2,
  professionalProgramCourse: false, isBenYan: false, sourceKinds: ['core'], ...overrides,
})

const catalog = (courses: Course[]): Catalog => ({
  schemaVersion: 1, dataVersion: 'v1', generatedAt: '', courses, offerings: [], disciplines: [], professionalFields: [], diagnostics: [],
  termConfig: { fall: { label: '', startDate: '', weeks: 22, hasSchedule: true }, spring: { label: '', startDate: null, weeks: 20, hasSchedule: false } },
  stats: { planFall: 0, planSpring: 0, coreFall: 0, coreSpring: 0, scheduleOfferings: 0, scheduleMeetings: 0 },
})

describe('课程归一化与合并', () => {
  it('去除班号和校区但保留英语班型', () => {
    expect(normalizeCourseName('英语B-191班（中）-高级写作')).toBe('英语b高级写作')
    expect(normalizeCourseName('英语B-39班（怀）-高级听说')).toBe('英语b高级听说')
  })

  it('新版工作簿空字段不会抹掉已有核心课归属', () => {
    const merged = mergeCatalog(catalog([course()]), { courses: [course({ name: '具体班名', attribute: '', firstLevelDiscipline: '', sharedFirstLevels: ['软件工程'], sourceKinds: ['schedule'] })], offerings: [] })
    expect(merged.courses[0]).toMatchObject({ name: '具体班名', attribute: '学科核心课', firstLevelDiscipline: '计算机科学与技术' })
    expect(merged.courses[0].sharedFirstLevels).toEqual(['软件工程'])
    expect(merged.courses[0].sourceKinds).toEqual(['core', 'schedule'])
  })

  it('合并课程数据时将英语A统一为64学时', () => {
    const merged = mergeCatalog(catalog([course({ name: '英语A', hours: 32 })]), { courses: [course({ name: '英语A', hours: 32 })], offerings: [] })
    expect(merged.courses[0].hours).toBe(64)
  })

  it('载入旧版课程库时也补齐英语A学时和秋季教学周', () => {
    const legacy = catalog([course({ name: '英语A', hours: 32 })])
    legacy.termConfig.fall.weeks = 20
    const normalized = normalizeCatalog(legacy)
    expect(normalized.courses[0].hours).toBe(64)
    expect(normalized.termConfig.fall.weeks).toBe(22)
  })

  it('导入春季详细排课后会开放春季周课表', () => {
    const springCourse: Course = { ...course(), id: 'spring:S1', term: 'spring', baseCode: 'S1' }
    const meeting: Meeting = { weeks: [1], weekday: 1, periods: [1], room: '教室', rawWeeks: '1', rawTime: '周一(1)' }
    const offering: CourseOffering = { id: 'spring:S1-01', courseId: springCourse.id, term: 'spring', offeringCode: 'S1-01', name: '春季课程', campus: '', capacity: 20, enrolled: 0, teachingMethod: '', examMethod: '', leadProfessor: '', teachers: [], meetings: [meeting] }
    const merged = mergeCatalog(catalog([]), { courses: [springCourse], offerings: [offering] })
    expect(merged.termConfig.spring.hasSchedule).toBe(true)
  })
})
