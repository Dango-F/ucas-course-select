<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BookmarkPlus, Check, Copy, Filter, Search, SlidersHorizontal, Trash2 } from 'lucide-vue-next'
import CourseDrawer from '../components/CourseDrawer.vue'
import PageHeader from '../components/PageHeader.vue'
import { isVisibleForOwnDiscipline, ownDisciplineCoursePriority } from '../domain/catalogFilters'
import { usePlannerStore } from '../stores/planner'
import type { CourseChoice, PlanStatus } from '../types'

const store = usePlannerStore()
const FILTER_STORAGE_KEY = 'ucas-course-catalog-filters-v3'
type CatalogFilterState = { query: string; attribute: string; campus: string; level: string; disciplineOnly: boolean }

function readFilters(): CatalogFilterState {
  const fallback: CatalogFilterState = { query: '', attribute: '', campus: '雁栖湖', level: '', disciplineOnly: true }
  try {
    const parsed = JSON.parse(sessionStorage.getItem(FILTER_STORAGE_KEY) || 'null') as Partial<CatalogFilterState> | null
    return { ...fallback, ...parsed, disciplineOnly: typeof parsed?.disciplineOnly === 'boolean' ? parsed.disciplineOnly : fallback.disciplineOnly }
  } catch {
    return fallback
  }
}

const savedFilters = readFilters()
const query = ref(savedFilters.query)
const attribute = ref(savedFilters.attribute)
const campus = ref(savedFilters.campus)
const level = ref(savedFilters.level)
const disciplineOnly = ref(savedFilters.disciplineOnly)
const selected = ref<CourseChoice | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(650)
const itemHeight = ref(window.innerWidth <= 900 ? 282 : 138)
const retakeChoice = ref<{ choice: CourseChoice; status: PlanStatus; reason: string } | null>(null)
const copiedField = ref('')
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

const attributes = computed(() => [...new Set(store.choices.map((choice) => choice.course.attribute).filter(Boolean))])
const campuses = computed(() => [...new Set(store.choices.flatMap((choice) => [choice.offering?.campus, ...choice.course.campuses]).filter(Boolean))])
const levels = computed(() => [...new Set(store.choices.map((choice) => choice.course.level).filter(Boolean))])

const filtered = computed(() => {
  const keywords = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = store.choices.filter((choice) => {
    const { course, offering } = choice
    const text = `${offering?.name ?? ''} ${course.name} ${course.englishName} ${course.baseCode} ${offering?.offeringCode ?? ''} ${course.department} ${course.level} ${offering?.teachers.join(' ') ?? ''} ${offering?.leadProfessor ?? ''} ${offering?.examMethod ?? ''}`.toLowerCase()
    if (keywords.some((keyword) => !text.includes(keyword))) return false
    if (attribute.value && course.attribute !== attribute.value) return false
    if (campus.value && !course.campuses.includes(campus.value) && offering?.campus !== campus.value && !offering?.meetings.some((meeting) => meeting.room.includes(campus.value))) return false
    if (level.value && course.level !== level.value) return false
    if (disciplineOnly.value && store.profile) {
      if (!isVisibleForOwnDiscipline(store.profile, course, offering)) return false
    }
    return true
  })
  return disciplineOnly.value && store.profile
    ? matches.sort((left, right) => ownDisciplineCoursePriority(store.profile!, left.course, left.offering) - ownDisciplineCoursePriority(store.profile!, right.course, right.offering))
    : matches
})

const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / itemHeight.value) - 4))
const endIndex = computed(() => Math.min(filtered.value.length, Math.ceil((scrollTop.value + viewportHeight.value) / itemHeight.value) + 4))
const visible = computed(() => filtered.value.slice(startIndex.value, endIndex.value))

function onScroll(event: Event) {
  const target = event.target as HTMLElement
  scrollTop.value = target.scrollTop
  viewportHeight.value = target.clientHeight
}

function alreadyAdded(choice: CourseChoice) {
  return Boolean(planEntryForChoice(choice))
}

function planEntryForChoice(choice: CourseChoice) {
  return store.planEntries.find((entry) => entry.courseId === choice.course.id && entry.offeringId === (choice.offering?.id ?? null))
}

async function removeChoice(choice: CourseChoice) {
  const entry = planEntryForChoice(choice)
  if (entry) await store.removeEntry(entry.id)
}

async function add(choice: CourseChoice, status: PlanStatus) {
  const duplicate = store.duplicateReason(choice)
  if (duplicate) {
    retakeChoice.value = { choice, status, reason: '' }
    return
  }
  await store.addChoice(choice, status)
  if (selected.value?.id === choice.id) selected.value = null
}

async function addAsRetake() {
  if (!retakeChoice.value?.reason.trim()) return
  await store.addChoice(retakeChoice.value.choice, retakeChoice.value.status, true, retakeChoice.value.reason.trim())
  retakeChoice.value = null
}

function saveFilters() {
  try {
    sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ query: query.value, attribute: attribute.value, campus: campus.value, level: level.value, disciplineOnly: disciplineOnly.value }))
  } catch { /* 隐私模式下无法写入时，筛选仍可正常使用 */ }
}

function clearFilters() { query.value = ''; attribute.value = ''; campus.value = ''; level.value = ''; disciplineOnly.value = false; saveFilters() }
function syncItemHeight() { itemHeight.value = window.innerWidth <= 900 ? 282 : 138 }
function remainingSeats(choice: CourseChoice) {
  const offering = choice.offering
  return offering?.capacity ? Math.max(0, offering.capacity - offering.enrolled) : null
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

async function copyCourseText(text: string, field: string) {
  try {
    await writeClipboard(text)
    copiedField.value = field
    if (copyResetTimer) clearTimeout(copyResetTimer)
    copyResetTimer = setTimeout(() => { copiedField.value = '' }, 1400)
  } catch {
    copiedField.value = ''
  }
}

onMounted(() => window.addEventListener('resize', syncItemHeight))
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncItemHeight)
  if (copyResetTimer) clearTimeout(copyResetTimer)
})
watch([query, attribute, campus, level, disciplineOnly], saveFilters, { flush: 'sync' })
</script>

<template>
  <div class="page catalog-page">
    <PageHeader eyebrow="COURSE CATALOG" title="课程目录" :description="`${store.activeTerm === 'fall' ? '秋季含具体班级、教师和周次' : '春季为计划课，排课详情待导入'}。`">
      <div class="catalog-count"><strong>{{ filtered.length.toLocaleString() }}</strong><span>个可选课程班</span></div>
    </PageHeader>

    <section class="catalog-toolbar">
      <label class="search-box"><Search :size="18" /><input v-model="query" placeholder="搜索课程、编码、教师或院系" /></label>
      <select v-model="attribute" aria-label="课程属性"><option value="">全部属性</option><option v-for="item in attributes" :key="item">{{ item }}</option></select>
      <select v-model="campus" aria-label="校区"><option value="">全部校区</option><option v-for="item in campuses" :key="item">{{ item }}</option></select>
      <select v-model="level" aria-label="培养层次"><option value="">全部层次</option><option v-for="item in levels" :key="item">{{ item }}</option></select>
      <label class="switch-filter"><input v-model="disciplineOnly" type="checkbox" /><SlidersHorizontal :size="16" /> 只看本学科</label>
      <button class="text-button" @click="clearFilters"><Filter :size="15" /> 清除</button>
    </section>

    <section class="catalog-table-head" aria-hidden="true"><span>课程与班级</span><span>培养归属</span><span>上课安排</span><span>教师与名额</span><span>操作</span></section>
    <div class="virtual-course-list" @scroll="onScroll">
      <div class="virtual-spacer" :style="{ height: `${filtered.length * itemHeight}px` }">
        <article v-for="(choice, index) in visible" :key="choice.id" class="course-row" :style="{ transform: `translateY(${(startIndex + index) * itemHeight}px)` }">
          <div class="course-identity">
            <div class="course-main">
              <div class="course-name-row">
                <button class="course-title-button" :aria-label="`查看课程详情：${choice.offering?.name || choice.course.name}`" @click="selected = choice"><strong>{{ choice.offering?.name || choice.course.name }}</strong></button>
                <button class="copy-field-button" :class="{ copied: copiedField === `${choice.id}:name` }" :title="copiedField === `${choice.id}:name` ? '已复制课程名称' : '复制课程名称'" :aria-label="copiedField === `${choice.id}:name` ? '已复制课程名称' : '复制课程名称'" @click.stop="copyCourseText(choice.offering?.name || choice.course.name, `${choice.id}:name`)"><Check v-if="copiedField === `${choice.id}:name`" :size="14" /><Copy v-else :size="14" /></button>
              </div>
              <div class="course-code-row">
                <code>{{ choice.offering?.offeringCode ?? choice.course.baseCode }}</code>
                <button class="copy-field-button" :class="{ copied: copiedField === `${choice.id}:code` }" :title="copiedField === `${choice.id}:code` ? '已复制课程代码' : '复制课程代码'" :aria-label="copiedField === `${choice.id}:code` ? '已复制课程代码' : '复制课程代码'" @click.stop="copyCourseText(choice.offering?.offeringCode ?? choice.course.baseCode, `${choice.id}:code`)"><Check v-if="copiedField === `${choice.id}:code`" :size="14" /><Copy v-else :size="14" /></button>
              </div>
              <div class="course-meta-row"><span>{{ choice.course.department }}</span><strong class="course-credits">{{ choice.course.credits }} <i>学分</i></strong></div>
            </div>
            <div class="course-taxonomy"><div><span>{{ choice.course.attribute }}</span><span class="level-tag">{{ choice.course.level || '层次待定' }}</span><span v-if="choice.course.professionalProgramCourse" class="pro-tag">专业学位适用</span><span v-if="choice.course.isBenYan" class="b-tag">本研层次</span></div><p class="course-discipline"><b>一级学科：</b><span>{{ choice.course.firstLevelDiscipline || choice.course.subject || '归属待确认' }}</span></p></div>
          </div>
          <div class="course-time"><div v-if="choice.offering?.meetings.length" class="course-meeting-list"><p v-for="meeting in choice.offering.meetings" :key="`${meeting.rawTime}-${meeting.rawWeeks}-${meeting.room}`"><b>{{ meeting.rawTime }}</b><span>{{ meeting.rawWeeks }} · {{ meeting.room || '教室待定' }}</span></p></div><p v-else class="no-time"><b>排课待定</b><span>可加入方案，暂不参与冲突判断</span></p></div>
          <div class="course-staff"><p><b>主讲</b><span>{{ choice.offering?.teachers.join('、') || '待定' }}</span></p><p v-if="choice.offering?.leadProfessor"><b>首席</b><span>{{ choice.offering.leadProfessor }}</span></p><div class="seat-status" :class="{ full: remainingSeats(choice) === 0 }"><span v-if="choice.offering?.capacity">名额 {{ choice.offering.enrolled }} / {{ choice.offering.capacity }}</span><span v-else>容量待定</span><strong v-if="remainingSeats(choice) !== null">{{ remainingSeats(choice) ? `余 ${remainingSeats(choice)}` : '已满' }}</strong></div></div>
          <div class="course-actions"><template v-if="alreadyAdded(choice)"><span class="added"><Check :size="16" /> 已加入</span><button class="icon-action danger-ghost" title="取消选课" :aria-label="`取消${choice.offering?.name || choice.course.name}`" @click.stop="removeChoice(choice)"><Trash2 :size="18" /></button></template><template v-else><button class="icon-action" title="加入备选" @click="add(choice, 'backup')"><BookmarkPlus :size="18" /></button><button class="button small primary" :disabled="Boolean(store.formalAddBlockReason(choice))" :title="store.formalAddBlockReason(choice) || undefined" @click="add(choice, 'formal')">加入方案</button></template></div>
        </article>
      </div>
      <div v-if="!filtered.length" class="catalog-empty"><Search :size="28" /><strong>没有匹配课程</strong><p>放宽筛选条件，或检查当前学期。</p><button class="button secondary" @click="clearFilters">清除筛选</button></div>
    </div>

    <CourseDrawer :choice="selected" @close="selected = null" @add="(status) => selected && add(selected, status)" />

    <Teleport to="body">
      <div v-if="retakeChoice" class="modal-layer" @click.self="retakeChoice = null">
        <section class="dialog-card"><p class="section-kicker">同名课程检查</p><h2>仅重修时可以重复选择</h2><p>“{{ retakeChoice.choice.offering?.name || retakeChoice.choice.course.name }}”已出现在当前方案或已修历史中。若这是重修，请填写原因。</p><label class="field-label"><span>重修说明</span><textarea v-model="retakeChoice.reason" rows="3" placeholder="例如：上次课程未通过，已申请重修" /></label><footer><button class="button secondary" @click="retakeChoice = null">取消</button><button class="button danger" :disabled="!retakeChoice.reason.trim()" @click="addAsRetake">按重修加入</button></footer></section>
      </div>
    </Teleport>
  </div>
</template>
