import { Tooltip as TooltipPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

/** Default hover-open delay for `Tip`. Non-zero so a cursor sweeping across the
 * chrome doesn't flash a trail of tips — they only appear on a deliberate,
 * settled hover. Call sites that need an instant tip pass `delayDuration={0}`. */
const TIP_DELAY_MS = 200

function TooltipProvider({
  delayDuration = 0,
  // Radix's "skip" grace makes subsequent tips open instantly. Zero it so each
  // tip independently honors its hover delay.
  skipDelayDuration = 0,
  // Tips are labels, not interactive surfaces. Hoverable content + Radix's
  // pointer-grace bridge can leave tips stuck open over Electron chrome.
  disableHoverableContent = true,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      disableHoverableContent={disableHoverableContent}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  )
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        // No transition. bg-foreground/text-background auto-inverts per theme:
        // white on near-black in light mode, black on white in dark.
        className={cn(
          'pointer-events-none z-[200] w-fit bg-foreground px-1.5 py-1 text-[11px] font-bold leading-none text-background select-none [font-family:Arial,sans-serif]',
          className
        )}
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

interface TipProps extends Omit<React.ComponentProps<typeof TooltipPrimitive.Content>, 'content'> {
  label: React.ReactNode
  children: React.ReactNode
  delayDuration?: number
}

// Drop-in replacement for native `title=`: wrap any single element. Delayed,
// position-aware, themed. Self-contained (carries its own Provider) so it works
// anywhere without a provider ancestor. Renders the child untouched when label
// is falsy. Open state is trigger-hover only — never sticky or click-blocking.
function Tip({ label, children, delayDuration = TIP_DELAY_MS, ...props }: TipProps) {
  if (!label) {
    return <>{children}</>
  }

  return (
    <TooltipProvider delayDuration={delayDuration} disableHoverableContent>
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent {...props}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export { Tip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
