<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, CircleAlert } from 'lucide-vue-next'
import PageHeader from '../components/PageHeader.vue'
import MathMotif from '../components/MathMotif.vue'
import { categoryLabels } from '../domain/requirements'
import { usePlannerStore } from '../stores/planner'

const store = usePlannerStore()
const report = computed(() => store.report)
const passed = computed(() => report.value?.items.filter((item) => item.status === 'passed').length ?? 0)
const englishSummary = computed(() => {
  const plan = store.profile?.english
  if (!plan) return ''
  const labels = { exempt: '英语A：免修免考', mooc: '英语A：线上慕课 + 期末考试', offline: '英语A：线下课', not_applicable: '' }
  return [labels[plan.masterMethod], plan.doctorEnglishRequired ? '英语B：同学期读写类 + 听说类' : ''].filter(Boolean).join('；')
})
const upcoming = computed(() => store.formalEntries.slice(0, 5).flatMap((entry) => {
  const course = store.index.courses.get(entry.courseId)
  const offering = entry.offeringId ? store.index.offerings.get(entry.offeringId) : null
  return course ? [{ entry, course, offering }] : []
}))
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
          <div v-for="item in report?.items.slice(0, 7)" :key="item.key" :class="item.status">
            <component :is="item.status === 'passed' ? CheckCircle2 : CircleAlert" :size="19" />
            <span><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></span>
            <b>{{ item.current.toFixed(item.unit === '学分' ? 1 : 0) }} / {{ item.target }} {{ item.unit }}</b>
          </div>
        </div>
      </section>

      <section class="panel next-panel">
        <header class="panel-heading"><div><span>正式方案</span><h2>已选课程</h2></div><RouterLink to="/plan">调整方案 <ArrowRight :size="15" /></RouterLink></header>
        <div v-if="upcoming.length" class="overview-courses">
          <article v-for="row in upcoming" :key="row.entry.id">
            <div class="course-dot" :class="{ degree: row.entry.isDegreeCourse }" />
            <div><strong>{{ row.offering?.name || row.course.name }}</strong><p>{{ row.course.attribute }} · {{ row.course.credits }} 学分</p></div>
            <span>{{ row.offering?.meetings[0]?.rawTime || '时间待定' }}</span>
          </article>
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
