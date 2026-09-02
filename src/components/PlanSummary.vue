<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, Layers3, Trash2 } from 'lucide-vue-next'
import { ownDisciplinePlanPriority } from '../domain/catalogFilters'
import { usePlannerStore } from '../stores/planner'
import type { Course, CourseOffering, PlanEntry } from '../types'

const PAGE_SIZE = 10
const store = usePlannerStore()
type SummaryRow = { entry: PlanEntry; course: Course; offering: CourseOffering | null }

const rows = computed<SummaryRow[]>(() => store.formalEntries.flatMap((entry) => {
  const course = store.index.courses.get(entry.courseId)
  const offering = entry.offeringId ? store.index.offerings.get(entry.offeringId) ?? null : null
  return course ? [{ entry, course, offering }] : []
}).sort((left, right) => store.profile ? ownDisciplinePlanPriority(store.profile, left.course, left.offering) - ownDisciplinePlanPriority(store.profile, right.course, right.offering) : 0))
const pages = computed(() => {
  const result: SummaryRow[][] = []
  for (let start = 0; start < rows.value.length; start += PAGE_SIZE) result.push(rows.value.slice(start, start + PAGE_SIZE))
  return result
})
const activePage = ref(0)
const currentPage = computed(() => Math.min(activePage.value, Math.max(pages.value.length - 1, 0)))
const currentRows = computed(() => pages.value[currentPage.value] ?? [])
const totalCredits = computed(() => rows.value.reduce((sum, row) => sum + row.course.credits, 0))
const pageRange = computed(() => currentRows.value.length
  ? `${currentPage.value * PAGE_SIZE + 1}–${currentPage.value * PAGE_SIZE + currentRows.value.length}`
  : '0')

watch(() => pages.value.length, (count) => {
  if (activePage.value >= count) activePage.value = Math.max(count - 1, 0)
})

function selectPage(index: number) {
  if (!pages.value.length) return
  activePage.value = Math.max(0, Math.min(index, pages.value.length - 1))
}

function movePage(step: number) {
  if (pages.value.length < 2) return
  activePage.value = (currentPage.value + step + pages.value.length) % pages.value.length
}

</script>

<template>
  <aside class="plan-summary">
    <header>
      <div>
        <span>当前方案</span>
        <strong>{{ rows.length }} 门正式课</strong>
        <small class="summary-total">合计 {{ totalCredits.toFixed(1) }} 学分</small>
      </div>
      <Layers3 :size="21" />
    </header>

    <div v-if="store.conflicts.length" class="summary-alert"><AlertTriangle :size="16" /><span>{{ store.conflicts.length }} 处时间冲突待处理</span></div>

    <div v-if="rows.length" class="summary-carousel" aria-label="正式课程轮播">
      <div class="summary-carousel-viewport" aria-live="polite">
        <div class="summary-carousel-track" :style="{ transform: `translateX(-${currentPage * 100}%)` }">
          <section v-for="(page, pageIndex) in pages" :key="pageIndex" class="summary-slide" :aria-label="`第 ${pageIndex + 1} 页，共 ${pages.length} 页`">
            <div class="summary-course-list">
              <article v-for="row in page" :key="row.entry.id" class="summary-course-row">
                <i class="summary-course-marker" :class="{ degree: row.entry.isDegreeCourse }" aria-hidden="true" />
                <span class="summary-course-copy">
                  <strong>{{ row.course.name }}</strong>
                  <small>{{ row.course.credits }} 学分 · {{ row.course.attribute }}</small>
                </span>
                <button class="summary-course-remove" :aria-label="`删除课程 ${row.course.name}`" title="删除课程" @click="store.removeEntry(row.entry.id)"><Trash2 :size="16" /></button>
              </article>
            </div>
          </section>
        </div>
      </div>

      <div class="summary-carousel-footer">
        <div class="summary-carousel-pager">
          <button class="summary-carousel-control" :disabled="pages.length < 2" aria-label="上一页课程" @click="movePage(-1)"><ChevronLeft :size="16" /></button>
          <div class="summary-carousel-dots" aria-label="选择课程页">
            <button v-for="(page, pageIndex) in pages" :key="pageIndex" class="summary-carousel-dot" :class="{ active: currentPage === pageIndex }" :aria-label="`查看第 ${pageIndex + 1} 页课程`" :aria-current="currentPage === pageIndex ? 'page' : undefined" @click="selectPage(pageIndex)" />
          </div>
          <button class="summary-carousel-control" :disabled="pages.length < 2" aria-label="下一页课程" @click="movePage(1)"><ChevronRight :size="16" /></button>
        </div>
        <span class="summary-carousel-position">{{ pageRange }} / {{ rows.length }}</span>
      </div>
    </div>
    <div v-else class="summary-empty"><p>正式方案还是空的</p><span>从课程目录加入课程后，这里会显示学分与冲突。</span></div>

    <RouterLink class="summary-link" to="/plan">查看完整选课单 <ArrowRight :size="16" /></RouterLink>
  </aside>
</template>
