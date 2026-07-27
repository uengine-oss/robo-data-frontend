import {
  parseAgentAnalysisResult,
  parseCausalDiscoveryResult,
  parseComparisonResult,
  parseDataDiscoveryResult,
  parseLiteracyExplanation,
  parseValidationResult,
} from '../api/contracts'
import type {
  SavedWhatIfSession,
  WhatIfSessionData,
  WhatIfSessionSnapshot,
} from '../model/session'

export const WHATIF_SESSION_STORAGE_KEY = 'whatif_sessions'
export const WHATIF_CURRENT_SESSION_STORAGE_KEY = 'whatif_current_session'
export const MAX_SAVED_WHATIF_SESSIONS = 10

export interface SessionStoragePort {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface SessionRepositoryResult<T> {
  value: T
  warning?: string
}

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field}은(는) 문자열이어야 합니다.`)
  return value
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${field}은(는) 문자열 배열이어야 합니다.`)
  }
  return [...value]
}

function parseOptional<T>(
  value: unknown,
  parser: (candidate: unknown) => T,
  field: string,
  warnings: string[],
): T | undefined {
  if (value === undefined) return undefined
  try {
    return parser(value)
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    warnings.push(`${field}: ${detail}`)
    return undefined
  }
}

function parseSessionData(
  value: unknown,
  sessionId: string,
  warnings: string[],
): WhatIfSessionData {
  if (!isObject(value)) {
    warnings.push(`${sessionId}.data: 객체가 아니어서 빈 세션 데이터로 복원했습니다.`)
    return {}
  }

  return {
    agentResult: parseOptional(
      value.agentResult,
      parseAgentAnalysisResult,
      `${sessionId}.agentResult`,
      warnings,
    ),
    discoveryResult: parseOptional(
      value.discoveryResult,
      parseDataDiscoveryResult,
      `${sessionId}.discoveryResult`,
      warnings,
    ),
    selectedTables: parseOptional(
      value.selectedTables,
      candidate => optionalStringArray(candidate, 'selectedTables') ?? [],
      `${sessionId}.selectedTables`,
      warnings,
    ),
    customSql: parseOptional(
      value.customSql,
      candidate => requiredString(candidate, 'customSql'),
      `${sessionId}.customSql`,
      warnings,
    ),
    causalResult: parseOptional(
      value.causalResult,
      parseCausalDiscoveryResult,
      `${sessionId}.causalResult`,
      warnings,
    ),
    validationResult: parseOptional(
      value.validationResult,
      parseValidationResult,
      `${sessionId}.validationResult`,
      warnings,
    ),
    comparisonResult: parseOptional(
      value.comparisonResult,
      parseComparisonResult,
      `${sessionId}.comparisonResult`,
      warnings,
    ),
    literacyExplanation: parseOptional(
      value.literacyExplanation,
      parseLiteracyExplanation,
      `${sessionId}.literacyExplanation`,
      warnings,
    ),
  }
}

function parseSavedSession(
  value: unknown,
  index: number,
  warnings: string[],
): SavedWhatIfSession | null {
  if (!isObject(value)) {
    warnings.push(`sessions[${index}]: 객체가 아니어서 제외했습니다.`)
    return null
  }

  try {
    const id = requiredString(value.id, `sessions[${index}].id`)
    const currentStep = value.currentStep
    if (!Number.isInteger(currentStep) || (currentStep as number) < 0 || (currentStep as number) > 4) {
      throw new Error(`sessions[${index}].currentStep은(는) 0~4 정수여야 합니다.`)
    }
    return {
      id,
      scenario: requiredString(value.scenario, `sessions[${index}].scenario`),
      currentStep: currentStep as number,
      createdAt: requiredString(value.createdAt, `sessions[${index}].createdAt`),
      updatedAt: requiredString(value.updatedAt, `sessions[${index}].updatedAt`),
      data: parseSessionData(value.data, id, warnings),
    }
  } catch (cause) {
    warnings.push(cause instanceof Error ? cause.message : String(cause))
    return null
  }
}

export function loadSavedWhatIfSessions(
  storage: SessionStoragePort,
): SessionRepositoryResult<SavedWhatIfSession[]> {
  let stored: string | null
  try {
    stored = storage.getItem(WHATIF_SESSION_STORAGE_KEY)
  } catch (cause) {
    return {
      value: [],
      warning: `저장된 What-If 세션에 접근하지 못했습니다: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    }
  }
  if (!stored) return { value: [] }

  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) {
      return {
        value: [],
        warning: '저장된 What-If 세션 목록이 배열이 아니어서 복원하지 않았습니다.',
      }
    }
    const warnings: string[] = []
    const sessions = parsed
      .map((entry, index) => parseSavedSession(entry, index, warnings))
      .filter((session): session is SavedWhatIfSession => session !== null)
      .slice(0, MAX_SAVED_WHATIF_SESSIONS)
    return {
      value: sessions,
      warning: warnings.length > 0
        ? `일부 저장 세션을 완전히 복원하지 못했습니다: ${warnings.join(' | ')}`
        : undefined,
    }
  } catch {
    return {
      value: [],
      warning: '저장된 What-If 세션 JSON이 손상되어 복원하지 않았습니다.',
    }
  }
}

export function readCurrentWhatIfSessionId(
  storage: SessionStoragePort,
): SessionRepositoryResult<string | null> {
  try {
    return { value: storage.getItem(WHATIF_CURRENT_SESSION_STORAGE_KEY) }
  } catch (cause) {
    return {
      value: null,
      warning: `최근 What-If 세션을 읽지 못했습니다: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    }
  }
}

export function createSavedWhatIfSession(
  snapshot: WhatIfSessionSnapshot,
  previous: SavedWhatIfSession | undefined,
  now: string,
): SavedWhatIfSession {
  return {
    ...snapshot,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  }
}

export function upsertSavedWhatIfSession(
  sessions: SavedWhatIfSession[],
  session: SavedWhatIfSession,
): SavedWhatIfSession[] {
  return [
    session,
    ...sessions.filter(candidate => candidate.id !== session.id),
  ].slice(0, MAX_SAVED_WHATIF_SESSIONS)
}

export function persistWhatIfSessions(
  storage: SessionStoragePort,
  sessions: SavedWhatIfSession[],
  currentSessionId: string,
): string | undefined {
  try {
    storage.setItem(WHATIF_SESSION_STORAGE_KEY, JSON.stringify(sessions))
    storage.setItem(WHATIF_CURRENT_SESSION_STORAGE_KEY, currentSessionId)
    return undefined
  } catch (cause) {
    return `What-If 세션을 저장하지 못했습니다: ${
      cause instanceof Error ? cause.message : String(cause)
    }`
  }
}

export function persistSavedWhatIfSessionList(
  storage: SessionStoragePort,
  sessions: SavedWhatIfSession[],
): string | undefined {
  try {
    storage.setItem(WHATIF_SESSION_STORAGE_KEY, JSON.stringify(sessions))
    return undefined
  } catch (cause) {
    return `What-If 세션 목록을 저장하지 못했습니다: ${
      cause instanceof Error ? cause.message : String(cause)
    }`
  }
}

export function clearCurrentWhatIfSession(
  storage: SessionStoragePort,
): string | undefined {
  try {
    storage.removeItem(WHATIF_CURRENT_SESSION_STORAGE_KEY)
    return undefined
  } catch (cause) {
    return `최근 What-If 세션 표시를 지우지 못했습니다: ${
      cause instanceof Error ? cause.message : String(cause)
    }`
  }
}
