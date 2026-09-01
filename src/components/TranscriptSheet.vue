<script setup lang="ts">
import { computed } from 'vue'
import { transcriptTermOrder } from '../domain/term'
import type { TranscriptIdentity, TranscriptRow } from '../types'

const props = defineProps<{
  identity: TranscriptIdentity
  rows: TranscriptRow[]
  generatedDate: string
}>()

const groups = computed(() => {
  const grouped = new Map<string, TranscriptRow[]>()
  for (const row of props.rows) grouped.set(row.term, [...(grouped.get(row.term) ?? []), row])
  return [...grouped.entries()].sort(([left], [right]) => transcriptTermOrder(left) - transcriptTermOrder(right)).map(([term, rows]) => ({ term, rows }))
})

const formalRows = computed(() => props.rows.filter((row) => row.source === '正式方案'))
const totalCredits = computed(() => formalRows.value.reduce((total, row) => total + row.credits, 0))
const degreeCredits = computed(() => formalRows.value.filter((row) => row.degree === '是').reduce((total, row) => total + row.credits, 0))
</script>

<template>
  <section class="transcript-print" aria-label="研究生课程选课单打印版">
    <h1>研究生课程选课单</h1>

    <div class="transcript-meta">
      <p><b>姓　　名：</b>{{ identity.name }}</p>
      <p><b>学生类别：</b>{{ identity.category }}</p>
      <p><b>培养单位：</b>{{ identity.trainingUnit }}</p>
      <p><b>学　　号：</b>{{ identity.studentId }}</p>
      <p><b>所学专业：</b>{{ identity.major }}</p>
      <p />
    </div>

    <table>
      <colgroup><col class="term-col" /><col class="name-col" /><col class="source-col" /><col class="hours-col" /><col class="credits-col" /><col class="grade-col" /><col class="degree-col" /></colgroup>
      <thead><tr><th>学年学期</th><th>课程名称</th><th>课程来源</th><th>学时</th><th>学分</th><th>成绩</th><th>学位课</th></tr></thead>
      <tbody v-if="groups.length">
        <template v-for="group in groups" :key="group.term">
          <tr v-for="(row, index) in group.rows" :key="`${group.term}-${row.name}-${index}`">
            <td v-if="index === 0" class="term-cell" :rowspan="group.rows.length">{{ group.term }}</td>
            <td class="course-cell">{{ row.name }}</td><td>{{ row.source }}</td><td>{{ row.hours || '—' }}</td><td>{{ row.credits }}</td><td>{{ row.grade }}</td><td>{{ row.degree }}</td>
          </tr>
        </template>
      </tbody>
      <tbody v-else><tr><td class="term-cell">—</td><td class="course-cell">以下空白</td><td /><td /><td /><td /><td /></tr></tbody>
      <tbody class="transcript-blank"><tr><td /><td class="course-cell">以下空白</td><td /><td /><td /><td /><td /></tr><tr><td /><td /><td /><td /><td /><td /><td /></tr></tbody>
      <tfoot>
        <tr class="transcript-total"><th>总学分</th><td colspan="3">{{ totalCredits }}</td><th colspan="2">学位课学分</th><td>{{ degreeCredits }}</td></tr>
        <tr class="transcript-gpa"><th>平均学分绩点（GPA）</th><td colspan="6">—</td></tr>
        <tr class="transcript-notes"><td colspan="7"><b>备注：</b><span>1. 本单显示正式方案及备选池课程，“课程来源”栏用于区分。</span><span>2. 总学分和学位课学分只统计正式方案；成绩与 GPA 不由本工具生成。</span><span>3. 本单仅供课程规划，以培养方案、导师、培养单位及学校正式系统为准。</span></td></tr>
      </tfoot>
    </table>

    <footer><p>{{ generatedDate }}</p><span>1 - 1</span></footer>
  </section>
</template>
