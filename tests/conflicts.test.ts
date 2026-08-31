import { describe, expect, it } from 'vitest'
import { createCatalogIndex } from '../src/domain/catalog'
import { detectConflicts } from '../src/domain/conflicts'
import type { Catalog, Course, CourseOffering, Meeting, PlanEntry } from '../src/types'

const meeting = (weeks: number[], weekday = 1, periods = [1, 2]): Meeting => ({ weeks, weekday, periods, room: '', rawWeeks: weeks.join(','), rawTime: `周一(${periods.join('-')})` })
const course = (id: string): Course => ({ id: `fall:${id}`, term: 'fall', baseCode: id, name: id, englishName: '', department: '', campuses: [], attribute: '专业课', level: '硕博通用课程', subject: '', firstLevelDiscipline: '', sharedSubjects: [], sharedFirstLevels: [], sharedAttributes: [], sharedLevels: [], hours: 0, credits: 2, professionalProgramCourse: false, isBenYan: false, sourceKinds: [] })
const offering = (id: string, courseId: string, meetings: Meeting[]): CourseOffering => ({ id: `fall:${id}`, courseId, term: 'fall', offeringCode: id, name: id, campus: '', capacity: 0, enrolled: 0, teachingMethod: '', examMethod: '', leadProfessor: '', teachers: [], meetings })
const entry = (id: string, courseId: string, offeringId: string): PlanEntry => ({ id, courseId, offeringId, status: 'formal', isDegreeCourse: false, approvalState: 'none', retake: false, retakeReason: '', createdAt: '' })

function index(leftMeetings: Meeting[], rightMeetings: Meeting[]) {
  const courses = [course('A'), course('B')]
  const offerings = [offering('A-1', courses[0].id, leftMeetings), offering('B-1', courses[1].id, rightMeetings)]
  const catalog = { courses, offerings } as Catalog
  return { catalogIndex: createCatalogIndex(catalog), entries: [entry('a', courses[0].id, offerings[0].id), entry('b', courses[1].id, offerings[1].id)] }
}

describe('实际教学周冲突', () => {
  it('星期、节次、教学周三者同时交叉才冲突', () => {
    const data = index([meeting([1, 3, 5])], [meeting([3, 4])])
    expect(detectConflicts(data.entries, data.catalogIndex)[0]).toMatchObject({ weekday: 1, periods: [1, 2], weeks: [3] })
  })

  it('同星期同节次但教学周不交叉不冲突', () => {
    const data = index([meeting([1, 3, 5])], [meeting([2, 4, 6])])
    expect(detectConflicts(data.entries, data.catalogIndex)).toHaveLength(0)
  })

  it('支持周日补课和同课程多时段', () => {
    const data = index([meeting([8], 7, [5, 6]), meeting([9], 2, [1, 2])], [meeting([8], 7, [6, 7])])
    expect(detectConflicts(data.entries, data.catalogIndex)[0]).toMatchObject({ weekday: 7, periods: [6], weeks: [8] })
  })
})
