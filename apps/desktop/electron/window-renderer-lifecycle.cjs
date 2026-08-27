'use strict'

// Shared renderer lifecycle diagnostics and bounded crash recovery for every
// first-party BrowserWindow. Auxiliary and third-party windows use log-only
// mode so a crash never resurrects a window the user closed.

const DEFAULT_RELOAD_WINDOW_MS = 60_000
const DEFAULT_RELOAD_MAX = 3
const RECOVERABLE_REASONS = new Set(['crashed', 'oom'])

function safeNow(now) {
  return typeof now === 'function' ? now() : Date.now()
}

function pruneReloadTimes(times, now, windowMs) {
  return times.filter(timestamp => now - timestamp < windowMs)
}

function pushReloadTime(times, now) {
  times.push(now)
  return times
}

function shouldReloadAfterRendererGone(details) {
  if (details.isDestroyed) return { reload: false, suppressedReason: 'expected-teardown' }
  if (!RECOVERABLE_REASONS.has(String(details.reason || ''))) {
    return { reload: false, suppressedReason: 'unrecoverable-reason' }
  }

  const windowMs = details.reloadWindowMs ?? DEFAULT_RELOAD_WINDOW_MS
  const max = details.reloadMax ?? DEFAULT_RELOAD_MAX
  const now = safeNow(details.now)
  const recent = pruneReloadTimes(details.recentReloadTimes, now, windowMs)
  if (recent.length >= max) return { reload: false, suppressedReason: 'crash-loop' }
  return { reload: true }
}

function shouldReloadAfterFailedLoad(details) {
  if (details.isMainFrame !== true) return { reload: false, suppressedReason: 'unrecoverable-reason' }
  if (String(details.errorCode) === '-3') return { reload: false, suppressedReason: 'expected-teardown' }

  const windowMs = details.reloadWindowMs ?? DEFAULT_RELOAD_WINDOW_MS
  const max = details.reloadMax ?? DEFAULT_RELOAD_MAX
  const now = safeNow(details.now)
  const recent = pruneReloadTimes(details.recentReloadTimes, now, windowMs)
  if (recent.length >= max) return { reload: false, suppressedReason: 'crash-loop', surfaceError: true }
  return { reload: true }
}

function describeRendererLifecycleEvent(event) {
  const kind = String(event.kind || '?')
  if (event.event === 'unresponsive') return `[renderer:${kind}] webContents became unresponsive`
  if (event.event === 'did-fail-load') {
    const code = event.errorCode === undefined ? '?' : String(event.errorCode)
    return `[renderer:${kind}] did-fail-load code=${code} url=${String(event.url || '?')}`
  }

  const reason = String(event.reason || '?')
  const exitCode = event.exitCode === undefined ? '?' : String(event.exitCode)
  const teardown = event.isDestroyed && reason === 'killed' ? ' (expected teardown)' : ''
  return `[renderer:${kind}] render-process-gone reason=${reason} exitCode=${exitCode}${teardown}`
}

function installWindowRendererLifecycle(win, options) {
  const { kind } = options
  const { log, reload, onCrashLoopSuppressed, onFailedLoadBudgetExhausted } = options.callbacks
  const reloadWindowMs = options.reloadWindowMs ?? DEFAULT_RELOAD_WINDOW_MS
  const reloadMax = options.reloadMax ?? DEFAULT_RELOAD_MAX
  const budgetRef = options.recentReloadTimesRef ?? { current: [] }
  const redactLoadUrl = options.redactLoadUrl === true
  const contents = win.webContents

  const onRendererGone = (_event, details = {}) => {
    const destroyed = win.isDestroyed()
    log(describeRendererLifecycleEvent({ kind, event: 'render-process-gone', ...details, isDestroyed: destroyed }))

    const nowMs = safeNow(options.now)
    const recent = pruneReloadTimes(budgetRef.current, nowMs, reloadWindowMs)
    budgetRef.current.length = 0
    budgetRef.current.push(...recent)
    const decision = shouldReloadAfterRendererGone({
      reason: details.reason,
      isDestroyed: destroyed,
      recentReloadTimes: budgetRef.current,
      reloadWindowMs,
      reloadMax,
      now: () => nowMs
    })

    if (!decision.reload) {
      if (decision.suppressedReason === 'crash-loop') {
        log(
          `[renderer:${kind}] suppressing reload: ${budgetRef.current.length} crashes within ${reloadWindowMs}ms (likely a crash loop)`
        )
        onCrashLoopSuppressed?.(details)
      }
      return
    }
    if (typeof reload !== 'function') return

    pushReloadTime(budgetRef.current, nowMs)
    setImmediate(() => {
      if (win.isDestroyed()) return
      try {
        reload()
      } catch (error) {
        log(`[renderer:${kind}] reload after crash failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
  }

  const onUnresponsive = () => log(describeRendererLifecycleEvent({ kind, event: 'unresponsive' }))
  const onDidFailLoad = (_event, errorCode, _errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame === true) {
      log(
        describeRendererLifecycleEvent({
          kind,
          event: 'did-fail-load',
          errorCode,
          url: redactLoadUrl ? '(redacted)' : String(validatedURL ?? '')
        })
      )

      if (options.reloadOnFailedLoad && typeof reload === 'function') {
        const nowMs = safeNow(options.now)
        const recent = pruneReloadTimes(budgetRef.current, nowMs, reloadWindowMs)
        budgetRef.current.length = 0
        budgetRef.current.push(...recent)
        const decision = shouldReloadAfterFailedLoad({
          errorCode,
          isMainFrame,
          recentReloadTimes: budgetRef.current,
          reloadWindowMs,
          reloadMax,
          now: () => nowMs
        })

        if (decision.reload) {
          pushReloadTime(budgetRef.current, nowMs)
          setImmediate(() => {
            if (win.isDestroyed()) return
            try {
              reload()
            } catch (error) {
              log(
                `[renderer:${kind}] reload after failed load failed: ${error instanceof Error ? error.message : String(error)}`
              )
            }
          })
        } else if (decision.surfaceError) {
          onFailedLoadBudgetExhausted?.({ errorCode, isMainFrame, url: validatedURL })
        }
      }
    }
  }

  contents.on('render-process-gone', onRendererGone)
  contents.on('unresponsive', onUnresponsive)
  contents.on('did-fail-load', onDidFailLoad)

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    contents.removeListener?.('render-process-gone', onRendererGone)
    contents.removeListener?.('unresponsive', onUnresponsive)
    contents.removeListener?.('did-fail-load', onDidFailLoad)
  }
}

module.exports = {
  describeRendererLifecycleEvent,
  installWindowRendererLifecycle,
  pruneReloadTimes,
  pushReloadTime,
  shouldReloadAfterFailedLoad,
  shouldReloadAfterRendererGone
}
