import { describe, expect, it } from 'vitest'
import { createCatalogIndex } from '../src/domain/catalog'
import { categoryRules, evaluatePlan, isDegreeCourseEligible, isDisciplineMatch, isFirstLevelDisciplineMatch, stageCreditTargets } from '../src/domain/requirements'
import type { Catalog, Course, CourseOffering, PlanEntry, StudentCategory, StudentProfile } from '../src/types'

const makeCourse = (id: string, overrides: Partial<Course> = {}): Course => ({
  id: `fall:${id}`, term: 'fall', baseCode: id, name: id, englishName: '', department: '测试院系', campuses: ['雁栖湖'],
  attribute: '专业课', level: '硕博通用课程', subject: '计算机科学与技术', firstLevelDiscipline: '计算机科学与技术',
  sharedSubjects: [], sharedFirstLevels: [], sharedAttributes: [], sharedLevels: [], hours: 32, credits: 3,
  professionalProgramCourse: false, isBenYan: false, sourceKinds: ['test'], ...overrides,
})

const makeOffering = (id: string, courseId: string, name: string): CourseOffering => ({
  id: `fall:${id}`, courseId, term: 'fall', offeringCode: id, name, campus: '雁栖湖', capacity: 50, enrolled: 0,
  teachingMethod: '', examMethod: '', leadProfessor: '', teachers: [], meetings: [],
})

const makeEntry = (id: string, course: Course, offering: CourseOffering | null = null, degree = true): PlanEntry => ({
  id, courseId: course.id, offeringId: offering?.id ?? null, status: 'formal', isDegreeCourse: degree,
  approvalState: degree ? 'confirmed' : 'none', retake: false, retakeReason: '', createdAt: '2026-08-31',
})

const profile = (category: StudentCategory): StudentProfile => ({
  name: '测试学生', studentId: '202600000000000', trainingUnit: '测试培养单位', major: '测试专业',
  category,
  programKind: category === 'engineering_master' || category === 'engineering_doctor' || category === 'professional_master' ? 'professional' : 'academic',
  discipline: '计算机科学与技术', campusPreference: '雁栖湖',
  english: { masterMethod: 'exempt', doctorEnglishRequired: ['ordinary_doctor', 'engineering_doctor', 'direct_doctor'].includes(category) },
  createdAt: '2026-08-31',
})

const makeCatalog = (courses: Course[], offerings: CourseOffering[] = []): Catalog => ({
  schemaVersion: 1, dataVersion: 'test', generatedAt: '', courses, offerings, disciplines: [], professionalFields: [], diagnostics: [],
  termConfig: { fall: { label: '', startDate: '2026-08-31', weeks: 22, hasSchedule: true }, spring: { label: '', startDate: null, weeks: 20, hasSchedule: false } },
  stats: { planFall: 0, planSpring: 0, coreFall: 0, coreSpring: 0, scheduleOfferings: offerings.length, scheduleMeetings: 0 },
})

describe('培养要求矩阵', () => {
  it.each<StudentCategory>([
    'academic_master', 'ordinary_doctor', 'direct_doctor', 'engineering_doctor', 'engineering_master', 'professional_master',
  ])('%s 的本学科主口径均为一级学科', (category) => {
    const ownCourse = makeCourse('OWN')
    const sameMajorOnly = makeCourse('MAJOR-ONLY', { firstLevelDiscipline: '电子科学与技术', subject: '计算机科学与技术' })
    expect(isFirstLevelDisciplineMatch(profile(category), ownCourse)).toBe(true)
    expect(isFirstLevelDisciplineMatch(profile(category), sameMajorOnly)).toBe(false)
  })

  it('专业学位类别或领域仅作为培养课程的可选补充匹配', () => {
    const fieldCourse = makeCourse('FIELD', { firstLevelDiscipline: '电子科学与技术', subject: '电子信息' })
    const engineeringProfile = profile('engineering_master')
    expect(isDisciplineMatch(engineeringProfile, fieldCourse)).toBe(false)
    expect(isDisciplineMatch({ ...engineeringProfile, professionalField: '电子信息' }, fieldCourse)).toBe(true)
    expect(isFirstLevelDisciplineMatch({ ...engineeringProfile, professionalField: '电子信息' }, fieldCourse)).toBe(false)
  })

  it.each<[StudentCategory, number, number, number, number]>([
    ['academic_master', 12, 2, 2, 2],
    ['ordinary_doctor', 4, 0, 0, 0],
    ['direct_doctor', 16, 2, 2, 2],
    ['engineering_doctor', 4, 0, 0, 0],
    ['engineering_master', 12, 2, 2, 2],
    ['professional_master', 12, 2, 2, 2],
  ])('%s 使用正确目标', (category, credits, core, professional, publicElective) => {
    expect(categoryRules[category]).toMatchObject({ degreeCredits: credits, core, professional, publicElective })
    expect(stageCreditTargets[category]).toBe(['ordinary_doctor', 'direct_doctor', 'engineering_doctor'].includes(category) ? 38 : 30)
    const report = evaluatePlan(profile(category), [], [], createCatalogIndex(makeCatalog([])), 'fall')
    expect(report.stageCredits).toBe(0)
    expect(report.items.find((item) => item.key === 'stage-credits')?.target).toBe(stageCreditTargets[category])
    expect(report.items.find((item) => item.key === 'degree-credits')?.target).toBe(credits)
    expect(Boolean(report.items.find((item) => item.key === 'public-elective'))).toBe(publicElective > 0)
  })

  it('学术型硕士按本学科已确认学位课完成2+2，跨学科核心课不冒充本学科结构', () => {
    const courses = [
      makeCourse('C1', { attribute: '学科核心课' }), makeCourse('C2', { attribute: '专业核心课' }),
      makeCourse('P1'), makeCourse('P2'),
      makeCourse('OTHER', { attribute: '学科核心课', firstLevelDiscipline: '物理学', subject: '物理学' }),
      makeCourse('PE', { name: '公共选修', attribute: '公共选修课', credits: 2 }),
    ]
    const entries = courses.map((course, index) => makeEntry(String(index), course, null, course.baseCode !== 'PE'))
    const report = evaluatePlan(profile('academic_master'), entries, [], createCatalogIndex(makeCatalog(courses)), 'fall')
    expect(report.stageCredits).toBe(17)
    expect(report.degreeCredits).toBe(15)
    expect(report.coreCount).toBe(2)
    expect(report.professionalCount).toBe(2)
    expect(report.publicElectiveCredits).toBe(2)
  })

  it('专业课结构只统计已确认学位课，并兼容课程属性中的空白字符', () => {
    const course = makeCourse('PRO', { attribute: ' 专业课 ' })
    const pendingReport = evaluatePlan(profile('academic_master'), [makeEntry('pending', course, null, false)], [], createCatalogIndex(makeCatalog([course])), 'fall')
    expect(pendingReport.professionalCount).toBe(0)
    expect(pendingReport.items.find((item) => item.key === 'professional-count')?.detail).toContain('需设为学位课')

    const confirmedReport = evaluatePlan(profile('academic_master'), [makeEntry('confirmed', course)], [], createCatalogIndex(makeCatalog([course])), 'fall')
    expect(confirmedReport.professionalCount).toBe(1)
  })

  it('公共课程不能冒充专业学位课', () => {
    const publicCourse = makeCourse('PUBLIC', { attribute: '公共必修课', credits: 3 })
    const report = evaluatePlan(profile('academic_master'), [makeEntry('public', publicCourse)], [], createCatalogIndex(makeCatalog([publicCourse])), 'fall')
    expect(report.degreeCredits).toBe(0)
  })

  it.each(['研讨课', '实验课', '实践课', '科学前沿讲座'])("%s不能设置为学位课", (attribute) => {
    expect(isDegreeCourseEligible(profile('academic_master'), makeCourse(`NO-DEGREE-${attribute}`, { attribute }))).toBe(false)
  })

  it.each(['学科核心课', '专业核心课', '专业课'])("%s可以设置为学位课", (attribute) => {
    expect(isDegreeCourseEligible(profile('academic_master'), makeCourse(`DEGREE-${attribute}`, { attribute }))).toBe(true)
  })

  it('英语A线下课必须恰好选择一门', () => {
    const courses = [
      makeCourse('EA1', { name: '英语A-学术读写', department: '外语系', attribute: '公共必修课', credits: 3 }),
      makeCourse('EA2', { name: '英语A-学术听说', department: '外语系', attribute: '公共必修课', credits: 3 }),
    ]
    const masterProfile = { ...profile('academic_master'), english: { masterMethod: 'offline', doctorEnglishRequired: false } as const }
    const report = evaluatePlan(masterProfile, courses.map((course, index) => makeEntry(String(index), course, null, false)), [], createCatalogIndex(makeCatalog(courses)), 'fall')
    expect(report.items.find((item) => item.key === 'master-english')?.status).toBe('pending')
    expect(report.warnings.some((warning) => warning.includes('任选1门'))).toBe(true)
  })

  it('英语B必须同学期恰好一门读写和一门听说', () => {
    const courses = [
      makeCourse('BR1', { name: '英语B-高级写作', department: '外语系', attribute: '公共必修课', credits: 1 }),
      makeCourse('BR2', { name: '英语B-高级读写', department: '外语系', attribute: '公共必修课', credits: 1 }),
      makeCourse('BL1', { name: '英语B-高级听说', department: '外语系', attribute: '公共必修课', credits: 1 }),
    ]
    const report = evaluatePlan(profile('ordinary_doctor'), courses.map((course, index) => makeEntry(String(index), course, null, false)), [], createCatalogIndex(makeCatalog(courses)), 'fall')
    expect(report.items.find((item) => item.key === 'doctor-english')?.status).toBe('pending')
    expect(report.warnings.some((warning) => warning.includes('恰好选择1门'))).toBe(true)
  })

  it('普博要求一门本学科硕博通用/博士学位课和四学分，不要求公共选修', () => {
    const course = makeCourse('D1', { credits: 4, level: '博士课程' })
    const report = evaluatePlan(profile('ordinary_doctor'), [makeEntry('doctor', course)], [], createCatalogIndex(makeCatalog([course])), 'fall')
    expect(report.items.find((item) => item.key === 'doctor-degree-count')?.status).toBe('passed')
    expect(report.items.find((item) => item.key === 'doctor-degree-count')?.target).toBe(1)
    expect(report.items.some((item) => item.key === 'public-elective')).toBe(false)
    expect(report.warnings.some((warning) => warning.includes('至少1门'))).toBe(false)
  })

  it('博士英语B按具体班级名校验同学期读写类+听说类', () => {
    const reading = makeCourse('BR', { name: '英语B', department: '外语系', attribute: '公共必修课', level: '博士课程', credits: 1 })
    const listening = makeCourse('BL', { name: '英语B', department: '外语系', attribute: '公共必修课', level: '博士课程', credits: 1 })
    const readingClass = makeOffering('BR-01', reading.id, '英语B-01班（怀）-高级写作')
    const listeningClass = makeOffering('BL-01', listening.id, '英语B-02班（怀）-高级听说')
    const entries = [makeEntry('r', reading, readingClass, false), makeEntry('l', listening, listeningClass, false)]
    const report = evaluatePlan(profile('ordinary_doctor'), entries, [], createCatalogIndex(makeCatalog([reading, listening], [readingClass, listeningClass])), 'fall')
    expect(report.items.find((item) => item.key === 'doctor-english')?.status).toBe('passed')
  })

  it('10学分排除人文讲座和科学前沿，博士硕士专属专业课无效，本研层次例外', () => {
    const regular = makeCourse('R', { credits: 8 })
    const humanities = makeCourse('H', { name: '人文系列讲座', attribute: '公共选修课', credits: 1 })
    const frontier = makeCourse('F', { name: '科学前沿讲座', attribute: '科学前沿讲座', credits: 1 })
    const masterOnly = makeCourse('M', { credits: 2, level: '硕士课程' })
    const benYan = makeCourse('B', { credits: 2, level: '硕士课程', isBenYan: true })
    const courses = [regular, humanities, frontier, masterOnly, benYan]
    const report = evaluatePlan(profile('ordinary_doctor'), courses.map((course, index) => makeEntry(String(index), course, null, false)), [], createCatalogIndex(makeCatalog(courses)), 'fall')
    expect(report.effectiveCredits).toBe(10)
    expect(report.warnings.some((warning) => warning.includes('1门课程因培养层次'))).toBe(true)
  })

  it('工程硕士把专业类非学位课计入专业选修并检查工程伦理', () => {
    const elective = makeCourse('E', { credits: 2 })
    const ethics = makeCourse('ETH', { name: '工程伦理（雁栖湖慕课）', department: '工程科学学院', attribute: '公共必修课', credits: 1 })
    const entries = [makeEntry('e', elective, null, false), makeEntry('eth', ethics, null, false)]
    const report = evaluatePlan(profile('engineering_master'), entries, [], createCatalogIndex(makeCatalog([elective, ethics])), 'fall')
    expect(report.professionalElectiveCredits).toBe(2)
    expect(report.items.find((item) => item.key === 'engineering-ethics')?.status).toBe('passed')
  })

  it('普通博士单门4学分的本学科硕博通用课程可同时满足门数和学分', () => {
    const oneCourse = makeCourse('D4', { credits: 4 })
    const oneReport = evaluatePlan(profile('ordinary_doctor'), [makeEntry('one', oneCourse)], [], createCatalogIndex(makeCatalog([oneCourse])), 'fall')
    expect(oneReport.degreeCredits).toBe(4)
    expect(oneReport.items.find((item) => item.key === 'doctor-degree-count')?.status).toBe('passed')
  })

  it('公共必修身份同时校验开设单位、课程属性、培养层次、学期和教学形式', () => {
    const wrongEngineeringEthics = makeCourse('BAD-ETH', { name: '工程伦理（专业选修课慕课）', department: '工程科学学院', attribute: '学科核心课', level: '硕士课程' })
    const correctEngineeringEthics = makeCourse('GOOD-ETH', { name: '工程伦理（雁栖湖慕课）', department: '工程科学学院', attribute: '公共必修课', level: '硕博通用课程' })
    const engineeringProfile = profile('engineering_master')
    const report = evaluatePlan(
      engineeringProfile,
      [makeEntry('bad', wrongEngineeringEthics, null, false), makeEntry('good', correctEngineeringEthics, null, false)],
      [],
      createCatalogIndex(makeCatalog([wrongEngineeringEthics, correctEngineeringEthics])),
      'fall',
    )
    expect(report.items.find((item) => item.key === 'engineering-ethics')?.status).toBe('passed')

    const onlyWrongReport = evaluatePlan(
      engineeringProfile,
      [makeEntry('bad-only', wrongEngineeringEthics, null, false)],
      [],
      createCatalogIndex(makeCatalog([wrongEngineeringEthics])),
      'fall',
    )
    expect(onlyWrongReport.items.find((item) => item.key === 'engineering-ethics')?.status).toBe('pending')

    const classroomEthics = makeCourse('CLASSROOM-ETH', { name: '工程伦理', department: '工程科学学院', attribute: '公共必修课', level: '硕博通用课程' })
    const classroomOffering = makeOffering('CLASSROOM-ETH-01', classroomEthics.id, '工程伦理')
    classroomOffering.teachingMethod = '课堂讲授为主'
    const wrongMethodReport = evaluatePlan(
      engineeringProfile,
      [makeEntry('wrong-method', classroomEthics, classroomOffering, false)],
      [],
      createCatalogIndex(makeCatalog([classroomEthics], [classroomOffering])),
      'fall',
    )
    expect(wrongMethodReport.items.find((item) => item.key === 'engineering-ethics')?.status).toBe('pending')

    const masterOnlyEthics = makeCourse('MASTER-ONLY-ETH', { name: '工程伦理（雁栖湖慕课）', department: '工程科学学院', attribute: '公共必修课', level: '硕士课程' })
    const wrongAudienceReport = evaluatePlan(
      profile('engineering_doctor'),
      [makeEntry('wrong-audience', masterOnlyEthics, null, false)],
      [],
      createCatalogIndex(makeCatalog([masterOnlyEthics])),
      'fall',
    )
    expect(wrongAudienceReport.items.find((item) => item.key === 'engineering-ethics')?.status).toBe('pending')
  })

  it('学术道德通论按公共政策与管理学院识别，分论按本院系匹配而非一级学科', () => {
    const masterProfile = { ...profile('academic_master'), trainingUnit: '中国科学院大学计算机科学与技术学院', discipline: '物理学' }
    const general = makeCourse('GENERAL', { name: '学术道德与学术写作规范-通论', department: '公共政策与管理学院', attribute: '公共必修课' })
    const ownSpecific = makeCourse('OWN-SPECIFIC', {
      name: '学术道德与学术写作规范-分论', department: '计算机科学与技术学院', attribute: '公共必修课',
      subject: '其他学科', firstLevelDiscipline: '其他学科',
    })
    const otherSpecific = makeCourse('OTHER-SPECIFIC', {
      name: '学术道德与学术写作规范-分论', department: '其他开设单位', attribute: '公共必修课',
      subject: '物理学', firstLevelDiscipline: '物理学',
    })
    const report = evaluatePlan(
      masterProfile,
      [makeEntry('general', general, null, false), makeEntry('own', ownSpecific, null, false), makeEntry('other', otherSpecific, null, false)],
      [],
      createCatalogIndex(makeCatalog([general, ownSpecific, otherSpecific])),
      'fall',
    )
    expect(report.items.find((item) => item.key === 'ethics-general')?.status).toBe('passed')
    expect(report.items.find((item) => item.key === 'ethics-specific')?.status).toBe('passed')

    const wrongSpecificReport = evaluatePlan(
      masterProfile,
      [makeEntry('other-only', otherSpecific, null, false)],
      [],
      createCatalogIndex(makeCatalog([otherSpecific])),
      'fall',
    )
    expect(wrongSpecificReport.items.find((item) => item.key === 'ethics-specific')?.status).toBe('pending')
  })

  it('硕士理论课和自然辩证法只在秋季且须为马克思主义学院公共必修课', () => {
    const springTheory = makeCourse('SPRING-THEORY', { name: '新时代中国特色社会主义理论与实践', term: 'spring', department: '马克思主义学院', attribute: '公共必修课' })
    const wrongDepartmentDialectics = makeCourse('BAD-DIALECTICS', { name: '自然辩证法概论', department: '其他学院', attribute: '公共必修课' })
    const report = evaluatePlan(
      profile('academic_master'),
      [makeEntry('spring-theory', springTheory, null, false), makeEntry('bad-dialectics', wrongDepartmentDialectics, null, false)],
      [],
      createCatalogIndex(makeCatalog([springTheory, wrongDepartmentDialectics])),
      'fall',
    )
    expect(report.items.find((item) => item.key === 'theory')?.status).toBe('pending')
    expect(report.items.find((item) => item.key === 'dialectics')?.status).toBe('pending')
  })
})
