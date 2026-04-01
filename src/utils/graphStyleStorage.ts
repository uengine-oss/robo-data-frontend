/**
 * graphStyleStorage.ts
 * 그래프 요소(노드/관계) 스타일 설정 저장 및 관리 유틸리티
 *
 * localStorage를 사용하여 타입별 색상 및 크기/두께 설정을 저장하고 불러옵니다.
 * 노드와 관계 모두 동일한 인터페이스를 사용합니다.
 */

// ============================================================================
// 타입 정의
// ============================================================================

export interface StyleConfig {
  color?: string
  /** 노드: 크기(size), 관계: 두께(width) */
  size?: number
}

export type StyleMap = Record<string, StyleConfig>

/** 스타일 카테고리 */
export type StyleCategory = 'node' | 'relationship'

// ============================================================================
// 스토리지 키 매핑
// ============================================================================

const STORAGE_KEYS: Record<StyleCategory, string> = {
  node: 'robo-analyzer-node-styles',
  relationship: 'robo-analyzer-relationship-styles'
}

// ============================================================================
// 공통 CRUD 함수
// ============================================================================

/**
 * localStorage에서 스타일 설정 로드
 */
export function loadStyles(category: StyleCategory): StyleMap {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS[category])
    if (!stored) return {}
    return JSON.parse(stored) as StyleMap
  } catch (e) {
    console.warn(`${category} 스타일 설정 로드 실패:`, e)
    return {}
  }
}

/**
 * localStorage에 스타일 설정 저장
 */
export function saveStyles(category: StyleCategory, styles: StyleMap): void {
  try {
    localStorage.setItem(STORAGE_KEYS[category], JSON.stringify(styles))
  } catch (e) {
    console.warn(`${category} 스타일 설정 저장 실패:`, e)
  }
}

/**
 * 특정 타입의 스타일 설정 가져오기
 */
export function getStyle(category: StyleCategory, type: string): StyleConfig | null {
  const styles = loadStyles(category)
  return styles[type] || null
}

/**
 * 특정 타입의 색상 설정
 */
export function setColor(category: StyleCategory, type: string, color: string): void {
  const styles = loadStyles(category)
  if (!styles[type]) styles[type] = {}
  styles[type].color = color
  saveStyles(category, styles)
}

/**
 * 특정 타입의 크기/두께 설정
 */
export function setSize(category: StyleCategory, type: string, size: number): void {
  const styles = loadStyles(category)
  if (!styles[type]) styles[type] = {}
  styles[type].size = size
  saveStyles(category, styles)
}

/**
 * 특정 타입의 스타일 설정 제거
 */
export function removeStyle(category: StyleCategory, type: string): void {
  const styles = loadStyles(category)
  delete styles[type]
  saveStyles(category, styles)
}

/**
 * 모든 스타일 설정 초기화
 */
export function clearStyles(category: StyleCategory): void {
  try {
    localStorage.removeItem(STORAGE_KEYS[category])
  } catch (e) {
    console.warn(`${category} 스타일 설정 초기화 실패:`, e)
  }
}

// ============================================================================
// 하위호환 래퍼 (기존 nodeStyleStorage API와 동일한 시그니처)
// ============================================================================

export const getNodeStyle = (type: string) => getStyle('node', type)
export const setNodeColor = (type: string, color: string) => setColor('node', type, color)
export const setNodeSize = (type: string, size: number) => setSize('node', type, size)

export const getRelationshipStyle = (type: string) => getStyle('relationship', type)
export const setRelationshipColor = (type: string, color: string) => setColor('relationship', type, color)
export const setRelationshipSize = (type: string, size: number) => setSize('relationship', type, size)
