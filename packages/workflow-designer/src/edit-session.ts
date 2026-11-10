import type { WorkflowModel } from './types'

export interface WorkflowRoutePoints { x: number; y: number }

/**
 * A committed business model and the optional route points that belong to its
 * flows. Route arrays use model.flows order at this module's interface.
 */
export interface WorkflowEditSnapshot {
  model: WorkflowModel
  routes: (WorkflowRoutePoints[] | undefined)[]
}

interface StoredRoute {
  source: string
  target: string
  occurrence: number
  points: WorkflowRoutePoints[]
}

interface StoredSnapshot {
  model: WorkflowModel
  routes: StoredRoute[]
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function routeIdentity(source: string, target: string, occurrence: number): string {
  return JSON.stringify([source, target, occurrence])
}

function storeSnapshot(snapshot: WorkflowEditSnapshot): StoredSnapshot {
  const occurrences = new Map<string, number>()
  const routes: StoredRoute[] = []

  snapshot.model.flows.forEach((flow, index) => {
    const pair = JSON.stringify([flow.source, flow.target])
    const occurrence = occurrences.get(pair) ?? 0
    occurrences.set(pair, occurrence + 1)
    const points = snapshot.routes[index]
    if (points?.length) {
      routes.push({ source: flow.source, target: flow.target, occurrence, points: cloneJson(points) })
    }
  })

  return { model: cloneJson(snapshot.model), routes }
}

function restoreSnapshot(snapshot: StoredSnapshot): WorkflowEditSnapshot {
  const occurrences = new Map<string, number>()
  const routes = snapshot.model.flows.map(flow => {
    const pair = JSON.stringify([flow.source, flow.target])
    const occurrence = occurrences.get(pair) ?? 0
    occurrences.set(pair, occurrence + 1)
    const identity = routeIdentity(flow.source, flow.target, occurrence)
    const route = snapshot.routes.find(item => routeIdentity(item.source, item.target, item.occurrence) === identity)
    return route ? cloneJson(route.points) : undefined
  })

  return { model: cloneJson(snapshot.model), routes }
}

/** Owns committed edit history without depending on Vue, Vue Flow, or the host. */
export function createWorkflowEditSession() {
  let history: StoredSnapshot[] = []
  let cursor = -1

  return {
    get hasBaseline(): boolean {
      return cursor >= 0
    },
    get canUndo(): boolean {
      return cursor > 0
    },
    get canRedo(): boolean {
      return cursor >= 0 && cursor < history.length - 1
    },
    reset(snapshot?: WorkflowEditSnapshot): void {
      if (!snapshot) {
        history = []
        cursor = -1
        return
      }
      history = [storeSnapshot(snapshot)]
      cursor = 0
    },
    ensureBaseline(snapshot: WorkflowEditSnapshot): void {
      if (cursor < 0) {
        history = [storeSnapshot(snapshot)]
        cursor = 0
      }
    },
    commit(snapshot: WorkflowEditSnapshot): void {
      const next = storeSnapshot(snapshot)
      if (cursor < 0) {
        history = [next]
        cursor = 0
        return
      }
      if (JSON.stringify(history[cursor]) === JSON.stringify(next)) return
      history = [...history.slice(0, cursor + 1), next]
      cursor = history.length - 1
    },
    undo(): WorkflowEditSnapshot | undefined {
      if (!this.canUndo) return undefined
      cursor -= 1
      return restoreSnapshot(history[cursor]!)
    },
    redo(): WorkflowEditSnapshot | undefined {
      if (!this.canRedo) return undefined
      cursor += 1
      return restoreSnapshot(history[cursor]!)
    },
  }
}
