import { describe, expect, it } from 'vitest'
import { buildOverviewRequirementItems } from '../src/domain/overview'
import type { RequirementItem } from '../src/types'

const requirement = (key: string, label: string, current: number, target = 1): RequirementItem => ({
  key, label, current, target, unit: key === 'public-elective' ? '学分' : '项',
  status: current >= target ? 'passed' : current > 0 ? 'warning' : 'pending', detail: label,
})

describe('培养概览要求摘要', () => {
  it('把公共必修要求聚合为一项，并排在公共选修课之前', () => {
    const result = buildOverviewRequirementItems([
      requirement('term-credits', '秋季有效学分', 8, 10),
      requirement('public-elective', '公共选修课', 0, 2),
      requirement('theory', '新时代中国特色社会主义理论与实践', 1),
      requirement('dialectics', '自然辩证法概论', 0),
      requirement('master-english', '硕士学位英语', 1),
      requirement('ethics-general', '学术道德与写作规范·通论', 0),
    ])
    expect(result.map((item) => item.key)).toEqual(['term-credits', 'public-compulsory', 'public-elective'])
    const publicCompulsory = result[1]
    expect(publicCompulsory.label).toBe('公共必修课')
    expect(publicCompulsory.current).toBe(2)
    expect(publicCompulsory.target).toBe(4)
    expect(publicCompulsory.detail).toContain('自然辩证法概论')
    expect(publicCompulsory.detail).toContain('学术道德与写作规范·通论')
  })
})
