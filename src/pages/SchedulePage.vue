<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, CalendarOff, ChevronLeft, ChevronRight, Trash2 } from 'lucide-vue-next'
import PageHeader from '../components/PageHeader.vue'
import { usePlannerStore } from '../stores/planner'
import type { Course, CourseConflict, CourseOffering, Meeting, PlanEntry } from '../types'

const store = usePlannerStore()
const selectedWeek = ref(1)
const weekCount = computed(() => Math.max(1, store.catalog.termConfig[store.activeTerm]?.weeks || 20))
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const times = ['8:30–9:15', '9:20–10:05', '10:25–11:10', '11:15–12:00', '13:30–14:15', '14:20–15:05', '15:25–16:10', '16:15–17:00', '17:05–17:50', '18:30–19:15', '19:20–20:05', '20:15–21:00', '21:05–21:50']

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
</script>

<template>
  <div class="page schedule-page">
      <PageHeader eyebrow="WEEKLY SCHEDULE" title="周课表" description="间断周、周末补课和多时段安排会按实际教学周展开。">
      <div class="week-control"><button class="icon-button" :disabled="selectedWeek === 1" @click="changeWeek(-1)"><ChevronLeft :size="18" /></button><strong>{{ weekLabel }}</strong><button class="icon-button" :disabled="selectedWeek === weekCount" @click="changeWeek(1)"><ChevronRight :size="18" /></button></div>
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
        <article v-for="block in blocks" :key="block.entry.id + block.meeting.rawWeeks + block.meeting.rawTime" class="schedule-block" :class="{ conflict: block.conflict, degree: block.entry.isDegreeCourse, 'has-lanes': block.laneCount > 1 }" :style="{ gridColumn: block.meeting.weekday + 1, gridRow: `${block.start + 1} / span ${block.span}`, '--lane': block.lane, '--lanes': block.laneCount }">
          <strong>{{ block.offering.name || block.course.name }}</strong><span>{{ block.meeting.rawTime }}</span><small>{{ block.meeting.room || '教室待定' }}</small>
          <div class="schedule-block-actions"><AlertTriangle v-if="block.conflict" :size="14" /><button class="schedule-remove-button" type="button" :aria-label="`从正式方案删除${block.offering.name || block.course.name}`" title="从正式方案删除" @click.stop="removeScheduleEntry(block.entry.id)"><Trash2 :size="14" /></button></div>
        </article>
      </div>
      <div v-if="!blocks.length" class="schedule-empty-overlay"><CalendarOff :size="28" /><strong>本周没有正式课程</strong><span>切换教学周，或从课程目录加入正式方案。</span></div>
    </section>
    <div class="schedule-legend"><span><i class="normal" />普通课程</span><span><i class="degree" />学位课</span><span><i class="conflict" />时间冲突</span></div>
  </div>
</template>
