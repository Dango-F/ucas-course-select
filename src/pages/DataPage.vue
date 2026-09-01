<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { Database, Download, FileJson, FileSpreadsheet, Printer, RefreshCcw, Upload, XCircle } from 'lucide-vue-next'
import PageHeader from '../components/PageHeader.vue'
import TranscriptSheet from '../components/TranscriptSheet.vue'
import { categoryLabels } from '../domain/requirements'
import { transcriptTermOrder } from '../domain/term'
import { usePlannerStore } from '../stores/planner'
import type { ImportPreview, PersistedState, Term, TranscriptIdentity, TranscriptRow } from '../types'

const store = usePlannerStore()
const preview = ref<ImportPreview | null>(null)
const working = ref(false)
const error = ref('')
const confirmReset = ref(false)
const printReady = ref(false)
const pdfPreview = ref(false)
const scheduleOfferingCount = computed(() => store.catalog.dataVersion === '2026-08-28' ? 2084 : store.catalog.offerings.length)
const exportIdentityComplete = computed(() => Boolean(store.profile?.name.trim() && store.profile?.studentId.trim() && store.profile?.trainingUnit.trim() && store.profile?.major.trim()))
const generatedDate = computed(() => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date()))
const transcriptIdentity = computed<TranscriptIdentity>(() => ({
  name: store.profile?.name.trim() ?? '', studentId: store.profile?.studentId.trim() ?? '', trainingUnit: store.profile?.trainingUnit.trim() ?? '',
  category: categoryLabels[store.profile!.category], major: store.profile!.major,
}))

function safeFilePart(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '') || '未填写'
}
const exportTermLabel = computed(() => {
  const terms = [...new Set(transcriptRows.value.map((row) => row.term.includes('秋') ? '2026秋' : '2027春'))]
  return terms.length ? terms.join('+') : store.activeTerm === 'fall' ? '2026秋' : '2027春'
})
const exportFileStem = computed(() => {
  const profile = store.profile!
  const unit = profile.trainingUnit.trim().replace(/^中国科学院大学/, '') || profile.trainingUnit
  return ['国科大选课单', safeFilePart(profile.studentId), safeFilePart(profile.name), safeFilePart(profile.major), safeFilePart(unit), exportTermLabel.value].join('_')
})

const transcriptRows = computed<TranscriptRow[]>(() => store.planEntries.flatMap((entry) => {
  const course = store.index.courses.get(entry.courseId)
  const offering = entry.offeringId ? store.index.offerings.get(entry.offeringId) : null
  if (!course) return []
  return [{
    term: course.term === 'fall' ? '2026—2027学年(秋)第一学期' : '2026—2027学年(春)第二学期',
    name: offering?.name || course.name, source: entry.status === 'formal' ? '正式方案' as const : '备选池' as const, hours: course.hours,
    credits: course.credits, grade: '-', degree: entry.isDegreeCourse ? '是' : '否',
  }]
}).sort((a, b) => transcriptTermOrder(a.term) - transcriptTermOrder(b.term) || a.name.localeCompare(b.name, 'zh-CN')))

function download(content: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function localDateStamp() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function exportBackup() {
  download(JSON.stringify(store.snapshot(), null, 2), `国科大选课规划备份-${localDateStamp()}.json`, 'application/json')
}

async function restoreBackup(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const value = JSON.parse(await file.text()) as PersistedState
    if (value.schemaVersion !== 1 || !Array.isArray(value.planEntries)) throw new Error('不是可识别的规划备份')
    await store.restore(value); error.value = ''
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '备份恢复失败' }
  ;(event.target as HTMLInputElement).value = ''
}

async function importExcel(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  working.value = true; preview.value = null; error.value = ''
  const buffer = await file.arrayBuffer()
  const baseCodes = {
    fall: store.catalog.courses.filter((course) => course.term === 'fall').map((course) => course.baseCode),
    spring: store.catalog.courses.filter((course) => course.term === 'spring').map((course) => course.baseCode),
  } satisfies Record<Term, string[]>
  const worker = new Worker(new URL('../workers/excelWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (message) => {
    if (message.data.action === 'import-result') preview.value = message.data.preview
    else error.value = message.data.message
    working.value = false; worker.terminate()
  }
  worker.postMessage({
    action: 'import', fileName: file.name, buffer, baseCodes,
    existingCourseIds: store.catalog.courses.map((course) => course.id),
    existingOfferingIds: store.catalog.offerings.map((offering) => offering.id),
  }, [buffer])
  ;(event.target as HTMLInputElement).value = ''
}

async function applyPreview() { if (!preview.value || preview.value.kind === 'unknown') return; await store.applyImport(preview.value); preview.value = null }

async function exportExcel() {
  working.value = true; error.value = ''
  const worker = new Worker(new URL('../workers/excelWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (message) => {
    if (message.data.action === 'export-result') download(message.data.buffer, `${exportFileStem.value}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    else error.value = message.data.message
    working.value = false; worker.terminate()
  }
  worker.postMessage({
    action: 'export', rows: JSON.parse(JSON.stringify(transcriptRows.value)),
    identity: JSON.parse(JSON.stringify(transcriptIdentity.value)), generatedDate: generatedDate.value,
  })
}

async function resetAll() { await store.resetAll(); confirmReset.value = false }
function checkExportIdentity() {
  if (exportIdentityComplete.value) return true
  error.value = '请先点击左侧“修改设置”，补全姓名、学号、培养单位和所学专业后再导出。'
  return false
}
async function startExcelExport() { if (checkExportIdentity()) await exportExcel() }
function startPdfExport() { if (checkExportIdentity()) { error.value = ''; pdfPreview.value = true } }
let printOriginalTitle = ''
function cleanupPrint() {
  document.body.classList.remove('transcript-printing')
  printReady.value = false
  if (printOriginalTitle) { document.title = printOriginalTitle; printOriginalTitle = '' }
}
async function printPlan() {
  printReady.value = true
  await nextTick()
  document.body.classList.add('transcript-printing')
  printOriginalTitle = document.title
  document.title = exportFileStem.value
  window.addEventListener('afterprint', cleanupPrint, { once: true })
  window.print()
}
onBeforeUnmount(cleanupPrint)
</script>

<template>
  <div class="page data-page">
      <PageHeader eyebrow="DATA & BACKUP" title="课程库与个人方案" description="新版课程数据导入前显示变更摘要；个人设置只保存在当前浏览器。" />
    <section class="data-health"><div><Database :size="22" /><span><strong>{{ store.catalog.courses.length.toLocaleString() }}</strong> 条学期课程</span></div><div><FileSpreadsheet :size="22" /><span><strong>{{ scheduleOfferingCount.toLocaleString() }}</strong> 个详细课程班</span></div><div><RefreshCcw :size="22" /><span><strong>{{ store.catalog.dataVersion }}</strong> 数据版本</span></div></section>

    <div v-if="error" class="inline-error"><XCircle :size="18" />{{ error }}</div>
    <div class="data-grid">
      <section class="panel data-panel"><header><Upload :size="21" /><div><span>课程数据</span><h2>导入新版 Excel</h2></div></header><p>支持开课计划、核心/专业课列表和含“星期节次”的详细课表。系统会识别红字、共享学科和班号后缀。</p><label class="button primary file-button"><input type="file" accept=".xlsx,.xls" @change="importExcel" />{{ working ? '正在处理…' : '选择 Excel 文件' }}</label><small>导入前不会修改现有课程库。</small></section>
      <section class="panel data-panel"><header><FileJson :size="21" /><div><span>个人数据</span><h2>备份与恢复</h2></div></header><p>JSON备份包含培养身份、正式方案、备选池、已修历史和本机导入的数据。</p><div class="button-row"><button class="button secondary" @click="exportBackup"><Download :size="17" /> 下载备份</button><label class="button secondary file-button"><input type="file" accept=".json" @change="restoreBackup" /><Upload :size="17" /> 恢复备份</label></div></section>
      <section class="panel data-panel"><header><FileSpreadsheet :size="21" /><div><span>选课单</span><h2>导出给导师查看</h2></div></header><p>Excel 与 PDF 采用学校成绩单式版面；姓名、学号、培养单位和所学专业读取自培养身份，成绩统一以“-”表示。</p><div class="button-row"><button class="button primary" :disabled="working" @click="startExcelExport"><Download :size="17" /> 导出 Excel</button><button class="button secondary" @click="startPdfExport"><Printer :size="17" /> 导出 PDF</button></div></section>
      <section class="panel data-panel danger-zone"><header><XCircle :size="21" /><div><span>本机数据</span><h2>清除并重新设置</h2></div></header><p>删除当前浏览器中的身份、方案、历史和自定义课程库，恢复内置数据。</p><button class="button danger" @click="confirmReset = true">清除本机数据</button></section>
    </div>

    <Teleport to="body">
      <div v-if="preview" class="modal-layer" @click.self="preview = null"><section class="dialog-card import-preview"><p class="section-kicker">导入预览</p><h2>{{ preview.fileName }}</h2><div class="preview-stats"><div><strong>{{ preview.summary.added }}</strong><span>新增</span></div><div><strong>{{ preview.summary.overwritten }}</strong><span>覆盖更新</span></div><div><strong>{{ preview.summary.unmatched }}</strong><span>未匹配</span></div><div><strong>{{ preview.summary.missingFields }}</strong><span>缺字段</span></div></div><p>共读取 {{ preview.rowsRead }} 行；识别类型：{{ { plan: '开课计划', core: '核心/专业课列表', schedule: '详细课表', unknown: '无法识别' }[preview.kind] }}</p><ul v-if="preview.diagnostics.length"><li v-for="item in preview.diagnostics" :key="item">{{ item }}</li></ul><footer><button class="button secondary" @click="preview = null">取消</button><button class="button primary" :disabled="preview.kind === 'unknown'" @click="applyPreview">确认合并</button></footer></section></div>
      <div v-if="confirmReset" class="modal-layer" @click.self="confirmReset = false"><section class="dialog-card"><p class="section-kicker danger-text">不可撤销</p><h2>清除全部本机数据？</h2><p>如果还需要当前方案，请先下载JSON备份。课程内置文件不会删除。</p><footer><button class="button secondary" @click="confirmReset = false">取消</button><button class="button danger" @click="resetAll">确认清除</button></footer></section></div>
    </Teleport>

    <Teleport to="body">
      <div v-if="pdfPreview" class="transcript-preview-layer">
        <header><div><strong>PDF 版式预览</strong><span>A4 纵向 · 可在打印窗口中另存为 PDF</span></div><div><button class="button secondary" @click="pdfPreview = false">关闭预览</button><button class="button primary" @click="printPlan"><Printer :size="17" /> 打印 / 另存为 PDF</button></div></header>
        <div class="transcript-preview-canvas"><TranscriptSheet :identity="transcriptIdentity" :rows="transcriptRows" :generated-date="generatedDate" /></div>
      </div>
      <TranscriptSheet v-if="printReady" :identity="transcriptIdentity" :rows="transcriptRows" :generated-date="generatedDate" />
    </Teleport>
  </div>
</template>
