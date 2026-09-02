<script setup lang="ts">
import { computed } from 'vue'
import { usePlannerStore } from '../stores/planner'

const store = usePlannerStore()
const items = computed(() => (store.report?.items ?? []).filter((item) => ['term-credits', 'degree-credits', 'core-count', 'professional-count', 'doctor-degree-count', 'public-elective'].includes(item.key)).slice(0, 5))
</script>

<template>
  <section v-if="items.length" class="requirement-rail" aria-label="培养要求进度">
    <div class="rail-title"><span>培养刻度</span><small>正式方案实时计算</small></div>
    <div v-for="item in items" :key="item.key" class="rail-segment" :class="[item.status, { 'warm-track': item.key === 'degree-credits', 'gold-track': item.key === 'public-elective', 'sage-track': item.key === 'core-count' || item.key === 'professional-count' }]">
      <div><span>{{ item.label }}</span><strong>{{ item.current.toFixed(item.unit === '学分' ? 1 : 0) }}<i>/ {{ item.target }} {{ item.unit }}</i></strong></div>
      <div class="tick-track"><i :style="{ width: `${Math.min(100, item.target ? (item.current / item.target) * 100 : 100)}%` }" /></div>
    </div>
  </section>
</template>
