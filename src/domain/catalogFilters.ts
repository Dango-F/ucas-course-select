import type { Course, CourseOffering, StudentProfile } from '../types'
import { isCatalogEnglishForProfile, isCatalogPublicCompulsoryForProfile, isFirstLevelDisciplineMatch, isSportsPublicElective, normalizeAttribute } from './requirements'

const PLAN_DISPLAY_PRIORITY = {
  own: 0,
  nonOwn: 1,
  sports: 2,
  publicElective: 3,
  english: 4,
  publicCompulsory: 5,
  academicEthics: 6,
} as const

function compact(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '')
}

export function isAcademicEthicsWritingCourse(course: Course): boolean {
  return /^学术道德与?学术写作规范/.test(compact(course.name))
}

export function isVisibleForOwnDiscipline(profile: StudentProfile, course: Course, offering?: CourseOffering | null): boolean {
  if (compact(course.attribute) === '公共必修课') return isCatalogPublicCompulsoryForProfile(profile, course, offering)
  return isFirstLevelDisciplineMatch(profile, course)
}

/** 只供选课方案展示排序使用；不决定课程是否在目录中显示。 */
export function isOwnDisciplineForPlanDisplay(profile: StudentProfile, course: Course, offering?: CourseOffering | null): boolean {
  if (compact(course.attribute) === '公共必修课') return isCatalogPublicCompulsoryForProfile(profile, course, offering)
  return isFirstLevelDisciplineMatch(profile, course)
}

export function ownDisciplineCoursePriority(profile: StudentProfile, course: Course, offering?: CourseOffering | null): number {
  if (isCatalogEnglishForProfile(profile, course, offering)) return 1
  if (isAcademicEthicsWritingCourse(course)) return 3
  if (isCatalogPublicCompulsoryForProfile(profile, course, offering)) return 2
  return 0
}

export function ownDisciplinePlanPriority(profile: StudentProfile, course: Course, offering?: CourseOffering | null): number {
  if (isSportsPublicElective(course)) return PLAN_DISPLAY_PRIORITY.sports
  if (normalizeAttribute(course.attribute) === '公共选修课') return PLAN_DISPLAY_PRIORITY.publicElective
  if (isCatalogEnglishForProfile(profile, course, offering)) return PLAN_DISPLAY_PRIORITY.english
  if (isAcademicEthicsWritingCourse(course)) return PLAN_DISPLAY_PRIORITY.academicEthics
  if (isCatalogPublicCompulsoryForProfile(profile, course, offering)) return PLAN_DISPLAY_PRIORITY.publicCompulsory
  return isOwnDisciplineForPlanDisplay(profile, course, offering)
    ? PLAN_DISPLAY_PRIORITY.own
    : PLAN_DISPLAY_PRIORITY.nonOwn
}
