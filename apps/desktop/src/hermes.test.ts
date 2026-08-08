import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AUDIO_SPEAK_MAX_REQUEST_TIMEOUT_MS,
  AUDIO_SPEAK_MIN_REQUEST_TIMEOUT_MS,
  AUDIO_TRANSCRIBE_MAX_REQUEST_TIMEOUT_MS,
  AUDIO_TRANSCRIBE_MIN_REQUEST_TIMEOUT_MS,
  audioSpeakRequestTimeoutMs,
  audioTranscribeRequestTimeoutMs,
  getAllSessionMessages,
  getCronJobs,
  getCronJobsForProfiles,
  getGlobalModelOptions,
  getLatestSessionMessages,
  getSessionMessages,
  listAllProfileSessions,
  listSessions,
  searchSessions,
  setApiRequestProfile,
  speakText,
  transcribeAudio,
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

  it('passes bounded transcript pagination through to the backend', async () => {
    api.mockResolvedValue({ messages: [], session_id: 'session-1' })

    await getSessionMessages('session-1', 'xiaoxuxu', { limit: 500, offset: 1000, order: 'latest' })

    expect(api).toHaveBeenCalledWith({
      path: '/api/sessions/session-1/messages?profile=xiaoxuxu&limit=500&offset=1000&order=latest',
      profile: 'xiaoxuxu'
    })
  })

  it('requests only the latest bounded transcript for interactive resume', async () => {
    api.mockResolvedValue({ messages: [], session_id: 'session-1' })

    await getLatestSessionMessages('session-1')

    expect(api).toHaveBeenCalledWith({ path: '/api/sessions/session-1/messages?limit=500&order=latest' })
  })

  it('loads complete transcripts through bounded oldest-first pages', async () => {
    api
      .mockResolvedValueOnce({
        messages: Array.from({ length: 500 }, (_, id) => ({ id })),
        session_id: 'session-1',
        pagination: { limit: 500, offset: 0, order: 'oldest', returned: 500 }
      })
      .mockResolvedValueOnce({
        messages: [{ id: 500 }],
        session_id: 'session-1',
        pagination: { limit: 500, offset: 500, order: 'oldest', returned: 1 }
      })

    const result = await getAllSessionMessages('session-1')

    expect(result.messages).toHaveLength(501)
    expect(api).toHaveBeenNthCalledWith(2, {
      path: '/api/sessions/session-1/messages?limit=500&offset=500&order=oldest'
    })
  })

  it('routes session search to the active or explicitly selected profile backend', async () => {
    api.mockResolvedValue({ results: [] })
    setApiRequestProfile('coder')

    await searchSessions('first needle')

    expect(api).toHaveBeenLastCalledWith({
      path: '/api/sessions/search?q=first%20needle',
      profile: 'coder'
    })

    await searchSessions('other', 'research')

    expect(api).toHaveBeenLastCalledWith({
      path: '/api/sessions/search?q=other',
      profile: 'research'
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

  it('bounds audio request timeouts by payload size', () => {
    expect(audioSpeakRequestTimeoutMs('short')).toBe(AUDIO_SPEAK_MIN_REQUEST_TIMEOUT_MS)
    expect(audioSpeakRequestTimeoutMs('x'.repeat(100_000))).toBe(AUDIO_SPEAK_MAX_REQUEST_TIMEOUT_MS)
    expect(audioTranscribeRequestTimeoutMs('short')).toBe(AUDIO_TRANSCRIBE_MIN_REQUEST_TIMEOUT_MS)
    expect(audioTranscribeRequestTimeoutMs('x'.repeat(9_000_000))).toBe(AUDIO_TRANSCRIBE_MAX_REQUEST_TIMEOUT_MS)
  })

  it('routes blocking audio calls to the active profile with extended timeouts', async () => {
    api.mockResolvedValue({ ok: true })
    setApiRequestProfile('analyst')

    await speakText('Read this aloud')
    await transcribeAudio('data:audio/webm;base64,AA==', 'audio/webm')

    expect(api).toHaveBeenNthCalledWith(1, {
      body: { text: 'Read this aloud' },
      method: 'POST',
      path: '/api/audio/speak',
      profile: 'analyst',
      timeoutMs: AUDIO_SPEAK_MIN_REQUEST_TIMEOUT_MS
    })
    expect(api).toHaveBeenNthCalledWith(2, {
      body: { data_url: 'data:audio/webm;base64,AA==', mime_type: 'audio/webm' },
      method: 'POST',
      path: '/api/audio/transcribe',
      profile: 'analyst',
      timeoutMs: AUDIO_TRANSCRIBE_MIN_REQUEST_TIMEOUT_MS
    })
  })
})
