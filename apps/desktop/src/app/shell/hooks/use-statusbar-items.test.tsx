import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'
import { $busy, $turnStartedAt } from '@/store/session'

import type { StatusbarItem } from '../statusbar-controls'

import { useStatusbarItems } from './use-statusbar-items'

function readItems(): StatusbarItem[] {
  let latest: StatusbarItem[] = []

  function Probe() {
    latest = [
      ...useStatusbarItems({
        agentsOpen: false,
        chatOpen: true,
        commandCenterOpen: false,
        extraLeftItems: [],
        extraRightItems: [],
        freshDraftReady: false,
        gatewayLogLines: [],
        gatewayState: 'open',
        inferenceStatus: null,
        openAgents: () => undefined,
        openCommandCenterSection: () => undefined,
        requestGateway: async () => ({}) as never,
        statusSnapshot: null,
        toggleCommandCenter: () => undefined
      }).statusbarItems
    ]

    return null
  }

  render(
    <I18nProvider configClient={null}>
      <Probe />
    </I18nProvider>
  )

  return latest
}

describe('useStatusbarItems running indicator', () => {
  afterEach(() => {
    cleanup()
    $busy.set(false)
    $turnStartedAt.set(null)
  })

  it('shows the active running chip even when the turn start timestamp is unavailable', () => {
    $busy.set(true)
    $turnStartedAt.set(null)

    const item = readItems().find(candidate => candidate.id === 'running-timer')

    expect(item).toBeTruthy()
    expect(item?.hidden).toBe(false)
    expect(item?.detail).toBeUndefined()
  })

  it('still hides the running chip when the active session is idle', () => {
    $busy.set(false)
    $turnStartedAt.set(Date.now())

    const item = readItems().find(candidate => candidate.id === 'running-timer')

    expect(item).toBeTruthy()
    expect(item?.hidden).toBe(true)
  })
})
