<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, AlertTriangle, Layers3 } from 'lucide-vue-next'
import { usePlannerStore } from '../stores/planner'

const store = usePlannerStore()
const rows = computed(() => store.formalEntries.slice(0, 4).flatMap((entry) => {
  const course = store.index.courses.get(entry.courseId)
  const offering = entry.offeringId ? store.index.offerings.get(entry.offeringId) : null
  return course ? [{ entry, course, offering }] : []
}))
</script>

<template>
  <aside class="plan-summary">
    <header><div><span>当前方案</span><strong>{{ store.formalEntries.length }} 门正式课</strong></div><Layers3 :size="21" /></header>
    <div v-if="store.conflicts.length" class="summary-alert"><AlertTriangle :size="16" /><span>{{ store.conflicts.length }} 处时间冲突待处理</span></div>
    <div v-if="rows.length" class="summary-courses">
      <div v-for="row in rows" :key="row.entry.id"><i :class="{ degree: row.entry.isDegreeCourse }" /><span><strong>{{ row.offering?.name || row.course.name }}</strong><small>{{ row.course.credits }} 学分 · {{ row.course.attribute }}</small></span></div>
    </div>
    <div v-else class="summary-empty"><p>正式方案还是空的</p><span>从课程目录加入课程后，这里会显示学分与冲突。</span></div>
    <RouterLink class="summary-link" to="/plan">查看完整选课单 <ArrowRight :size="16" /></RouterLink>
  </aside>
</template>
