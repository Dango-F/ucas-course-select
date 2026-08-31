import type { Catalog, Course, CourseChoice, CourseOffering, Term } from '../types'

export interface CatalogIndex {
  courses: Map<string, Course>
  offerings: Map<string, CourseOffering>
  offeringsByCourse: Map<string, CourseOffering[]>
}

export function createCatalogIndex(catalog: Catalog): CatalogIndex {
  const courses = new Map(catalog.courses.map((course) => [course.id, course]))
  const offerings = new Map(catalog.offerings.map((offering) => [offering.id, offering]))
  const offeringsByCourse = new Map<string, CourseOffering[]>()
  for (const offering of catalog.offerings) {
    const list = offeringsByCourse.get(offering.courseId) ?? []
    list.push(offering)
    offeringsByCourse.set(offering.courseId, list)
  }
  return { courses, offerings, offeringsByCourse }
}

export function buildChoices(catalog: Catalog, term: Term): CourseChoice[] {
  const index = createCatalogIndex(catalog)
  const choices: CourseChoice[] = []
  for (const course of catalog.courses) {
    if (course.term !== term) continue
    const offerings = index.offeringsByCourse.get(course.id) ?? []
    if (offerings.length === 0) {
      choices.push({ id: course.id, course, offering: null })
      continue
    }
    for (const offering of offerings) choices.push({ id: offering.id, course, offering })
  }
  return choices
}

export function normalizeCatalog(catalog: Catalog): Catalog {
  return {
    ...catalog,
    courses: catalog.courses.map((course) => course.name === '英语A' ? { ...course, hours: 64 } : course),
    termConfig: {
      ...catalog.termConfig,
      fall: { ...catalog.termConfig.fall, weeks: Math.max(22, catalog.termConfig.fall.weeks) },
    },
  }
}

export function mergeCatalog(base: Catalog, incoming: ImportPreviewLike): Catalog {
  const courses = new Map(base.courses.map((course) => [course.id, course]))
  const offerings = new Map(base.offerings.map((offering) => [offering.id, offering]))
  for (const course of incoming.courses) {
    const normalizedCourse = course.name === '英语A' ? { ...course, hours: 64 } : course
    const current = courses.get(normalizedCourse.id)
    const merged = current ? {
      ...current,
      ...normalizedCourse,
      name: normalizedCourse.name || current.name,
      englishName: normalizedCourse.englishName || current.englishName,
      department: normalizedCourse.department || current.department,
      attribute: normalizedCourse.attribute || current.attribute,
      level: normalizedCourse.level || current.level,
      subject: normalizedCourse.subject || current.subject,
      firstLevelDiscipline: normalizedCourse.firstLevelDiscipline || current.firstLevelDiscipline,
      hours: normalizedCourse.hours || current.hours,
      credits: normalizedCourse.credits || current.credits,
      campuses: [...new Set([...current.campuses, ...normalizedCourse.campuses].filter(Boolean))],
      sharedSubjects: [...new Set([...current.sharedSubjects, ...normalizedCourse.sharedSubjects].filter(Boolean))],
      sharedFirstLevels: [...new Set([...current.sharedFirstLevels, ...normalizedCourse.sharedFirstLevels].filter(Boolean))],
      sharedAttributes: [...new Set([...current.sharedAttributes, ...normalizedCourse.sharedAttributes].filter(Boolean))],
      sharedLevels: [...new Set([...current.sharedLevels, ...normalizedCourse.sharedLevels].filter(Boolean))],
      sourceKinds: [...new Set([...current.sourceKinds, ...normalizedCourse.sourceKinds].filter(Boolean))],
      professionalProgramCourse: current.professionalProgramCourse || normalizedCourse.professionalProgramCourse,
      isBenYan: current.isBenYan || normalizedCourse.isBenYan,
    } : normalizedCourse
    if (merged.name === '英语A') merged.hours = 64
    courses.set(normalizedCourse.id, merged)
  }
  for (const offering of incoming.offerings) offerings.set(offering.id, offering)
  const allCourses = [...courses.values()]
  const importedTermsWithSchedule = new Set(incoming.offerings.filter((offering) => offering.meetings.length).map((offering) => offering.term))
  return normalizeCatalog({
    ...base,
    dataVersion: `${base.dataVersion}+local`,
    generatedAt: new Date().toISOString(),
    termConfig: {
      ...base.termConfig,
      fall: { ...base.termConfig.fall, hasSchedule: base.termConfig.fall.hasSchedule || importedTermsWithSchedule.has('fall') },
      spring: { ...base.termConfig.spring, hasSchedule: base.termConfig.spring.hasSchedule || importedTermsWithSchedule.has('spring') },
    },
    courses: allCourses,
    offerings: [...offerings.values()],
    disciplines: [...new Set(allCourses.filter((course) => !course.professionalProgramCourse).flatMap((course) => [course.firstLevelDiscipline, ...course.sharedFirstLevels]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    professionalFields: [...new Set(allCourses.filter((course) => course.professionalProgramCourse).flatMap((course) => [course.subject, ...course.sharedSubjects]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  })
}

type ImportPreviewLike = Pick<import('../types').ImportPreview, 'courses' | 'offerings'>

export function normalizeCourseName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[（(][^）)]*(班|怀|玉|中)[^）)]*[）)]/g, '')
    .replace(/[-—]\d+班(?=[（(]|[-—]|$)/g, '')
    .replace(/[-—_]+/g, '')
    .replace(/\s+/g, '')
    .replace(/[·•]/g, '・')
    .toLowerCase()
}

export function termLabel(term: Term): string {
  return term === 'fall' ? '2026 秋季' : '2027 春季'
}
