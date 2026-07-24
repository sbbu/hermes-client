import { beforeEach, expect, test } from 'vitest'

import { $notifications, clearNotifications, notifyError } from './notifications'

beforeEach(() => {
  clearNotifications()
})

function lastMessage(): string {
  return $notifications.get()[0]?.message ?? ''
}

test('gateway_auth_failed is summarized as gateway auth, not a provider key failure', () => {
  notifyError(
    new Error(
      '401 {"error": {"message": "Invalid gateway API key (API_SERVER_KEY)", "type": "gateway_auth_error", "code": "gateway_auth_failed"}}'
    ),
    'Request failed'
  )

  expect(lastMessage()).toContain('API_SERVER_KEY')
  expect(lastMessage()).not.toMatch(/OpenAI/i)
})

test('provider invalid_api_key still maps to the OpenAI summary', () => {
  notifyError(
    new Error('401 {"error": {"message": "Incorrect API key provided", "code": "invalid_api_key"}}'),
    'Request failed'
  )

  expect(lastMessage()).toMatch(/OpenAI rejected the API key/i)
})
