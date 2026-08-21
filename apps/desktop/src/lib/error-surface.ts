export const ERROR_SURFACE_LAYERS = [
  'provider',
  'endpoint',
  'streaming',
  'auth',
  'billing',
  'gateway',
  'runtime',
  'disk'
] as const

export type ErrorSurfaceLayer = (typeof ERROR_SURFACE_LAYERS)[number]

export interface ErrorSurface {
  layer: ErrorSurfaceLayer
  code: string
  retryable: boolean
  provider?: string
  model?: string
}

export function parseErrorSurface(value: unknown): ErrorSurface | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const raw = value as { code?: unknown; layer?: unknown; model?: unknown; provider?: unknown; retryable?: unknown }
  const layer = typeof raw.layer === 'string' ? (raw.layer as ErrorSurfaceLayer) : null

  if (!layer || !ERROR_SURFACE_LAYERS.includes(layer)) {
    return null
  }

  return {
    layer,
    code: typeof raw.code === 'string' && raw.code ? raw.code : 'unknown',
    retryable: raw.retryable !== false,
    ...(typeof raw.provider === 'string' && raw.provider ? { provider: raw.provider } : {}),
    ...(typeof raw.model === 'string' && raw.model ? { model: raw.model } : {})
  }
}

export function formatErrorDiagnostics(input: {
  errorText: string
  model?: string
  provider?: string
  surface?: ErrorSurface | null
}): string {
  const provider = input.surface?.provider || input.provider
  const model = input.surface?.model || input.model

  const lines = [
    '── Hermes Client error details ──',
    `time: ${new Date().toISOString()}`,
    input.surface ? `layer: ${input.surface.layer}` : null,
    input.surface ? `code: ${input.surface.code}` : null,
    input.surface ? `retryable: ${input.surface.retryable}` : null,
    provider ? `provider: ${provider}` : null,
    model ? `model: ${model}` : null,
    `error: ${input.errorText}`
  ]

  return lines.filter((line): line is string => Boolean(line)).join('\n')
}
