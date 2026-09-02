import type { CatalogIndex } from './catalog'
import type { Course, CourseOffering, Meeting, PlanEntry, ScheduleExportRow, Term } from '../types'

export type ScheduleBlock = {
  entry: PlanEntry
  course: Course
  offering: CourseOffering
  meeting: Meeting
  start: number
  span: number
  conflict: boolean
  lane: number
  laneCount: number
}

export function scheduleRowOrder(row: ScheduleExportRow): [number, number, string] {
  const firstMeeting = row.meetings[0]
  return [firstMeeting?.weekday ?? 99, firstMeeting ? Math.min(...firstMeeting.periods) : 99, row.name]
}

export function buildScheduleExportRows(entries: PlanEntry[], index: CatalogIndex, activeTerm: Term, conflictIds: Set<string>): ScheduleExportRow[] {
  return entries.flatMap((entry) => {
    const course = index.courses.get(entry.courseId)
    if (!course || course.term !== activeTerm) return []
    const offering = entry.offeringId ? index.offerings.get(entry.offeringId) ?? null : null
    const remaining = offering?.capacity ? Math.max(0, offering.capacity - offering.enrolled) : null
    return [{
      sequence: 0,
      entryId: entry.id,
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
      conflict: conflictIds.has(entry.id),
    }]
  }).sort((left, right) => {
    const leftOrder = scheduleRowOrder(left); const rightOrder = scheduleRowOrder(right)
    return leftOrder[0] - rightOrder[0] || leftOrder[1] - rightOrder[1] || leftOrder[2].localeCompare(rightOrder[2], 'zh-CN')
  }).map((row, index) => ({ ...row, sequence: index + 1 }))
}

function meetingsOverlap(left: Meeting, right: Meeting) {
  return left.weekday === right.weekday && left.periods.some((period) => right.periods.includes(period))
}

export function buildScheduleBlocks(entries: PlanEntry[], index: CatalogIndex, activeTerm: Term, selectedWeek: number, conflictIds: Set<string>): ScheduleBlock[] {
  const rawBlocks = entries.flatMap((entry) => {
    const course = index.courses.get(entry.courseId)
    const offering = entry.offeringId ? index.offerings.get(entry.offeringId) : null
    if (!course || !offering || course.term !== activeTerm) return []
    return offering.meetings.filter((meeting) => meeting.weeks.includes(selectedWeek)).map((meeting) => ({
      entry, course, offering, meeting,
      start: Math.min(...meeting.periods), span: meeting.periods.length,
      conflict: conflictIds.has(entry.id),
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
}
