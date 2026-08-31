import { atom } from 'nanostores'

import { parseTodoRevision, parseTodos, type TodoItem } from '@/lib/todos'

/** Live todo list per runtime session, rendered by the composer status stack. */
export const $todosBySession = atom<Record<string, TodoItem[]>>({})
export const $todoRevisionsBySession = atom<Record<string, number>>({})

export const todoListActive = (todos: readonly TodoItem[]) =>
  todos.some(t => t.status === 'pending' || t.status === 'in_progress')

// Stored transcript hydration runs after a turn completes. An active list in
// that history is stale; only a finished list should briefly reappear.
export function todosForHydration(todos: readonly TodoItem[] | null): TodoItem[] | null {
  return todos && !todoListActive(todos) ? [...todos] : null
}

const FINISHED_LINGER_MS = 4_000
const clearTimers = new Map<string, ReturnType<typeof setTimeout>>()
const todoGenerations = new Map<string, number>()

function bumpSessionTodoGeneration(sid: string) {
  todoGenerations.set(sid, (todoGenerations.get(sid) ?? 0) + 1)
}

export const sessionTodoGeneration = (sid: string): number => todoGenerations.get(sid) ?? 0

function cancelScheduledClear(sid: string) {
  const timer = clearTimers.get(sid)

  if (timer !== undefined) {
    clearTimeout(timer)
    clearTimers.delete(sid)
  }
}

function acceptRevision(sid: string, revision?: null | number): boolean {
  const revisions = $todoRevisionsBySession.get()
  const current = revisions[sid]

  // tool.start has no revision; allow its optimistic merge without moving the watermark.
  if (revision == null) {
    return true
  }

  if (current != null && revision < current) {
    return false
  }

  if (current !== revision) {
    $todoRevisionsBySession.set({ ...revisions, [sid]: revision })
  }

  return true
}

export function setSessionTodos(sid: string, todos: TodoItem[], revision?: null | number) {
  if (!sid || !acceptRevision(sid, revision)) {
    return
  }

  cancelScheduledClear(sid)
  bumpSessionTodoGeneration(sid)
  $todosBySession.set({ ...$todosBySession.get(), [sid]: todos })

  if (!todoListActive(todos)) {
    clearTimers.set(
      sid,
      setTimeout(() => {
        clearTimers.delete(sid)
        dropSessionTodos(sid, false)
      }, FINISHED_LINGER_MS)
    )
  }
}

function dropSessionTodos(sid: string, forgetRevision: boolean) {
  if (!sid) {
    return
  }

  cancelScheduledClear(sid)
  bumpSessionTodoGeneration(sid)

  const map = $todosBySession.get()

  if (sid in map) {
    const { [sid]: _drop, ...rest } = map
    $todosBySession.set(rest)
  }

  if (forgetRevision) {
    const revisions = $todoRevisionsBySession.get()

    if (sid in revisions) {
      const { [sid]: _drop, ...rest } = revisions
      $todoRevisionsBySession.set(rest)
    }
  }
}

export function clearSessionTodos(sid: string) {
  dropSessionTodos(sid, true)
}

// Turn completion without a final todo update must not leave an unfinished
// task list pinned above the composer. Finished lists keep their short linger.
export function clearActiveSessionTodos(sid: string) {
  if (!sid) {
    return
  }

  const todos = $todosBySession.get()[sid]

  if (todos && todoListActive(todos)) {
    dropSessionTodos(sid, false)

    return
  }

  // Even without visible work, this is a turn boundary. Invalidate any older
  // post-turn hydration still waiting on the transcript request.
  bumpSessionTodoGeneration(sid)
}

/** Apply stored transcript state only if no newer turn/todo mutation won while
 * the transcript request was in flight. Stale active history clears visible
 * work without forgetting the authoritative revision watermark. */
export function restoreSessionTodosFromHydration(
  sid: string,
  todos: readonly TodoItem[] | null,
  expectedGeneration: number,
  expectedRevision?: number
): boolean {
  if (
    !sid ||
    sessionTodoGeneration(sid) !== expectedGeneration ||
    $todoRevisionsBySession.get()[sid] !== expectedRevision
  ) {
    return false
  }

  // Revisioned live snapshots are authoritative. Stored transcript parsing
  // loses the revision attached to the tool result, so it must never replace a
  // state already fenced by the backend watermark.
  if (expectedRevision !== undefined) {
    return false
  }

  const visible = todosForHydration(todos)

  if (visible !== null) {
    setSessionTodos(sid, visible)
  } else {
    clearActiveSessionTodos(sid)
  }

  return true
}

/** Apply a session.resume/activate or todo.updated full snapshot. */
export function restoreSessionTodosFromSnapshot(sid: string, snapshot: unknown, running: boolean) {
  const todos = parseTodos(snapshot)

  if (!sid || todos === null) {
    return
  }

  const revision = parseTodoRevision(snapshot)

  if (todos.length === 0 && (revision == null || revision === 0)) {
    return
  }

  if (running || !todoListActive(todos)) {
    setSessionTodos(sid, todos, revision)
  } else if (acceptRevision(sid, revision)) {
    dropSessionTodos(sid, false)
  }
}
