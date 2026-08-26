'use strict'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeInlineScriptJson(value) {
  return value
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function buildRendererLoadErrorPage(details = {}) {
  const title = 'Hermes Client couldn’t start the desktop UI'
  const code = details.errorCode == null ? '' : ` (${escapeHtml(details.errorCode)})`
  const description = escapeHtml(details.errorDescription || 'The desktop renderer failed to load.')
  const target = details.reloadUrl
    ? `location.replace(${escapeInlineScriptJson(JSON.stringify(details.reloadUrl))})`
    : 'location.reload()'

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0e14;color:#e6e6e6;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:560px;padding:32px;border:1px solid #2b2f3a;border-radius:12px;background:#11151d}h1{font-size:18px;margin:0 0 12px}p{font-size:14px;line-height:1.5}code{font-family:ui-monospace,monospace;background:#1a1f2a;padding:2px 6px;border-radius:4px}button{margin-top:16px;padding:8px 18px;border:0;border-radius:6px;background:#4f7cff;color:#fff;cursor:pointer}</style>
</head><body><main><h1>${title}</h1><p>${description}${code}</p><p>Run <code>hermes-client update</code>, then restart the app. If this persists, check <code>logs/desktop.log</code>.</p><button id="reload" type="button">Reload</button><script>document.getElementById("reload").addEventListener("click",()=>${target})</script></main></body></html>`
}

async function loadRendererLoadErrorPage(win, details = {}) {
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(buildRendererLoadErrorPage(details))}`
  try {
    await win.loadURL(url)
  } catch {
    // The caller already logged the underlying failure; never reject recovery.
  }
}

module.exports = { buildRendererLoadErrorPage, loadRendererLoadErrorPage }
