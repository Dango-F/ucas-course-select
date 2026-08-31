import type { CatalogIndex } from './catalog'
import type { CompletedCourse, Course, CourseOffering, PlanEntry, RequirementItem, RequirementReport, StudentCategory, StudentProfile, Term } from '../types'

const CORE_ATTRIBUTES = ['学科核心课', '专业核心课']
const PROFESSIONAL_ATTRIBUTES = ['学科核心课', '专业核心课', '专业课', '研讨课', '实验课', '实践课', '科学前沿讲座']
const MASTER_TYPES: StudentCategory[] = ['academic_master', 'engineering_master', 'professional_master', 'direct_doctor']
const DOCTOR_TYPES: StudentCategory[] = ['ordinary_doctor', 'engineering_doctor', 'direct_doctor']
const PUBLIC_COMPULSORY_ATTRIBUTE = '公共必修课'
const FOREIGN_LANGUAGE_DEPARTMENT = '外语系'
const MARXISM_DEPARTMENT = '马克思主义学院'
const PUBLIC_POLICY_DEPARTMENT = '公共政策与管理学院'
const ENGINEERING_SCIENCE_DEPARTMENT = '工程科学学院'

type CourseRecord = { course: Course; offering?: CourseOffering }
type CourseAudience = 'master' | 'doctor' | 'graduate'
type PublicCourseSpec = {
  title: RegExp
  department?: string
  terms: Term[]
  audience: CourseAudience
  teaching: 'classroom' | 'mooc'
}

export function normalizeAttribute(value: string): string {
  const normalized = value.normalize('NFKC').replace(/\s+/g, '')
  return normalized === '专业类课程' ? '专业课' : normalized
}

function normalizeIdentityText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

function recordDisplayName(record: CourseRecord): string {
  return normalizeIdentityText(record.offering?.name || record.course.name)
}

function isPublicCompulsoryCourse(course: Course): boolean {
  return normalizeAttribute(course.attribute) === PUBLIC_COMPULSORY_ATTRIBUTE
}

function isDepartment(course: Course, department: string): boolean {
  return normalizeIdentityText(course.department) === normalizeIdentityText(department)
}

function codeAudience(course: Course): CourseAudience | null {
  const code = normalizeIdentityText(course.baseCode)
  if (/db/.test(code)) return 'doctor'
  if (/mb/.test(code)) return 'master'
  if (/pb/.test(code)) return 'graduate'
  return null
}

function audienceCodeAllowed(audience: CourseAudience, codeAudienceValue: CourseAudience | null): boolean {
  if (!codeAudienceValue) return true
  if (audience === 'graduate') return codeAudienceValue === 'graduate'
  return codeAudienceValue === audience || codeAudienceValue === 'graduate'
}

function isAudienceAllowed(course: Course, audience: CourseAudience): boolean {
  const level = normalizeIdentityText(course.level)
  if (!audienceCodeAllowed(audience, codeAudience(course))) return false
  if (!level) return true
  if (/本科/.test(level)) return false
  if (audience === 'master') return !/博士/.test(level)
  if (audience === 'doctor') return !/硕士/.test(level)
  return /硕博|研究生/.test(level) || !/硕士|博士/.test(level)
}

function isClassroomTeaching(record: CourseRecord): boolean {
  const method = normalizeIdentityText(record.offering?.teachingMethod || '')
  if (!method) return true
  if (/慕课|mooc|线上|在线|网络|自主学习/.test(method)) return false
  return /课堂|讲授|面授/.test(method)
}

function isMoocTeaching(record: CourseRecord): boolean {
  const text = `${record.course.name} ${record.offering?.name || ''} ${record.offering?.teachingMethod || ''}`.normalize('NFKC')
  return /慕课|mooc|线上|在线|网络课程|自主学习/i.test(text)
}

function isPublicCourse(record: CourseRecord, spec: PublicCourseSpec): boolean {
  return spec.title.test(normalizeIdentityText(record.course.name))
    && (!spec.department || isDepartment(record.course, spec.department))
    && isPublicCompulsoryCourse(record.course)
    && spec.terms.includes(record.course.term)
    && isAudienceAllowed(record.course, spec.audience)
    && (spec.teaching === 'mooc' ? isMoocTeaching(record) : isClassroomTeaching(record))
}

function isMasterEnglishMooc(record: CourseRecord): boolean {
  return isPublicCourse(record, { title: /^硕士学位英语.*慕课/, department: FOREIGN_LANGUAGE_DEPARTMENT, terms: ['fall', 'spring'], audience: 'master', teaching: 'mooc' })
}

function isMasterEnglishOffline(record: CourseRecord): boolean {
  return isPublicCourse(record, { title: /^英语a(?:$|[-(（])/, department: FOREIGN_LANGUAGE_DEPARTMENT, terms: ['fall', 'spring'], audience: 'master', teaching: 'classroom' })
    && /学术读写|学术听说/.test(recordDisplayName(record))
    && !isMoocTeaching(record)
}

function isDoctorEnglishClass(record: CourseRecord, part: 'reading' | 'listening'): boolean {
  if (!isPublicCourse(record, { title: /^英语b(?:$|[-(（])/, department: FOREIGN_LANGUAGE_DEPARTMENT, terms: ['fall', 'spring'], audience: 'doctor', teaching: 'classroom' })) return false
  return part === 'reading'
    ? /高级读写|高级写作|学术论文写作/.test(recordDisplayName(record))
    : /高级听说|高级口语/.test(recordDisplayName(record))
}

function isTheoryCourse(record: CourseRecord): boolean {
  return isPublicCourse(record, { title: /^新时代中国特色社会主义理论与实践$/, department: MARXISM_DEPARTMENT, terms: ['fall'], audience: 'master', teaching: 'classroom' })
}

function isDialecticsCourse(record: CourseRecord): boolean {
  return isPublicCourse(record, { title: /^自然辩证法概论$/, department: MARXISM_DEPARTMENT, terms: ['fall'], audience: 'master', teaching: 'classroom' })
}

function isMarxismCourse(record: CourseRecord): boolean {
  return isPublicCourse(record, { title: /^中国马克思主义与当代$/, department: MARXISM_DEPARTMENT, terms: ['fall', 'spring'], audience: 'doctor', teaching: 'classroom' })
}

function isEthicsGeneralCourse(record: CourseRecord): boolean {
  return isPublicCourse(record, { title: /^学术道德与学术写作规范.*通论/, department: PUBLIC_POLICY_DEPARTMENT, terms: ['fall', 'spring'], audience: 'graduate', teaching: 'classroom' })
}

function isEthicsSpecificCourse(profile: StudentProfile, record: CourseRecord): boolean {
  return isPublicCourse(record, { title: /^学术道德与学术写作规范.*分论/, terms: ['fall', 'spring'], audience: 'graduate', teaching: 'classroom' })
    && isDisciplineMatch(profile, record.course)
}

function isEngineeringEthicsCourse(profile: StudentProfile, record: CourseRecord): boolean {
  const audience: CourseAudience = profile.category === 'engineering_doctor' ? 'doctor' : 'master'
  return isPublicCourse(record, { title: /^工程伦理/, department: ENGINEERING_SCIENCE_DEPARTMENT, terms: ['fall', 'spring'], audience, teaching: 'mooc' })
}

function historySeason(term: string): Term | null {
  if (/秋/.test(term)) return 'fall'
  if (/春/.test(term)) return 'spring'
  return null
}

function resolveHistoricalCourseRecords(completed: CompletedCourse[], index: CatalogIndex): CourseRecord[] {
  return completed.flatMap((history) => {
    const targetName = normalizeIdentityText(history.name)
    const season = historySeason(history.term)
    const candidates: CourseRecord[] = []
    for (const course of index.courses.values()) {
      if (season && course.term !== season) continue
      if (normalizeIdentityText(course.name) === targetName) candidates.push({ course })
      for (const offering of index.offeringsByCourse.get(course.id) ?? []) {
        if (normalizeIdentityText(offering.name) === targetName) candidates.push({ course, offering })
      }
    }
    const unique = [...new Map(candidates.map((record) => [`${record.course.id}|${record.offering?.id || ''}`, record])).values()]
    const identityGroups = new Set(unique.map((record) => `${normalizeIdentityText(record.course.name)}|${normalizeIdentityText(record.course.department)}|${normalizeAttribute(record.course.attribute)}|${record.course.term}`))
    if (!unique.length || identityGroups.size !== 1) return []
    return [unique[0]]
  })
}

export const categoryLabels: Record<StudentCategory, string> = {
  academic_master: '硕士（学术型）',
  ordinary_doctor: '普通博士',
  direct_doctor: '硕博连读生 / 直博生',
  engineering_doctor: '工程博士',
  engineering_master: '工程硕士',
  professional_master: '其他专业学位硕士',
}

export const categoryRules: Record<StudentCategory, { degreeCredits: number; core: number; professional: number; publicElective: number; professionalElective: number; doctorDegreeCount: number }> = {
  academic_master: { degreeCredits: 12, core: 2, professional: 2, publicElective: 2, professionalElective: 0, doctorDegreeCount: 0 },
  ordinary_doctor: { degreeCredits: 4, core: 0, professional: 0, publicElective: 0, professionalElective: 0, doctorDegreeCount: 2 },
  direct_doctor: { degreeCredits: 16, core: 2, professional: 2, publicElective: 2, professionalElective: 0, doctorDegreeCount: 0 },
  engineering_doctor: { degreeCredits: 4, core: 0, professional: 0, publicElective: 0, professionalElective: 0, doctorDegreeCount: 2 },
  engineering_master: { degreeCredits: 12, core: 2, professional: 2, publicElective: 2, professionalElective: 2, doctorDegreeCount: 0 },
  professional_master: { degreeCredits: 12, core: 2, professional: 2, publicElective: 2, professionalElective: 0, doctorDegreeCount: 0 },
}

function item(key: string, label: string, current: number, target: number, unit: RequirementItem['unit'], detail: string): RequirementItem {
  return { key, label, current, target, unit, status: current >= target ? 'passed' : current > 0 ? 'warning' : 'pending', detail }
}

export function isDisciplineMatch(profile: StudentProfile, course: import('../types').Course): boolean {
  if (!profile.discipline) return false
  if (profile.programKind === 'academic') {
    return course.firstLevelDiscipline === profile.discipline || course.sharedFirstLevels.includes(profile.discipline) || course.subject === profile.discipline
  }
  return course.subject === profile.discipline || course.sharedSubjects.includes(profile.discipline) || course.sharedFirstLevels.includes(profile.discipline)
}

export function effectiveCourseTaxonomy(profile: StudentProfile, course: import('../types').Course): { attribute: string; level: string } {
  const directMatch = profile.programKind === 'academic'
    ? course.firstLevelDiscipline === profile.discipline || course.subject === profile.discipline
    : course.subject === profile.discipline
  if (directMatch) return { attribute: course.attribute, level: course.level }
  const sharedIndex = course.sharedSubjects.findIndex((item) => item === profile.discipline)
  const firstLevelIndex = course.sharedFirstLevels.findIndex((item) => item === profile.discipline)
  const index = sharedIndex >= 0 ? sharedIndex : firstLevelIndex
  if (index < 0) return { attribute: course.attribute, level: course.level }
  return {
    attribute: course.sharedAttributes[index] || course.sharedAttributes[0] || course.attribute,
    level: course.sharedLevels[index] || course.sharedLevels[0] || course.level,
  }
}

export function isDegreeCourseEligible(profile: StudentProfile, course: Course): boolean {
  return PROFESSIONAL_ATTRIBUTES.includes(normalizeAttribute(effectiveCourseTaxonomy(profile, course).attribute))
}

export function isSportsPublicElective(course: Course): boolean {
  return course.subject === '体育学' && normalizeAttribute(course.attribute) === '公共选修课'
}

function isLevelValid(profile: StudentProfile, course: import('../types').Course): boolean {
  if (course.isBenYan) return true
  const { attribute, level } = effectiveCourseTaxonomy(profile, course)
  const normalizedAttribute = normalizeAttribute(attribute)
  if (/本科/.test(level) && PROFESSIONAL_ATTRIBUTES.includes(normalizedAttribute)) return false
  if (DOCTOR_TYPES.includes(profile.category) && /硕士/.test(level) && !/硕博通用/.test(level) && PROFESSIONAL_ATTRIBUTES.includes(normalizedAttribute)) return false
  return true
}

export function evaluatePlan(
  profile: StudentProfile,
  entries: PlanEntry[],
  completed: CompletedCourse[],
  index: CatalogIndex,
  activeTerm: Term,
): RequirementReport {
  const rules = categoryRules[profile.category]
  const formal = entries.filter((entry) => entry.status === 'formal')
  const selected = formal.flatMap((entry) => {
    const course = index.courses.get(entry.courseId)
    const offering = entry.offeringId ? index.offerings.get(entry.offeringId) : undefined
    return course ? [{ entry, course, offering }] : []
  })
  const valid = selected.filter(({ course }) => isLevelValid(profile, course))
  const effective = valid.filter(({ course }) => course.term === activeTerm && !/人文系列讲座|科学前沿讲座/.test(course.name))
  const degree = valid.filter(({ entry, course }) => entry.isDegreeCourse && entry.approvalState === 'confirmed' && isDegreeCourseEligible(profile, course))
  const degreeCredits = degree.reduce((sum, { course }) => sum + course.credits, 0)
  const selectedCore = valid.filter(({ course }) => isDisciplineMatch(profile, course) && CORE_ATTRIBUTES.includes(normalizeAttribute(effectiveCourseTaxonomy(profile, course).attribute)))
  const coreCount = selectedCore.filter(({ entry }) => entry.isDegreeCourse && entry.approvalState === 'confirmed').length
  const corePendingCount = selectedCore.length - coreCount
  const coreDetail = selectedCore.length
    ? `已选${selectedCore.length}门，已计入${coreCount}门；${corePendingCount ? `还有${corePendingCount}门需设为学位课并完成认可` : '均已设为学位课并完成认可'}`
    : '仅统计本学科属性为“学科核心课”或“专业核心课”且已确认的学位课'
  const selectedProfessional = valid.filter(({ course }) => isDisciplineMatch(profile, course) && normalizeAttribute(effectiveCourseTaxonomy(profile, course).attribute) === '专业课')
  const professionalCount = selectedProfessional.filter(({ entry }) => entry.isDegreeCourse && entry.approvalState === 'confirmed').length
  const professionalPendingCount = selectedProfessional.length - professionalCount
  const professionalDetail = selectedProfessional.length
    ? `已选${selectedProfessional.length}门，已计入${professionalCount}门；${professionalPendingCount ? `还有${professionalPendingCount}门需设为学位课并完成认可` : '均已设为学位课并完成认可'}`
    : '仅统计本学科属性为“专业课”且已确认的学位课'
  const publicElectiveCredits = valid.filter(({ course }) => normalizeAttribute(course.attribute) === '公共选修课').reduce((sum, { course }) => sum + course.credits, 0)
  const professionalElectiveCredits = valid
    .filter(({ entry, course }) => {
      const attribute = normalizeAttribute(effectiveCourseTaxonomy(profile, course).attribute)
      return PROFESSIONAL_ATTRIBUTES.includes(attribute) && !entry.isDegreeCourse && attribute !== '科学前沿讲座'
    })
    .reduce((sum, { course }) => sum + course.credits, 0)
  const effectiveCredits = effective.reduce((sum, { course }) => sum + course.credits, 0)
  const publicRecords: CourseRecord[] = [
    ...valid.map(({ course, offering }) => ({ course, offering })),
    ...resolveHistoricalCourseRecords(completed, index).filter(({ course }) => isLevelValid(profile, course)),
  ]
  const hasPublicCourse = (predicate: (record: CourseRecord) => boolean) => publicRecords.some(predicate)
  const masterMoocCourses = publicRecords.filter(isMasterEnglishMooc)
  const masterOfflineCourses = publicRecords.filter(isMasterEnglishOffline)
  const bReading = publicRecords.filter((item) => isDoctorEnglishClass(item, 'reading'))
  const bListening = publicRecords.filter((item) => isDoctorEnglishClass(item, 'listening'))
  const doctorEnglishComplete = bReading.length === 1 && bListening.length === 1 && bReading[0].course.term === bListening[0].course.term
  const warnings: string[] = []
  const requirementItems: RequirementItem[] = [
    item('term-credits', `${activeTerm === 'fall' ? '秋季' : '春季'}有效学分`, effectiveCredits, 10, '学分', '不含人文系列讲座和科学前沿讲座'),
    item('degree-credits', '专业学位课', degreeCredits, rules.degreeCredits, '学分', '仅统计已确认并获认可的学位课'),
  ]

  if (rules.core) requirementItems.push(item('core-count', '核心课结构', coreCount, rules.core, '门', coreDetail))
  if (rules.professional) requirementItems.push(item('professional-count', '专业课结构', professionalCount, rules.professional, '门', professionalDetail))
  if (rules.doctorDegreeCount) requirementItems.push(item('doctor-degree-count', '博士专业学位课门数', degree.length, rules.doctorDegreeCount, '门', '至少2门，且合计至少4学分'))
  if (rules.publicElective) requirementItems.push(item('public-elective', '公共选修', publicElectiveCredits, rules.publicElective, '学分', '秋春两学期合计'))
  if (rules.professionalElective) requirementItems.push(item('professional-elective', '专业选修', professionalElectiveCredits, rules.professionalElective, '学分', '专业类非学位课'))

  const publicChecks: Array<[string, string, boolean, string]> = []
  if (MASTER_TYPES.includes(profile.category)) {
    publicChecks.push(
      ['theory', '新时代中国特色社会主义理论与实践', hasPublicCourse(isTheoryCourse), '马克思主义学院 · 公共必修课 · 秋季'],
      ['dialectics', '自然辩证法概论', hasPublicCourse(isDialecticsCourse), '马克思主义学院 · 公共必修课 · 秋季'],
    )
    const masterEnglish = profile.english.masterMethod === 'exempt'
      || (profile.english.masterMethod === 'mooc' && masterMoocCourses.length === 1)
      || (profile.english.masterMethod === 'offline' && masterOfflineCourses.length === 1)
    publicChecks.push(['master-english', '硕士学位英语', masterEnglish, profile.english.masterMethod === 'exempt' ? '免修免考' : '3学分'])
  }
  if (DOCTOR_TYPES.includes(profile.category)) {
    publicChecks.push(['marxism', '中国马克思主义与当代', hasPublicCourse(isMarxismCourse), '马克思主义学院 · 公共必修课 · 秋春均可'])
    publicChecks.push(['doctor-english', '博士学位英语B', doctorEnglishComplete, '同学期恰好读写类+听说类各1门，共2学分'])
  }
  publicChecks.push(
    ['ethics-general', '学术道德与写作规范·通论', hasPublicCourse(isEthicsGeneralCourse), '公共政策与管理学院 · 公共必修课 · 秋春均可'],
    ['ethics-specific', '学术道德与写作规范·分论', hasPublicCourse((record) => isEthicsSpecificCourse(profile, record)), '所属学科与学生培养学科匹配 · 公共必修课 · 秋春均可'],
  )
  if (['engineering_master', 'engineering_doctor'].includes(profile.category)) {
    publicChecks.push(['engineering-ethics', '工程伦理', hasPublicCourse((record) => isEngineeringEthicsCourse(profile, record)), '工程科学学院 · 公共必修课 · 慕课 · 秋春均可'])
  }
  for (const [key, label, passed, detail] of publicChecks) requirementItems.push(item(key, label, passed ? 1 : 0, 1, '项', detail))

  if (MASTER_TYPES.includes(profile.category) && profile.english.masterMethod === 'offline' && masterOfflineCourses.length > 1) {
    warnings.push(`线下英语A须在学术读写和学术听说中任选1门，当前正式方案有${masterOfflineCourses.length}门。`)
  }
  if (MASTER_TYPES.includes(profile.category) && profile.english.masterMethod === 'mooc' && masterMoocCourses.length > 1) {
    warnings.push(`线上硕士英语慕课按1门3学分规划，当前正式方案有${masterMoocCourses.length}门。`)
  }
  if (DOCTOR_TYPES.includes(profile.category) && (bReading.length + bListening.length > 0) && !doctorEnglishComplete) {
    warnings.push('博士英语B须在同一学期恰好选择1门读写类和1门听说类课程。')
  }
  const sportsByTerm = new Map<Term, number>()
  for (const { course } of valid.filter(({ course }) => isSportsPublicElective(course))) {
    sportsByTerm.set(course.term, (sportsByTerm.get(course.term) ?? 0) + 1)
  }
  for (const [term, count] of sportsByTerm) if (count > 1) warnings.push(`${term === 'fall' ? '秋季' : '春季'}体育公共选修已选${count}门，每学期最多1门。`)
  if (DOCTOR_TYPES.includes(profile.category)) {
    const qualifying = degree.filter(({ course }) => {
      const taxonomy = effectiveCourseTaxonomy(profile, course)
      return isDisciplineMatch(profile, course) && CORE_ATTRIBUTES.concat('专业课').includes(normalizeAttribute(taxonomy.attribute)) && ['硕博通用课程', '博士课程'].includes(taxonomy.level)
    })
    if (qualifying.length < 1) warnings.push('博士生还需至少1门本学科硕博通用或博士专属核心课/专业课作为学位课。')
  }
  if (profile.category === 'professional_master') warnings.push('其他专业学位硕士的培养方案附加要求需要本人和导师另行确认。')
  const invalidCount = selected.length - valid.length
  if (invalidCount) warnings.push(`${invalidCount}门课程因培养层次不适用，未计入成绩单与培养要求。`)
  if (selected.some(({ course }) => /人文系列讲座/.test(course.name))) warnings.push('人文系列讲座须全学年听满20学时后才能取得课程学分。')
  if (selected.some(({ course }) => /科学前沿讲座/.test(course.name))) warnings.push('科学前沿讲座须全学年听满20学时后才能取得课程学分。')
  if (selected.some(({ course }) => course.isBenYan)) warnings.push('已选本研层次课程；增选、中期退课、缓考、补考和重修按本科生规定执行，请在课程详情查看具体条件。')

  return { items: requirementItems, effectiveCredits, degreeCredits, coreCount, professionalCount, publicElectiveCredits, professionalElectiveCredits, warnings }
}
