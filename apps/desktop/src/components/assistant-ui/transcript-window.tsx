import { createContext, type ReactNode, useContext } from 'react'

export interface TranscriptWindowValue {
  olderAvailable: boolean
  expandWindow: () => void
}

const TranscriptWindowContext = createContext<TranscriptWindowValue>({
  olderAvailable: false,
  expandWindow: () => {}
})

export function TranscriptWindowProvider({ children, value }: { children: ReactNode; value: TranscriptWindowValue }) {
  return <TranscriptWindowContext.Provider value={value}>{children}</TranscriptWindowContext.Provider>
}

export function useTranscriptWindow(): TranscriptWindowValue {
  return useContext(TranscriptWindowContext)
}

export function resolveShowEarlierAction(hiddenCount: number, olderAvailable: boolean): 'dom' | 'window' | null {
  return hiddenCount > 0 ? 'dom' : olderAvailable ? 'window' : null
}
