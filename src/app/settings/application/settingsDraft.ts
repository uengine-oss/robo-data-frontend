import type { ApiProvider, Theme } from '@/shared/stores/runtime'

export const DEFAULT_UML_DEPTH = 3
export const UML_DEPTH_STORAGE_KEY = 'umlDepth'

export interface SettingsDraft {
  appTitle: string
  theme: Theme
  apiKey: string
  apiProvider: ApiProvider
  umlDepth: number
}

export interface SettingsDraftSource {
  appTitle: string
  theme: Theme
  apiKey: string
  apiProvider: ApiProvider
  storedUmlDepth: string | null
}

export function parseUmlDepth(
  storedValue: string | null,
  fallback = DEFAULT_UML_DEPTH,
): number {
  if (storedValue === null || !/^\d+$/.test(storedValue.trim())) return fallback
  const depth = Number(storedValue)
  return Number.isInteger(depth) && depth >= 1 && depth <= 10 ? depth : fallback
}

export function createSettingsDraft(source: SettingsDraftSource): SettingsDraft {
  return {
    appTitle: source.appTitle,
    theme: source.theme,
    apiKey: source.apiKey,
    apiProvider: source.apiProvider,
    umlDepth: parseUmlDepth(source.storedUmlDepth),
  }
}

export function normalizeAppTitle(title: string, fallback: string): string {
  const normalized = title.trim()
  return normalized || fallback
}
