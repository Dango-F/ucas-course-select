import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ScheduleTable from '../src/components/ScheduleTable.vue'
import type { ScheduleExportRow, TranscriptIdentity } from '../src/types'

const identity: TranscriptIdentity = {
  name: '测试学生',
  studentId: '20260001',
  trainingUnit: '计算机科学与技术学院',
  category: '硕士（学术型）',
  major: '计算机应用技术',
}

const row: ScheduleExportRow = {
  sequence: 1,
  term: 'fall',
  name: '矩阵分析与应用',
  courseCode: 'TEST-COURSE-001H',
  attribute: '专业课',
  level: '硕博通用课程',
  hours: 40,
  credits: 2,
  degreeLabel: '学位课',
  teachers: '测试教师',
  leadProfessor: '测试首席教授',
  campus: '雁栖湖',
  capacityLabel: '名额 0 / 100',
  teachingMethod: '课堂讲授',
  examMethod: '闭卷考试',
  conflict: false,
  meetings: [{ weeks: [1, 2], weekday: 1, periods: [1, 2], room: '教一楼101', rawWeeks: '第1-2周', rawTime: '周一(1-2)' }],
}

describe('课程总表预览', () => {
  it('课程块展示学位课、课程名称、代码、教师、考核方式和完整上课信息', () => {
    const wrapper = mount(ScheduleTable, { props: { identity, rows: [row], termLabel: '2026 秋季', generatedDate: '2026年8月31日' } })
    const blockText = wrapper.get('.schedule-weekly-block').text()

    expect(blockText).toContain('学位课')
    expect(blockText).toContain('矩阵分析与应用')
    expect(blockText).toContain('第1-2周')
    expect(blockText).toContain('周一(1-2)')
    expect(blockText).toContain('教一楼101')
    expect(blockText).toContain(row.courseCode)
    expect(blockText).toContain(row.teachers)
    expect(blockText).toContain(row.leadProfessor)
    expect(blockText).toContain(row.examMethod)
    expect(blockText).toContain('主讲')
    expect(blockText).toContain('首席')
    expect(blockText).toContain('考核')
    expect(blockText).not.toContain(row.attribute)
    expect(wrapper.text()).not.toContain('统计范围')
  })

  it('课程明细按内容拆页，并且上课安排不重复星期前缀', () => {
    const denseRows = Array.from({ length: 9 }, (_, index): ScheduleExportRow => ({
      ...row,
      sequence: index + 1,
      name: `课程明细测试 ${index + 1}`,
      courseCode: `TEST-${index + 1}`,
      meetings: [
        { ...row.meetings[0], rawTime: '周二(3-4)', rawWeeks: '第2-5周', room: '教一楼101' },
        { ...row.meetings[0], rawTime: '周五(3-4)', rawWeeks: '第6-12周', room: '教一楼102' },
        { ...row.meetings[0], rawTime: '周日(3-4)', rawWeeks: '第13周', room: '教一楼103' },
      ],
    }))
    const wrapper = mount(ScheduleTable, { props: { identity, rows: denseRows, termLabel: '2026 秋季', generatedDate: '2026年8月31日' } })
    const detailPages = wrapper.findAll('.schedule-detail-page')

    expect(detailPages.length).toBeGreaterThan(1)
    expect(detailPages.flatMap((page) => page.findAll('tbody tr'))).toHaveLength(denseRows.length)
    expect(detailPages.every((page) => page.findAll('tbody tr').length <= 5)).toBe(true)
    expect(wrapper.findAll('.detail-meeting-cell b').every((meeting) => !meeting.text().startsWith('周周'))).toBe(true)
  })

  it('可在总表课程卡片右下角通过垃圾桶删除课程', async () => {
    const wrapper = mount(ScheduleTable, { props: { identity, rows: [{ ...row, entryId: 'entry-1' }], termLabel: '2026 秋季', generatedDate: '2026年8月31日', totalOnly: true, deletable: true } })
    const removeButton = wrapper.get('.schedule-weekly-block .schedule-remove-button')

    expect(removeButton.attributes('aria-label')).toBe('删除矩阵分析与应用')
    expect(removeButton.element.querySelector('svg')).not.toBeNull()
    await removeButton.trigger('click')
    expect(wrapper.emitted('remove')).toEqual([['entry-1']])
  })
})
