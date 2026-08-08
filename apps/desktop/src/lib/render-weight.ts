import { isCardTool, isFileEditTool, isSilentTool } from '@/lib/tool-render-class'

export const RENDER_WEIGHT_CHARS = 512

const MAX_MEASURED_MESSAGE_CHARS = 300 * RENDER_WEIGHT_CHARS
const storeWeightCache = new WeakMap<object, number>()
const paintWeightCache = new WeakMap<object, number>()
const NON_RENDERED_CONTENT_FIELDS = new Set(['id', 'role', 'toolCallId', 'toolName', 'type'])
const COLLAPSED_ROW_WEIGHT = 1
const CARD_WEIGHT = 6

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function payloadCharacters(roots: readonly unknown[], budget: number): number {
  const seen = new WeakSet<object>()
  const pending: unknown[] = [...roots]
  let characters = 0

  while (pending.length > 0 && characters < budget) {
    const value = pending.pop()

    if (typeof value === 'string') {
      characters += Math.min(value.length, budget - characters)

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

  return characters
}

function payloadWeight(parts: readonly unknown[], budget: number): number {
  return parts.length + Math.ceil(payloadCharacters(parts, budget) / RENDER_WEIGHT_CHARS)
}

/** Cost of retaining and normalizing a message in the assistant-ui store. */
export function messageStoreWeight(content: unknown): number {
  if (!Array.isArray(content)) {
    return 1
  }

  const cached = storeWeightCache.get(content)

  if (cached !== undefined) {
    return cached
  }

  const weight = Math.max(1, payloadWeight(content, MAX_MEASURED_MESSAGE_CHARS))
  storeWeightCache.set(content, weight)

  return weight
}

function partPaintWeight(part: unknown, measure: (parts: readonly unknown[]) => number): number {
  if (!isRecord(part)) {
    return 1
  }

  if (part.type === 'reasoning') {
    return COLLAPSED_ROW_WEIGHT
  }

  if (part.type !== 'tool-call') {
    return measure([part])
  }

  const toolName = typeof part.toolName === 'string' ? part.toolName : ''

  if (isSilentTool(toolName)) {
    return 0
  }

  if (!isCardTool(toolName)) {
    return COLLAPSED_ROW_WEIGHT
  }

  return isFileEditTool(toolName) ? measure([part]) : CARD_WEIGHT
}

/** Cost of what a message actually mounts after tool/reasoning collapsing. */
export function messagePaintWeight(content: unknown): number {
  if (!Array.isArray(content)) {
    return 1
  }

  const cached = paintWeightCache.get(content)

  if (cached !== undefined) {
    return cached
  }

  let remaining = MAX_MEASURED_MESSAGE_CHARS

  const measure = (parts: readonly unknown[]) => {
    const characters = payloadCharacters(parts, remaining)
    remaining -= characters

    return parts.length + Math.ceil(characters / RENDER_WEIGHT_CHARS)
  }

  let weight = 0

  for (const part of content) {
    weight += partPaintWeight(part, measure)
  }

  weight = Math.max(1, weight)
  paintWeightCache.set(content, weight)

  return weight
}
