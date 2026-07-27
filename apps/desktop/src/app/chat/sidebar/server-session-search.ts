import { useEffect, useMemo, useState } from 'react'

import { searchSessions, type SessionSearchResult } from '@/hermes'

const SEARCH_DEBOUNCE_MS = 200
const EMPTY_RESULTS: SessionSearchResult[] = []

interface ServerSearchState {
  key: string
  matches: SessionSearchResult[]
}

/** Search the active backend without ever exposing a prior profile/query's results. */
export function useServerSessionSearch(query: string, profile: string): SessionSearchResult[] {
  const requestKey = useMemo(() => JSON.stringify([profile, query]), [profile, query])
  const [search, setSearch] = useState<ServerSearchState>({ key: '', matches: EMPTY_RESULTS })

  useEffect(() => {
    if (!query) {
      return
    }

    let cancelled = false

    const id = window.setTimeout(() => {
      void searchSessions(query, profile)
        .then(response => {
          if (!cancelled) {
            setSearch({
              key: requestKey,
              matches: response.results.map(result => ({ ...result, profile }))
            })
          }
        })
        .catch(() => undefined)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [profile, query, requestKey])

  return search.key === requestKey ? search.matches : EMPTY_RESULTS
}
