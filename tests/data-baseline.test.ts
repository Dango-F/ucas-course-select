import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Catalog } from '../src/types'

describe('内置课程库验收基线', () => {
  it('保留三张工作簿的基线统计与样式解析结果', async () => {
    const catalog = JSON.parse(await readFile(resolve(process.cwd(), 'public/data/catalog.json'), 'utf8')) as Catalog
    expect(catalog.stats).toMatchObject({
      planFall: 1498, planSpring: 1476, coreFall: 1025, coreSpring: 876,
      scheduleOfferings: 2077, scheduleRows: 3466, scheduleMeetings: 3468,
    })
    expect(catalog.termConfig.fall.weeks).toBe(22)
    expect(catalog.courses.some((course) => course.professionalProgramCourse)).toBe(true)
    expect(catalog.courses.some((course) => course.isBenYan)).toBe(true)
    expect(catalog.courses.filter((course) => course.name === '英语A').every((course) => course.hours === 64)).toBe(true)
    expect(catalog.courses.some((course) => /^说明[：:]/.test(course.baseCode))).toBe(false)
    expect(catalog.offerings.some((offering) => /英语B.*高级写作/i.test(offering.name))).toBe(true)

    const earthquake = catalog.offerings.find((offering) => offering.offeringCode === '1800830708Z1P5001H')
    const bone = catalog.offerings.find((offering) => offering.offeringCode === '180083070903P6003H')
    expect(earthquake?.meetings.map((meeting) => meeting.rawTime)).toEqual(expect.arrayContaining(['周六(1-3)', '周六(5-7)']))
    expect(bone?.meetings).toHaveLength(2)
    expect(catalog.diagnostics.some((item) => item.kind === 'schedule-unparsed')).toBe(false)
  })
})
