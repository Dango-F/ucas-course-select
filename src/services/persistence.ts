import { openDB } from 'idb'
import type { PersistedState } from '../types'

const DB_NAME = 'ucas-course-planner'
const STORE = 'planner'
const STATE_KEY = 'state'

async function database() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    },
  })
}

export async function loadPersistedState(): Promise<PersistedState | null> {
  try {
    const db = await database()
    const value = await db.get(STORE, STATE_KEY) as PersistedState | undefined
    if (value) return value
  } catch {
    // IndexedDB may be unavailable in privacy-restricted browsers; use the same local fallback below.
  }
  const fallback = localStorage.getItem(STATE_KEY)
  return fallback ? JSON.parse(fallback) as PersistedState : null
}

export async function savePersistedState(state: PersistedState): Promise<void> {
  const plainState = JSON.parse(JSON.stringify(state)) as PersistedState
  try {
    const db = await database()
    await db.put(STORE, plainState, STATE_KEY)
    localStorage.removeItem(STATE_KEY)
  } catch {
    localStorage.setItem(STATE_KEY, JSON.stringify(plainState))
  }
}

export async function clearPersistedState(): Promise<void> {
  try {
    const db = await database()
    await db.delete(STORE, STATE_KEY)
  } catch { /* local fallback is still cleared below */ }
  localStorage.removeItem(STATE_KEY)
}
