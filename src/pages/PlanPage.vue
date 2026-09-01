<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, ArrowLeftRight, BookCheck, Check, Trash2 } from 'lucide-vue-next'
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
const conflictEntryIds = computed(() => new Set(store.conflicts.flatMap((conflict) => [conflict.entryA, conflict.entryB])))
type PlanRow = { entry: PlanEntry; course: Course; offering: CourseOffering | null }
type PlanConflictGroup = { entryIds: string[]; conflicts: CourseConflict[]; rows: PlanRow[]; kind: 'conflict' | 'regular' }
function coursePriority(row: PlanRow) { return store.profile ? ownDisciplinePlanPriority(store.profile, row.course, row.offering) : 0 }

const rows = computed<PlanRow[]>(() => (tab.value === 'formal' ? store.formalEntries : store.backupEntries).flatMap((entry) => {
  const course = store.index.courses.get(entry.courseId)
  const offering = entry.offeringId ? store.index.offerings.get(entry.offeringId) ?? null : null
  return course ? [{ entry, course, offering }] : []
}).sort((left, right) => Number(conflictEntryIds.value.has(right.entry.id)) - Number(conflictEntryIds.value.has(left.entry.id)) || coursePriority(left) - coursePriority(right)))
const displayGroups = computed<PlanConflictGroup[]>(() => {
  const rowMap = new Map(rows.value.map((row) => [row.entry.id, row]))
  const visibleConflicts = store.conflicts.filter((conflict) => rowMap.has(conflict.entryA) && rowMap.has(conflict.entryB))
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
  const regularRows = rows.value.filter((row) => !conflictEntryIds.value.has(row.entry.id))
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
</script>

<template>
  <div class="page plan-page">
    <PageHeader eyebrow="COURSE PLAN" title="选课方案" description="正式课程计入学分与课表，备选课程只作比较。">
      <button class="button clear-plan-button" :disabled="!store.planEntries.length" @click="clearAllOpen = true"><Trash2 :size="17" /> 清空全部选课</button>
    </PageHeader>
    <div class="plan-tabs"><button :class="{ active: tab === 'formal' }" @click="tab = 'formal'">正式方案 <span>{{ store.formalEntries.length }}</span></button><button :class="{ active: tab === 'backup' }" @click="tab = 'backup'">备选池 <span>{{ store.backupEntries.length }}</span></button></div>
    <div v-if="actionNotice" class="inline-error">{{ actionNotice }}</div>

    <section v-if="rows.length" class="plan-list">
      <div v-if="conflictGroupCount" class="plan-group-label conflict-group-label"><AlertTriangle :size="17" /><div><strong>冲突课程</strong><span>{{ conflictGroupCount }} 组</span></div></div>
      <div class="plan-catalog-head" aria-hidden="true"><span>课程与班级</span><span>培养归属</span><span>上课安排</span><span>教师</span><span>学分与操作</span></div>
      <template v-for="(group, groupIndex) in displayGroups" :key="`${group.kind}-${group.entryIds.join('-')}`">
        <section class="plan-course-group" :class="{ 'conflicted-group': group.kind === 'conflict', 'regular-course-group': group.kind === 'regular' }">
          <header class="plan-subgroup-label" :class="{ 'conflict-subgroup-label': group.kind === 'conflict', 'regular-subgroup-label': group.kind === 'regular' }">
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
              <div class="course-time"><div v-if="row.offering?.meetings.length" class="course-meeting-list"><p v-for="meeting in row.offering.meetings" :key="`${meeting.rawTime}-${meeting.rawWeeks}-${meeting.room}`"><b>{{ meeting.rawTime }}</b><span>{{ meeting.rawWeeks }} · {{ meeting.room || '教室待定' }}</span></p></div><p v-else class="no-time"><b>排课待定</b><span>暂不参与冲突判断</span></p></div>
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
