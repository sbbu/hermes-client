export function resolveManualSessionOrderIds(currentIds: string[], orderIds: string[], manual: boolean): string[] {
  if (!manual || !currentIds.length || !orderIds.length) {
    return []
  }

  const current = new Set(currentIds)
  const retained = orderIds.filter(id => current.has(id))

  if (!retained.length) {
    return []
  }

  const retainedSet = new Set(retained)
  const firstRetained = currentIds.findIndex(id => retainedSet.has(id))
  const newer: string[] = []
  const older: string[] = []

  currentIds.forEach((id, index) => {
    if (!retainedSet.has(id)) {
      ;(firstRetained >= 0 && index < firstRetained ? newer : older).push(id)
    }
  })

  return [...newer, ...retained, ...older]
}
