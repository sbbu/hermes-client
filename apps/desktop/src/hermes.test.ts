import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getCronJobs,
  getCronJobsForProfiles,
  getGlobalModelOptions,
  getSessionMessages,
  listAllProfileSessions,
  listSessions,
  setApiRequestProfile,
  triggerCronJob
} from './hermes'

const emptySessionsResponse = {
  limit: 0,
  offset: 0,
  sessions: [],
  total: 0
}

describe('Hermes REST session helpers', () => {
  let api: ReturnType<typeof vi.fn>

  beforeEach(() => {
    api = vi.fn().mockResolvedValue(emptySessionsResponse)
    Object.defineProperty(window, 'hermesDesktop', {
      configurable: true,
      value: { api }
    })
  })

  afterEach(() => {
    setApiRequestProfile(null)
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, 'hermesDesktop')
  })

  it('uses a longer timeout for the single-profile session list', async () => {
    await listSessions(50, 1)

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/sessions?limit=50&offset=0&min_messages=1&archived=exclude&order=recent',
        timeoutMs: 60_000
      })
    )
  })

  it('uses a longer timeout for the all-profile session list', async () => {
    await listAllProfileSessions(50, 1)

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/profiles/sessions?limit=50&offset=0&min_messages=1&archived=exclude&order=recent&profile=all',
        timeoutMs: 60_000
      })
    )
  })

  it('scopes cron lists by sidebar profile and active backend', async () => {
    api.mockResolvedValue([])
    setApiRequestProfile('coder')

    await getCronJobs('all')

    expect(api).toHaveBeenCalledWith({
      path: '/api/cron/jobs?profile=all',
      profile: 'coder',
      timeoutMs: 60_000
    })
  })

  it('routes cron mutations to the job-owning profile', async () => {
    api.mockResolvedValue({ id: 'job-1' })
    setApiRequestProfile('coder')

    await triggerCronJob('job-1', 'analyst')

    expect(api).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/cron/jobs/job-1/trigger?profile=analyst',
      profile: 'analyst'
    })
  })

  it('fans out all-profile cron reads through profile-specific backends', async () => {
    api.mockImplementation(async ({ profile }: { profile?: string }) => [
      { enabled: true, id: 'same-id', profile, state: 'scheduled' }
    ])

    const jobs = await getCronJobsForProfiles(['default', 'analyst'])

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/cron/jobs?profile=default', profile: 'default' })
    )
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/cron/jobs?profile=analyst', profile: 'analyst' })
    )
    expect(jobs.map(job => job.profile)).toEqual(['default', 'analyst'])
  })

  it('tags cross-profile message reads for Electron routing and backend lookup', async () => {
    api.mockResolvedValue({ messages: [], session_id: 'session-1' })

    await getSessionMessages('session-1', 'xiaoxuxu')

    expect(api).toHaveBeenCalledWith({
      path: '/api/sessions/session-1/messages?profile=xiaoxuxu',
      profile: 'xiaoxuxu'
    })
  })

  it('requests explicit model providers by default', async () => {
    await getGlobalModelOptions()

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/model/options?explicit_only=1'
      })
    )
  })

  it('can request the onboarding provider universe', async () => {
    await getGlobalModelOptions({ includeUnconfigured: true, explicitOnly: false, refresh: true })

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/model/options?refresh=1&include_unconfigured=1'
      })
    )
  })
})
