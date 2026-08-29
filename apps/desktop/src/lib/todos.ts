export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface TodoItem {
  content: string
  id: string
  parent?: string
  status: TodoStatus
}

const STATUSES: readonly TodoStatus[] = ['pending', 'in_progress', 'completed', 'cancelled']

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const isStatus = (v: unknown): v is TodoStatus => (STATUSES as readonly string[]).includes(v as string)

function parseArray(value: unknown[]): TodoItem[] {
  return value.flatMap(item => {
    if (!isRecord(item) || !isStatus(item.status)) {
      return []
    }

    const id = String(item.id ?? '').trim()
    const content = String(item.content ?? '').trim()
    const parent = String(item.parent ?? '').trim()

    return id && content ? [{ content, id, status: item.status, ...(parent && parent !== id ? { parent } : {}) }] : []
  })
}

function parse(value: unknown, depth: number): null | TodoItem[] {
  if (depth > 2) {
    return null
  }

  if (Array.isArray(value)) {
    return parseArray(value)
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      return parse(JSON.parse(value), depth + 1)
    } catch {
      return null
    }
  }

  if (isRecord(value) && Object.hasOwn(value, 'todos')) {
    return parse(value.todos, depth + 1)
  }

  return null
}

export const parseTodos = (value: unknown): null | TodoItem[] => parse(value, 0)

/** Parent-before-child display order. Dangling and cyclic parents degrade to
 * top-level rows so malformed payloads never hide work. */
export function todoTree(todos: readonly TodoItem[]): [TodoItem, number][] {
  const ids = new Set(todos.map(todo => todo.id))
  const children = new Map<string, TodoItem[]>()
  const roots: TodoItem[] = []

  for (const todo of todos) {
    if (todo.parent && ids.has(todo.parent) && todo.parent !== todo.id) {
      const siblings = children.get(todo.parent) ?? []
      siblings.push(todo)
      children.set(todo.parent, siblings)
    } else {
      roots.push(todo)
    }
  }

  const ordered: [TodoItem, number][] = []
  const seen = new Set<string>()

  const walk = (todo: TodoItem, depth: number) => {
    if (seen.has(todo.id)) {
      return
    }

    seen.add(todo.id)
    ordered.push([todo, depth])

    for (const child of children.get(todo.id) ?? []) {
      walk(child, depth + 1)
    }
  }

  for (const root of roots) {
    walk(root, 0)
  }

  for (const todo of todos) {
    if (!seen.has(todo.id)) {
      seen.add(todo.id)
      ordered.push([todo, 0])
    }
  }

  return ordered
}

/** Latest parseable todo list from one message's aui content parts (tool-call
 *  parts named `todo`; live parts carry `todos`, hydrated ones args/result). */
export function todosFromMessageContent(content: unknown): null | TodoItem[] {
  if (!Array.isArray(content)) {
    return null
  }

  let latest: null | TodoItem[] = null

  for (const part of content) {
    if (!isRecord(part) || part.type !== 'tool-call' || part.toolName !== 'todo') {
      continue
    }

    const parsed = parseTodos(part.todos) ?? parseTodos(part.result) ?? parseTodos(part.args)

    if (parsed !== null) {
      latest = parsed
    }
  }

  return latest
}

/** Current todo state for a whole transcript — the last list wins. */
export function latestSessionTodos(messages: readonly { parts?: unknown }[]): null | TodoItem[] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const todos = todosFromMessageContent(messages[i]?.parts)

    if (todos !== null) {
      return todos
    }
  }

  return null
}
