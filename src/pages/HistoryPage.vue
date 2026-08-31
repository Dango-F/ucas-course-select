<script setup lang="ts">
import { ref } from 'vue'
import { History, Plus, Trash2 } from 'lucide-vue-next'
import PageHeader from '../components/PageHeader.vue'
import { usePlannerStore } from '../stores/planner'

const store = usePlannerStore()
const name = ref('')
const term = ref('2025 秋季')
const credits = ref(2)
const isRetake = ref(false)
const note = ref('')

async function add() {
  if (!name.value.trim()) return
  await store.addCompleted({ name: name.value.trim(), term: term.value.trim(), credits: Number(credits.value) || 0, isRetake: isRetake.value, note: note.value.trim() })
  name.value = ''; credits.value = 2; isRetake.value = false; note.value = ''
}
</script>

<template>
  <div class="page history-page">
      <PageHeader eyebrow="COURSE HISTORY" title="已修课程" description="记录过往课程；加入同名课程时，系统会拦截并要求说明是否重修。" />
    <div class="history-layout">
      <section class="panel history-form"><header class="panel-heading"><div><span>新增记录</span><h2>录入已修课程</h2></div></header><label class="field-label"><span>课程名称</span><input v-model="name" placeholder="请输入成绩单上的完整课程名称" /></label><div class="field-row"><label class="field-label"><span>修读学期</span><input v-model="term" /></label><label class="field-label"><span>学分</span><input v-model.number="credits" type="number" min="0" step="0.5" /></label></div><label class="confirmation-check compact"><input v-model="isRetake" type="checkbox" /><span><strong>这是一门重修课程</strong><small>重修记录不会作为后续同名拦截的唯一依据。</small></span></label><label class="field-label"><span>备注（可选）</span><textarea v-model="note" rows="3" /></label><button class="button primary full" :disabled="!name.trim()" @click="add"><Plus :size="17" /> 添加记录</button></section>

      <section class="panel history-list"><header class="panel-heading"><div><span>本机记录</span><h2>{{ store.completedCourses.length }} 门已修课程</h2></div></header><div v-if="store.completedCourses.length"><article v-for="course in store.completedCourses" :key="course.id"><div class="history-icon"><History :size="18" /></div><div><strong>{{ course.name }}</strong><p>{{ course.term }} · {{ course.credits }} 学分 <span v-if="course.isRetake">· 重修</span></p><small v-if="course.note">{{ course.note }}</small></div><button class="icon-button danger-ghost" aria-label="删除记录" @click="store.removeCompleted(course.id)"><Trash2 :size="17" /></button></article></div><div v-else class="panel-empty"><History :size="30" /><strong>尚未记录已修课程</strong><p>录入后可跨学期检查同名课程。</p></div></section>
    </div>
  </div>
</template>
