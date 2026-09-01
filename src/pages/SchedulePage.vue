<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { AlertTriangle, CalendarOff, ChevronLeft, ChevronRight, Printer, Trash2, X } from 'lucide-vue-next'
import PageHeader from '../components/PageHeader.vue'
import ScheduleTable from '../components/ScheduleTable.vue'
import { categoryLabels } from '../domain/requirements'
import { vFitScheduleCard } from '../directives/fitScheduleCard'
import { usePlannerStore } from '../stores/planner'
import type { Course, CourseConflict, CourseOffering, Meeting, PlanEntry, ScheduleExportRow, TranscriptIdentity } from '../types'

const store = usePlannerStore()
const selectedWeek = ref(1)
const scheduleExportOpen = ref(false)
const scheduleExportWorking = ref(false)
const scheduleExportError = ref('')
const schedulePreviewRef = ref<HTMLElement | null>(null)
const weekCount = computed(() => Math.max(1, store.catalog.termConfig[store.activeTerm]?.weeks || 20))
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const times = ['8:30–9:15', '9:20–10:05', '10:25–11:10', '11:15–12:00', '13:30–14:15', '14:20–15:05', '15:25–16:10', '16:15–17:00', '17:05–17:50', '18:30–19:15', '19:20–20:05', '20:15–21:00', '21:05–21:50']
const generatedDate = computed(() => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date()))
const scheduleTermLabel = computed(() => store.catalog.termConfig[store.activeTerm]?.label || (store.activeTerm === 'fall' ? '2026 秋季' : '2027 春季'))
const scheduleFileTerm = computed(() => store.activeTerm === 'fall' ? '2026秋' : '2027春')
const scheduleIdentity = computed<TranscriptIdentity>(() => {
  const profile = store.profile
  return {
    name: profile?.name.trim() ?? '', studentId: profile?.studentId.trim() ?? '', trainingUnit: profile?.trainingUnit.trim() ?? '',
    category: profile ? categoryLabels[profile.category] : '', major: profile?.major.trim() ?? '',
  }
})

function safeFilePart(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '') || '未填写'
}

const scheduleFileStem = computed(() => {
  const profile = store.profile
  const unit = profile?.trainingUnit.trim().replace(/^中国科学院大学/, '') || profile?.trainingUnit || '未填写'
  return ['国科大课表总表', safeFilePart(profile?.studentId ?? ''), safeFilePart(profile?.name ?? ''), safeFilePart(profile?.major ?? ''), safeFilePart(unit), scheduleFileTerm.value].join('_')
})

const weekLabel = computed(() => {
  if (store.activeTerm !== 'fall') return `第 ${selectedWeek.value} 教学周`
  const start = new Date('2026-08-31T00:00:00')
  start.setDate(start.getDate() + (selectedWeek.value - 1) * 7)
  const end = new Date(start); end.setDate(end.getDate() + 6)
  return `第 ${selectedWeek.value} 教学周 · ${start.getMonth() + 1}月${start.getDate()}日—${end.getMonth() + 1}月${end.getDate()}日`
})

type ConflictGroup = { entryIds: string[]; conflicts: CourseConflict[]; courses: Array<{ entry: PlanEntry; course: Course; offering: CourseOffering | null }> }
type ScheduleBlock = { entry: PlanEntry; course: Course; offering: CourseOffering; meeting: Meeting; start: number; span: number; conflict: boolean; lane: number; laneCount: number }

const activeConflicts = computed(() => store.conflicts.filter((conflict) => {
  const entry = store.planEntries.find((item) => item.id === conflict.entryA)
  const course = entry ? store.index.courses.get(entry.courseId) : null
  return course?.term === store.activeTerm
}))
const conflictIds = computed(() => new Set(activeConflicts.value.flatMap((conflict) => [conflict.entryA, conflict.entryB])))
const conflictGroups = computed<ConflictGroup[]>(() => {
  const groups: Array<{ entryIds: string[]; conflicts: CourseConflict[] }> = []
  for (const conflict of activeConflicts.value) {
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
  return groups.map((group) => ({
    ...group,
    courses: group.entryIds.flatMap((entryId) => {
      const entry = store.planEntries.find((item) => item.id === entryId)
      const course = entry ? store.index.courses.get(entry.courseId) : null
      const offering = entry?.offeringId ? store.index.offerings.get(entry.offeringId) ?? null : null
      return entry && course ? [{ entry, course, offering }] : []
    }),
  }))
})

function scheduleRowOrder(row: ScheduleExportRow): [number, number, string] {
  const firstMeeting = row.meetings[0]
  return [firstMeeting?.weekday ?? 99, firstMeeting ? Math.min(...firstMeeting.periods) : 99, row.name]
}

const scheduleRows = computed<ScheduleExportRow[]>(() => store.formalEntries.flatMap((entry) => {
  const course = store.index.courses.get(entry.courseId)
  if (!course || course.term !== store.activeTerm) return []
  const offering = entry.offeringId ? store.index.offerings.get(entry.offeringId) ?? null : null
  const remaining = offering?.capacity ? Math.max(0, offering.capacity - offering.enrolled) : null
  return [{
    sequence: 0,
    term: course.term,
    name: offering?.name || course.name,
    courseCode: offering?.offeringCode || course.baseCode,
    attribute: course.attribute,
    level: course.level,
    hours: course.hours,
    credits: course.credits,
    degreeLabel: entry.isDegreeCourse ? `学位课${entry.approvalState === 'pending' ? '·待确认' : ''}` : '普通课程',
    teachers: offering?.teachers.join('、') || '',
    leadProfessor: offering?.leadProfessor || '',
    campus: offering?.campus || course.campuses.join('、'),
    capacityLabel: offering?.capacity ? `名额 ${offering.enrolled} / ${offering.capacity} · 余 ${remaining}` : '容量待定',
    teachingMethod: offering?.teachingMethod || '',
    examMethod: offering?.examMethod || '',
    meetings: offering?.meetings ?? [],
    conflict: conflictIds.value.has(entry.id),
  }]
}).sort((left, right) => {
  const leftOrder = scheduleRowOrder(left); const rightOrder = scheduleRowOrder(right)
  return leftOrder[0] - rightOrder[0] || leftOrder[1] - rightOrder[1] || leftOrder[2].localeCompare(rightOrder[2], 'zh-CN')
}).map((row, index) => ({ ...row, sequence: index + 1 })))

function meetingsOverlap(left: Meeting, right: Meeting) {
  return left.weekday === right.weekday && left.periods.some((period) => right.periods.includes(period))
}

watch(weekCount, (count) => {
  if (selectedWeek.value > count) selectedWeek.value = count
})

const blocks = computed<ScheduleBlock[]>(() => {
  const rawBlocks = store.formalEntries.flatMap((entry) => {
    const course = store.index.courses.get(entry.courseId)
    const offering = entry.offeringId ? store.index.offerings.get(entry.offeringId) : null
    if (!course || !offering || course.term !== store.activeTerm) return []
    return offering.meetings.filter((meeting) => meeting.weeks.includes(selectedWeek.value)).map((meeting) => ({
      entry, course, offering, meeting,
      start: Math.min(...meeting.periods), span: meeting.periods.length,
      conflict: conflictIds.value.has(entry.id),
      lane: 0, laneCount: 1,
    }))
  })

  const lanes = Array.from({ length: rawBlocks.length }, () => 0)
  const laneCounts = Array.from({ length: rawBlocks.length }, () => 1)
  const visited = new Set<number>()

  rawBlocks.forEach((_, seedIndex) => {
    if (visited.has(seedIndex)) return
    const component: number[] = []
    const pending = [seedIndex]
    visited.add(seedIndex)
    while (pending.length) {
      const currentIndex = pending.pop()!
      component.push(currentIndex)
      rawBlocks.forEach((candidate, candidateIndex) => {
        if (!visited.has(candidateIndex) && meetingsOverlap(rawBlocks[currentIndex].meeting, candidate.meeting)) {
          visited.add(candidateIndex)
          pending.push(candidateIndex)
        }
      })
    }

    const ordered = [...component].sort((left, right) => rawBlocks[left].start - rawBlocks[right].start || rawBlocks[left].span - rawBlocks[right].span)
    ordered.forEach((blockIndex, orderIndex) => {
      const used = new Set<number>()
      ordered.slice(0, orderIndex).forEach((otherIndex) => {
        if (meetingsOverlap(rawBlocks[blockIndex].meeting, rawBlocks[otherIndex].meeting)) used.add(lanes[otherIndex])
      })
      let lane = 0
      while (used.has(lane)) lane += 1
      lanes[blockIndex] = lane
    })
    const componentLaneCount = Math.max(...component.map((index) => lanes[index])) + 1
    component.forEach((index) => { laneCounts[index] = componentLaneCount })
  })

  return rawBlocks.map((block, index) => ({
    ...block,
    lane: lanes[index],
    laneCount: laneCounts[index],
  }))
})

function changeWeek(delta: number) { selectedWeek.value = Math.min(weekCount.value, Math.max(1, selectedWeek.value + delta)) }
async function removeScheduleEntry(entryId: string) { await store.removeEntry(entryId) }

function openScheduleExport() { scheduleExportError.value = ''; scheduleExportOpen.value = true }
function closeScheduleExport() { if (!scheduleExportWorking.value) scheduleExportOpen.value = false }

let schedulePrintOriginalTitle = ''
let schedulePrintClone: HTMLElement | null = null
function cleanupSchedulePrint() {
  document.body.classList.remove('schedule-printing')
  schedulePrintClone?.remove()
  schedulePrintClone = null
  if (schedulePrintOriginalTitle) { document.title = schedulePrintOriginalTitle; schedulePrintOriginalTitle = '' }
}

async function printSchedule() {
  if (!scheduleRows.value.length) { scheduleExportError.value = '当前学期没有正式方案课程。'; return }
  await nextTick()
  const preview = schedulePreviewRef.value?.querySelector<HTMLElement>('.schedule-table-print')
  if (!preview) { scheduleExportError.value = '课表预览尚未生成，请关闭后重新打开。'; return }
  schedulePrintClone?.remove()
  schedulePrintClone = preview.cloneNode(true) as HTMLElement
  schedulePrintClone.classList.add('schedule-print-clone')
  schedulePrintClone.setAttribute('aria-hidden', 'true')
  document.body.appendChild(schedulePrintClone)
  document.body.classList.add('schedule-printing')
  schedulePrintOriginalTitle = document.title
  document.title = scheduleFileStem.value
  window.addEventListener('afterprint', cleanupSchedulePrint, { once: true })
  window.print()
}

onBeforeUnmount(cleanupSchedulePrint)
</script>

<template>
  <div class="page schedule-page">
      <PageHeader eyebrow="WEEKLY SCHEDULE" title="周课表" description="间断周、周末补课和多时段安排会按实际教学周展开。">
      <div class="schedule-header-actions"><button class="button secondary" @click="openScheduleExport"><Printer :size="17" /> 导出课表总表</button><div class="week-control"><button class="icon-button" :disabled="selectedWeek === 1" @click="changeWeek(-1)"><ChevronLeft :size="18" /></button><strong>{{ weekLabel }}</strong><button class="icon-button" :disabled="selectedWeek === weekCount" @click="changeWeek(1)"><ChevronRight :size="18" /></button></div></div>
    </PageHeader>

    <section v-if="conflictGroups.length" class="schedule-conflict-board">
      <header><div><p class="section-kicker">冲突课程总览</p><h2>{{ conflictGroups.length }} 组冲突，涉及 {{ conflictIds.size }} 门课程</h2></div></header>
      <p class="schedule-conflict-intro">课表网格按当前教学周展示；下面按冲突关系逐门列出课程、教师、全部上课时段和重叠依据。</p>
      <div class="schedule-conflict-groups">
        <article v-for="(group, groupIndex) in conflictGroups" :key="group.entryIds.join('-')" class="schedule-conflict-group">
          <header><strong>冲突组 {{ String(groupIndex + 1).padStart(2, '0') }}</strong><span>{{ group.courses.length }} 门课程</span></header>
          <div class="schedule-conflict-courses">
            <div v-for="item in group.courses" :key="item.entry.id" class="schedule-conflict-course">
              <strong>{{ item.offering?.name || item.course.name }}</strong>
              <code>{{ item.offering?.offeringCode || item.course.baseCode }}</code>
              <p>{{ item.offering?.teachers.join('、') || '教师待定' }} · {{ item.course.credits }} 学分</p>
              <ul v-if="item.offering?.meetings.length"><li v-for="meeting in item.offering.meetings" :key="meeting.rawWeeks + meeting.rawTime">{{ meeting.rawTime }} · {{ meeting.rawWeeks }} · {{ meeting.room || '教室待定' }}</li></ul>
              <span v-else class="conflict-course-muted">排课待定</span>
            </div>
          </div>
          <div class="schedule-conflict-evidence"><span v-for="(conflict, conflictIndex) in group.conflicts" :key="conflictIndex">周{{ '一二三四五六日'[conflict.weekday - 1] }} · 第{{ conflict.periods.join('、') }}节 · 第{{ conflict.weeks.join('、') }}周重叠</span></div>
        </article>
      </div>
    </section>

    <div class="week-dots" :style="{ '--week-count': weekCount }" aria-label="快速切换教学周"><button v-for="week in weekCount" :key="week" :class="{ active: selectedWeek === week }" @click="selectedWeek = week">{{ week }}</button></div>

    <section v-if="store.activeTerm === 'spring' && !store.catalog.termConfig.spring.hasSchedule" class="spring-schedule-note"><CalendarOff :size="25" /><div><strong>春季详细排课尚未导入</strong><p>课程仍可加入方案和计算学分；导入含“星期节次”的春季课表后，此处会自动生成周课表。</p></div></section>

    <section v-if="!(store.activeTerm === 'spring' && !store.catalog.termConfig.spring.hasSchedule)" class="schedule-wrap">
      <div class="schedule-grid">
        <div class="schedule-corner">节次 / 时间</div>
        <div v-for="(day, index) in weekdays" :key="day" class="day-head" :style="{ gridColumn: index + 2 }">{{ day }}</div>
        <template v-for="period in 13" :key="period">
          <div class="time-label" :style="{ gridColumn: 1, gridRow: period + 1 }"><strong>{{ period }}</strong><span>{{ times[period - 1] }}</span></div>
          <div v-for="day in 7" :key="`${period}-${day}`" class="schedule-cell" :style="{ gridColumn: day + 1, gridRow: period + 1 }" />
        </template>
        <article v-for="block in blocks" :key="block.entry.id + block.meeting.rawWeeks + block.meeting.rawTime" v-fit-schedule-card="{ minScale: 0.32, maxScale: 1.16 }" class="schedule-block" :class="{ conflict: block.conflict, degree: block.entry.isDegreeCourse, 'has-lanes': block.laneCount > 1 }" :style="{ gridColumn: block.meeting.weekday + 1, gridRow: `${block.start + 1} / span ${block.span}`, '--lane': block.lane, '--lanes': block.laneCount }" :title="`${block.offering.name || block.course.name}｜${block.offering.offeringCode || block.course.baseCode}｜主讲：${block.offering.teachers.join('、') || '待定'}｜首席：${block.offering.leadProfessor || '待定'}｜考核：${block.offering.examMethod || '待定'}｜${block.meeting.rawTime}｜${block.meeting.room || '教室待定'}`">
          <div class="schedule-card-fit-content schedule-block-content">
            <span v-if="block.entry.isDegreeCourse" class="schedule-block-degree-label">学位课</span>
            <strong class="schedule-card-fit-title">{{ block.offering.name || block.course.name }}</strong>
            <code class="schedule-card-fit-code">{{ block.offering.offeringCode || block.course.baseCode }}</code>
            <span class="schedule-card-fit-meta">{{ block.meeting.rawTime }} · {{ block.meeting.room || '教室待定' }}</span>
            <small class="schedule-card-fit-meta schedule-card-fit-secondary"><b>主讲</b><span>{{ block.offering.teachers.join('、') || '待定' }}</span></small>
            <small class="schedule-card-fit-meta schedule-card-fit-secondary"><b>首席</b><span>{{ block.offering.leadProfessor || '待定' }}</span></small>
            <small class="schedule-card-fit-meta schedule-card-fit-secondary"><b>考核</b><span>{{ block.offering.examMethod || '待定' }}</span></small>
          </div>
          <div class="schedule-block-actions"><AlertTriangle v-if="block.conflict" :size="14" /><button class="schedule-remove-button" type="button" :aria-label="`从正式方案删除${block.offering.name || block.course.name}`" title="从正式方案删除" @click.stop="removeScheduleEntry(block.entry.id)"><Trash2 :size="14" /></button></div>
        </article>
      </div>
      <div v-if="!blocks.length" class="schedule-empty-overlay"><CalendarOff :size="28" /><strong>本周没有正式课程</strong><span>切换教学周，或从课程目录加入正式方案。</span></div>
    </section>
    <div class="schedule-legend"><span><i class="normal" />普通课程</span><span><i class="degree" />学位课</span><span><i class="conflict" />时间冲突</span></div>

    <Teleport to="body">
      <div v-if="scheduleExportOpen" class="schedule-export-layer" role="dialog" aria-modal="true" aria-label="课表总表导出预览">
        <header class="schedule-export-header">
          <div><p class="section-kicker">SCHEDULE TABLE</p><h2>课表总表</h2><span>{{ scheduleTermLabel }} · 仅显示正式方案 · {{ scheduleRows.length }} 门课程</span></div>
          <div class="schedule-export-header-actions"><button class="button primary" :disabled="scheduleExportWorking" @click="printSchedule"><Printer :size="17" /> 打印 / 另存为 PDF</button><button class="icon-button" aria-label="关闭总表预览" title="关闭" :disabled="scheduleExportWorking" @click="closeScheduleExport"><X :size="20" /></button></div>
        </header>
        <div class="schedule-export-content">
          <div v-if="scheduleExportError" class="schedule-export-error"><AlertTriangle :size="17" />{{ scheduleExportError }}</div>
          <div ref="schedulePreviewRef" class="schedule-table-preview"><ScheduleTable :identity="scheduleIdentity" :rows="scheduleRows" :term-label="scheduleTermLabel" :generated-date="generatedDate" /></div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
