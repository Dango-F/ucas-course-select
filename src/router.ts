import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'overview', component: () => import('./pages/OverviewPage.vue') },
  { path: '/catalog', name: 'catalog', component: () => import('./pages/CatalogPage.vue') },
  { path: '/plan', name: 'plan', component: () => import('./pages/PlanPage.vue') },
  { path: '/schedule', name: 'schedule', component: () => import('./pages/SchedulePage.vue') },
  { path: '/requirements', name: 'requirements', component: () => import('./pages/RequirementsPage.vue') },
  { path: '/history', name: 'history', component: () => import('./pages/HistoryPage.vue') },
  { path: '/data', name: 'data', component: () => import('./pages/DataPage.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({ history: createWebHistory(), routes, scrollBehavior: () => ({ top: 0 }) })
