import { useEffect, useRef } from 'react'
import spinners, { type BrailleSpinnerName as SpinnerName } from 'unicode-animations'

import { cn } from '@/lib/utils'

export type { SpinnerName }

interface NormalisedSpinner {
  frames: readonly string[]
  interval: number
}

// Some spinners ship multi-character frames. Pull the first cell so each
// frame fits in one monospace box — matches how the TUI uses them.
const FRAMES_BY_NAME: Record<SpinnerName, NormalisedSpinner> = (() => {
  const out = {} as Record<SpinnerName, NormalisedSpinner>

  for (const name of Object.keys(spinners) as SpinnerName[]) {
    const raw = spinners[name]

    out[name] = {
      frames: raw.frames.map(frame => [...frame][0] ?? '⠀'),
      interval: raw.interval
    }
  }

  return out
})()

interface GlyphSpinnerProps {
  ariaLabel?: string
  className?: string
  spinner?: SpinnerName
}

/**
 * One-char glyph spinner driven by `unicode-animations` (braille, orbit, scan,
 * etc. — pick any `spinner` name). Mirrors the spinner used by the Ink TUI so
 * the desktop and terminal experiences read the same visually. Renders inside
 * an `inline-flex` cell with `leading-none` and `items-center` so it sits
 * vertically centred inside its parent's line-box.
 */
export function GlyphSpinner({ ariaLabel = 'Loading', className, spinner = 'braille' }: GlyphSpinnerProps) {
  const spin = FRAMES_BY_NAME[spinner] ?? FRAMES_BY_NAME.braille!
  const glyphRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const glyph = glyphRef.current

    if (!glyph) {
      return
    }

    let frame = 0
    let timer: number | undefined
    glyph.textContent = spin.frames[frame]

    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
    }

    const sync = () => {
      if (document.hidden || !document.hasFocus()) {
        stop()

        return
      }

      if (timer === undefined) {
        timer = window.setInterval(() => {
          frame = (frame + 1) % spin.frames.length
          glyph.textContent = spin.frames[frame]
        }, spin.interval)
      }
    }

    window.addEventListener('focus', sync)
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', sync)
    sync()

    return () => {
      window.removeEventListener('focus', sync)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', sync)
      stop()
    }
  }, [spin])

  return (
    <span
      aria-label={ariaLabel}
      className={cn('inline-flex items-center justify-center font-mono leading-none tabular-nums', className)}
      ref={glyphRef}
      role="status"
    >
      {spin.frames[0]}
    </span>
  )
}
