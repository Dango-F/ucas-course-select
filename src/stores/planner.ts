import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { buildChoices, createCatalogIndex, mergeCatalog, normalizeCatalog, normalizeCourseName } from '../domain/catalog'
import { detectConflicts } from '../domain/conflicts'
import { evaluatePlan, isDegreeCourseEligible, isSportsPublicElective } from '../domain/requirements'
import { clearPersistedState, loadPersistedState, savePersistedState } from '../services/persistence'
import type { Catalog, CompletedCourse, Course, CourseChoice, CourseOffering, ImportPreview, PersistedState, PlanEntry, PlanStatus, StudentProfile, Term } from '../types'

const emptyCatalog = (): Catalog => ({
  schemaVersion: 1,
  dataVersion: 'loading',
  generatedAt: '',
  termConfig: {
    fall: { label: '2026 秋季', startDate: '2026-08-31', weeks: 22, hasSchedule: true },
    spring: { label: '2027 春季', startDate: null, weeks: 20, hasSchedule: false },
  },
  courses: [], offerings: [], disciplines: [], professionalFields: [], diagnostics: [],
  stats: { planFall: 0, planSpring: 0, coreFall: 0, coreSpring: 0, scheduleOfferings: 0, scheduleMeetings: 0 },
})

function normalizeStoredProfile(value: StudentProfile, catalog: Catalog): StudentProfile {
  const legacyDiscipline = value.discipline ?? ''
  const legacyProfessionalField = value.programKind === 'professional'
    && !catalog.disciplines.includes(legacyDiscipline)
    && catalog.professionalFields.includes(legacyDiscipline)
      ? legacyDiscipline
      : ''
  return {
    ...value,
    name: value.name ?? '',
    studentId: value.studentId ?? '',
    trainingUnit: value.trainingUnit ?? '',
    major: value.major ?? legacyDiscipline,
    discipline: legacyProfessionalField ? '' : legacyDiscipline,
    professionalField: value.professionalField ?? legacyProfessionalField,
  }
}

type CourseSelectionIdentity = {
  courseCode: string
  offeringCode: string
  courseName: string
  displayName: string
  englishBPart: 'reading' | 'listening' | null
}

function normalizeCourseCode(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').toUpperCase()
}

function englishBPart(course: Course, offering: CourseOffering | null): CourseSelectionIdentity['englishBPart'] {
  const courseName = course.name.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
  const attribute = course.attribute.normalize('NFKC').replace(/\s+/g, '')
  const department = course.department.normalize('NFKC').replace(/\s+/g, '')
  if (department !== '外语系' || attribute !== '公共必修课' || !/^英语b(?:$|[-(（])/.test(courseName)) return null
  const displayName = (offering?.name || course.name).normalize('NFKC').replace(/\s+/g, '').toLowerCase()
  if (/高级读写|高级写作|学术论文写作/.test(displayName)) return 'reading'
  if (/高级听说|高级口语/.test(displayName)) return 'listening'
  return null
}

function selectionIdentity(course: Course, offering: CourseOffering | null): CourseSelectionIdentity {
  const fallbackCode = course.id.includes(':') ? course.id.slice(course.id.indexOf(':') + 1) : course.id
  return {
    courseCode: normalizeCourseCode(course.baseCode || fallbackCode),
    offeringCode: normalizeCourseCode(offering?.offeringCode || ''),
    courseName: normalizeCourseName(course.name),
    displayName: normalizeCourseName(offering?.name || course.name),
    englishBPart: englishBPart(course, offering),
  }
}

function isDistinctDoctorEnglishPair(a: CourseSelectionIdentity, b: CourseSelectionIdentity): boolean {
  return Boolean(a.englishBPart && b.englishBPart && a.englishBPart !== b.englishBPart)
}

function sameCourseIdentity(a: CourseSelectionIdentity, b: CourseSelectionIdentity, allowDoctorEnglishPair: boolean): boolean {
  if (allowDoctorEnglishPair && isDistinctDoctorEnglishPair(a, b)) return false
  return Boolean(
    (a.courseCode && a.courseCode === b.courseCode)
    || (a.offeringCode && a.offeringCode === b.offeringCode)
    || (a.displayName && a.displayName === b.displayName)
    || (a.courseName && a.courseName === b.courseName),
  )
}

export const usePlannerStore = defineStore('planner', () => {
  const catalog = ref<Catalog>(emptyCatalog())
  const profile = ref<StudentProfile | null>(null)
  const planEntries = ref<PlanEntry[]>([])
  const completedCourses = ref<CompletedCourse[]>([])
  const activeTerm = ref<Term>('fall')
  const hydrated = ref(false)
  const loading = ref(true)
  const lastNotice = ref('')

  const index = computed(() => createCatalogIndex(catalog.value))
  const choices = computed(() => buildChoices(catalog.value, activeTerm.value))
  const report = computed(() => profile.value ? evaluatePlan(profile.value, planEntries.value, completedCourses.value, index.value, activeTerm.value) : null)
  const conflicts = computed(() => detectConflicts(planEntries.value, index.value))
  const formalEntries = computed(() => planEntries.value.filter((entry) => entry.status === 'formal'))
  const backupEntries = computed(() => planEntries.value.filter((entry) => entry.status === 'backup'))

  function sanitizeDegreeCourseEntries(): boolean {
    if (!profile.value) return false
    let changed = false
    const currentIndex = createCatalogIndex(catalog.value)
    planEntries.value = planEntries.value.map((entry) => {
      const course = currentIndex.courses.get(entry.courseId)
      if (!entry.isDegreeCourse || (course && isDegreeCourseEligible(profile.value!, course))) return entry
      changed = true
      return { ...entry, isDegreeCourse: false, approvalState: 'none' }
    })
    return changed
  }

  async function hydrate() {
    loading.value = true
    const [response, persisted] = await Promise.all([fetch('/data/catalog.json'), loadPersistedState()])
    const base = await response.json() as Catalog
    catalog.value = normalizeCatalog(persisted?.customCatalog ?? base)
    if (persisted) {
      profile.value = persisted.profile ? normalizeStoredProfile(persisted.profile, catalog.value) : null
      planEntries.value = persisted.planEntries ?? []
      completedCourses.value = persisted.completedCourses ?? []
      activeTerm.value = persisted.activeTerm ?? 'fall'
      if (sanitizeDegreeCourseEntries()) await persist()
    }
    hydrated.value = true
    loading.value = false
  }

  function snapshot(): PersistedState {
    return { schemaVersion: 1, profile: profile.value, planEntries: planEntries.value, completedCourses: completedCourses.value, activeTerm: activeTerm.value, customCatalog: catalog.value.dataVersion.includes('+local') ? catalog.value : null }
  }

  async function persist() { await savePersistedState(snapshot()) }

  async function setProfile(value: StudentProfile) { profile.value = value; sanitizeDegreeCourseEntries(); await persist() }
  async function setTerm(term: Term) { activeTerm.value = term; await persist() }

  function duplicateReason(choice: CourseChoice): string | null {
    const target = selectionIdentity(choice.course, choice.offering)
    const allowDoctorEnglishPair = Boolean(profile.value?.english.doctorEnglishRequired)
    const current = planEntries.value.some((entry) => {
      const course = index.value.courses.get(entry.courseId)
      const offering = entry.offeringId ? index.value.offerings.get(entry.offeringId) ?? null : null
      return course && sameCourseIdentity(target, selectionIdentity(course, offering), allowDoctorEnglishPair)
    })
    if (current) return '当前方案或备选池中已有相同课程编号、课程名称或班级展示名称。'
    if (completedCourses.value.some((course) => !course.isRetake && (normalizeCourseName(course.name) === target.displayName || normalizeCourseName(course.name) === target.courseName))) return '已修课程历史中已有同名课程。'
    return null
  }

  function formalBlockReason(course: Course, offering: CourseOffering | null, excludedEntryId = ''): string | null {
    const formalRows = formalEntries.value
      .filter((entry) => entry.id !== excludedEntryId)
      .flatMap((entry) => {
        const currentCourse = index.value.courses.get(entry.courseId)
        if (!currentCourse) return []
        const currentOffering = entry.offeringId ? index.value.offerings.get(entry.offeringId) ?? null : null
        return [{ course: currentCourse, offering: currentOffering }]
      })
    const termName = course.term === 'fall' ? '秋季' : '春季'
    if (isSportsPublicElective(course) && formalRows.some((row) => row.course.term === course.term && isSportsPublicElective(row.course))) {
      return `${termName}体育公共选修每学期最多选择1门。`
    }

    const name = normalizeCourseName(offering?.name || course.name)
    const formalNames = formalRows.map((row) => normalizeCourseName(row.offering?.name || row.course.name))
    const hasMatching = (pattern: RegExp) => formalNames.some((item) => pattern.test(item))
    if (profile.value?.english.masterMethod === 'offline' && /英语a.*(学术读写|学术听说)/.test(name) && hasMatching(/英语a.*(学术读写|学术听说)/)) {
      return '线下英语A须在学术读写和学术听说中任选1门，正式方案中已存在一门。'
    }
    if (profile.value?.english.masterMethod === 'mooc' && /硕士学位英语.*慕课|英语a.*慕课/.test(name) && hasMatching(/硕士学位英语.*慕课|英语a.*慕课/)) {
      return '线上硕士英语慕课按1门3学分规划，正式方案中已存在一门。'
    }

    if (profile.value?.english.doctorEnglishRequired) {
      const reading = /英语b.*(高级读写|高级写作|学术论文写作)/.test(name)
      const listening = /英语b.*(高级听说|高级口语)/.test(name)
      if (reading && hasMatching(/英语b.*(高级读写|高级写作|学术论文写作)/)) return '博士英语B的读写类课程只能在正式方案中选择1门。'
      if (listening && hasMatching(/英语b.*(高级听说|高级口语)/)) return '博士英语B的听说类课程只能在正式方案中选择1门。'
      const opposite = formalRows.find((row) => {
        const rowName = normalizeCourseName(row.offering?.name || row.course.name)
        return reading ? /英语b.*(高级听说|高级口语)/.test(rowName) : listening ? /英语b.*(高级读写|高级写作|学术论文写作)/.test(rowName) : false
      })
      if (opposite && opposite.course.term !== course.term) return '博士英语B的读写类和听说类必须安排在同一学期。'
    }
    return null
  }

  function formalAddBlockReason(choice: CourseChoice): string | null {
    return formalBlockReason(choice.course, choice.offering)
  }

  async function addChoice(choice: CourseChoice, status: PlanStatus, retake = false, retakeReason = '') {
    if (!retake && duplicateReason(choice)) return false
    if (!retake && planEntries.value.some((entry) => entry.offeringId === choice.offering?.id && entry.courseId === choice.course.id)) return false
    const sportBlockReason = status === 'formal' ? formalAddBlockReason(choice) : null
    if (sportBlockReason) {
      lastNotice.value = sportBlockReason
      return false
    }
    planEntries.value.push({
      id: crypto.randomUUID(), courseId: choice.course.id, offeringId: choice.offering?.id ?? null, status,
      isDegreeCourse: false, approvalState: 'none', retake, retakeReason, createdAt: new Date().toISOString(),
    })
    lastNotice.value = status === 'formal' ? '已加入正式方案' : '已加入备选池'
    await persist()
    return true
  }

  async function removeEntry(id: string) { planEntries.value = planEntries.value.filter((entry) => entry.id !== id); await persist() }
  async function clearPlanEntries() {
    planEntries.value = []
    lastNotice.value = '已清空全部正式课程和备选课程'
    await persist()
  }
  async function moveEntry(id: string, status: PlanStatus) {
    const entry = planEntries.value.find((item) => item.id === id)
    if (!entry) return false
    if (status === 'formal') {
      const course = index.value.courses.get(entry.courseId)
      const offering = entry.offeringId ? index.value.offerings.get(entry.offeringId) ?? null : null
      const blockReason = course ? formalBlockReason(course, offering, id) : null
      if (blockReason) {
        lastNotice.value = blockReason
        return false
      }
    }
    entry.status = status
    await persist()
    return true
  }
  async function setDegreeCourse(id: string, enabled: boolean, approved = false) {
    const entry = planEntries.value.find((item) => item.id === id)
    if (!entry) return
    const course = index.value.courses.get(entry.courseId)
    if (enabled && (!profile.value || !course || !isDegreeCourseEligible(profile.value, course))) {
      lastNotice.value = '只有学科核心课、专业核心课和专业课可以设置为学位课。'
      return
    }
    entry.isDegreeCourse = enabled
    entry.approvalState = enabled ? (approved ? 'confirmed' : 'pending') : 'none'
    await persist()
  }

  async function addCompleted(course: Omit<CompletedCourse, 'id'>) { completedCourses.value.push({ ...course, id: crypto.randomUUID() }); await persist() }
  async function removeCompleted(id: string) { completedCourses.value = completedCourses.value.filter((course) => course.id !== id); await persist() }
  async function applyImport(preview: ImportPreview) { catalog.value = mergeCatalog(catalog.value, preview); sanitizeDegreeCourseEntries(); lastNotice.value = `已合并 ${preview.rowsRead} 行课程数据`; await persist() }

  async function restore(state: PersistedState) {
    if (state.customCatalog) catalog.value = normalizeCatalog(state.customCatalog)
    profile.value = state.profile ? normalizeStoredProfile(state.profile, catalog.value) : null
    planEntries.value = state.planEntries ?? []
    completedCourses.value = state.completedCourses ?? []
    activeTerm.value = state.activeTerm ?? 'fall'
    sanitizeDegreeCourseEntries()
    await persist()
  }

  async function resetAll() {
    await clearPersistedState()
    profile.value = null; planEntries.value = []; completedCourses.value = []; activeTerm.value = 'fall'
    const response = await fetch('/data/catalog.json'); catalog.value = await response.json()
  }

  return {
    catalog, profile, planEntries, completedCourses, activeTerm, hydrated, loading, lastNotice,
    index, choices, report, conflicts, formalEntries, backupEntries,
    hydrate, snapshot, persist, setProfile, setTerm, duplicateReason, formalAddBlockReason, addChoice, removeEntry, clearPlanEntries, moveEntry,
    setDegreeCourse, addCompleted, removeCompleted, applyImport, restore, resetAll,
  }
})
