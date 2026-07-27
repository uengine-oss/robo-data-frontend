/** Resolve and open HTTP(S) links without allowing executable URL schemes. */
export function resolveExternalHttpUrl(value: unknown, baseUrl?: string): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null

  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function openExternalHttpUrl(value: unknown): boolean {
  const url = resolveExternalHttpUrl(value, window.location.href)
  if (!url) return false

  const openedWindow = window.open(url, '_blank', 'noopener,noreferrer')
  if (openedWindow) openedWindow.opener = null
  return true
}
