'use strict'

function formatRendererConsoleLine(label, detailsOrLevel, message, line, sourceId) {
  const details = detailsOrLevel && typeof detailsOrLevel === 'object' ? detailsOrLevel : null
  const level = details ? details.level : detailsOrLevel
  if (level !== 3) return null

  const text = details ? details.message : message
  const src = details ? details.sourceUrl : sourceId
  const lineNo = details ? details.lineNumber : line
  return `[renderer console:${label}] ${String(text)} (${String(src)}:${String(lineNo)})`
}

function attachRendererConsoleCapture(win, label, log) {
  win.webContents.on('console-message', (_event, detailsOrLevel, message, line, sourceId) => {
    const formatted = formatRendererConsoleLine(label, detailsOrLevel, message, line, sourceId)
    if (formatted !== null) log(formatted)
  })
}

function formatRendererBoundaryReport(label, boundary, message, componentStack) {
  const clamp = (value, max) =>
    Array.from(String(value ?? ''))
      .filter(char => {
        const code = char.charCodeAt(0)
        return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
      })
      .join('')
      .slice(0, max)
  const head = `[renderer crash:${clamp(label, 64) || 'unknown'}] [error-boundary:${clamp(boundary, 64) || 'unknown'}] ${
    clamp(message, 2000) || '(no message)'
  }`
  const stack = clamp(componentStack, 4000).trim()
  return stack ? `${head}\n${stack}` : head
}

module.exports = { attachRendererConsoleCapture, formatRendererBoundaryReport, formatRendererConsoleLine }
