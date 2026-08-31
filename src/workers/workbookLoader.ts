import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'

export async function loadWorkbook(buffer: ArrayBuffer, fileName: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  if (/\.xls$/i.test(fileName)) {
    const legacyWorkbook = XLSX.read(buffer, { type: 'array', cellStyles: true, cellNF: true })
    const converted = XLSX.write(legacyWorkbook, { bookType: 'xlsx', type: 'array', cellStyles: true })
    await workbook.xlsx.load(converted as never)
  } else {
    await workbook.xlsx.load(buffer as never)
  }
  return workbook
}
