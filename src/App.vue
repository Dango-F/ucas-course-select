<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import {
  BookOpen, CalendarDays, CheckSquare2, Database, GraduationCap, History,
  LayoutDashboard, Menu, Settings2, X,
} from 'lucide-vue-next'
import SetupWizard from './components/SetupWizard.vue'
import RequirementRail from './components/RequirementRail.vue'
import PlanSummary from './components/PlanSummary.vue'
import { categoryLabels, stageCreditTargets } from './domain/requirements'
import { usePlannerStore } from './stores/planner'

const store = usePlannerStore()
const route = useRoute()
const editingProfile = ref(false)
const mobileNavOpen = ref(false)

onMounted(() => store.hydrate())

const navItems = [
  { to: '/', label: '培养概览', icon: LayoutDashboard },
  { to: '/catalog', label: '课程目录', icon: BookOpen },
  { to: '/plan', label: '选课方案', icon: CheckSquare2 },
  { to: '/schedule', label: '周课表', icon: CalendarDays },
  { to: '/requirements', label: '培养要求', icon: GraduationCap },
  { to: '/history', label: '已修课程', icon: History },
  { to: '/data', label: '数据与备份', icon: Database },
]

const showRightPanel = computed(() => !['data', 'history'].includes(String(route.name)))
const stageCreditTarget = computed(() => stageCreditTargets[store.profile?.category ?? 'academic_master'])
const stageCreditLabel = computed(() => stageCreditTarget.value === 38 ? '博士阶段' : '硕士阶段')
const stageCreditCurrent = computed(() => store.report?.stageCredits ?? 0)
</script>

<template>
  <div v-if="store.loading" class="boot-screen">
    <div class="boot-mark" aria-hidden="true"><span /><span /><span /></div>
    <p>正在加载课程数据</p>
    <small>读取 2026—2027 学年课程数据</small>
  </div>

  <SetupWizard
    v-else-if="!store.profile || !store.profile.discipline || editingProfile"
    :initial-profile="store.profile"
    :can-cancel="Boolean(store.profile?.discipline)"
    @cancel="editingProfile = false"
    @complete="editingProfile = false"
  />

  <div v-else class="app-shell" :class="`season-${store.activeTerm}`">
    <aside class="sidebar" :class="{ open: mobileNavOpen }">
      <div class="brand">
        <img class="brand-logo" src="/branding/ucas-logo-horizontal-white.png" alt="中国科学院大学" />
        <div class="brand-meta"><span>UCAS · 2026</span><div class="brand-title-line"><strong>选课规划</strong><em>v1.0.2</em></div></div>
        <button class="icon-button sidebar-close" aria-label="关闭导航" @click="mobileNavOpen = false"><X :size="20" /></button>
      </div>

      <nav class="primary-nav" aria-label="主导航">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" @click="mobileNavOpen = false">
          <component :is="item.icon" :size="18" stroke-width="1.8" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="profile-plate">
        <span>培养身份</span>
        <strong>{{ categoryLabels[store.profile.category] }}</strong>
        <p>{{ store.profile.major || store.profile.discipline }}</p>
        <button class="text-button" @click="editingProfile = true"><Settings2 :size="15" /> 修改设置</button>
      </div>
      <p class="sidebar-foot">数据仅保存在本机<br />结果请以学校正式系统为准</p>
    </aside>

    <div v-if="mobileNavOpen" class="nav-scrim" @click="mobileNavOpen = false" />

    <main class="main-area">
      <header class="topbar">
        <button class="icon-button mobile-menu" aria-label="打开导航" @click="mobileNavOpen = true"><Menu :size="21" /></button>
        <div class="term-switch" aria-label="选择学期">
          <button :class="{ active: store.activeTerm === 'fall' }" @click="store.setTerm('fall')">2026 秋</button>
          <button :class="{ active: store.activeTerm === 'spring' }" @click="store.setTerm('spring')">2027 春</button>
        </div>
        <div class="stage-credit-stat" :class="{ doctoral: stageCreditTarget === 38 }" aria-label="整个培养阶段学分进度">
          <span class="stage-credit-stat-label">{{ stageCreditLabel }}<small>全程学分</small></span>
          <strong>{{ stageCreditCurrent.toFixed(1) }}</strong><i>/ {{ stageCreditTarget }} 学分</i>
        </div>
        <div class="data-stamp"><span>课程库</span><strong>{{ store.catalog.dataVersion }}</strong></div>
      </header>

      <RequirementRail />

      <div class="workspace" :class="{ 'without-summary': !showRightPanel }">
        <section class="page-stage"><RouterView /></section>
        <PlanSummary v-if="showRightPanel" />
      </div>
    </main>
  </div>
</template>
