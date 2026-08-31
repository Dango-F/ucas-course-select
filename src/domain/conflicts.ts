import type { CatalogIndex } from './catalog'
import type { CourseConflict, PlanEntry } from '../types'

const intersect = (left: number[], right: number[]) => left.filter((item) => right.includes(item))

export function detectConflicts(entries: PlanEntry[], index: CatalogIndex): CourseConflict[] {
  const formal = entries.filter((entry) => entry.status === 'formal' && entry.offeringId)
  const conflicts: CourseConflict[] = []
  for (let i = 0; i < formal.length; i += 1) {
    for (let j = i + 1; j < formal.length; j += 1) {
      const left = formal[i]
      const right = formal[j]
      const offeringA = index.offerings.get(left.offeringId!)
      const offeringB = index.offerings.get(right.offeringId!)
      const courseA = index.courses.get(left.courseId)
      const courseB = index.courses.get(right.courseId)
      if (!offeringA || !offeringB || !courseA || !courseB || offeringA.term !== offeringB.term) continue
      for (const meetingA of offeringA.meetings) {
        for (const meetingB of offeringB.meetings) {
          if (meetingA.weekday !== meetingB.weekday) continue
          const periods = intersect(meetingA.periods, meetingB.periods)
          const weeks = intersect(meetingA.weeks, meetingB.weeks)
          if (periods.length && weeks.length) {
            conflicts.push({
              entryA: left.id,
              entryB: right.id,
              courseA: offeringA.name || courseA.name,
              courseB: offeringB.name || courseB.name,
              weekday: meetingA.weekday,
              periods,
              weeks,
            })
          }
        }
      }
    }
  }
  return conflicts
}
