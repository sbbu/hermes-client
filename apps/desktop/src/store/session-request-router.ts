import { activeGatewayProfileKey, requestGatewayForProfile } from '@/store/gateway'

const normKey = (profile: null | string | undefined): string => (profile ?? '').trim() || 'default'

export function sessionRpcNeedsProfileRoute(
  ownerProfile: null | string | undefined,
  activeProfile: string = activeGatewayProfileKey()
): boolean {
  if (ownerProfile == null || !String(ownerProfile).trim()) {
    return false
  }

  return normKey(ownerProfile) !== normKey(activeProfile)
}

/** Route session RPCs by their owning profile at call time, not swap time. */
export function requestForSessionProfile<T>(
  ownerProfile: null | string | undefined,
  ambientRequest: <R>(method: string, params?: Record<string, unknown>) => Promise<R>,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  if (!sessionRpcNeedsProfileRoute(ownerProfile)) {
    return ambientRequest<T>(method, params)
  }

  return requestGatewayForProfile<T>(normKey(ownerProfile), method, params)
}
