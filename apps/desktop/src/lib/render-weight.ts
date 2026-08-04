export const RENDER_WEIGHT_CHARS = 512

const MAX_MEASURED_MESSAGE_CHARS = 300 * RENDER_WEIGHT_CHARS
const contentWeightCache = new WeakMap<object, number>()
const NON_RENDERED_CONTENT_FIELDS = new Set(['id', 'role', 'toolCallId', 'toolName', 'type'])

/** Estimate synchronous render cost from component count and rendered text. */
export function messageRenderWeight(content: unknown): number {
  if (!Array.isArray(content)) {
    return 1
  }

  const cached = contentWeightCache.get(content)

  if (cached !== undefined) {
    return cached
  }

  const seen = new WeakSet<object>()
  const pending: unknown[] = [...content]
  let characters = 0

  while (pending.length > 0 && characters < MAX_MEASURED_MESSAGE_CHARS) {
    const value = pending.pop()

    if (typeof value === 'string') {
      characters += Math.min(value.length, MAX_MEASURED_MESSAGE_CHARS - characters)

      continue
    }

    if (!value || typeof value !== 'object' || seen.has(value)) {
      continue
    }

    seen.add(value)

    if (Array.isArray(value)) {
      pending.push(...value)

      continue
    }

    for (const [key, nested] of Object.entries(value)) {
      if (!NON_RENDERED_CONTENT_FIELDS.has(key)) {
        pending.push(nested)
      }
    }
  }

  const weight = Math.max(1, content.length) + Math.ceil(characters / RENDER_WEIGHT_CHARS)
  contentWeightCache.set(content, weight)

  return weight
}
