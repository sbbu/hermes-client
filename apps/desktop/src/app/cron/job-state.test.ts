import { describe, expect, it } from 'vitest'

import type { CronJob } from '@/types/hermes'

import { cronJobKey } from './job-state'

describe('cronJobKey', () => {
  it('keeps cloned job ids distinct across profiles', () => {
    const defaultJob = { id: 'copied-id', profile: 'default' } as CronJob
    const analystJob = { id: 'copied-id', profile: 'analyst' } as CronJob

    expect(cronJobKey(defaultJob)).toBe('default:copied-id')
    expect(cronJobKey(analystJob)).toBe('analyst:copied-id')
    expect(cronJobKey(defaultJob)).not.toBe(cronJobKey(analystJob))
  })

  it('treats missing owner metadata as the default profile', () => {
    expect(cronJobKey({ id: 'job-1' } as CronJob)).toBe('default:job-1')
  })
})
