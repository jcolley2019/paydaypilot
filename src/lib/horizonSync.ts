import { syncHorizon } from '@/lib/horizon'

type Listener = (userId: string) => void

interface SyncState {
  /** The one follow-up run shared by every request that arrives while this run is going. */
  queued: Promise<void> | null
  startQueued: ((run: Promise<void>) => void) | null
}

const listeners = new Set<Listener>()
const running = new Map<string, SyncState>()

/** Calls `listener` each time a horizon sync finishes successfully; returns the unsubscribe. */
export function onHorizonSynced(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function start(userId: string): Promise<void> {
  const state: SyncState = { queued: null, startQueued: null }
  running.set(userId, state)
  return syncHorizon(userId)
    .then(() => {
      for (const listener of listeners) listener(userId)
    })
    .finally(() => {
      running.delete(userId)
      // Started in the same tick the slot frees up, so no other request can slip in between.
      state.startQueued?.(start(userId))
    })
}

/**
 * Regenerates the user's paychecks and bill instances, then tells subscribers the data changed.
 * Syncs for a user never overlap: a request made during a run waits for one follow-up run, and
 * every request made in the meantime shares it — the follow-up sees all of their changes.
 * Rejects if the run this request waited on failed.
 */
export function requestHorizonSync(userId: string): Promise<void> {
  const state = running.get(userId)
  if (!state) return start(userId)
  state.queued ??= new Promise<void>((resolve) => {
    state.startQueued = resolve
  })
  return state.queued
}
