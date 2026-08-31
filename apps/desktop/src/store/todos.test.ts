import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TodoItem } from '@/lib/todos'

import {
  $todoRevisionsBySession,
  $todosBySession,
  clearSessionTodos,
  restoreSessionTodosFromSnapshot,
  setSessionTodos
} from './todos'

const todo = (id: string, status: TodoItem['status']): TodoItem => ({ content: `task ${id}`, id, status })

describe('setSessionTodos finished-list auto-clear', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    clearSessionTodos('s1')
    vi.useRealTimers()
  })

  it('keeps an in-flight list indefinitely', () => {
    setSessionTodos('s1', [todo('a', 'completed'), todo('b', 'in_progress')])

    vi.advanceTimersByTime(60_000)

    expect($todosBySession.get().s1).toHaveLength(2)
  })

  it('drops the list shortly after every item completes', () => {
    setSessionTodos('s1', [todo('a', 'completed'), todo('b', 'cancelled')])

    expect($todosBySession.get().s1).toHaveLength(2)

    vi.advanceTimersByTime(5_000)

    expect($todosBySession.get().s1).toBeUndefined()
  })

  it('cancels the pending clear when a new active list arrives', () => {
    setSessionTodos('s1', [todo('a', 'completed')])
    vi.advanceTimersByTime(2_000)

    // The next turn starts a fresh plan before the linger expires.
    setSessionTodos('s1', [todo('a', 'completed'), todo('b', 'pending')])
    vi.advanceTimersByTime(60_000)

    expect($todosBySession.get().s1).toHaveLength(2)
  })
})

describe('revisioned snapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearSessionTodos('s1')
  })

  afterEach(() => {
    clearSessionTodos('s1')
    vi.useRealTimers()
  })

  it('rejects older snapshots and restores active work only while running', () => {
    setSessionTodos('s1', [todo('new', 'in_progress')], 5)
    setSessionTodos('s1', [todo('old', 'pending')], 4)
    expect($todosBySession.get().s1?.[0]?.id).toBe('new')

    clearSessionTodos('s1')
    const snapshot = { revision: 7, todos: [todo('active', 'in_progress')] }
    restoreSessionTodosFromSnapshot('s1', snapshot, false)
    expect($todosBySession.get().s1).toBeUndefined()
    restoreSessionTodosFromSnapshot('s1', snapshot, true)
    expect($todosBySession.get().s1?.[0]?.id).toBe('active')
    expect($todoRevisionsBySession.get().s1).toBe(7)
  })

  it('allows an unversioned optimistic merge after a revisioned snapshot', () => {
    setSessionTodos('s1', [todo('a', 'pending')], 5)
    setSessionTodos('s1', [todo('a', 'completed')])
    expect($todosBySession.get().s1?.[0]?.status).toBe('completed')
    expect($todoRevisionsBySession.get().s1).toBe(5)
  })
})
