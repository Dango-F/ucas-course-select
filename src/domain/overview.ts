import type { RequirementItem } from '../types'

const PUBLIC_COMPULSORY_KEYS = [
  'theory', 'dialectics', 'master-english', 'marxism', 'doctor-english',
  'ethics-general', 'ethics-specific', 'engineering-ethics',
]

const OVERVIEW_ORDER = [
  'term-credits', 'degree-credits', 'core-count', 'professional-count',
  'doctor-degree-count', 'professional-elective', 'public-compulsory', 'public-elective',
]

export function buildOverviewRequirementItems(items: RequirementItem[]): RequirementItem[] {
  const publicItems = items.filter((item) => PUBLIC_COMPULSORY_KEYS.includes(item.key))
  const publicCompulsory: RequirementItem | null = publicItems.length ? {
    key: 'public-compulsory',
    label: '公共必修课',
    current: publicItems.reduce((sum, item) => sum + Math.min(item.current, item.target), 0),
    target: publicItems.reduce((sum, item) => sum + item.target, 0),
    unit: '项',
    status: publicItems.every((item) => item.status === 'passed')
      ? 'passed'
      : publicItems.some((item) => item.status !== 'pending') ? 'warning' : 'pending',
    detail: publicItems.every((item) => item.status === 'passed')
      ? '已完成当前培养类别的全部公共必修要求'
      : `待完成：${publicItems.filter((item) => item.status !== 'passed').map((item) => item.label).join('、')}`,
  } : null

  const itemMap = new Map(items.map((item) => [item.key, item]))
  if (publicCompulsory) itemMap.set(publicCompulsory.key, publicCompulsory)
  return OVERVIEW_ORDER.flatMap((key) => {
    const item = itemMap.get(key)
    return item ? [item] : []
  })
}
