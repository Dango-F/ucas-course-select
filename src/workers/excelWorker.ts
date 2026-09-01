/// <reference lib="webworker" />
import ExcelJS from 'exceljs'
import { transcriptTermOrder } from '../domain/term'
import type { Catalog, Course, CourseOffering, ImportPreview, Meeting, ScheduleExportRow, Term, TranscriptIdentity, TranscriptRow } from '../types'
import { loadWorkbook } from './workbookLoader'

type ImportMessage = {
  action: 'import'
  fileName: string
  buffer: ArrayBuffer
  baseCodes: Record<Term, string[]>
  existingCourseIds: string[]
  existingOfferingIds: string[]
}
type ExportMessage =
  | { action: 'export'; rows: TranscriptRow[]; identity: TranscriptIdentity; generatedDate: string }
  | { action: 'export-schedule'; rows: ScheduleExportRow[]; identity: TranscriptIdentity; generatedDate: string; termLabel: string }
const ENGLISH_A_HOURS = 64

const valueText = (value: ExcelJS.CellValue): string => {
  if (value == null) return ''
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text ?? '').trim()
    if ('result' in value) return String(value.result ?? '').trim()
    if ('richText' in value) return value.richText.map((item) => item.text).join('').trim()
  }
  return String(value).trim()
}
const numberValue = (value: ExcelJS.CellValue) => Number.parseFloat(valueText(value)) || 0
const splitMulti = (value: ExcelJS.CellValue) => valueText(value).split(/[；;\n、]/).map((item) => item.trim()).filter(Boolean)
const uniq = <T>(items: T[]) => [...new Set(items.filter(Boolean))]
const courseId = (term: Term, code: string) => `${term}:${code}`
const isBenYan = (code: string) => /^B/i.test(code) || /^\d{5}B/i.test(code)

function parseWeeks(value: ExcelJS.CellValue): number[] {
  const cleaned = valueText(value).replace(/[第周\s]/g, '').replace(/，/g, ',').replace(/[—–]/g, '-')
  const result: number[] = []
  for (const part of cleaned.split(',')) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!match) continue
    const start = Number(match[1]); const end = Number(match[2] ?? match[1])
    for (let week = start; week <= end; week += 1) result.push(week)
  }
  return uniq(result).sort((a, b) => a - b)
}

function parseMeetings(weeks: ExcelJS.CellValue, time: ExcelJS.CellValue, room: ExcelJS.CellValue): Meeting[] {
  const rawTime = valueText(time)
  const match = rawTime.match(/^周([一二三四五六日天])\s*[（(]\s*([^）)]+?)\s*[）)]$/)
  if (!match) return []
  const weekday = ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 } as Record<string, number>)[match[1]]
  const ranges = match[2].replace(/[，、；;]/g, ',').replace(/[—–－]/g, '-').split(',').map((part) => part.trim()).filter(Boolean)
  const parsedRanges: Array<{ start: number; end: number; label: string }> = []
  for (const range of ranges) {
    const rangeMatch = range.match(/^(\d+)\s*(?:-\s*(\d+)\s*)?$/)
    if (!rangeMatch) return []
    const start = Number(rangeMatch[1]); const end = Number(rangeMatch[2] ?? rangeMatch[1])
    if (end < start) return []
    parsedRanges.push({ start, end, label: `${start}${rangeMatch[2] ? `-${end}` : ''}` })
  }
  const rawWeeks = valueText(weeks); const roomText = valueText(room)
  return parsedRanges.map(({ start, end, label }) => ({
    weeks: parseWeeks(weeks), weekday, periods: Array.from({ length: end - start + 1 }, (_, index) => start + index), room: roomText,
    rawWeeks, rawTime: parsedRanges.length === 1 ? rawTime : `周${match[1]}(${label})`,
  }))
}

function defaultCourse(term: Term, code: string): Course {
  return { id: courseId(term, code), term, baseCode: code, name: '', englishName: '', department: '', campuses: [], attribute: '', level: '', subject: '', firstLevelDiscipline: '', sharedSubjects: [], sharedFirstLevels: [], sharedAttributes: [], sharedLevels: [], hours: 0, credits: 0, professionalProgramCourse: false, isBenYan: isBenYan(code), sourceKinds: [] }
}

function headerMap(sheet: ExcelJS.Worksheet): { row: number; headers: Map<string, number> } | null {
  for (let rowNumber = 1; rowNumber <= Math.min(6, sheet.rowCount); rowNumber += 1) {
    const headers = new Map<string, number>()
    const occurrences = new Map<string, number>()
    sheet.getRow(rowNumber).eachCell((cell, column) => {
      const text = valueText(cell.value)
      if (!text) return
      const count = (occurrences.get(text) ?? 0) + 1
      occurrences.set(text, count)
      headers.set(count === 1 ? text : `${text}#${count}`, column)
    })
    if (headers.has('课程编码') && headers.has('课程名称')) return { row: rowNumber, headers }
  }
  return null
}

const column = (headers: Map<string, number>, ...names: string[]) => names.map((name) => headers.get(name)).find(Boolean) ?? 0
const cell = (row: ExcelJS.Row, index: number) => index ? row.getCell(index) : null
const cellValue = (row: ExcelJS.Row, index: number): ExcelJS.CellValue => cell(row, index)?.value ?? null
const cellText = (row: ExcelJS.Row, index: number) => valueText(cellValue(row, index))
const redFont = (cellValue: ExcelJS.Cell | null) => {
  const argb = String(cellValue?.font?.color && 'argb' in cellValue.font.color ? cellValue.font.color.argb : '').toUpperCase()
  return argb.endsWith('FF0000') || argb.endsWith('C00000')
}

async function normalizeWorkbook(message: ImportMessage): Promise<ImportPreview> {
  const workbook = await loadWorkbook(message.buffer, message.fileName)
  const courses = new Map<string, Course>()
  const offerings = new Map<string, CourseOffering>()
  const diagnostics: string[] = []
  let detected: ImportPreview['kind'] = 'unknown'
  let rowsRead = 0
  let unmatched = 0
  let missingFields = 0

  const upsert = (term: Term, code: string, partial: Partial<Course>) => {
    const id = courseId(term, code)
    const current = courses.get(id) ?? defaultCourse(term, code)
    const merged = {
      ...current, ...partial, id, term, baseCode: code,
      campuses: uniq([...(current.campuses ?? []), ...(partial.campuses ?? [])]),
      sharedSubjects: uniq([...(current.sharedSubjects ?? []), ...(partial.sharedSubjects ?? [])]),
      sharedFirstLevels: uniq([...(current.sharedFirstLevels ?? []), ...(partial.sharedFirstLevels ?? [])]),
      sharedAttributes: uniq([...(current.sharedAttributes ?? []), ...(partial.sharedAttributes ?? [])]),
      sharedLevels: uniq([...(current.sharedLevels ?? []), ...(partial.sharedLevels ?? [])]),
      sourceKinds: uniq([...(current.sourceKinds ?? []), ...(partial.sourceKinds ?? [])]),
      professionalProgramCourse: current.professionalProgramCourse || partial.professionalProgramCourse === true,
      isBenYan: current.isBenYan || partial.isBenYan === true,
    }
    if (merged.name === '英语A') merged.hours = ENGLISH_A_HOURS
    courses.set(id, merged)
  }

  for (const sheet of workbook.worksheets) {
    const header = headerMap(sheet)
    if (!header) { diagnostics.push(`${sheet.name}：未找到课程编码/课程名称表头`); continue }
    const { headers } = header
    const kind: ImportPreview['kind'] = headers.has('星期节次') ? 'schedule' : headers.has('所属一级学科') ? 'core' : headers.has('课程所属学科') ? 'plan' : 'unknown'
    if (kind === 'unknown') { diagnostics.push(`${sheet.name}：表头无法识别`); continue }
    detected = detected === 'unknown' ? kind : detected
    const defaultTerm: Term = /春/.test(sheet.name) || /春/.test(message.fileName) ? 'spring' : 'fall'
    const codeColumn = column(headers, '课程编码')
    const nameColumn = column(headers, '课程名称')
    for (let rowNumber = header.row + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber)
      const code = cellText(row, codeColumn)
      if (!code || /^说明[：:]/.test(code)) continue
      rowsRead += 1
      if (!cellText(row, nameColumn)) missingFields += 1
      const termText = cellText(row, column(headers, '开课学期'))
      const term: Term = /春/.test(termText) ? 'spring' : /秋/.test(termText) ? 'fall' : defaultTerm
      if (kind === 'plan') {
        upsert(term, code, {
          name: cellText(row, nameColumn), department: cellText(row, column(headers, '开课院系')),
          campuses: [cellText(row, column(headers, '开课校区'))], attribute: cellText(row, column(headers, '课程属性')),
          subject: cellText(row, column(headers, '课程所属学科')), hours: numberValue(cellValue(row, column(headers, '学时'))),
          credits: numberValue(cellValue(row, column(headers, '学分'))), sourceKinds: ['plan'], isBenYan: isBenYan(code),
        })
      } else if (kind === 'core') {
        upsert(term, code, {
          name: cellText(row, nameColumn), department: cellText(row, column(headers, '开课院系')),
          campuses: [cellText(row, column(headers, '开课校区'))], attribute: cellText(row, column(headers, '课程属性')),
          level: cellText(row, column(headers, '培养层次')), subject: cellText(row, column(headers, '课程所属学科')),
          firstLevelDiscipline: cellText(row, column(headers, '所属一级学科')), hours: numberValue(cellValue(row, column(headers, '学时'))),
          credits: numberValue(cellValue(row, column(headers, '学分'))), sharedSubjects: splitMulti(cellValue(row, column(headers, '共享学科'))),
          sharedFirstLevels: splitMulti(cellValue(row, column(headers, '共享学科所属一级学科/专业学位'))),
          sharedAttributes: splitMulti(cellValue(row, column(headers, '共享学科课程属性'))),
          sharedLevels: splitMulti(cellValue(row, column(headers, '共享学科培养层次', '培养层次#2'))),
          professionalProgramCourse: redFont(cell(row, nameColumn)), sourceKinds: ['core'], isBenYan: isBenYan(code),
        })
      } else {
        const bases = message.baseCodes[term].slice().sort((a, b) => b.length - a.length)
        const baseCode = bases.includes(code) ? code : bases.find((base) => code.startsWith(`${base}-`)) ?? code
        if (baseCode === code && !bases.includes(code)) unmatched += 1
        const [hours, credits] = cellText(row, column(headers, '课时/学分')).split('/').map((item) => Number.parseFloat(item) || 0)
        upsert(term, baseCode, {
          name: cellText(row, nameColumn), englishName: cellText(row, column(headers, '英文名称')),
          department: cellText(row, column(headers, '开课院系')), attribute: cellText(row, column(headers, '课程属性')),
          level: cellText(row, column(headers, '培养层次')), subject: cellText(row, column(headers, '所属学科/专业')),
          hours, credits, sourceKinds: ['schedule'], isBenYan: isBenYan(code),
        })
        const id = `${term}:${code}`
        const existing = offerings.get(id) ?? {
          id, courseId: courseId(term, baseCode), term, offeringCode: code, name: cellText(row, nameColumn), campus: '', capacity: numberValue(cellValue(row, column(headers, '限选人数'))),
          enrolled: numberValue(cellValue(row, column(headers, '已选人数'))), teachingMethod: cellText(row, column(headers, '授课方式')),
          examMethod: cellText(row, column(headers, '考试方式')), leadProfessor: cellText(row, column(headers, '首席教授')),
          teachers: [], meetings: [],
        }
        existing.teachers = uniq([...existing.teachers, cellText(row, column(headers, '主讲教师'))])
        const meetings = parseMeetings(cellValue(row, column(headers, '开课周')), cellValue(row, column(headers, '星期节次')), cellValue(row, column(headers, '教室')))
        if (!meetings.length) diagnostics.push(`${sheet.name}：第${rowNumber}行的星期节次无法解析：${cellText(row, column(headers, '星期节次'))}`)
        for (const meeting of meetings) {
          if (!existing.meetings.some((item) => JSON.stringify(item) === JSON.stringify(meeting))) existing.meetings.push(meeting)
        }
        offerings.set(id, existing)
      }
    }
  }

  if (detected === 'unknown') diagnostics.push('没有可导入的工作表，原有课程库未修改。')
  const existingCourseIds = new Set(message.existingCourseIds)
  const existingOfferingIds = new Set(message.existingOfferingIds)
  const overwritten = [...courses.keys()].filter((id) => existingCourseIds.has(id)).length
    + [...offerings.keys()].filter((id) => existingOfferingIds.has(id)).length
  const added = courses.size + offerings.size - overwritten
  return {
    kind: detected, fileName: message.fileName, courses: [...courses.values()], offerings: [...offerings.values()], diagnostics, rowsRead,
    summary: { added, overwritten, unmatched, missingFields },
  }
}

async function exportPlan(message: Extract<ExportMessage, { action: 'export' }>): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '国科大选课规划'
  workbook.created = new Date()
  workbook.calcProperties.fullCalcOnLoad = true

  const sheet = workbook.addWorksheet('研究生课程选课单', { views: [{ showGridLines: false, zoomScale: 90 }] })
  sheet.properties.defaultRowHeight = 22
  sheet.columns = [31, 40, 14, 9, 9, 11, 11].map((width) => ({ width }))
  sheet.pageSetup = {
    orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.38, right: 0.38, top: 0.42, bottom: 0.45, header: 0.18, footer: 0.2 },
  }

  sheet.mergeCells('A1:G1')
  const title = sheet.getCell('A1')
  title.value = '研究生课程选课单'
  title.font = { name: '黑体', size: 21, bold: true, color: { argb: 'FF000000' } }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 42
  sheet.getRow(2).height = 36

  const richLabel = (label: string, value: string, size = 11) => ({
    richText: [
      { font: { name: '宋体', size, bold: true }, text: label },
      { font: { name: '宋体', size }, text: value },
    ],
  })
  sheet.mergeCells('A3:B3'); sheet.mergeCells('C3:D3'); sheet.mergeCells('E3:G3')
  sheet.mergeCells('A4:B4'); sheet.mergeCells('C4:D4'); sheet.mergeCells('E4:G4')
  sheet.getCell('A3').value = richLabel('姓　　名：', message.identity.name)
  sheet.getCell('C3').value = richLabel('学生类别：', message.identity.category)
  sheet.getCell('E3').value = richLabel('培养单位：', message.identity.trainingUnit, 8.8)
  sheet.getCell('A4').value = richLabel('学　　号：', message.identity.studentId)
  sheet.getCell('C4').value = richLabel('所学专业：', message.identity.major)
  for (const address of ['A3', 'C3', 'E3', 'A4', 'C4']) sheet.getCell(address).alignment = { vertical: 'middle', wrapText: false }
  sheet.getCell('E3').alignment = { vertical: 'middle', wrapText: false, shrinkToFit: true }
  sheet.getRow(3).height = 24; sheet.getRow(4).height = 24

  const headerRow = 5
  const headers = ['学年学期', '课程名称', '课程来源', '学时', '学分', '成绩', '学位课']
  sheet.getRow(headerRow).values = headers
  sheet.getRow(headerRow).height = 26
  sheet.getRow(headerRow).eachCell((cell) => {
    cell.font = { name: '宋体', size: 11, bold: true, color: { argb: 'FF000000' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  const orderedRows = [...message.rows].sort((a, b) => transcriptTermOrder(a.term) - transcriptTermOrder(b.term) || a.name.localeCompare(b.name, 'zh-CN'))
  const rows = orderedRows.length ? orderedRows : [{ term: '—', name: '以下空白', source: '正式方案' as const, hours: 0, credits: 0, grade: '', degree: '' }]
  let rowNumber = headerRow + 1
  let groupStart = rowNumber
  let currentTerm = rows[0].term
  const mergeCurrentTerm = (start: number, end: number) => { if (end > start) sheet.mergeCells(start, 1, end, 1) }

  for (const row of rows) {
    if (row.term !== currentTerm) {
      mergeCurrentTerm(groupStart, rowNumber - 1)
      currentTerm = row.term
      groupStart = rowNumber
    }
    sheet.getRow(rowNumber).values = [row.term, row.name, row.source, row.hours || null, row.credits || null, row.grade, row.degree]
    sheet.getRow(rowNumber).height = row.name.length > 24 ? 34 : 23
    rowNumber += 1
  }
  mergeCurrentTerm(groupStart, rowNumber - 1)
  const dataStart = headerRow + 1
  const dataEnd = rowNumber - 1

  sheet.getRow(rowNumber).values = [null, '以下空白', null, null, null, null, null]; sheet.getRow(rowNumber).height = 22; rowNumber += 1
  sheet.getRow(rowNumber).values = [null, null, null, null, null, null, null]; sheet.getRow(rowNumber).height = 22; rowNumber += 1

  const totalRow = rowNumber
  const formalCredits = message.rows.filter((row) => row.source === '正式方案').reduce((total, row) => total + row.credits, 0)
  const degreeCredits = message.rows.filter((row) => row.source === '正式方案' && row.degree === '是').reduce((total, row) => total + row.credits, 0)
  sheet.mergeCells(totalRow, 2, totalRow, 4)
  sheet.mergeCells(totalRow, 5, totalRow, 6)
  sheet.getCell(totalRow, 1).value = '总学分'
  sheet.getCell(totalRow, 2).value = { formula: `SUMIF(C${dataStart}:C${dataEnd},"正式方案",E${dataStart}:E${dataEnd})`, result: formalCredits }
  sheet.getCell(totalRow, 5).value = '学位课学分'
  sheet.getCell(totalRow, 7).value = { formula: `SUMIFS(E${dataStart}:E${dataEnd},C${dataStart}:C${dataEnd},"正式方案",G${dataStart}:G${dataEnd},"是")`, result: degreeCredits }
  sheet.getRow(totalRow).height = 26
  rowNumber += 1

  const gpaRow = rowNumber
  sheet.mergeCells(gpaRow, 2, gpaRow, 7)
  sheet.getCell(gpaRow, 1).value = '平均学分绩点（GPA）'
  sheet.getCell(gpaRow, 2).value = '—'
  sheet.getRow(gpaRow).height = 26
  rowNumber += 1

  const notesRow = rowNumber
  sheet.mergeCells(notesRow, 1, notesRow, 7)
  sheet.getCell(notesRow, 1).value = '备注： 1. 本单显示正式方案及备选池课程，“课程来源”栏用于区分。\n          2. 总学分和学位课学分只统计正式方案；成绩与 GPA 不由本工具生成。\n          3. 本单仅供课程规划，以培养方案、导师、培养单位及学校正式系统为准。'
  sheet.getCell(notesRow, 1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
  sheet.getRow(notesRow).height = 66

  const footerRow = notesRow + 2
  sheet.mergeCells(footerRow, 1, footerRow, 7)
  sheet.getCell(footerRow, 1).value = `中国科学院大学 · 选课规划工具　${message.generatedDate}`
  sheet.getCell(footerRow, 1).alignment = { horizontal: 'right', vertical: 'middle' }
  sheet.mergeCells(footerRow + 1, 1, footerRow + 1, 7)
  sheet.getCell(footerRow + 1, 1).value = '1 - 1'
  sheet.getCell(footerRow + 1, 1).alignment = { horizontal: 'right', vertical: 'middle' }

  const thin = { style: 'thin' as const, color: { argb: 'FF000000' } }
  const medium = { style: 'medium' as const, color: { argb: 'FF000000' } }
  const tableEnd = notesRow
  for (let row = headerRow; row <= tableEnd; row += 1) {
    for (let column = 1; column <= 7; column += 1) {
      const cell = sheet.getCell(row, column)
      cell.font = { ...cell.font, name: '宋体', size: row === headerRow ? 11 : 10.5, color: { argb: 'FF000000' } }
      if (row !== notesRow) cell.alignment = { horizontal: row === headerRow ? 'center' : column === 2 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      cell.border = {
        top: row === headerRow ? medium : thin,
        bottom: row === tableEnd ? medium : thin,
        left: column === 1 ? medium : thin,
        right: column === 7 ? medium : thin,
      }
    }
  }
  for (let row = dataStart; row <= dataEnd; row += 1) {
    sheet.getCell(row, 4).numFmt = 'General'
    sheet.getCell(row, 5).numFmt = 'General'
  }
  sheet.getCell(totalRow, 2).numFmt = 'General'; sheet.getCell(totalRow, 7).numFmt = 'General'
  sheet.getCell(totalRow, 1).font = { name: '宋体', size: 11, bold: true }
  sheet.getCell(totalRow, 5).font = { name: '宋体', size: 11, bold: true }
  sheet.getCell(gpaRow, 1).font = { name: '宋体', size: 11, bold: true }
  sheet.getCell(notesRow, 1).font = { name: '宋体', size: 10.5 }
  sheet.getCell(footerRow, 1).font = { name: '宋体', size: 10.5 }
  sheet.getCell(footerRow + 1, 1).font = { name: '宋体', size: 10.5 }
  sheet.pageSetup.printArea = `A1:G${footerRow + 1}`
  sheet.headerFooter.oddFooter = '&R第 &P 页 / 共 &N 页'

  const rawBuffer = await workbook.xlsx.writeBuffer() as unknown
  if (rawBuffer instanceof ArrayBuffer) return rawBuffer
  return Uint8Array.from(rawBuffer as Uint8Array).buffer
}

function scheduleMeetingText(meeting: Meeting) {
  return `${meeting.rawTime}\n${meeting.rawWeeks} · ${meeting.room || '教室待定'}`
}

async function exportScheduleLegacy(message: Extract<ExportMessage, { action: 'export-schedule' }>): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '国科大选课规划'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('课表总表', { views: [{ showGridLines: false, zoomScale: 80 }] })
  sheet.properties.defaultRowHeight = 24
  sheet.columns = [6, 27, 17, 8, 8, 24, 43, 18, 21, 16].map((width) => ({ width }))
  sheet.pageSetup = {
    orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.28, right: 0.28, top: 0.38, bottom: 0.42, header: 0.15, footer: 0.18 },
  }

  sheet.mergeCells('A1:J1')
  const title = sheet.getCell('A1')
  title.value = '研究生课表总表'
  title.font = { name: '黑体', size: 21, bold: true, color: { argb: 'FF000000' } }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 40

  const richLabel = (label: string, value: string, size = 10.5) => ({
    richText: [
      { font: { name: '宋体', size, bold: true }, text: label },
      { font: { name: '宋体', size }, text: value },
    ],
  })
  sheet.mergeCells('A3:B3'); sheet.mergeCells('C3:D3'); sheet.mergeCells('E3:G3'); sheet.mergeCells('H3:J3')
  sheet.mergeCells('A4:B4'); sheet.mergeCells('C4:E4'); sheet.mergeCells('F4:J4')
  sheet.getCell('A3').value = richLabel('姓　　名：', message.identity.name)
  sheet.getCell('C3').value = richLabel('学生类别：', message.identity.category)
  sheet.getCell('E3').value = richLabel('培养单位：', message.identity.trainingUnit, 8.6)
  sheet.getCell('H3').value = richLabel('学　　期：', message.termLabel)
  sheet.getCell('A4').value = richLabel('学　　号：', message.identity.studentId)
  sheet.getCell('C4').value = richLabel('所学专业：', message.identity.major)
  sheet.getCell('F4').value = richLabel('统计范围：', '当前学期正式方案课程；备选池不计入课表')
  for (const address of ['A3', 'C3', 'E3', 'H3', 'A4', 'C4', 'F4']) sheet.getCell(address).alignment = { vertical: 'middle', wrapText: false, shrinkToFit: address === 'E3' || address === 'F4' }
  sheet.getRow(3).height = 23; sheet.getRow(4).height = 23

  const totalCredits = message.rows.reduce((total, row) => total + row.credits, 0)
  const degreeCount = message.rows.filter((row) => row.degreeLabel.startsWith('学位课')).length
  const conflictCount = message.rows.filter((row) => row.conflict).length
  sheet.mergeCells('A5:J5')
  sheet.getCell('A5').value = `正式方案 ${message.rows.length} 门　·　总学分 ${totalCredits}　·　学位课 ${degreeCount} 门　·　时间冲突 ${conflictCount} 门`
  sheet.getCell('A5').font = { name: '宋体', size: 10.5, bold: true, color: { argb: 'FF294F72' } }
  sheet.getCell('A5').alignment = { horizontal: 'left', vertical: 'middle' }
  sheet.getRow(5).height = 24

  const headerRow = 6
  const headers = ['序号', '课程与班级', '课程属性 / 层次', '学时', '学分', '教师与首席教授', '全部上课安排', '校区 / 名额', '授课 / 考核', '学位课 / 状态']
  sheet.getRow(headerRow).values = headers
  sheet.getRow(headerRow).height = 31

  const dataStart = headerRow + 1
  if (message.rows.length) {
    message.rows.forEach((row, index) => {
      const excelRow = dataStart + index
      const meetingText = row.meetings.length ? row.meetings.map(scheduleMeetingText).join('\n') : '暂无详细排课'
      sheet.getRow(excelRow).values = [
        row.sequence, `${row.name}\n${row.courseCode}`, `${row.attribute || '属性待定'}\n${row.level || '层次待定'}`,
        row.hours || null, row.credits, `主讲：${row.teachers || '待定'}\n首席：${row.leadProfessor || '待定'}`,
        meetingText, `${row.campus || '校区待定'}\n${row.capacityLabel}`, `${row.teachingMethod || '授课方式待定'}\n${row.examMethod || '考核方式待定'}`,
        `${row.degreeLabel}${row.conflict ? '\n有时间冲突' : ''}`,
      ]
      sheet.getRow(excelRow).height = Math.max(36, 25 + row.meetings.length * 22, row.name.length > 22 ? 52 : 0)
    })
  } else {
    sheet.mergeCells(dataStart, 1, dataStart, 10)
    sheet.getCell(dataStart, 1).value = '当前学期没有正式方案课程'
    sheet.getCell(dataStart, 1).alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(dataStart).height = 32
  }
  const dataEnd = dataStart + Math.max(message.rows.length, 1) - 1

  const notesRow = dataEnd + 2
  sheet.mergeCells(notesRow, 1, notesRow, 10)
  sheet.getCell(notesRow, 1).value = '备注：上课安排按导入数据的全部教学周、星期、节次和教室列出；春季在未导入详细课表时显示“暂无详细排课”。本表仅供课程规划，以培养方案、导师、培养单位及学校正式系统为准。'
  sheet.getCell(notesRow, 1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
  sheet.getCell(notesRow, 1).font = { name: '宋体', size: 9.5, color: { argb: 'FF333333' } }
  sheet.getRow(notesRow).height = 38

  const footerRow = notesRow + 2
  sheet.mergeCells(footerRow, 1, footerRow, 10)
  sheet.getCell(footerRow, 1).value = `中国科学院大学 · 选课规划工具　${message.generatedDate}`
  sheet.getCell(footerRow, 1).alignment = { horizontal: 'right', vertical: 'middle' }
  sheet.getCell(footerRow, 1).font = { name: '宋体', size: 9.5, color: { argb: 'FF333333' } }
  sheet.mergeCells(footerRow + 1, 1, footerRow + 1, 10)
  sheet.getCell(footerRow + 1, 1).value = '1 - 1'
  sheet.getCell(footerRow + 1, 1).alignment = { horizontal: 'right', vertical: 'middle' }
  sheet.getCell(footerRow + 1, 1).font = { name: '宋体', size: 9.5, color: { argb: 'FF333333' } }

  const thin = { style: 'thin' as const, color: { argb: 'FF7C8790' } }
  const medium = { style: 'medium' as const, color: { argb: 'FF202A29' } }
  for (let row = headerRow; row <= dataEnd; row += 1) {
    for (let column = 1; column <= 10; column += 1) {
      const cell = sheet.getCell(row, column)
      cell.font = { name: '宋体', size: row === headerRow ? 10 : 9.5, bold: row === headerRow, color: { argb: 'FF000000' } }
      cell.alignment = { horizontal: row === headerRow || column !== 2 ? 'center' : 'left', vertical: 'middle', wrapText: true }
      cell.border = { top: row === headerRow ? medium : thin, bottom: row === dataEnd ? medium : thin, left: column === 1 ? medium : thin, right: column === 10 ? medium : thin }
      if (row !== headerRow && message.rows[row - dataStart]?.conflict) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE7E5' } }
    }
  }
  for (let column = 1; column <= 10; column += 1) {
    sheet.getCell(notesRow, column).border = { top: thin, bottom: medium, left: column === 1 ? medium : thin, right: column === 10 ? medium : thin }
  }
  sheet.autoFilter = { from: `A${headerRow}`, to: `J${headerRow}` }
  sheet.pageSetup.printArea = `A1:J${footerRow + 1}`
  sheet.headerFooter.oddFooter = '&R第 &P 页 / 共 &N 页'

  const rawBuffer = await workbook.xlsx.writeBuffer() as unknown
  if (rawBuffer instanceof ArrayBuffer) return rawBuffer
  return Uint8Array.from(rawBuffer as Uint8Array).buffer
}

const scheduleWeekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const schedulePeriodTimes = [
  '8:30–9:15', '9:20–10:05', '10:25–11:10', '11:15–12:00',
  '13:30–14:15', '14:20–15:05', '15:25–16:10', '16:15–17:00',
  '17:05–17:50', '18:30–19:15', '19:20–20:05', '20:15–21:00', '21:05–21:50',
]

type WeeklyExportBlock = {
  id: string
  row: ScheduleExportRow
  meeting: Meeting
  weekday: number
  start: number
  span: number
}

function schedulePeriodRuns(periods: number[]) {
  const ordered = uniq(periods.filter((period) => period >= 1 && period <= schedulePeriodTimes.length)).sort((left, right) => left - right)
  const runs: number[][] = []
  for (const period of ordered) {
    const last = runs[runs.length - 1]
    if (last && period === last[last.length - 1] + 1) last.push(period)
    else runs.push([period])
  }
  return runs
}

function weeklyBlocksOverlap(left: WeeklyExportBlock, right: WeeklyExportBlock) {
  return left.weekday === right.weekday && left.start < right.start + right.span && right.start < left.start + left.span
}

function buildWeeklyExportBlocks(rows: ScheduleExportRow[]) {
  return rows.flatMap((row) => row.meetings.flatMap((meeting, meetingIndex) => {
    if (meeting.weekday < 1 || meeting.weekday > scheduleWeekdays.length) return []
    return schedulePeriodRuns(meeting.periods).map((run, runIndex) => ({
      id: `${row.sequence}-${meetingIndex}-${runIndex}-${meeting.rawWeeks}-${meeting.rawTime}`,
      row, meeting, weekday: meeting.weekday, start: run[0], span: run.length,
    }))
  }))
}

function weeklyBlockText(block: WeeklyExportBlock, continuation = false) {
  const name = continuation ? `↳ ${block.row.name}` : block.row.name
  const details = continuation
    ? `${block.row.courseCode} · ${block.meeting.rawWeeks} · ${block.meeting.room || '教室待定'}`
    : `${block.row.courseCode} · ${block.row.credits}学分\n${block.row.teachers || '教师待定'}\n${block.meeting.rawTime}\n${block.meeting.rawWeeks} · ${block.meeting.room || '教室待定'}`
  return `${name}\n${details}`
}

async function exportSchedule(message: Extract<ExportMessage, { action: 'export-schedule' }>): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '国科大选课规划'
  workbook.created = new Date()

  const weeklySheet = workbook.addWorksheet('一周课表', { views: [{ showGridLines: false, zoomScale: 78 }] })
  weeklySheet.properties.defaultRowHeight = 46
  weeklySheet.columns = [13, 25, 25, 25, 25, 25, 25, 25].map((width) => ({ width }))
  weeklySheet.pageSetup = {
    orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1,
    horizontalCentered: true,
    margins: { left: 0.22, right: 0.22, top: 0.34, bottom: 0.38, header: 0.12, footer: 0.16 },
  }

  const thin = { style: 'thin' as const, color: { argb: 'FF9AA9B1' } }
  const medium = { style: 'medium' as const, color: { argb: 'FF202A29' } }
  const richLabel = (label: string, value: string, size = 10.5) => ({
    richText: [
      { font: { name: '宋体', size, bold: true }, text: label },
      { font: { name: '宋体', size }, text: value || '未填写' },
    ],
  })

  weeklySheet.mergeCells('A1:H1')
  weeklySheet.getCell('A1').value = '研究生课表总表'
  weeklySheet.getCell('A1').font = { name: '黑体', size: 21, bold: true, color: { argb: 'FF000000' } }
  weeklySheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  weeklySheet.getRow(1).height = 40

  weeklySheet.mergeCells('A3:B3'); weeklySheet.mergeCells('C3:D3'); weeklySheet.mergeCells('E3:F3'); weeklySheet.mergeCells('G3:H3')
  weeklySheet.mergeCells('A4:B4'); weeklySheet.mergeCells('C4:D4'); weeklySheet.mergeCells('E4:H4')
  weeklySheet.getCell('A3').value = richLabel('姓　　名：', message.identity.name)
  weeklySheet.getCell('C3').value = richLabel('学生类别：', message.identity.category)
  weeklySheet.getCell('E3').value = richLabel('培养单位：', message.identity.trainingUnit, 8.5)
  weeklySheet.getCell('G3').value = richLabel('学　　期：', message.termLabel)
  weeklySheet.getCell('A4').value = richLabel('学　　号：', message.identity.studentId)
  weeklySheet.getCell('C4').value = richLabel('所学专业：', message.identity.major)
  weeklySheet.getCell('E4').value = richLabel('统计范围：', '当前学期正式方案；备选池不计入课表', 9.2)
  for (const address of ['A3', 'C3', 'E3', 'G3', 'A4', 'C4', 'E4']) weeklySheet.getCell(address).alignment = { vertical: 'middle', wrapText: false, shrinkToFit: true }
  weeklySheet.getRow(3).height = 23; weeklySheet.getRow(4).height = 23

  const totalCredits = message.rows.reduce((total, row) => total + row.credits, 0)
  const degreeCount = message.rows.filter((row) => row.degreeLabel.startsWith('学位课')).length
  const conflictCount = message.rows.filter((row) => row.conflict).length
  weeklySheet.mergeCells('A5:H5')
  weeklySheet.getCell('A5').value = `正式方案 ${message.rows.length} 门　·　总学分 ${totalCredits}　·　学位课 ${degreeCount} 门　·　时间冲突 ${conflictCount} 门`
  weeklySheet.getCell('A5').font = { name: '宋体', size: 10.5, bold: true, color: { argb: 'FF294F72' } }
  weeklySheet.getCell('A5').alignment = { horizontal: 'left', vertical: 'middle' }
  weeklySheet.getRow(5).height = 24

  const gridHeaderRow = 7
  const gridStartRow = 8
  const gridEndRow = gridStartRow + schedulePeriodTimes.length - 1
  weeklySheet.getRow(gridHeaderRow).values = ['节次 / 时间', ...scheduleWeekdays]
  const weeklyBlocks = buildWeeklyExportBlocks(message.rows)
  const cellTexts = new Map<string, string[]>()
  const cellBlocks = new Map<string, WeeklyExportBlock[]>()
  const mergedBlocks = weeklyBlocks.filter((block) => block.span > 1 && !weeklyBlocks.some((other) => other.id !== block.id && weeklyBlocksOverlap(block, other)))
  const mergedBlockIds = new Set(mergedBlocks.map((block) => block.id))

  const addCellBlock = (rowNumber: number, dayColumn: number, block: WeeklyExportBlock, continuation: boolean) => {
    const key = `${rowNumber}-${dayColumn}`
    const currentTexts = cellTexts.get(key) ?? []
    currentTexts.push(weeklyBlockText(block, continuation))
    cellTexts.set(key, currentTexts)
    const currentBlocks = cellBlocks.get(key) ?? []
    currentBlocks.push(block)
    cellBlocks.set(key, currentBlocks)
  }

  for (const block of weeklyBlocks) {
    if (mergedBlockIds.has(block.id)) continue
    for (let period = block.start; period < block.start + block.span; period += 1) {
      addCellBlock(gridStartRow + period - 1, block.weekday + 1, block, period !== block.start)
    }
  }

  const normalFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEAF2FA' } }
  const degreeFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF2D4' } }
  const conflictFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFDE7E3' } }
  const baseFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFBFCFD' } }

  for (let column = 1; column <= 8; column += 1) {
    const cell = weeklySheet.getCell(gridHeaderRow, column)
    cell.font = { name: '宋体', size: 10.5, bold: true, color: { argb: column === 1 ? 'FF596B76' : 'FF184994' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: column === 1 ? 'FFF0F4F2' : 'FFE6EEF8' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { top: medium, bottom: thin, left: column === 1 ? medium : thin, right: column === 8 ? medium : thin }
  }
  weeklySheet.getRow(gridHeaderRow).height = 30

  for (let period = 1; period <= schedulePeriodTimes.length; period += 1) {
    const rowNumber = gridStartRow + period - 1
    weeklySheet.getRow(rowNumber).height = 50
    const timeCell = weeklySheet.getCell(rowNumber, 1)
    timeCell.value = `${period}\n${schedulePeriodTimes[period - 1]}`
    timeCell.font = { name: '宋体', size: 8.8, bold: true, color: { argb: 'FF31546B' } }
    timeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F2' } }
    timeCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    timeCell.border = { top: thin, bottom: period === schedulePeriodTimes.length ? medium : thin, left: medium, right: thin }
    for (let day = 1; day <= 7; day += 1) {
      const column = day + 1
      const key = `${rowNumber}-${column}`
      const cell = weeklySheet.getCell(rowNumber, column)
      const entries = cellBlocks.get(key) ?? []
      cell.value = cellTexts.get(key)?.join('\n\n') || null
      cell.font = { name: '宋体', size: entries.length > 1 ? 7.6 : 8.4, color: { argb: entries.some((entry) => entry.row.conflict) ? 'FF7C2F35' : 'FF243D52' } }
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, shrinkToFit: false }
      cell.fill = entries.some((entry) => entry.row.conflict) ? conflictFill : entries.some((entry) => entry.row.degreeLabel.startsWith('学位课')) ? degreeFill : normalFill
      cell.border = { top: thin, bottom: period === schedulePeriodTimes.length ? medium : thin, left: thin, right: day === 7 ? medium : thin }
    }
  }

  for (const block of mergedBlocks) {
    const startRow = gridStartRow + block.start - 1
    const endRow = startRow + block.span - 1
    const column = block.weekday + 1
    weeklySheet.mergeCells(startRow, column, endRow, column)
    const cell = weeklySheet.getCell(startRow, column)
    cell.value = weeklyBlockText(block)
    cell.font = { name: '宋体', size: 8.4, color: { argb: block.row.conflict ? 'FF7C2F35' : 'FF243D52' } }
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
    cell.fill = block.row.conflict ? conflictFill : block.row.degreeLabel.startsWith('学位课') ? degreeFill : normalFill
  }

  const legendRow = gridEndRow + 2
  weeklySheet.mergeCells(legendRow, 1, legendRow, 8)
  weeklySheet.getCell(legendRow, 1).value = '图例：蓝色为普通课程　·　金色为学位课　·　红色为存在时间冲突　·　同一时段多门课程会并列列出。'
  weeklySheet.getCell(legendRow, 1).font = { name: '宋体', size: 9, color: { argb: 'FF596B76' } }
  weeklySheet.getCell(legendRow, 1).alignment = { horizontal: 'left', vertical: 'middle' }
  weeklySheet.getRow(legendRow).height = 23

  let weeklyEndRow = legendRow
  const unscheduledRows = message.rows.filter((row) => !row.meetings.length)
  if (unscheduledRows.length) {
    const unassignedTitleRow = legendRow + 2
    weeklySheet.mergeCells(unassignedTitleRow, 1, unassignedTitleRow, 8)
    weeklySheet.getCell(unassignedTitleRow, 1).value = '暂无详细排课的课程'
    weeklySheet.getCell(unassignedTitleRow, 1).font = { name: '宋体', size: 10, bold: true, color: { argb: 'FF9A682B' } }
    weeklySheet.getCell(unassignedTitleRow, 1).alignment = { horizontal: 'left', vertical: 'middle' }
    weeklyEndRow = unassignedTitleRow
    unscheduledRows.forEach((row, index) => {
      const rowNumber = unassignedTitleRow + index + 1
      weeklySheet.mergeCells(rowNumber, 1, rowNumber, 8)
      weeklySheet.getCell(rowNumber, 1).value = `${row.name} · ${row.courseCode} · ${row.credits} 学分 · ${row.degreeLabel}`
      weeklySheet.getCell(rowNumber, 1).font = { name: '宋体', size: 9, color: { argb: 'FF596B76' } }
      weeklySheet.getCell(rowNumber, 1).alignment = { horizontal: 'left', vertical: 'middle' }
      weeklyEndRow = rowNumber
    })
  }
  weeklySheet.mergeCells(weeklyEndRow + 2, 1, weeklyEndRow + 2, 8)
  weeklySheet.getCell(weeklyEndRow + 2, 1).value = `中国科学院大学 · 选课规划工具　${message.generatedDate}`
  weeklySheet.getCell(weeklyEndRow + 2, 1).font = { name: '宋体', size: 9, color: { argb: 'FF596B76' } }
  weeklySheet.getCell(weeklyEndRow + 2, 1).alignment = { horizontal: 'right', vertical: 'middle' }
  weeklySheet.mergeCells(weeklyEndRow + 3, 1, weeklyEndRow + 3, 8)
  weeklySheet.getCell(weeklyEndRow + 3, 1).value = '1 - 1'
  weeklySheet.getCell(weeklyEndRow + 3, 1).font = { name: '宋体', size: 9, color: { argb: 'FF596B76' } }
  weeklySheet.getCell(weeklyEndRow + 3, 1).alignment = { horizontal: 'right', vertical: 'middle' }
  weeklySheet.pageSetup.printArea = `A1:H${weeklyEndRow + 3}`
  weeklySheet.headerFooter.oddFooter = '&R第 &P 页 / 共 &N 页'

  const detailSheet = workbook.addWorksheet('课程明细', { views: [{ showGridLines: false, zoomScale: 82 }] })
  detailSheet.properties.defaultRowHeight = 23
  detailSheet.columns = [6, 28, 18, 8, 8, 23, 43, 18, 23, 17].map((width) => ({ width }))
  detailSheet.pageSetup = {
    orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.28, right: 0.28, top: 0.38, bottom: 0.42, header: 0.15, footer: 0.18 },
  }
  detailSheet.mergeCells('A1:J1')
  detailSheet.getCell('A1').value = '研究生课表总表 · 课程明细'
  detailSheet.getCell('A1').font = { name: '黑体', size: 19, bold: true, color: { argb: 'FF000000' } }
  detailSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  detailSheet.getRow(1).height = 38
  detailSheet.mergeCells('A3:B3'); detailSheet.mergeCells('C3:D3'); detailSheet.mergeCells('E3:G3'); detailSheet.mergeCells('H3:J3')
  detailSheet.mergeCells('A4:B4'); detailSheet.mergeCells('C4:E4'); detailSheet.mergeCells('F4:J4')
  detailSheet.getCell('A3').value = richLabel('姓　　名：', message.identity.name)
  detailSheet.getCell('C3').value = richLabel('学生类别：', message.identity.category)
  detailSheet.getCell('E3').value = richLabel('培养单位：', message.identity.trainingUnit, 8.5)
  detailSheet.getCell('H3').value = richLabel('学　　期：', message.termLabel)
  detailSheet.getCell('A4').value = richLabel('学　　号：', message.identity.studentId)
  detailSheet.getCell('C4').value = richLabel('所学专业：', message.identity.major)
  detailSheet.getCell('F4').value = richLabel('统计范围：', '当前学期正式方案课程；备选池不计入课表', 9.2)
  for (const address of ['A3', 'C3', 'E3', 'H3', 'A4', 'C4', 'F4']) detailSheet.getCell(address).alignment = { vertical: 'middle', wrapText: false, shrinkToFit: true }
  detailSheet.getRow(3).height = 23; detailSheet.getRow(4).height = 23
  detailSheet.mergeCells('A5:J5')
  detailSheet.getCell('A5').value = `正式方案 ${message.rows.length} 门　·　总学分 ${totalCredits}　·　学位课 ${degreeCount} 门　·　时间冲突 ${conflictCount} 门`
  detailSheet.getCell('A5').font = { name: '宋体', size: 10.5, bold: true, color: { argb: 'FF294F72' } }
  detailSheet.getCell('A5').alignment = { horizontal: 'left', vertical: 'middle' }
  detailSheet.getRow(5).height = 24

  const detailHeaderRow = 6
  const detailStartRow = detailHeaderRow + 1
  const detailHeaders = ['序号', '课程与班级', '课程属性 / 层次', '学时', '学分', '教师与首席教授', '全部上课安排', '校区 / 名额', '授课 / 考核', '学位课 / 状态']
  detailSheet.getRow(detailHeaderRow).values = detailHeaders
  detailSheet.getRow(detailHeaderRow).height = 31
  const detailEndRow = detailStartRow + Math.max(message.rows.length, 1) - 1
  if (message.rows.length) {
    message.rows.forEach((row, index) => {
      const rowNumber = detailStartRow + index
      const meetingText = row.meetings.length
        ? row.meetings.map((meeting) => `周${scheduleWeekdays[meeting.weekday - 1] || '待定'} · ${meeting.rawTime}\n${meeting.rawWeeks} · ${meeting.room || '教室待定'}`).join('\n\n')
        : '暂无详细排课'
      detailSheet.getRow(rowNumber).values = [
        row.sequence, `${row.name}\n${row.courseCode}`, `${row.attribute || '属性待定'}\n${row.level || '层次待定'}`,
        row.hours || null, row.credits, `主讲：${row.teachers || '待定'}\n首席：${row.leadProfessor || '待定'}`,
        meetingText, `${row.campus || '校区待定'}\n${row.capacityLabel}`, `${row.teachingMethod || '授课方式待定'}\n${row.examMethod || '考核方式待定'}`,
        `${row.degreeLabel}${row.conflict ? '\n有时间冲突' : ''}`,
      ]
      detailSheet.getRow(rowNumber).height = Math.min(126, Math.max(38, 28 + row.meetings.length * 24, row.name.length > 20 ? 54 : 0))
    })
  } else {
    detailSheet.mergeCells(detailStartRow, 1, detailStartRow, 10)
    detailSheet.getCell(detailStartRow, 1).value = '当前学期没有正式方案课程'
    detailSheet.getCell(detailStartRow, 1).alignment = { horizontal: 'center', vertical: 'middle' }
    detailSheet.getRow(detailStartRow).height = 32
  }

  for (let row = detailHeaderRow; row <= detailEndRow; row += 1) {
    for (let column = 1; column <= 10; column += 1) {
      const cell = detailSheet.getCell(row, column)
      cell.font = { name: '宋体', size: row === detailHeaderRow ? 10 : 9.3, bold: row === detailHeaderRow, color: { argb: 'FF000000' } }
      cell.alignment = { horizontal: row === detailHeaderRow || column !== 2 ? 'center' : 'left', vertical: 'middle', wrapText: true }
      cell.border = { top: row === detailHeaderRow ? medium : thin, bottom: row === detailEndRow ? medium : thin, left: column === 1 ? medium : thin, right: column === 10 ? medium : thin }
      if (row !== detailHeaderRow && message.rows[row - detailStartRow]?.conflict) cell.fill = conflictFill
    }
  }
  const detailNotesRow = detailEndRow + 2
  detailSheet.mergeCells(detailNotesRow, 1, detailNotesRow, 10)
  detailSheet.getCell(detailNotesRow, 1).value = '备注：一周课表位于第一个工作表；本页用于查看完整课程信息。上课安排按全部教学周、星期、节次和教室列出。本表仅供课程规划，以培养方案、导师、培养单位及学校正式系统为准。'
  detailSheet.getCell(detailNotesRow, 1).font = { name: '宋体', size: 9.3, color: { argb: 'FF333333' } }
  detailSheet.getCell(detailNotesRow, 1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
  detailSheet.getRow(detailNotesRow).height = 38
  const detailFooterRow = detailNotesRow + 2
  detailSheet.mergeCells(detailFooterRow, 1, detailFooterRow, 10)
  detailSheet.getCell(detailFooterRow, 1).value = `中国科学院大学 · 选课规划工具　${message.generatedDate}`
  detailSheet.getCell(detailFooterRow, 1).alignment = { horizontal: 'right', vertical: 'middle' }
  detailSheet.mergeCells(detailFooterRow + 1, 1, detailFooterRow + 1, 10)
  detailSheet.getCell(detailFooterRow + 1, 1).value = '1 - 1'
  detailSheet.getCell(detailFooterRow + 1, 1).alignment = { horizontal: 'right', vertical: 'middle' }
  detailSheet.autoFilter = { from: `A${detailHeaderRow}`, to: `J${detailHeaderRow}` }
  detailSheet.pageSetup.printArea = `A1:J${detailFooterRow + 1}`
  detailSheet.headerFooter.oddFooter = '&R第 &P 页 / 共 &N 页'

  const rawBuffer = await workbook.xlsx.writeBuffer() as unknown
  if (rawBuffer instanceof ArrayBuffer) return rawBuffer
  return Uint8Array.from(rawBuffer as Uint8Array).buffer
}

self.onmessage = async (event: MessageEvent<ImportMessage | ExportMessage>) => {
  try {
    if (event.data.action === 'import') {
      const preview = await normalizeWorkbook(event.data)
      self.postMessage({ action: 'import-result', preview })
    } else if (event.data.action === 'export-schedule') {
      const buffer = await exportSchedule(event.data)
      self.postMessage({ action: 'export-result', buffer }, [buffer])
    } else {
      const buffer = await exportPlan(event.data)
      self.postMessage({ action: 'export-result', buffer }, [buffer])
    }
  } catch (error) {
    self.postMessage({ action: 'error', message: error instanceof Error ? error.message : 'Excel 处理失败' })
  }
}

export {}
