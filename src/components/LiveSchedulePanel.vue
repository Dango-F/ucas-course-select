<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, CalendarOff, ChevronLeft, ChevronRight, Clock3, Trash2 } from 'lucide-vue-next'
import { categoryLabels } from '../domain/requirements'
import { buildScheduleBlocks, buildScheduleExportRows, type ScheduleBlock } from '../domain/schedule'
import ScheduleTable from './ScheduleTable.vue'
import { usePlannerStore } from '../stores/planner'
import { vFitScheduleCard } from '../directives/fitScheduleCard'
import type { TranscriptIdentity } from '../types'

const store = usePlannerStore()
const selectedWeek = ref(1)
const scheduleView = ref<'week' | 'total'>('total')
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const times = ['8:30–9:15', '9:20–10:05', '10:25–11:10', '11:15–12:00', '13:30–14:15', '14:20–15:05', '15:25–16:10', '16:15–17:00', '17:05–17:50', '18:30–19:15', '19:20–20:05', '20:15–21:00', '21:05–21:50']

const weekCount = computed(() => Math.max(1, store.catalog.termConfig[store.activeTerm]?.weeks || 20))
const scheduleAvailable = computed(() => store.activeTerm === 'fall' || Boolean(store.catalog.termConfig[store.activeTerm]?.hasSchedule))
const termLabel = computed(() => store.catalog.termConfig[store.activeTerm]?.label || (store.activeTerm === 'fall' ? '2026 秋季' : '2027 春季'))
const weekLabel = computed(() => `第 ${selectedWeek.value} 教学周`)

const activeConflicts = computed(() => store.conflicts.filter((conflict) => {
  const entry = store.planEntries.find((item) => item.id === conflict.entryA)
  const course = entry ? store.index.courses.get(entry.courseId) : null
  return course?.term === store.activeTerm
}))
const conflictWeeks = computed(() => new Set(activeConflicts.value.flatMap((conflict) => conflict.weeks)))
const conflictIds = computed(() => new Set(activeConflicts.value.flatMap((conflict) => [conflict.entryA, conflict.entryB])))
const blocks = computed<ScheduleBlock[]>(() => buildScheduleBlocks(store.formalEntries, store.index, store.activeTerm, selectedWeek.value, conflictIds.value))
const currentTermEntries = computed(() => store.formalEntries.filter((entry) => store.index.courses.get(entry.courseId)?.term === store.activeTerm))
const currentWeekCourseCount = computed(() => new Set(blocks.value.map((block) => block.entry.id)).size)
const scheduleRows = computed(() => buildScheduleExportRows(store.formalEntries, store.index, store.activeTerm, conflictIds.value))
const generatedDate = computed(() => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date()))
const scheduleIdentity = computed<TranscriptIdentity>(() => {
  const profile = store.profile
  return {
    name: profile?.name?.trim() ?? '',
    studentId: profile?.studentId?.trim() ?? '',
    trainingUnit: profile?.trainingUnit?.trim() ?? '',
    category: profile?.category ? categoryLabels[profile.category] : '',
    major: profile?.major?.trim() ?? '',
  }
})

watch(weekCount, (count) => {
  if (selectedWeek.value > count) selectedWeek.value = count
})
watch(() => store.activeTerm, () => { selectedWeek.value = 1 })

function changeWeek(delta: number) {
  selectedWeek.value = Math.min(weekCount.value, Math.max(1, selectedWeek.value + delta))
}
async function removeScheduleEntry(entryId: string) { await store.removeEntry(entryId) }
</script>

<template>
  <section class="live-schedule-panel" aria-label="边选边看实时课表">
    <header class="live-schedule-heading">
      <div>
        <p class="section-kicker">LIVE SCHEDULE</p>
        <h2>实时课表</h2>
        <p>加入正式方案后，排课会立即显示在这里。</p>
      </div>
      <div class="live-schedule-stat"><strong>{{ currentTermEntries.length }}</strong><span>门正式课<br /><template v-if="scheduleView === 'week'">本周 {{ currentWeekCourseCount }} 门</template><template v-else>全学期总表</template></span></div>
    </header>

    <div class="live-schedule-viewbar">
      <div class="live-schedule-view-switch" role="tablist" aria-label="实时课表视图">
        <button type="button" role="tab" :class="{ active: scheduleView === 'total' }" :aria-selected="scheduleView === 'total'" @click="scheduleView = 'total'">总表</button>
        <button type="button" role="tab" :class="{ active: scheduleView === 'week' }" :aria-selected="scheduleView === 'week'" @click="scheduleView = 'week'">周次表</button>
      </div>
      <span class="live-schedule-view-hint">{{ scheduleView === 'week' ? '按教学周查看当前安排' : '导出总表 · 查看全部教学安排' }}</span>
    </div>

    <template v-if="scheduleView === 'week'">
      <div class="live-schedule-weekbar">
        <div class="live-week-control">
          <button class="icon-button" :disabled="selectedWeek === 1" aria-label="上一教学周" @click="changeWeek(-1)"><ChevronLeft :size="17" /></button>
          <strong>{{ weekLabel }}</strong>
          <button class="icon-button" :disabled="selectedWeek === weekCount" aria-label="下一教学周" @click="changeWeek(1)"><ChevronRight :size="17" /></button>
        </div>
        <span class="live-term-label">{{ termLabel }}</span>
      </div>

      <div class="live-week-dots" :style="{ '--week-count': weekCount }" aria-label="快速切换教学周">
        <button v-for="week in weekCount" :key="week" :class="{ active: selectedWeek === week, conflict: conflictWeeks.has(week) }" :aria-label="`第 ${week} 教学周${conflictWeeks.has(week) ? '，存在时间冲突' : ''}`" :title="conflictWeeks.has(week) ? `第 ${week} 教学周存在时间冲突` : `切换到第 ${week} 教学周`" @click="selectedWeek = week">{{ week }}</button>
      </div>
    </template>

    <div v-if="!scheduleAvailable" class="live-schedule-note"><CalendarOff :size="24" /><div><strong>春季详细排课尚未导入</strong><p>课程仍可加入正式方案；导入春季课表后，这里会自动显示实时安排。</p></div></div>

    <section v-else :class="['schedule-wrap', 'live-schedule-wrap', { 'live-total-schedule-wrap': scheduleView === 'total' }]" aria-live="polite">
      <template v-if="scheduleView === 'week'">
      <div class="schedule-grid live-schedule-grid">
        <div class="schedule-corner">节次 / 时间</div>
        <div v-for="(day, index) in weekdays" :key="day" class="day-head" :style="{ gridColumn: index + 2 }">{{ day }}</div>
        <template v-for="period in 13" :key="period">
          <div class="time-label" :style="{ gridColumn: 1, gridRow: period + 1 }"><strong>{{ period }}</strong><span>{{ times[period - 1] }}</span></div>
          <div v-for="day in 7" :key="`${period}-${day}`" class="schedule-cell" :style="{ gridColumn: day + 1, gridRow: period + 1 }" />
        </template>
        <article v-for="block in blocks" :key="block.entry.id + block.meeting.rawWeeks + block.meeting.rawTime" v-fit-schedule-card="{ minScale: 0.34, maxScale: 1 }" class="schedule-block live-schedule-block" :class="{ conflict: block.conflict, degree: block.entry.isDegreeCourse, 'has-lanes': block.laneCount > 1 }" :style="{ gridColumn: block.meeting.weekday + 1, gridRow: `${block.start + 1} / span ${block.span}`, '--lane': block.lane, '--lanes': block.laneCount }" :title="`${block.offering.name || block.course.name}｜${block.offering.offeringCode || block.course.baseCode}｜${block.meeting.rawWeeks}｜${block.meeting.rawTime}｜${block.meeting.room || '教室待定'}`">
          <div class="schedule-card-fit-content live-schedule-block-content">
            <span v-if="block.entry.isDegreeCourse" class="schedule-block-degree-label">学位课</span>
            <strong class="schedule-card-fit-title">{{ block.offering.name || block.course.name }}</strong>
            <code class="schedule-card-fit-code">{{ block.offering.offeringCode || block.course.baseCode }}</code>
            <small class="schedule-card-fit-meta schedule-card-fit-weeks">{{ block.meeting.rawWeeks }}</small>
            <span class="schedule-card-fit-meta schedule-card-fit-time">{{ block.meeting.rawTime }}</span>
            <small class="schedule-card-fit-meta live-schedule-room"><Clock3 :size="10" />{{ block.meeting.room || '教室待定' }}</small>
          </div>
          <AlertTriangle v-if="block.conflict" class="live-schedule-conflict-mark" :size="13" aria-label="时间冲突" />
          <div class="schedule-block-actions"><button class="schedule-remove-button" type="button" :aria-label="`删除${block.offering.name || block.course.name}`" :title="`删除${block.offering.name || block.course.name}`" @click.stop="removeScheduleEntry(block.entry.id)"><Trash2 :size="13" /></button></div>
        </article>
      </div>
      <div v-if="!blocks.length" class="live-schedule-empty"><CalendarOff :size="26" /><strong>{{ currentTermEntries.length ? '本周没有已排课程' : '还没有正式课程' }}</strong><span>{{ currentTermEntries.length ? '切换教学周查看，或继续从左侧加入正式课程。' : '从左侧将课程加入正式方案后，会立即出现在周课表中。' }}</span></div>
      </template>
      <div v-else class="live-total-table-wrap" aria-label="课表总表">
        <ScheduleTable :identity="scheduleIdentity" :rows="scheduleRows" :term-label="termLabel" :generated-date="generatedDate" :total-only="true" :deletable="true" @remove="removeScheduleEntry" />
      </div>
    </section>

    <footer v-if="scheduleView === 'week'" class="live-schedule-legend"><span><i class="normal" />普通课程</span><span><i class="degree" />学位课</span><span><i class="conflict" />时间冲突</span></footer>
  </section>
</template>
