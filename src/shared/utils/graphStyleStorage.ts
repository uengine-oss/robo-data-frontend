/**
 * graphStyleStorage.ts
 * 그래프 요소(노드/관계) 사용자 명시 스타일 영속화 — localStorage 기반.
 *
 * Vue 반응성 노출:
 *   `storageVersion` ref 가 모든 mutation 직후 1 증가한다. consumer 의 computed
 *   는 이 ref 를 dependency 로 읽어 storage 변경을 감지한다.
 */

import { ref } from 'vue'
import { logger } from '@/shared/utils/logger'
import { STORAGE_KEYS } from '@/shared/config/storageKeys'

// ============================================================================
// 타입
// ============================================================================

export interface StyleConfig {
  color?: string
  /** 노드: 크기(size), 관계: 두께(width) */
  size?: number
}

export type StyleMap = Record<string, StyleConfig>

export type StyleCategory = 'node' | 'relationship'

// ============================================================================
// 스토리지 키
// ============================================================================

const CATEGORY_STORAGE_KEY: Record<StyleCategory, string> = {
  node: STORAGE_KEYS.NODE_STYLES,
  relationship: STORAGE_KEYS.RELATIONSHIP_STYLES,
}

// ============================================================================
// 반응성 트리거 — storage 가 변할 때마다 +1
// ============================================================================

export const storageVersion = ref(0)

function bumpVersion(): void {
  storageVersion.value++
}

// ============================================================================
// 사용자 명시 스타일 (color + size) CRUD
// ============================================================================

export function loadStyles(category: StyleCategory): StyleMap {
  try {
    const raw = localStorage.getItem(CATEGORY_STORAGE_KEY[category])
    return raw ? (JSON.parse(raw) as StyleMap) : {}
  } catch (e) {
    logger.warn(`[graphStyleStorage] load ${category} 실패:`, e)
    return {}
  }
}

export function saveStyles(category: StyleCategory, styles: StyleMap): void {
  try {
    localStorage.setItem(CATEGORY_STORAGE_KEY[category], JSON.stringify(styles))
    bumpVersion()
  } catch (e) {
    logger.warn(`[graphStyleStorage] save ${category} 실패:`, e)
  }
}

export function getStyle(category: StyleCategory, type: string): StyleConfig | null {
  return loadStyles(category)[type] ?? null
}

export function setColor(category: StyleCategory, type: string, color: string): void {
  const styles = loadStyles(category)
  styles[type] = { ...styles[type], color }
  saveStyles(category, styles)
}

export function setSize(category: StyleCategory, type: string, size: number): void {
  const styles = loadStyles(category)
  styles[type] = { ...styles[type], size }
  saveStyles(category, styles)
}

export function removeStyle(category: StyleCategory, type: string): void {
  const styles = loadStyles(category)
  if (!(type in styles)) return
  delete styles[type]
  saveStyles(category, styles)
}

export function clearStyles(category: StyleCategory): void {
  try {
    localStorage.removeItem(CATEGORY_STORAGE_KEY[category])
    bumpVersion()
  } catch (e) {
    logger.warn(`[graphStyleStorage] clear ${category} 실패:`, e)
  }
}

/** graphStyles.ts 가 색 결정에 사용 */
export const getNodeStyle = (type: string) => getStyle('node', type)
export const getRelationshipStyle = (type: string) => getStyle('relationship', type)
