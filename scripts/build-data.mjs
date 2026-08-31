import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import ExcelJS from 'exceljs'

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, 'data')
const OUT_DIR = path.join(ROOT, 'public', 'data')
const FALL = 'fall'
const SPRING = 'spring'
const ENGLISH_A_HOURS = 64

const files = {
  plan: path.join(DATA_DIR, '2026-2027学年秋季和春季开课计划表0828.xlsx'),
  core: path.join(DATA_DIR, '2026-2027学年研究生核心课和专业课列表（请先阅读表格最下方的说明）0828.xlsx'),
  schedule: path.join(DATA_DIR, '2026年秋季学期课表.xlsx'),
}

const text = (value) => {
  if (value == null) return ''
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text ?? '').trim()
    if ('result' in value) return String(value.result ?? '').trim()
    if ('richText' in value) return value.richText.map((item) => item.text).join('').trim()
  }
  return String(value).trim()
}
const num = (value) => Number.parseFloat(text(value)) || 0
const splitMulti = (value) => text(value).split(/[；;\n、]/).map((item) => item.trim()).filter(Boolean)
const uniq = (items) => [...new Set(items.filter(Boolean))]
const courseId = (term, code) => `${term}:${code}`
const offeringId = (term, code) => `${term}:${code}`
const isBenYanCode = (code) => /^B/i.test(code) || /^\d{5}B/i.test(code)
const isRed = (cell) => {
  const argb = String(cell.font?.color?.argb ?? '').toUpperCase()
  return argb.endsWith('FF0000') || argb.endsWith('C00000')
}

function parseWeeks(value) {
  const cleaned = text(value).replace(/[第周\s]/g, '').replace(/，/g, ',').replace(/[—–]/g, '-')
  const weeks = []
  for (const part of cleaned.split(',')) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!match) continue
    const start = Number(match[1])
    const end = Number(match[2] ?? match[1])
    for (let week = start; week <= end; week += 1) weeks.push(week)
  }
  return uniq(weeks).sort((a, b) => a - b)
}

function parseMeetings(weeksValue, timeValue, room) {
  const time = text(timeValue)
  const match = time.match(/^周([一二三四五六日天])\s*[（(]\s*([^）)]+?)\s*[）)]$/)
  if (!match) return []
  const weekday = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }[match[1]]
  const ranges = match[2].replace(/[，、；;]/g, ',').replace(/[—–－]/g, '-').split(',').map((part) => part.trim()).filter(Boolean)
  const parsedRanges = []
  for (const range of ranges) {
    const rangeMatch = range.match(/^(\d+)\s*(?:-\s*(\d+)\s*)?$/)
    if (!rangeMatch) return []
    const start = Number(rangeMatch[1])
    const end = Number(rangeMatch[2] ?? rangeMatch[1])
    if (end < start) return []
    parsedRanges.push({ start, end, label: `${start}${rangeMatch[2] ? `-${end}` : ''}` })
  }
  const rawWeeks = text(weeksValue)
  const roomText = text(room)
  return parsedRanges.map(({ start, end, label }) => ({
    weeks: parseWeeks(weeksValue),
    weekday,
    periods: Array.from({ length: end - start + 1 }, (_, index) => start + index),
    room: roomText,
    rawWeeks,
    rawTime: parsedRanges.length === 1 ? time : `周${match[1]}(${label})`,
  }))
}

async function readWorkbook(file) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  return workbook
}

const [planBook, coreBook, scheduleBook] = await Promise.all([
  readWorkbook(files.plan),
  readWorkbook(files.core),
  readWorkbook(files.schedule),
])

const courseMap = new Map()
const offeringMap = new Map()
const diagnostics = []
const scheduleOnlyCodes = new Set()

function ensureCourse(term, code, partial = {}) {
  const id = courseId(term, code)
  const current = courseMap.get(id) ?? {
    id,
    term,
    baseCode: code,
    name: '',
    englishName: '',
    department: '',
    campuses: [],
    attribute: '',
    level: '',
    subject: '',
    firstLevelDiscipline: '',
    sharedSubjects: [],
    sharedFirstLevels: [],
    sharedAttributes: [],
    sharedLevels: [],
    hours: 0,
    credits: 0,
    professionalProgramCourse: false,
    isBenYan: isBenYanCode(code),
    sourceKinds: [],
  }
  const merged = {
    ...current,
    ...Object.fromEntries(Object.entries(partial).filter(([, value]) => value !== '' && value != null)),
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
  courseMap.set(id, merged)
  return merged
}

function parsePlanSheet(sheet, term) {
  const headerRow = 2
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const code = text(row.getCell(3).value)
    if (!code) continue
    ensureCourse(term, code, {
      name: text(row.getCell(4).value),
      department: text(row.getCell(2).value),
      campuses: [text(row.getCell(5).value)],
      attribute: text(row.getCell(7).value),
      subject: text(row.getCell(8).value),
      hours: num(row.getCell(9).value),
      credits: num(row.getCell(10).value),
      sourceKinds: ['plan'],
    })
  }
}

parsePlanSheet(planBook.worksheets[0], FALL)
parsePlanSheet(planBook.worksheets[1], SPRING)

function parseCoreSheet(sheet, term) {
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const code = text(row.getCell(3).value)
    if (!code || /^说明[：:]/.test(code)) continue
    ensureCourse(term, code, {
      name: text(row.getCell(4).value),
      department: text(row.getCell(2).value),
      campuses: [text(row.getCell(5).value)],
      attribute: text(row.getCell(7).value),
      level: text(row.getCell(8).value),
      subject: text(row.getCell(9).value),
      firstLevelDiscipline: text(row.getCell(10).value),
      hours: num(row.getCell(11).value),
      credits: num(row.getCell(12).value),
      sharedSubjects: splitMulti(row.getCell(13).value),
      sharedFirstLevels: splitMulti(row.getCell(14).value),
      sharedAttributes: splitMulti(row.getCell(15).value),
      sharedLevels: splitMulti(row.getCell(16).value),
      professionalProgramCourse: isRed(row.getCell(4)),
      sourceKinds: ['core'],
    })
  }
}

parseCoreSheet(coreBook.worksheets[0], FALL)
parseCoreSheet(coreBook.worksheets[1], SPRING)

const fallBaseCodes = [...courseMap.values()]
  .filter((course) => course.term === FALL)
  .map((course) => course.baseCode)
  .sort((a, b) => b.length - a.length)

function resolveBaseCode(code) {
  if (courseMap.has(courseId(FALL, code))) return code
  return fallBaseCodes.find((baseCode) => code.startsWith(`${baseCode}-`)) ?? code
}

const scheduleSheet = scheduleBook.worksheets[0]
for (let rowNumber = 2; rowNumber <= scheduleSheet.rowCount; rowNumber += 1) {
  const row = scheduleSheet.getRow(rowNumber)
  const code = text(row.getCell(3).value)
  if (!code) continue
  const baseCode = resolveBaseCode(code)
  const scheduleName = text(row.getCell(4).value)
  const currentBase = courseMap.get(courseId(FALL, baseCode))
  const [hours, credits] = text(row.getCell(9).value).split('/').map((item) => Number.parseFloat(item) || 0)
  const course = ensureCourse(FALL, baseCode, {
    name: currentBase?.name || scheduleName,
    englishName: text(row.getCell(5).value),
    department: text(row.getCell(2).value),
    attribute: text(row.getCell(6).value),
    level: text(row.getCell(7).value),
    subject: text(row.getCell(8).value),
    hours,
    credits,
    isBenYan: isBenYanCode(code),
    sourceKinds: ['schedule'],
  })
  if (!fallBaseCodes.includes(baseCode) && !scheduleOnlyCodes.has(code)) {
    diagnostics.push({ kind: 'schedule-only', code, name: course.name })
    scheduleOnlyCodes.add(code)
  }
  const id = offeringId(FALL, code)
  const offering = offeringMap.get(id) ?? {
    id,
    courseId: course.id,
    term: FALL,
    offeringCode: code,
    name: scheduleName,
    campus: text(row.getCell(14).value).includes('玉泉') ? '玉泉路' : text(row.getCell(14).value).includes('中关') ? '中关村' : '',
    capacity: num(row.getCell(10).value),
    enrolled: num(row.getCell(11).value),
    teachingMethod: text(row.getCell(15).value),
    examMethod: text(row.getCell(16).value),
    leadProfessor: text(row.getCell(17).value),
    teachers: uniq([text(row.getCell(19).value)]),
    meetings: [],
  }
  const meetings = parseMeetings(row.getCell(12).value, row.getCell(13).value, row.getCell(14).value)
  if (!meetings.length) {
    diagnostics.push({ kind: 'schedule-unparsed', code, row: rowNumber, weeks: text(row.getCell(12).value), time: text(row.getCell(13).value) })
  }
  for (const meeting of meetings) {
    if (!offering.meetings.some((item) => JSON.stringify(item) === JSON.stringify(meeting))) offering.meetings.push(meeting)
  }
  offering.teachers = uniq([...offering.teachers, text(row.getCell(19).value)])
  offeringMap.set(id, offering)
}

const courses = [...courseMap.values()].sort((a, b) => a.term.localeCompare(b.term) || a.department.localeCompare(b.department, 'zh-CN') || a.name.localeCompare(b.name, 'zh-CN'))
const offerings = [...offeringMap.values()].sort((a, b) => a.offeringCode.localeCompare(b.offeringCode))
const disciplines = uniq(courses.filter((course) => !course.professionalProgramCourse).flatMap((course) => [course.firstLevelDiscipline, ...course.sharedFirstLevels])).sort((a, b) => a.localeCompare(b, 'zh-CN'))
const professionalFields = uniq(courses.filter((course) => course.professionalProgramCourse).flatMap((course) => [course.subject, ...course.sharedSubjects])).sort((a, b) => a.localeCompare(b, 'zh-CN'))

const catalog = {
  schemaVersion: 1,
  dataVersion: '2026-08-28',
  generatedAt: new Date().toISOString(),
  termConfig: {
    fall: { label: '2026 秋季', startDate: '2026-08-31', weeks: 22, hasSchedule: true },
    spring: { label: '2027 春季', startDate: null, weeks: 20, hasSchedule: false },
  },
  courses,
  offerings,
  disciplines,
  professionalFields,
  diagnostics,
  stats: {
    planFall: 1498,
    planSpring: 1476,
    coreFall: 1025,
    coreSpring: 876,
    scheduleOfferings: offerings.length,
    scheduleRows: scheduleSheet.rowCount - 1,
    scheduleMeetings: offerings.reduce((total, offering) => total + offering.meetings.length, 0),
  },
}

await fs.mkdir(OUT_DIR, { recursive: true })
await fs.writeFile(path.join(OUT_DIR, 'catalog.json'), JSON.stringify(catalog))
console.log(`Generated ${courses.length} courses, ${offerings.length} offerings, ${catalog.stats.scheduleMeetings} meeting rows.`)
