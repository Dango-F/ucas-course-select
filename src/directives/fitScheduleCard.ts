import type { DirectiveBinding, ObjectDirective } from 'vue'

export interface FitScheduleCardOptions {
  contentSelector?: string
  maxScale?: number
  minScale?: number
}

type FitState = {
  frame: number | null
  observer: ResizeObserver | null
  options: Required<FitScheduleCardOptions>
}

const states = new WeakMap<HTMLElement, FitState>()

function normalizeOptions(value?: FitScheduleCardOptions): Required<FitScheduleCardOptions> {
  const maxScale = Math.min(1.25, Math.max(1, value?.maxScale ?? 1))
  return {
    contentSelector: value?.contentSelector || '.schedule-card-fit-content',
    maxScale,
    minScale: Math.min(maxScale, Math.max(0.28, value?.minScale ?? 0.42)),
  }
}

function contentFits(content: HTMLElement, availableWidth: number, availableHeight: number) {
  return content.scrollWidth <= availableWidth + 0.75 && content.scrollHeight <= availableHeight + 0.75
}

function cssPixels(value: string) {
  const pixels = Number.parseFloat(value)
  return Number.isFinite(pixels) ? pixels : 0
}

export function fitScheduleCardNow(element: HTMLElement, value?: FitScheduleCardOptions) {
  const options = normalizeOptions(value)
  const content = element.querySelector<HTMLElement>(options.contentSelector)
  if (!content) return

  const elementStyle = getComputedStyle(element)
  const availableWidth = element.clientWidth - cssPixels(elementStyle.paddingLeft) - cssPixels(elementStyle.paddingRight)
  const availableHeight = element.clientHeight - cssPixels(elementStyle.paddingTop) - cssPixels(elementStyle.paddingBottom)
  if (availableWidth <= 0 || availableHeight <= 0) return

  const applyScale = (scale: number) => {
    element.style.setProperty('--schedule-card-scale', scale.toFixed(3))
    return contentFits(content, availableWidth, availableHeight)
  }

  if (applyScale(options.maxScale)) {
    element.dataset.fitScale = options.maxScale.toFixed(3)
    element.dataset.fitOverflow = 'false'
    return
  }

  let lower = options.minScale
  let upper = options.maxScale
  const minimumFits = applyScale(lower)
  if (minimumFits) {
    for (let index = 0; index < 8; index += 1) {
      const candidate = (lower + upper) / 2
      if (applyScale(candidate)) lower = candidate
      else upper = candidate
    }
  }

  applyScale(lower)
  element.dataset.fitScale = lower.toFixed(3)
  element.dataset.fitOverflow = String(!contentFits(content, availableWidth, availableHeight))
}

function queueFit(element: HTMLElement) {
  const state = states.get(element)
  if (!state) return
  if (state.frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(state.frame)
  const run = () => {
    state.frame = null
    fitScheduleCardNow(element, state.options)
  }
  if (typeof requestAnimationFrame === 'function') state.frame = requestAnimationFrame(run)
  else queueMicrotask(run)
}

export const vFitScheduleCard: ObjectDirective<HTMLElement, FitScheduleCardOptions> = {
  mounted(element, binding: DirectiveBinding<FitScheduleCardOptions>) {
    const state: FitState = { frame: null, observer: null, options: normalizeOptions(binding.value) }
    states.set(element, state)
    if (typeof ResizeObserver !== 'undefined') {
      state.observer = new ResizeObserver(() => queueFit(element))
      state.observer.observe(element)
    }
    queueFit(element)
  },
  updated(element, binding: DirectiveBinding<FitScheduleCardOptions>) {
    const state = states.get(element)
    if (!state) return
    state.options = normalizeOptions(binding.value)
    queueFit(element)
  },
  unmounted(element) {
    const state = states.get(element)
    if (!state) return
    state.observer?.disconnect()
    if (state.frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(state.frame)
    states.delete(element)
  },
}
