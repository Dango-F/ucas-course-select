import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { loadWorkbook } from '../src/workers/workbookLoader'

function toArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value
  return new Uint8Array(value).slice().buffer as ArrayBuffer
}

describe('Excel 工作簿读取', () => {
  it('可以读取传统 .xls 文件并交给统一解析流程', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['课程编码', '课程名称', '开课学期'],
      ['C001', '测试课程', '秋季'],
    ]), '课程计划')
    const legacyBuffer = XLSX.write(workbook, { bookType: 'xls', type: 'array' }) as ArrayBuffer | Uint8Array

    const loaded = await loadWorkbook(toArrayBuffer(legacyBuffer), '课程计划.xls')
    expect(loaded.worksheets[0].name).toBe('课程计划')
    expect(loaded.worksheets[0].getCell(1, 1).value).toBe('课程编码')
    expect(loaded.worksheets[0].getCell(2, 2).value).toBe('测试课程')
  })
})
