import { atom } from 'nanostores'

import { parseTodoRevision, parseTodos, type TodoItem } from '@/lib/todos'

/** Live todo list per runtime session, rendered by the composer status stack. */
export const $todosBySession = atom<Record<string, TodoItem[]>>({})
export const $todoRevisionsBySession = atom<Record<string, number>>({})

export const todoListActive = (todos: readonly TodoItem[]) =>
  todos.some(t => t.status === 'pending' || t.status === 'in_progress')

const FINISHED_LINGER_MS = 4_000
const clearTimers = new Map<string, ReturnType<typeof setTimeout>>()

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
  cancelScheduledClear(sid)

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
