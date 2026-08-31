import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlannerStore } from '../src/stores/planner'
import type { Catalog, Course, CourseOffering, StudentProfile } from '../src/types'

const makeCourse = (baseCode: string, overrides: Partial<Course> = {}): Course => ({
  id: `fall:${baseCode}`, term: 'fall', baseCode, name: '测试课程', englishName: '', department: '测试院系', campuses: ['雁栖湖'],
  attribute: '专业课', level: '硕博通用课程', subject: '计算机科学与技术', firstLevelDiscipline: '计算机科学与技术',
  sharedSubjects: [], sharedFirstLevels: [], sharedAttributes: [], sharedLevels: [], hours: 32, credits: 2,
  professionalProgramCourse: false, isBenYan: false, sourceKinds: ['test'], ...overrides,
})

const makeOffering = (id: string, courseId: string, name: string): CourseOffering => ({
  id: `fall:${id}`, courseId, term: 'fall', offeringCode: id, name, campus: '雁栖湖', capacity: 50, enrolled: 0,
  teachingMethod: '', examMethod: '', leadProfessor: '', teachers: [], meetings: [],
})

const makeCatalog = (courses: Course[], offerings: CourseOffering[]): Catalog => ({
  schemaVersion: 1, dataVersion: 'test', generatedAt: '', courses, offerings, disciplines: [], professionalFields: [], diagnostics: [],
  termConfig: { fall: { label: '', startDate: '2026-08-31', weeks: 20, hasSchedule: true }, spring: { label: '', startDate: null, weeks: 20, hasSchedule: false } },
  stats: { planFall: 0, planSpring: 0, coreFall: 0, coreSpring: 0, scheduleOfferings: offerings.length, scheduleMeetings: 0 },
})

const profile = (doctorEnglishRequired = false): StudentProfile => ({
  name: '测试学生', studentId: '202600000000000', trainingUnit: '测试培养单位', major: '测试专业',
  category: doctorEnglishRequired ? 'ordinary_doctor' : 'academic_master', programKind: 'academic', discipline: '计算机科学与技术',
  campusPreference: '雁栖湖', english: { masterMethod: 'exempt', doctorEnglishRequired }, createdAt: '2026-08-31',
})

describe('选课重复检查', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('同一个课程编号只能选择一个班级', () => {
    const course = makeCourse('C100')
    const first = makeOffering('C100-01', course.id, '测试课程一班')
    const second = makeOffering('C100-02', course.id, '测试课程二班')
    const store = usePlannerStore()
    store.catalog = makeCatalog([course], [first, second])
    store.profile = profile()
    store.planEntries = [{ id: 'existing', courseId: course.id, offeringId: first.id, status: 'formal', isDegreeCourse: false, approvalState: 'none', retake: false, retakeReason: '', createdAt: '2026-08-31' }]

    expect(store.duplicateReason({ id: second.id, course, offering: second })).toContain('课程编号')
  })

  it('不同课程编号但课程名称相同也不能重复选择', () => {
    const firstCourse = makeCourse('C101', { name: '同名课程' })
    const secondCourse = makeCourse('C102', { name: '同名课程' })
    const first = makeOffering('C101-01', firstCourse.id, '同名课程一班')
    const second = makeOffering('C102-01', secondCourse.id, '同名课程二班')
    const store = usePlannerStore()
    store.catalog = makeCatalog([firstCourse, secondCourse], [first, second])
    store.profile = profile()
    store.planEntries = [{ id: 'existing', courseId: firstCourse.id, offeringId: first.id, status: 'formal', isDegreeCourse: false, approvalState: 'none', retake: false, retakeReason: '', createdAt: '2026-08-31' }]

    expect(store.duplicateReason({ id: second.id, course: secondCourse, offering: second })).toContain('课程名称')
  })

  it('博士英语B允许同一课程号下同时选择读写类和听说类', () => {
    const course = makeCourse('180089050200DB001H', { name: '英语B', department: '外语系', attribute: '公共必修课', level: '博士课程' })
    const reading = makeOffering('180089050200DB001H-W01', course.id, '英语B-01班（怀）-高级写作')
    const listening = makeOffering('180089050200DB001H-S02', course.id, '英语B-02班（怀）-高级听说')
    const store = usePlannerStore()
    store.catalog = makeCatalog([course], [reading, listening])
    store.profile = profile(true)
    store.planEntries = [{ id: 'reading', courseId: course.id, offeringId: reading.id, status: 'formal', isDegreeCourse: false, approvalState: 'none', retake: false, retakeReason: '', createdAt: '2026-08-31' }]

    expect(store.duplicateReason({ id: listening.id, course, offering: listening })).toBeNull()
  })
})
