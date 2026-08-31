<script setup lang="ts">
import { computed } from 'vue'
import type { Term } from '../types'

type Point = { x: number; y: number }

const viewBox = '0 0 360 360'
const props = defineProps<{ season: Term }>()

function koch(start: Point, end: Point, depth: number): Point[] {
  if (depth === 0) return [start, end]

  const dx = (end.x - start.x) / 3
  const dy = (end.y - start.y) / 3
  const first = { x: start.x + dx, y: start.y + dy }
  const second = { x: start.x + dx * 2, y: start.y + dy * 2 }
  // Screen coordinates grow downward, so the outward Koch bump uses -60°.
  const angle = -Math.PI / 3
  const vx = second.x - first.x
  const vy = second.y - first.y
  const peak = {
    x: first.x + vx * Math.cos(angle) - vy * Math.sin(angle),
    y: first.y + vx * Math.sin(angle) + vy * Math.cos(angle),
  }

  return [
    ...koch(start, first, depth - 1).slice(0, -1),
    ...koch(first, peak, depth - 1).slice(0, -1),
    ...koch(peak, second, depth - 1).slice(0, -1),
    ...koch(second, end, depth - 1),
  ]
}

function snowflakePath() {
  const top = { x: 175, y: 30 }
  const right = { x: 307, y: 260 }
  const left = { x: 43, y: 260 }
  const points = [
    ...koch(top, right, 3).slice(0, -1),
    ...koch(right, left, 3).slice(0, -1),
    ...koch(left, top, 3),
  ]

  return `M ${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')} Z`
}

const snowflake = computed(snowflakePath)
</script>

<template>
  <svg
    class="math-motif math-motif--banner"
    :class="`math-motif--${props.season}`"
    :viewBox="viewBox"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
  >
    <g v-if="props.season === 'fall'" class="math-motif__snowflake-group">
      <path class="math-motif__snowflake-glow" :d="snowflake" />
      <path class="math-motif__snowflake" :d="snowflake" />
    </g>
    <g v-else class="math-motif__leaf-bud-group">
      <path class="math-motif__leaf-stem" d="M 338 350 C 338 300 338 250 338 215 C 338 180 334 145 326 118 C 321 99 318 82 318 66" />
      <path class="math-motif__leaf-branch" d="M 338 225 C 346 218 353 209 358 199 M 327 121 C 307 113 288 101 273 86" />
      <path class="math-motif__leaf" d="M 310 235 C 320 214 338 202 356 203 C 353 224 340 241 321 246 C 316 247 312 243 310 235 Z" />
      <path class="math-motif__leaf" d="M 313 126 C 291 126 273 113 264 89 C 288 85 308 95 317 112 C 320 118 318 123 313 126 Z" />
      <path class="math-motif__leaf-vein" d="M 315 232 C 329 222 342 212 353 205 M 310 121 C 293 110 279 99 268 90" />
      <path class="math-motif__bud" d="M 312 85 C 303 76 305 64 317 56 C 329 65 333 77 327 85 C 323 91 317 91 312 85 Z" />
    </g>
  </svg>
</template>
