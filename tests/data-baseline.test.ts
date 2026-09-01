import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Catalog } from '../src/types'

describe('内置课程库验收基线', () => {
  it('保留0901三张工作簿的基线统计与样式解析结果', async () => {
    const catalog = JSON.parse(await readFile(resolve(process.cwd(), 'public/data/catalog.json'), 'utf8')) as Catalog
    expect(catalog.dataVersion).toBe('2026-09-01')
    expect(catalog.stats).toMatchObject({
      planFall: 1501, planSpring: 1479, coreFall: 1028, coreSpring: 879,
      scheduleOfferings: 2079, scheduleRows: 3468, scheduleMeetings: 3470,
    })
    expect(catalog.termConfig.fall.weeks).toBe(22)
    expect(catalog.courses.some((course) => course.professionalProgramCourse)).toBe(true)
    expect(catalog.courses.some((course) => course.isBenYan)).toBe(true)
    expect(catalog.courses.filter((course) => /^英语A(?:$|[-—_（(])/.test(course.name.normalize('NFKC').replace(/\s+/g, ''))).every((course) => course.hours === 32)).toBe(true)
    const masterMoocEnglish = catalog.courses.filter((course) => course.name === '硕士学位英语（慕课学习）')
    expect(masterMoocEnglish.length).toBeGreaterThan(0)
    expect(masterMoocEnglish.every((course) => course.level === '硕士课程')).toBe(true)
    expect(catalog.courses.some((course) => /^说明[：:]/.test(course.baseCode))).toBe(false)
    expect(catalog.offerings.some((offering) => /英语B.*高级写作/i.test(offering.name))).toBe(true)
    expect(catalog.offerings.some((offering) => offering.offeringCode === '180083075100P3003H')).toBe(true)

    const robotPractice = catalog.courses.find((course) => course.name === '智能机器人原型设计与制造实践')
    expect(robotPractice).toMatchObject({
      department: '计算机科学与技术学院', attribute: '实验课', subject: '计算机应用技术', firstLevelDiscipline: '计算机科学与技术',
    })
    expect(catalog.courses.find((course) => course.name === '应用统计学基础')).toMatchObject({
      subject: '统计学', firstLevelDiscipline: '统计学（经济大类）',
    })
    expect(catalog.courses.find((course) => course.name === '大数据科学')).toMatchObject({
      subject: '基因组健康技术', firstLevelDiscipline: '生物学',
    })

    const earthquake = catalog.offerings.find((offering) => offering.offeringCode === '1800830708Z1P5001H')
    const bone = catalog.offerings.find((offering) => offering.offeringCode === '180083070903P6003H')
    expect(earthquake?.meetings.map((meeting) => meeting.rawTime)).toEqual(expect.arrayContaining(['周六(1-3)', '周六(5-7)']))
    expect(bone?.meetings).toHaveLength(2)
    expect(catalog.diagnostics.some((item) => item.kind === 'schedule-unparsed')).toBe(false)
  })
})
