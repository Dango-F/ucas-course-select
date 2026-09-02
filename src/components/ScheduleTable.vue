<script setup lang="ts">
import { computed } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { vFitScheduleCard } from '../directives/fitScheduleCard'
import type { Meeting, ScheduleExportRow, TranscriptIdentity } from '../types'

const props = defineProps<{
  identity: TranscriptIdentity
  rows: ScheduleExportRow[]
  termLabel: string
  generatedDate: string
  totalOnly?: boolean
  deletable?: boolean
}>()

const emit = defineEmits<{ remove: [entryId: string] }>()

const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const periodTimes = [
  '8:30–9:15', '9:20–10:05', '10:25–11:10', '11:15–12:00',
  '13:30–14:15', '14:20–15:05', '15:25–16:10', '16:15–17:00',
  '17:05–17:50', '18:30–19:15', '19:20–20:05', '20:15–21:00', '21:05–21:50',
]

type ScheduleWeeklyBlock = {
  id: string
  row: ScheduleExportRow
  meeting: Meeting
  weekday: number
  start: number
  span: number
  lane: number
  laneCount: number
}

function periodRuns(periods: number[]) {
  const ordered = [...new Set(periods)].filter((period) => period >= 1 && period <= periodTimes.length).sort((left, right) => left - right)
  const runs: number[][] = []
  for (const period of ordered) {
    const last = runs[runs.length - 1]
    if (last && period === last[last.length - 1] + 1) last.push(period)
    else runs.push([period])
  }
  return runs
}

function blockOverlaps(left: ScheduleWeeklyBlock, right: ScheduleWeeklyBlock) {
  return left.weekday === right.weekday && left.start < right.start + right.span && right.start < left.start + left.span
}

function calculateLanes(blocks: ScheduleWeeklyBlock[]) {
  const lanes = Array.from({ length: blocks.length }, () => 0)
  const laneCounts = Array.from({ length: blocks.length }, () => 1)
  const visited = new Set<number>()

  blocks.forEach((_, seedIndex) => {
    if (visited.has(seedIndex)) return
    const component: number[] = []
    const pending = [seedIndex]
    visited.add(seedIndex)
    while (pending.length) {
      const currentIndex = pending.pop()!
      component.push(currentIndex)
      blocks.forEach((candidate, candidateIndex) => {
        if (!visited.has(candidateIndex) && blockOverlaps(blocks[currentIndex], candidate)) {
          visited.add(candidateIndex)
          pending.push(candidateIndex)
        }
      })
    }

    const ordered = [...component].sort((left, right) => blocks[left].start - blocks[right].start || blocks[left].span - blocks[right].span || blocks[left].id.localeCompare(blocks[right].id))
    ordered.forEach((blockIndex, orderIndex) => {
      const used = new Set<number>()
      ordered.slice(0, orderIndex).forEach((otherIndex) => {
        if (blockOverlaps(blocks[blockIndex], blocks[otherIndex])) used.add(lanes[otherIndex])
      })
      let lane = 0
      while (used.has(lane)) lane += 1
      lanes[blockIndex] = lane
    })
    const componentLaneCount = Math.max(...component.map((index) => lanes[index])) + 1
    component.forEach((index) => { laneCounts[index] = componentLaneCount })
  })

  return blocks.map((block, index) => ({ ...block, lane: lanes[index], laneCount: laneCounts[index] }))
}

const weeklyBlocks = computed<ScheduleWeeklyBlock[]>(() => {
  const rawBlocks: ScheduleWeeklyBlock[] = props.rows.flatMap((row) => row.meetings.flatMap((meeting, meetingIndex) => {
    if (meeting.weekday < 1 || meeting.weekday > weekdays.length) return []
    return periodRuns(meeting.periods).map((run, runIndex) => ({
      id: `${row.sequence}-${meetingIndex}-${runIndex}-${meeting.rawWeeks}-${meeting.rawTime}`,
      row, meeting, weekday: meeting.weekday, start: run[0], span: run.length, lane: 0, laneCount: 1,
    }))
  }))
  return calculateLanes(rawBlocks)
})

const totalCredits = computed(() => props.rows.reduce((total, row) => total + row.credits, 0))
const degreeCount = computed(() => props.rows.filter((row) => row.degreeLabel.startsWith('学位课')).length)
const conflictCount = computed(() => props.rows.filter((row) => row.conflict).length)
const unscheduledRows = computed(() => props.rows.filter((row) => !row.meetings.length))
const detailPages = computed<ScheduleExportRow[][]>(() => {
  if (!props.rows.length) return [[]]
  const pages: ScheduleExportRow[][] = []
  let page: ScheduleExportRow[] = []
  let pageWeight = 0

  for (const row of props.rows) {
    const meetingWeight = 1 + Math.max(0, row.meetings.length - 1) * 0.65
    const textWeight = row.name.length > 18 || row.teachers.length > 18 ? 0.35 : 0
    const rowWeight = meetingWeight + textWeight
    if (page.length && (page.length >= 5 || pageWeight + rowWeight > 7)) {
      pages.push(page)
      page = []
      pageWeight = 0
    }
    page.push(row)
    pageWeight += rowWeight
  }

  if (page.length) pages.push(page)
  return pages
})

function blockStyle(block: ScheduleWeeklyBlock) {
  return {
    gridColumn: block.weekday + 1,
    gridRow: `${block.start + 1} / span ${block.span}`,
    '--lane': block.lane,
    '--lanes': block.laneCount,
  }
}

function removeCourse(row: ScheduleExportRow) {
  if (props.deletable && row.entryId) emit('remove', row.entryId)
}
</script>

<template>
  <section class="schedule-table-print" aria-label="研究生课表总表">
    <div class="schedule-export-page schedule-weekly-page">
      <div class="schedule-table-heading">
        <div>
          <p class="schedule-table-eyebrow">WEEKLY TIMETABLE · FORMAL PLAN</p>
          <h1>研究生课表总表</h1>
          <p class="schedule-table-subtitle">一周七天总览 · 课程按实际星期、节次和教学周定位</p>
        </div>
        <div class="schedule-table-term-mark"><b>{{ termLabel }}</b><span>{{ rows.length }} 门正式课程</span></div>
      </div>

      <div class="schedule-table-meta">
        <p><b>姓　　名：</b>{{ identity.name || '未填写' }}</p>
        <p><b>学生类别：</b>{{ identity.category || '未填写' }}</p>
        <p><b>培养单位：</b>{{ identity.trainingUnit || '未填写' }}</p>
        <p><b>学　　号：</b>{{ identity.studentId || '未填写' }}</p>
        <p><b>所学专业：</b>{{ identity.major || '未填写' }}</p>
      </div>

      <div class="schedule-table-summary">
        <span><strong>{{ rows.length }}</strong> 门正式课程</span>
        <span><strong>{{ totalCredits }}</strong> 学分</span>
        <span><strong>{{ degreeCount }}</strong> 门学位课</span>
        <span :class="{ 'has-conflict': conflictCount }"><strong>{{ conflictCount }}</strong> 门时间冲突</span>
      </div>

      <section class="schedule-weekly-section" aria-label="一周七天课表">
        <div class="schedule-weekly-caption"><strong>排课总表</strong><span>冲突课程会在同一时段并列显示；课程块内保留完整教学周与教室。</span></div>
        <div class="schedule-weekly-scroll">
          <div class="schedule-weekly-grid" role="grid">
            <div class="schedule-weekly-corner">节次 / 时间</div>
            <div v-for="(day, index) in weekdays" :key="day" class="schedule-weekly-day" :style="{ gridColumn: index + 2 }">{{ day }}</div>

            <template v-for="(time, index) in periodTimes" :key="time">
              <div class="schedule-weekly-time" :style="{ gridColumn: 1, gridRow: index + 2 }"><strong>{{ index + 1 }}</strong><span>{{ time }}</span></div>
              <div v-for="day in weekdays" :key="`${index}-${day}`" class="schedule-weekly-cell" :style="{ gridColumn: weekdays.indexOf(day) + 2, gridRow: index + 2 }" />
            </template>

            <article
              v-for="block in weeklyBlocks"
              :key="block.id"
              v-fit-schedule-card="{ minScale: 0.28, maxScale: 1.08 }"
              class="schedule-weekly-block"
              :class="{ degree: block.row.degreeLabel.startsWith('学位课'), conflict: block.row.conflict, 'has-lanes': block.laneCount > 1, 'has-remove-action': deletable && block.row.entryId }"
              :style="blockStyle(block)"
              :title="`${block.row.name}｜${block.row.courseCode}｜主讲：${block.row.teachers || '待定'}｜首席：${block.row.leadProfessor || '待定'}｜考核：${block.row.examMethod || '待定'}｜${block.meeting.rawWeeks}｜${block.meeting.rawTime}｜${block.meeting.room || '教室待定'}`"
            >
              <div class="schedule-card-fit-content schedule-weekly-block-content">
                <div v-if="block.row.degreeLabel.startsWith('学位课')" class="schedule-weekly-block-degree"><span aria-hidden="true" />学位课</div>
                <strong class="schedule-card-fit-title">{{ block.row.name }}</strong>
                <code class="schedule-card-fit-code">{{ block.row.courseCode }}</code>
                <small class="schedule-card-fit-meta weekly-block-weeks">{{ block.meeting.rawWeeks }}</small>
                <small class="schedule-card-fit-meta weekly-block-location">{{ block.meeting.rawTime }} · {{ block.meeting.room || '教室待定' }}</small>
                <small class="schedule-card-fit-meta schedule-card-fit-secondary"><b>主讲</b><span>{{ block.row.teachers || '待定' }}</span></small>
                <small class="schedule-card-fit-meta schedule-card-fit-secondary"><b>首席</b><span>{{ block.row.leadProfessor || '待定' }}</span></small>
                <small class="schedule-card-fit-meta schedule-card-fit-secondary"><b>考核</b><span>{{ block.row.examMethod || '待定' }}</span></small>
              </div>
              <div v-if="deletable && block.row.entryId" class="schedule-weekly-block-actions">
                <button class="schedule-remove-button" type="button" :aria-label="`删除${block.row.name}`" :title="`删除${block.row.name}`" @click.stop="removeCourse(block.row)"><Trash2 :size="12" /></button>
              </div>
            </article>

            <div v-if="!weeklyBlocks.length" class="schedule-weekly-empty"><strong>暂无详细排课</strong><span>当前正式方案没有可定位到星期与节次的课程。</span></div>
          </div>
        </div>
        <div class="schedule-weekly-legend"><span><i class="normal" />普通课程</span><span><i class="degree" />学位课</span><span><i class="conflict" />时间冲突</span></div>
      </section>

      <section v-if="unscheduledRows.length" class="schedule-weekly-unassigned">
        <div><strong>暂无详细排课的课程</strong><span>课程仍保留在课程明细页。</span></div>
        <ul><li v-for="row in unscheduledRows" :key="row.sequence"><b>{{ row.name }}</b><code>{{ row.courseCode }}</code><span>{{ row.credits }} 学分 · {{ row.degreeLabel }}</span></li></ul>
      </section>

      <footer>
        <p>本页按星期一至星期日和第 1—13 节生成；同一时段存在多门课程时并列显示。</p>
        <p>生成日期：{{ generatedDate }}　·　以培养方案、导师、培养单位及学校正式系统为准</p>
      </footer>
    </div>

    <template v-if="!totalOnly">
    <div v-for="(detailRows, detailPageIndex) in detailPages" :key="`detail-page-${detailPageIndex}`" class="schedule-export-page schedule-detail-page">
      <div class="schedule-table-heading schedule-detail-heading">
        <div>
          <p class="schedule-table-eyebrow">COURSE DETAILS · FORMAL PLAN</p>
          <h2>课程明细</h2>
          <p class="schedule-table-subtitle">完整列出课程班、教师、名额、授课方式和全部上课安排</p>
        </div>
        <div class="schedule-table-term-mark"><b>{{ termLabel }}</b><span>明细 {{ detailPageIndex + 1 }} / {{ detailPages.length }} · 共 {{ rows.length }} 门</span></div>
      </div>

      <div class="schedule-table-meta">
        <p><b>姓　　名：</b>{{ identity.name || '未填写' }}</p>
        <p><b>学生类别：</b>{{ identity.category || '未填写' }}</p>
        <p><b>培养单位：</b>{{ identity.trainingUnit || '未填写' }}</p>
        <p><b>学　　号：</b>{{ identity.studentId || '未填写' }}</p>
        <p><b>所学专业：</b>{{ identity.major || '未填写' }}</p>
      </div>

      <div class="schedule-table-summary">
        <span><strong>{{ rows.length }}</strong> 门正式课程</span>
        <span><strong>{{ totalCredits }}</strong> 学分</span>
        <span><strong>{{ degreeCount }}</strong> 门学位课</span>
        <span :class="{ 'has-conflict': conflictCount }"><strong>{{ conflictCount }}</strong> 门时间冲突</span>
      </div>

      <table class="schedule-weekly-detail-table">
        <colgroup><col class="detail-sequence" /><col class="detail-course" /><col class="detail-attribute" /><col class="detail-credit" /><col class="detail-teacher" /><col class="detail-meeting" /><col class="detail-method" /></colgroup>
        <thead><tr><th>序号</th><th>课程与班级</th><th>课程属性 / 层次</th><th>学分 / 状态</th><th>教师与首席教授</th><th>全部上课安排</th><th>校区 / 名额 / 授课 / 考核</th></tr></thead>
        <tbody v-if="detailRows.length">
          <tr v-for="row in detailRows" :key="`detail-${row.sequence}`" :class="{ 'schedule-detail-conflict': row.conflict }">
            <td>{{ row.sequence }}</td>
            <td class="detail-course-cell"><strong>{{ row.name }}</strong><code>{{ row.courseCode }}</code></td>
            <td>{{ row.attribute || '属性待定' }}<br /><span>{{ row.level || '层次待定' }}</span></td>
            <td><strong>{{ row.credits }}</strong><br /><span>{{ row.degreeLabel }}</span></td>
            <td>主讲：{{ row.teachers || '待定' }}<br /><span>首席：{{ row.leadProfessor || '待定' }}</span></td>
            <td class="detail-meeting-cell">
              <template v-if="row.meetings.length"><div v-for="meeting in row.meetings" :key="`${meeting.rawTime}-${meeting.rawWeeks}-${meeting.room}`"><b>{{ meeting.rawTime }}</b><span>{{ meeting.rawWeeks }} · {{ meeting.room || '教室待定' }}</span></div></template>
              <span v-else>暂无详细排课</span>
            </td>
            <td>{{ row.campus || '校区待定' }}<br /><span>{{ row.capacityLabel }}</span><br /><span>{{ row.teachingMethod || '授课方式待定' }} / {{ row.examMethod || '考核方式待定' }}</span></td>
          </tr>
        </tbody>
        <tbody v-else><tr><td colspan="7" class="schedule-detail-empty">当前学期没有正式方案课程</td></tr></tbody>
      </table>

      <footer>
        <p>本页用于查看课程块空间不足时的完整信息，上课安排列出全部教学周、星期、节次和教室。</p>
        <p>生成日期：{{ generatedDate }}　·　以培养方案、导师、培养单位及学校正式系统为准</p>
      </footer>
    </div>
    </template>
  </section>
</template>
