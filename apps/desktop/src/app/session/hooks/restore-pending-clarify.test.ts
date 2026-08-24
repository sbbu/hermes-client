import { beforeEach, describe, expect, it } from 'vitest'

import { $clarifyRequests, setClarifyRequest } from '@/store/clarify'

import { restorePendingClarifyFromSnapshot } from './restore-pending-clarify'

describe('restorePendingClarifyFromSnapshot', () => {
  beforeEach(() => $clarifyRequests.set({}))

  it('restores a single pending request', () => {
    expect(
      restorePendingClarifyFromSnapshot(
        {
          pending_clarify: {
            choices: ['yes', 'no'],
            question: 'continue?',
            request_id: 'request-1'
          }
        },
        'session-1',
        10
      )
    ).toBe(true)

    expect($clarifyRequests.get()['session-1']).toMatchObject({
      choices: ['yes', 'no'],
      question: 'continue?',
      requestId: 'request-1'
    })
  })

  it('clears an older request when the snapshot says none is pending', () => {
    setClarifyRequest({
      choices: null,
      question: 'old',
      receivedAt: 5,
      requestId: 'old-request',
      sessionId: 'session-1'
    })

    expect(restorePendingClarifyFromSnapshot({ pending_clarify: null }, 'session-1', 10)).toBe(false)
    expect($clarifyRequests.get()['session-1']).toBeUndefined()
  })

  it('does not clear a request that arrived while resume was in flight', () => {
    setClarifyRequest({
      choices: null,
      question: 'new',
      receivedAt: 15,
      requestId: 'new-request',
      sessionId: 'session-1'
    })

    restorePendingClarifyFromSnapshot({ pending_clarify: null }, 'session-1', 10)
    expect($clarifyRequests.get()['session-1']?.requestId).toBe('new-request')
  })
})
