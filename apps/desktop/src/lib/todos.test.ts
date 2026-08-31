import { describe, expect, it } from 'vitest'

import { latestSessionTodos, nextTodosFromToolEvent, parseTodoRevision, parseTodos, todoTree } from './todos'

describe('parseTodos', () => {
  it('parses todo arrays with valid ids, content, and statuses', () => {
    expect(
      parseTodos([
        { content: 'Gather ingredients', id: 'prep', status: 'completed' },
        { content: 'Boil water', id: 'boil', status: 'in_progress' },
        { content: 'Serve', id: 'serve', status: 'pending' }
      ])
    ).toEqual([
      { content: 'Gather ingredients', id: 'prep', status: 'completed' },
      { content: 'Boil water', id: 'boil', status: 'in_progress' },
      { content: 'Serve', id: 'serve', status: 'pending' }
    ])
  })

  it('parses nested todo payloads from wrapped objects and JSON strings', () => {
    expect(parseTodos({ todos: [{ content: 'Plate', id: 'plate', status: 'pending' }] })).toEqual([
      { content: 'Plate', id: 'plate', status: 'pending' }
    ])

    expect(parseTodos('{"todos":[{"id":"plate","content":"Plate","status":"pending"}]}')).toEqual([
      { content: 'Plate', id: 'plate', status: 'pending' }
    ])
  })

  it('returns null for non-todo payloads', () => {
    expect(parseTodos(undefined)).toBeNull()
    expect(parseTodos('not json')).toBeNull()
    expect(parseTodos({ message: 'no todos here' })).toBeNull()
  })

  it('preserves valid parent ids and drops self-parenting', () => {
    expect(
      parseTodos([
        { content: 'Parent', id: 'a', status: 'pending' },
        { content: 'Child', id: 'b', parent: 'a', status: 'pending' },
        { content: 'Self', id: 'c', parent: 'c', status: 'pending' }
      ])
    ).toEqual([
      { content: 'Parent', id: 'a', status: 'pending' },
      { content: 'Child', id: 'b', parent: 'a', status: 'pending' },
      { content: 'Self', id: 'c', status: 'pending' }
    ])
  })
})

describe('todoTree', () => {
  it('orders nested children after parents with depth', () => {
    const items = [
      { content: 'Child', id: 'b', parent: 'a', status: 'pending' as const },
      { content: 'Parent', id: 'a', status: 'in_progress' as const },
      { content: 'Grandchild', id: 'c', parent: 'b', status: 'pending' as const }
    ]

    expect(todoTree(items).map(([todo, depth]) => [todo.id, depth])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2]
    ])
  })

  it('keeps cycles visible at depth zero', () => {
    const items = [
      { content: 'A', id: 'a', parent: 'b', status: 'pending' as const },
      { content: 'B', id: 'b', parent: 'a', status: 'pending' as const }
    ]

    expect(todoTree(items).map(([todo, depth]) => [todo.id, depth])).toEqual([
      ['a', 0],
      ['b', 0]
    ])
  })
})

describe('latestSessionTodos', () => {
  const todoPart = (todos: unknown, extra: Record<string, unknown> = {}) => ({
    type: 'tool-call',
    toolCallId: 't1',
    toolName: 'todo',
    args: { todos },
    ...extra
  })

  it('returns the last todo list across the transcript (result beats args)', () => {
    const messages = [
      { parts: [todoPart([{ content: 'Old', id: 'a', status: 'pending' }])] },
      { parts: [{ type: 'text', text: 'hi' }] },
      {
        parts: [
          todoPart([{ content: 'Stale', id: 'a', status: 'pending' }], {
            result: { todos: [{ content: 'Fresh', id: 'a', status: 'completed' }] }
          })
        ]
      }
    ]

    expect(latestSessionTodos(messages)).toEqual([{ content: 'Fresh', id: 'a', status: 'completed' }])
  })

  it('prefers the live carried `todos` field over args', () => {
    const messages = [
      {
        parts: [
          todoPart([{ content: 'Args', id: 'a', status: 'pending' }], {
            todos: [{ content: 'Live', id: 'a', status: 'in_progress' }]
          })
        ]
      }
    ]

    expect(latestSessionTodos(messages)).toEqual([{ content: 'Live', id: 'a', status: 'in_progress' }])
  })

  it('returns null when no todo tool calls exist', () => {
    expect(latestSessionTodos([{ parts: [{ type: 'text', text: 'hi' }] }])).toBeNull()
    expect(latestSessionTodos([])).toBeNull()
  })
})

describe('live todo updates', () => {
  it('merges a status-only patch without dropping the rest of the list', () => {
    const current = [
      { content: 'First', id: 'a', status: 'pending' as const },
      { content: 'Second', id: 'b', status: 'pending' as const }
    ]

    expect(
      nextTodosFromToolEvent(current, {
        args: { merge: true, todos: [{ id: 'a', status: 'completed' }] }
      })
    ).toEqual([
      { content: 'First', id: 'a', status: 'completed' },
      { content: 'Second', id: 'b', status: 'pending' }
    ])
  })

  it('reads revision metadata from direct and nested results', () => {
    expect(parseTodoRevision({ revision: 3 })).toBe(3)
    expect(parseTodoRevision({ result: '{"revision":4}' })).toBe(4)
    expect(parseTodoRevision({ revision: -1 })).toBeNull()
  })
})
