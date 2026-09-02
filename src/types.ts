export type Term = 'fall' | 'spring'

export type StudentCategory =
  | 'academic_master'
  | 'ordinary_doctor'
  | 'direct_doctor'
  | 'engineering_doctor'
  | 'engineering_master'
  | 'professional_master'

export type ProgramKind = 'academic' | 'professional'
export type MasterEnglishMethod = 'exempt' | 'mooc' | 'offline' | 'not_applicable'

export interface EnglishPlan {
  masterMethod: MasterEnglishMethod
  doctorEnglishRequired: boolean
}

export interface StudentProfile {
  name: string
  studentId: string
  trainingUnit: string
  major: string
  category: StudentCategory
  programKind: ProgramKind
  discipline: string
  professionalField?: string
  campusPreference: string
  english: EnglishPlan
  createdAt: string
}

export interface Meeting {
  weeks: number[]
  weekday: number
  periods: number[]
  room: string
  rawWeeks: string
  rawTime: string
}

export interface Course {
  id: string
  term: Term
  baseCode: string
  name: string
  englishName: string
  department: string
  campuses: string[]
  attribute: string
  level: string
  subject: string
  firstLevelDiscipline: string
  sharedSubjects: string[]
  sharedFirstLevels: string[]
  sharedAttributes: string[]
  sharedLevels: string[]
  hours: number
  credits: number
  professionalProgramCourse: boolean
  isBenYan: boolean
  sourceKinds: string[]
}

export interface CourseOffering {
  id: string
  courseId: string
  term: Term
  offeringCode: string
  name: string
  campus: string
  capacity: number
  enrolled: number
  teachingMethod: string
  examMethod: string
  leadProfessor: string
  teachers: string[]
  meetings: Meeting[]
}

export interface ScheduleExportRow {
  sequence: number
  entryId?: string
  term: Term
  name: string
  courseCode: string
  attribute: string
  level: string
  hours: number
  credits: number
  degreeLabel: string
  teachers: string
  leadProfessor: string
  campus: string
  capacityLabel: string
  teachingMethod: string
  examMethod: string
  meetings: Meeting[]
  conflict: boolean
}

export interface CatalogStats {
  planFall: number
  planSpring: number
  coreFall: number
  coreSpring: number
  scheduleOfferings: number
  scheduleMeetings: number
  scheduleRows?: number
}

export interface Catalog {
  schemaVersion: number
  dataVersion: string
  generatedAt: string
  termConfig: Record<Term, { label: string; startDate: string | null; weeks: number; hasSchedule: boolean }>
  courses: Course[]
  offerings: CourseOffering[]
  disciplines: string[]
  professionalFields: string[]
  diagnostics: Array<Record<string, unknown>>
  stats: CatalogStats
}

export type PlanStatus = 'formal' | 'backup'
export type ApprovalState = 'none' | 'pending' | 'confirmed'

export interface PlanEntry {
  id: string
  courseId: string
  offeringId: string | null
  status: PlanStatus
  isDegreeCourse: boolean
  approvalState: ApprovalState
  retake: boolean
  retakeReason: string
  createdAt: string
}

export interface CompletedCourse {
  id: string
  name: string
  term: string
  credits: number
  isRetake: boolean
  note: string
}

export interface TranscriptIdentity {
  name: string
  studentId: string
  trainingUnit: string
  category: string
  major: string
}

export interface TranscriptRow {
  term: string
  name: string
  source: '正式方案' | '备选池'
  hours: number
  credits: number
  grade: string
  degree: string
}

export interface RequirementItem {
  key: string
  label: string
  current: number
  target: number
  unit: '学分' | '门' | '项'
  status: 'passed' | 'warning' | 'pending'
  detail: string
}

export interface RequirementReport {
  items: RequirementItem[]
  stageCredits: number
  effectiveCredits: number
  degreeCredits: number
  coreCount: number
  professionalCount: number
  publicElectiveCredits: number
  professionalElectiveCredits: number
  warnings: string[]
}

export interface CourseChoice {
  id: string
  course: Course
  offering: CourseOffering | null
}

export interface CourseConflict {
  entryA: string
  entryB: string
  courseA: string
  courseB: string
  weekday: number
  periods: number[]
  weeks: number[]
}

export interface PersistedState {
  schemaVersion: number
  profile: StudentProfile | null
  planEntries: PlanEntry[]
  completedCourses: CompletedCourse[]
  activeTerm: Term
  customCatalog: Catalog | null
}

export interface ImportPreview {
  kind: 'plan' | 'core' | 'schedule' | 'unknown'
  fileName: string
  courses: Course[]
  offerings: CourseOffering[]
  diagnostics: string[]
  rowsRead: number
  summary: {
    added: number
    overwritten: number
    unmatched: number
    missingFields: number
  }
}
