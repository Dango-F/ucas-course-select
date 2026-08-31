import { describe, expect, it } from 'vitest'
import { transcriptTermOrder } from '../src/domain/term'

describe('成绩单学期排序', () => {
  it('秋季第一学期排在春季第二学期之前', () => {
    const terms = ['2026—2027学年(秋)第一学期', '2026—2027学年(春)第二学期']
    expect([...terms].sort((left, right) => transcriptTermOrder(left) - transcriptTermOrder(right))).toEqual(terms)
  })
})
