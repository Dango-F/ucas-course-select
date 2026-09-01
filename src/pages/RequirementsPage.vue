<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, CircleAlert, FileText, Info } from 'lucide-vue-next'
import PageHeader from '../components/PageHeader.vue'
import { categoryLabels, categoryRules } from '../domain/requirements'
import { usePlannerStore } from '../stores/planner'

const store = usePlannerStore()
const rules = computed(() => categoryRules[store.profile!.category])
const structural = computed(() => store.report?.items.filter((item) => ['term-credits', 'stage-credits', 'degree-credits', 'core-count', 'professional-count', 'doctor-degree-count', 'public-elective', 'professional-elective'].includes(item.key)) ?? [])
const publicCourses = computed(() => store.report?.items.filter((item) => !structural.value.includes(item)) ?? [])
</script>

<template>
  <div class="page requirements-page">
    <PageHeader eyebrow="PROGRAM REQUIREMENTS" :title="categoryLabels[store.profile!.category]" description="规则按学校通知与学生类别矩阵计算；培养方案中的个性要求仍需人工核对。" />
    <section class="rule-summary-band"><div><span>专业学位课</span><strong>≥ {{ rules.degreeCredits }} 学分</strong></div><div v-if="rules.core"><span>学位课结构</span><strong>{{ rules.core }} 核心 + {{ rules.professional }} 专业</strong></div><div v-if="rules.doctorDegreeCount"><span>博士课程门数</span><strong>≥ {{ rules.doctorDegreeCount }} 门</strong></div><div><span>公共选修课</span><strong>{{ rules.publicElective ? `≥ ${rules.publicElective} 学分` : '无硬指标' }}</strong></div><div><span>每学期</span><strong>≥ 10 有效学分</strong></div></section>

    <div class="requirements-layout">
      <section class="panel detailed-requirements"><header class="panel-heading"><div><span>自动核验</span><h2>学分与结构</h2></div></header><div class="requirement-cards"><article v-for="item in structural" :key="item.key" :class="item.status"><component :is="item.status === 'passed' ? CheckCircle2 : CircleAlert" :size="21" /><div><strong>{{ item.label }}</strong><p>{{ item.detail }}</p><div class="mini-progress"><i :style="{ width: `${Math.min(100, item.current / item.target * 100)}%` }" /></div></div><b>{{ item.current.toFixed(item.unit === '学分' ? 1 : 0) }} / {{ item.target }} {{ item.unit }}</b></article></div></section>
      <section class="panel public-course-panel"><header class="panel-heading"><div><span>公共必修</span><h2>课程清单</h2></div></header><div class="checklist"><div v-for="item in publicCourses" :key="item.key" :class="item.status"><component :is="item.status === 'passed' ? CheckCircle2 : CircleAlert" :size="18" /><span><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></span><b>{{ item.status === 'passed' ? '已满足' : '未完成' }}</b></div></div></section>
    </div>

    <section v-if="store.report?.warnings.length" class="policy-notes"><header><Info :size="19" /><strong>需要人工确认</strong></header><p v-for="warning in store.report.warnings" :key="warning">{{ warning }}</p></section>
    <section class="source-note"><FileText :size="19" /><div><strong>计算口径</strong><p>核心课包含学科核心课和专业核心课；专业课仅按“专业课”属性统计。人文系列讲座、科学前沿讲座不计入每学期10学分。普博和工程博士按图片分类矩阵不设公共选修课硬指标。</p></div></section>
  </div>
</template>
