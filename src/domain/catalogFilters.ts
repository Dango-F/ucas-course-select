import type { Course, CourseOffering, StudentProfile } from '../types'
import { isCatalogEnglishForProfile, isCatalogPublicCompulsoryForProfile, isFirstLevelDisciplineMatch } from './requirements'

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

export function ownDisciplineCoursePriority(profile: StudentProfile, course: Course, offering?: CourseOffering | null): number {
  if (isCatalogEnglishForProfile(profile, course, offering)) return 1
  if (isAcademicEthicsWritingCourse(course)) return 3
  if (isCatalogPublicCompulsoryForProfile(profile, course, offering)) return 2
  return 0
}
