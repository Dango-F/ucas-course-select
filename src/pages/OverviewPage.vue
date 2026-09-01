<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, CircleAlert, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import PageHeader from '../components/PageHeader.vue'
import MathMotif from '../components/MathMotif.vue'
import { buildOverviewRequirementItems } from '../domain/overview'
import { ownDisciplinePlanPriority } from '../domain/catalogFilters'
import { categoryLabels } from '../domain/requirements'
import { usePlannerStore } from '../stores/planner'
import type { Course, CourseOffering, PlanEntry } from '../types'

const store = usePlannerStore()
const report = computed(() => store.report)
const overviewRequirements = computed(() => buildOverviewRequirementItems(report.value?.items ?? []))
const passed = computed(() => report.value?.items.filter((item) => item.status === 'passed').length ?? 0)
const englishSummary = computed(() => {
  const plan = store.profile?.english
  if (!plan) return ''
  const labels = { exempt: '英语A：免修免考', mooc: '英语A：线上慕课 + 期末考试', offline: '英语A：线下课', not_applicable: '' }
  return [labels[plan.masterMethod], plan.doctorEnglishRequired ? '英语B：同学期读写类 + 听说类' : ''].filter(Boolean).join('；')
})
type OverviewRow = { entry: PlanEntry; course: Course; offering: CourseOffering | null }
const conflictEntryIds = computed(() => new Set(store.conflicts.flatMap((conflict) => [conflict.entryA, conflict.entryB])))
function coursePriority(row: OverviewRow) {
  return store.profile ? ownDisciplinePlanPriority(store.profile, row.course, row.offering) : 0
}
const formalRows = computed<OverviewRow[]>(() => store.formalEntries.flatMap((entry) => {
  const course = store.index.courses.get(entry.courseId)
  const offering = entry.offeringId ? store.index.offerings.get(entry.offeringId) ?? null : null
  return course ? [{ entry, course, offering }] : []
}).sort((left, right) => Number(conflictEntryIds.value.has(right.entry.id)) - Number(conflictEntryIds.value.has(left.entry.id)) || coursePriority(left) - coursePriority(right)))
const PAGE_SIZE = 6
const formalPages = computed(() => {
  const result: OverviewRow[][] = []
  for (let start = 0; start < formalRows.value.length; start += PAGE_SIZE) result.push(formalRows.value.slice(start, start + PAGE_SIZE))
  return result
})
const activeFormalPage = ref(0)
const currentFormalPage = computed(() => Math.min(activeFormalPage.value, Math.max(formalPages.value.length - 1, 0)))
const pageRange = computed(() => formalRows.value.length
  ? `${currentFormalPage.value * PAGE_SIZE + 1}–${currentFormalPage.value * PAGE_SIZE + (formalPages.value[currentFormalPage.value]?.length ?? 0)}`
  : '0')

watch(() => formalPages.value.length, (count) => {
  if (activeFormalPage.value >= count) activeFormalPage.value = Math.max(count - 1, 0)
})

function selectFormalPage(index: number) {
  if (!formalPages.value.length) return
  activeFormalPage.value = Math.max(0, Math.min(index, formalPages.value.length - 1))
}

function moveFormalPage(step: number) {
  if (formalPages.value.length < 2) return
  activeFormalPage.value = (currentFormalPage.value + step + formalPages.value.length) % formalPages.value.length
}
</script>

<template>
  <div class="page overview-page">
    <PageHeader eyebrow="PROGRAM OVERVIEW" title="培养概览">
      <RouterLink class="button primary" to="/catalog"><BookOpen :size="17" /> 浏览课程</RouterLink>
    </PageHeader>

    <section class="identity-banner">
      <MathMotif :season="store.activeTerm" />
      <div><span>当前培养身份</span><h2>{{ categoryLabels[store.profile!.category] }}</h2><p>{{ store.profile!.major || store.profile!.discipline }} · {{ store.profile!.campusPreference }}</p><p v-if="englishSummary" class="identity-english">{{ englishSummary }}</p></div>
      <div class="completion-dial"><strong>{{ passed }}</strong><span>/ {{ report?.items.length }} 项<br />当前达标</span></div>
    </section>

    <div class="overview-grid">
      <section class="panel requirement-list-panel">
        <header class="panel-heading"><div><span>培养要求</span><h2>当前缺口</h2></div><RouterLink to="/requirements">查看全部 <ArrowRight :size="15" /></RouterLink></header>
        <div class="compact-requirements">
          <div v-for="item in overviewRequirements" :key="item.key" :class="item.status">
            <component :is="item.status === 'passed' ? CheckCircle2 : CircleAlert" :size="19" />
            <span><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></span>
            <b>{{ item.current.toFixed(item.unit === '学分' ? 1 : 0) }} / {{ item.target }} {{ item.unit }}</b>
          </div>
        </div>
      </section>

      <section class="panel next-panel">
        <header class="panel-heading"><div><span>正式方案 · {{ formalRows.length }} 门</span><h2>已选课程</h2></div><RouterLink to="/plan">调整方案 <ArrowRight :size="15" /></RouterLink></header>
        <div v-if="formalRows.length" class="overview-carousel" aria-label="正式方案课程轮播">
          <div class="overview-carousel-viewport" aria-live="polite">
            <div class="overview-carousel-track" :style="{ transform: `translateX(-${currentFormalPage * 100}%)` }">
              <section v-for="(page, pageIndex) in formalPages" :key="pageIndex" class="overview-carousel-slide" :aria-label="`第 ${pageIndex + 1} 页，共 ${formalPages.length} 页`">
                <div class="overview-courses">
                  <article v-for="row in page" :key="row.entry.id" :class="{ conflicted: conflictEntryIds.has(row.entry.id) }">
                    <div class="course-dot" :class="{ degree: row.entry.isDegreeCourse }" />
                    <div><strong>{{ row.offering?.name || row.course.name }}</strong><p>{{ row.course.attribute }} · {{ row.course.credits }} 学分</p></div>
                    <span>{{ row.offering?.meetings[0]?.rawTime || '时间待定' }}</span>
                  </article>
                </div>
              </section>
            </div>
          </div>
          <div class="overview-carousel-footer">
            <div class="overview-carousel-pager">
              <button class="overview-carousel-control" :disabled="formalPages.length < 2" aria-label="上一页课程" @click="moveFormalPage(-1)"><ChevronLeft :size="16" /></button>
              <div class="overview-carousel-dots" aria-label="选择正式方案课程页">
                <button v-for="(page, pageIndex) in formalPages" :key="pageIndex" class="overview-carousel-dot" :class="{ active: currentFormalPage === pageIndex }" :aria-label="`查看第 ${pageIndex + 1} 页课程`" :aria-current="currentFormalPage === pageIndex ? 'page' : undefined" @click="selectFormalPage(pageIndex)" />
              </div>
              <button class="overview-carousel-control" :disabled="formalPages.length < 2" aria-label="下一页课程" @click="moveFormalPage(1)"><ChevronRight :size="16" /></button>
            </div>
            <span class="overview-carousel-position">{{ pageRange }} / {{ formalRows.length }}</span>
          </div>
        </div>
        <div v-else class="panel-empty"><CalendarDays :size="30" /><strong>还没有正式课程</strong><p>课程加入正式方案后，学分、要求和冲突会同步计算。</p><RouterLink class="button secondary" to="/catalog">开始选课</RouterLink></div>
      </section>
    </div>

    <section v-if="report?.warnings.length || store.conflicts.length" class="notice-strip">
      <CircleAlert :size="19" />
      <div><strong>需要留意</strong><p v-for="warning in report?.warnings" :key="warning">{{ warning }}</p><p v-if="store.conflicts.length">当前正式方案有 {{ store.conflicts.length }} 处实际教学周冲突。</p></div>
    </section>
  </div>
</template>
