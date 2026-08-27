import { getGlobalModelOptions, type HermesGateway, type ModelOptionsResponse } from '@/hermes'
import type { ModelOptionProvider } from '@/types/hermes'

const MOA_PROVIDER_SLUG = 'moa'

export function reconcileSelectionAfterCatalogRefresh(
  currentModel: string,
  providers: ModelOptionProvider[] | undefined
): { model: string; provider: string } | null {
  if (!providers?.length) {
    return null
  }

  if (currentModel && providers.some(provider => (provider.models ?? []).includes(currentModel))) {
    return null
  }

  for (const provider of providers) {
    const model = provider.slug === MOA_PROVIDER_SLUG ? null : provider.models?.[0]

    if (model) {
      return { model, provider: provider.slug }
    }
  }

  return null
}

interface ModelOptionsRequest {
  /** When false, include ambient/unconfigured providers (onboarding/setup
   *  surfaces). Chat pickers default to true so only explicitly configured
   *  providers are listed. */
  explicitOnly?: boolean
  gateway?: HermesGateway
  refresh?: boolean
  sessionId?: null | string
}

export function requestModelOptions({
  explicitOnly = true,
  gateway,
  refresh = false,
  sessionId
}: ModelOptionsRequest): Promise<ModelOptionsResponse> {
  if (gateway) {
    const params: Record<string, unknown> = {}

    if (sessionId) {
      params.session_id = sessionId
    }

    if (refresh) {
      params.refresh = true
    }

    if (explicitOnly) {
      params.explicit_only = true
    }

    return gateway.request<ModelOptionsResponse>('model.options', params)
  }

  return getGlobalModelOptions({ explicitOnly, ...(refresh ? { refresh: true } : {}) })
}
