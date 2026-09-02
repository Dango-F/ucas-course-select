<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, ArrowLeftRight, BookCheck, Check, Filter, Search, SlidersHorizontal, Trash2 } from 'lucide-vue-next'
import PageHeader from '../components/PageHeader.vue'
import { ownDisciplinePlanPriority } from '../domain/catalogFilters'
import { isDegreeCourseEligible, isDisciplineMatch } from '../domain/requirements'
import { usePlannerStore } from '../stores/planner'
import type { Course, CourseConflict, CourseOffering, PlanEntry, PlanStatus } from '../types'

const store = usePlannerStore()
const tab = ref<PlanStatus>('formal')
const degreeEntry = ref<PlanEntry | null>(null)
const approvalChecked = ref(false)
const clearAllOpen = ref(false)
const planQuery = ref('')
const planAttribute = ref('')
const planCampus = ref('')
const planLevel = ref('')
const conflictOnly = ref(false)
const conflictEntryIds = computed(() => new Set(store.conflicts.flatMap((conflict) => [conflict.entryA, conflict.entryB])))
type PlanRow = { entry: PlanEntry; course: Course; offering: CourseOffering | null }
type PlanConflictGroup = { entryIds: string[]; conflicts: CourseConflict[]; rows: PlanRow[]; kind: 'conflict' | 'regular' }
function coursePriority(row: PlanRow) { return store.profile ? ownDisciplinePlanPriority(store.profile, row.course, row.offering) : 0 }

// 排序始终先按选课方案规则完成，下面的筛选只决定显示哪些课程，不改变顺序。
const rows = computed<PlanRow[]>(() => (tab.value === 'formal' ? store.formalEntries : store.backupEntries).flatMap((entry) => {
  const course = store.index.courses.get(entry.courseId)
  const offering = entry.offeringId ? store.index.offerings.get(entry.offeringId) ?? null : null
  return course ? [{ entry, course, offering }] : []
}).sort((left, right) => Number(conflictEntryIds.value.has(right.entry.id)) - Number(conflictEntryIds.value.has(left.entry.id)) || coursePriority(left) - coursePriority(right)))
const planAttributes = computed(() => [...new Set(rows.value.map((row) => row.course.attribute).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, 'zh-CN')))
const planCampuses = computed(() => [...new Set(rows.value.flatMap((row) => [row.offering?.campus, ...row.course.campuses]).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, 'zh-CN')))
const planLevels = computed(() => [...new Set(rows.value.map((row) => row.course.level).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, 'zh-CN')))
const filteredRows = computed(() => {
  const keywords = planQuery.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return rows.value.filter((row) => {
    const text = [
      row.course.name, row.offering?.name, row.course.baseCode, row.offering?.offeringCode,
      row.course.department, row.course.attribute, row.course.level, row.course.subject,
      row.course.firstLevelDiscipline, row.offering?.campus, row.offering?.teachers.join(' '),
      row.offering?.leadProfessor, row.offering?.examMethod,
      ...(row.offering?.meetings ?? []).flatMap((meeting) => [meeting.rawTime, meeting.rawWeeks, meeting.room]),
    ].filter(Boolean).join(' ').toLowerCase()
    if (keywords.some((keyword) => !text.includes(keyword))) return false
    if (planAttribute.value && row.course.attribute !== planAttribute.value) return false
    if (planLevel.value && row.course.level !== planLevel.value) return false
    if (planCampus.value && !row.course.campuses.includes(planCampus.value) && row.offering?.campus !== planCampus.value && !row.offering?.meetings.some((meeting) => meeting.room.includes(planCampus.value))) return false
    if (conflictOnly.value && !conflictEntryIds.value.has(row.entry.id)) return false
    return true
  })
})
const hasPlanFilters = computed(() => Boolean(planQuery.value.trim() || planAttribute.value || planCampus.value || planLevel.value || conflictOnly.value))
const displayGroups = computed<PlanConflictGroup[]>(() => {
  const rowMap = new Map(filteredRows.value.map((row) => [row.entry.id, row]))
  const visibleConflicts = store.conflicts.filter((conflict) => rowMap.has(conflict.entryA) || rowMap.has(conflict.entryB))
  const groups: Array<{ entryIds: string[]; conflicts: CourseConflict[] }> = []

  for (const conflict of visibleConflicts) {
    const related = groups.map((group, index) => group.entryIds.some((id) => id === conflict.entryA || id === conflict.entryB) ? index : -1).filter((index) => index >= 0)
    if (!related.length) {
      groups.push({ entryIds: [conflict.entryA, conflict.entryB], conflicts: [conflict] })
      continue
    }
    const target = groups[related[0]]
    target.entryIds = [...new Set([...target.entryIds, conflict.entryA, conflict.entryB])]
    target.conflicts.push(conflict)
    for (const index of related.slice(1).sort((left, right) => right - left)) {
      target.entryIds = [...new Set([...target.entryIds, ...groups[index].entryIds])]
      target.conflicts.push(...groups[index].conflicts)
      groups.splice(index, 1)
    }
  }

  const conflictGroups = groups.map((group) => ({ ...group, rows: group.entryIds.flatMap((entryId) => rowMap.get(entryId) ?? []), kind: 'conflict' as const }))
  const groupedEntryIds = new Set(conflictGroups.flatMap((group) => group.rows.map((row) => row.entry.id)))
  const regularRows = filteredRows.value.filter((row) => !groupedEntryIds.has(row.entry.id))
  return regularRows.length
    ? [...conflictGroups, { entryIds: regularRows.map((row) => row.entry.id), conflicts: [], rows: regularRows, kind: 'regular' as const }]
    : conflictGroups
})
const conflictGroupCount = computed(() => displayGroups.value.filter((group) => group.kind === 'conflict').length)
const degreeCourse = computed(() => degreeEntry.value ? store.index.courses.get(degreeEntry.value.courseId) ?? null : null)
const actionNotice = ref('')

function openDegree(entry: PlanEntry) { degreeEntry.value = entry; approvalChecked.value = entry.approvalState === 'confirmed' }
async function saveDegree() { if (!degreeEntry.value) return; await store.setDegreeCourse(degreeEntry.value.id, true, approvalChecked.value); degreeEntry.value = null }
function isPendingDegree(row: PlanRow) { return !row.entry.isDegreeCourse && store.profile ? isDegreeCourseEligible(store.profile, row.course) : false }
async function moveEntry(entry: PlanEntry, status: PlanStatus) {
  const moved = await store.moveEntry(entry.id, status)
  actionNotice.value = moved ? '' : store.lastNotice
}
async function clearAllCourses() {
  await store.clearPlanEntries()
  actionNotice.value = ''
  clearAllOpen.value = false
}
function clearPlanFilters() {
  planQuery.value = ''
  planAttribute.value = ''
  planCampus.value = ''
  planLevel.value = ''
  conflictOnly.value = false
}
</script>

<template>
  <div class="page plan-page">
    <PageHeader eyebrow="COURSE PLAN" title="选课方案" description="正式课程计入学分与课表，备选课程只作比较。">
      <button class="button clear-plan-button" :disabled="!store.planEntries.length" @click="clearAllOpen = true"><Trash2 :size="17" /> 清空全部选课</button>
    </PageHeader>
    <div class="plan-tabs"><button :class="{ active: tab === 'formal' }" @click="tab = 'formal'">正式方案 <span>{{ store.formalEntries.length }}</span></button><button :class="{ active: tab === 'backup' }" @click="tab = 'backup'">备选池 <span>{{ store.backupEntries.length }}</span></button></div>
    <section class="plan-filter-bar" aria-label="选课方案筛选">
      <label class="search-box"><Search :size="17" /><input v-model="planQuery" placeholder="搜索课程、编码、教师或上课安排" /></label>
      <select v-model="planAttribute" aria-label="方案课程属性"><option value="">全部属性</option><option v-for="item in planAttributes" :key="item" :value="item">{{ item }}</option></select>
      <select v-model="planCampus" aria-label="方案校区"><option value="">全部校区</option><option v-for="item in planCampuses" :key="item" :value="item">{{ item }}</option></select>
      <select v-model="planLevel" aria-label="方案培养层次"><option value="">全部层次</option><option v-for="item in planLevels" :key="item" :value="item">{{ item }}</option></select>
      <label class="plan-filter-check"><input v-model="conflictOnly" type="checkbox" /><SlidersHorizontal :size="15" />只看冲突</label>
      <button class="text-button" :disabled="!hasPlanFilters" @click="clearPlanFilters"><Filter :size="15" />清除</button>
    </section>
    <div v-if="rows.length" class="plan-filter-result">显示 <strong>{{ filteredRows.length }}</strong> / {{ rows.length }} 门{{ tab === 'formal' ? '正式课程' : '备选课程' }}</div>
    <div v-if="actionNotice" class="inline-error">{{ actionNotice }}</div>

    <section v-if="rows.length && filteredRows.length" class="plan-list">
      <div v-if="conflictGroupCount" class="plan-group-label conflict-group-label"><AlertTriangle :size="17" /><div><strong>冲突课程</strong><span>{{ conflictGroupCount }} 组</span></div></div>
      <div class="plan-catalog-head" aria-hidden="true"><span>课程与班级</span><span>培养归属</span><span>上课安排/考核方式</span><span>教师</span><span>学分与操作</span></div>
      <template v-for="(group, groupIndex) in displayGroups" :key="`${group.kind}-${group.entryIds.join('-')}`">
        <section class="plan-course-group" :class="{ 'conflicted-group': group.kind === 'conflict', 'regular-course-group': group.kind === 'regular' }">
          <header v-if="group.kind === 'conflict' || conflictGroupCount > 0" class="plan-subgroup-label" :class="{ 'conflict-subgroup-label': group.kind === 'conflict', 'regular-subgroup-label': group.kind === 'regular' }">
            <div v-if="group.kind === 'conflict'"><strong>冲突组 {{ String(groupIndex + 1).padStart(2, '0') }}</strong><span>{{ group.rows.length }} 门课程</span></div>
            <div v-else><strong>{{ tab === 'formal' ? '其他正式课程' : '其他备选课程' }}</strong></div>
          </header>
          <article v-for="row in group.rows" :key="row.entry.id" class="plan-catalog-row" :class="{ conflicted: group.kind === 'conflict' }">
            <div class="plan-card-grid">
              <div class="course-identity">
                <div class="plan-course-main">
                  <strong>{{ row.offering?.name || row.course.name }}</strong>
                  <code>{{ row.offering?.offeringCode ?? row.course.baseCode }}</code>
                  <p>{{ row.course.department }}</p>
                </div>
                <div class="course-taxonomy">
                  <div><span>{{ row.course.attribute }}</span><span class="level-tag">{{ row.course.level || '层次待定' }}</span><span v-if="row.entry.isDegreeCourse" :class="['plan-degree-tag', row.entry.approvalState]">学位课{{ row.entry.approvalState === 'pending' ? '·待确认' : '' }}</span><span v-else-if="isPendingDegree(row)" class="degree-pending-tag">待设为学位课</span><span v-if="row.entry.retake" class="retake-tag">重修</span><span v-if="row.course.professionalProgramCourse" class="pro-tag">专业学位适用</span><span v-if="row.course.isBenYan" class="b-tag">本研层次</span></div>
                  <p class="course-discipline"><b>所属学科：</b><span>{{ row.course.subject || '未标注' }}</span><b>{{ row.course.professionalProgramCourse ? '关联一级学科（推断）：' : '所属一级学科：' }}</b><span>{{ row.course.firstLevelDiscipline || '待确认' }}</span></p>
                </div>
              </div>
              <div class="course-time"><div v-if="row.offering?.meetings.length" class="course-meeting-list"><p v-for="meeting in row.offering.meetings" :key="`${meeting.rawTime}-${meeting.rawWeeks}-${meeting.room}`"><b>{{ meeting.rawTime }}</b><span>{{ meeting.rawWeeks }} · {{ meeting.room || '教室待定' }}</span></p></div><p v-else class="no-time"><b>排课待定</b><span>暂不参与冲突判断</span></p><p class="course-exam"><b>考核方式</b><span>{{ row.offering?.examMethod || '待定' }}</span></p></div>
              <div class="course-staff"><p><b>主讲</b><span>{{ row.offering?.teachers.join('、') || '待定' }}</span></p><p v-if="row.offering?.leadProfessor"><b>首席</b><span>{{ row.offering.leadProfessor }}</span></p></div>
              <div class="plan-credit-actions">
                <div class="plan-credit-display"><strong>{{ row.course.credits }}</strong><span>学分</span></div>
                <div class="plan-actions"><span v-if="tab === 'formal'" class="degree-action-slot"><button v-if="isDegreeCourseEligible(store.profile!, row.course)" class="text-button" @click="openDegree(row.entry)"><BookCheck :size="16" /> {{ row.entry.isDegreeCourse ? '修改学位课' : '设为学位课' }}</button><small v-else class="degree-ineligible-note"><span>仅核心课和专业课</span><span>可设为学位课</span></small></span><button class="text-button" @click="moveEntry(row.entry, tab === 'formal' ? 'backup' : 'formal')"><ArrowLeftRight :size="16" /> {{ tab === 'formal' ? '移至备选' : '转为正式' }}</button><button class="icon-button danger-ghost" aria-label="删除" @click="store.removeEntry(row.entry.id)"><Trash2 :size="17" /></button></div>
              </div>
            </div>
          </article>
        </section>
      </template>
    </section>
    <section v-else-if="rows.length" class="large-empty plan-filter-empty"><Search :size="36" /><h2>没有匹配课程</h2><p>调整筛选条件，或清除筛选查看全部{{ tab === 'formal' ? '正式课程' : '备选课程' }}。</p><button class="button secondary" @click="clearPlanFilters">清除筛选</button></section>
    <section v-else class="large-empty"><BookCheck :size="36" /><h2>{{ tab === 'formal' ? '正式方案还是空的' : '备选池还是空的' }}</h2><p>{{ tab === 'formal' ? '从课程目录加入课程，培养刻度会立即更新。' : '把犹豫中的课程放在这里，不会影响学分统计。' }}</p><RouterLink class="button primary" to="/catalog">前往课程目录</RouterLink></section>

    <Teleport to="body">
      <div v-if="degreeEntry" class="modal-layer" @click.self="degreeEntry = null">
        <section class="dialog-card"><p class="section-kicker">设置学位课</p><h2>{{ degreeCourse?.name }}</h2><p v-if="store.profile && degreeCourse && isDisciplineMatch(store.profile, degreeCourse)" class="dialog-positive"><Check :size="17" /> 课程归属与当前培养信息匹配</p><p v-else class="dialog-warning"><AlertTriangle :size="17" /> 课程不在当前一级学科/类别的直接映射中，需导师和培养单位认可。</p><label class="confirmation-check"><input v-model="approvalChecked" type="checkbox" /><span><strong>我已确认该课程可作为学位课</strong><small>包括本学科认定，或已获得导师与培养单位同意。</small></span></label><footer><button v-if="degreeEntry.isDegreeCourse" class="button secondary" @click="store.setDegreeCourse(degreeEntry.id, false); degreeEntry = null">取消学位课</button><span /><button class="button primary" :disabled="!approvalChecked" @click="saveDegree">确认设置</button></footer></section>
      </div>
      <div v-if="clearAllOpen" class="modal-layer" @click.self="clearAllOpen = false">
        <section class="dialog-card"><p class="section-kicker danger-text">清空选课</p><h2>删除全部正式课程和备选课程？</h2><p>将删除 {{ store.formalEntries.length }} 门正式课程和 {{ store.backupEntries.length }} 门备选课程。培养身份、已修课程和课程库不受影响。</p><footer><button class="button secondary" @click="clearAllOpen = false">取消</button><span /><button class="button danger" @click="clearAllCourses">确认清空</button></footer></section>
      </div>
    </Teleport>
  </div>
</template>
