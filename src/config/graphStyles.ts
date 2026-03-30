/**
 * graphStyles.ts
 * Neo4j Graph 스타일 설정
 * 
 * 노드 및 관계의 색상, 크기 등 시각적 스타일 정의
 * 
 * NOTE: 추후 노드/관계 스타일을 사용자가 커스터마이징할 수 있는
 * UI를 제공할 예정이며, 해당 설정은 로컬 스토리지에 캐싱됩니다.
 */

// ============================================================================
// 노드 색상 설정
// ============================================================================

/**
 * 노드 타입별 색상
 * 
 * 색상 분류:
 * - SQL 액션 (노란색/금색 계열): SELECT, INSERT, UPDATE, DELETE, MERGE
 * - 제어문/스테이트먼트 (하늘색 계열): IF, TRY, LOOP, CALL 등
 * - 테이블/컬럼 (핑크색 계열): Table, Column
 * - 프로시저/함수 (보라색 계열): PROCEDURE, FUNCTION
 */
export const NODE_COLORS: Record<string, string> = {
  // 시스템/파일 구조
  SYSTEM: '#4A82CA',
  FILE: '#50B5D3',
  
  // ========================================
  // SQL 액션 스테이트먼트 (노란색/금색 계열)
  // ========================================
  SELECT: '#F5B041',      // 밝은 금색
  INSERT: '#F4D03F',      // 노란색
  UPDATE: '#F39C12',      // 진한 금색
  DELETE: '#E67E22',      // 오렌지-금색
  MERGE: '#F5B041',       // 밝은 금색
  
  // ========================================
  // 프로시저/함수 (밝은 녹색 계열)
  // ========================================
  PROCEDURE: '#4ADE80',   // 밝은 녹색
  FUNCTION: '#22C55E',    // 녹색
  
  // ========================================
  // 제어문/스테이트먼트 (하늘색 계열)
  // ========================================
  // 조건문
  IF: '#5DADE2',          // 하늘색
  ELSE: '#5DADE2',
  ELSIF: '#5DADE2',
  ELSEIF: '#5DADE2',
  CASE: '#5DADE2',
  WHEN: '#5DADE2',
  
  // 반복문
  WHILE: '#85C1E9',       // 밝은 하늘색
  LOOP: '#85C1E9',
  FOR: '#85C1E9',
  EXIT: '#85C1E9',
  CONTINUE: '#85C1E9',
  
  // 예외 처리
  TRY: '#7FB3D5',         // 연한 하늘색
  EXCEPTION: '#7FB3D5',
  RAISE: '#7FB3D5',
  
  // 트랜잭션/호출
  COMMIT: '#AED6F1',      // 매우 연한 하늘색
  CALL: '#AED6F1',
  EXECUTE: '#AED6F1',
  
  // 변수/선언
  DECLARE: '#85C1E9',
  ASSIGNMENT: '#85C1E9',
  Variable: '#98A0A8',
  
  // 커서 관련
  CURSOR: '#7FB3D5',
  CURSOR_VARIABLE: '#7FB3D5',
  OPEN_CURSOR: '#7FB3D5',
  CLOSE_CURSOR: '#7FB3D5',
  FETCH: '#7FB3D5',
  OPEN: '#7FB3D5',
  CLOSE: '#7FB3D5',
  
  // 기타 스테이트먼트
  UNION_ALL: '#85C1E9',
  RETURN: '#5DADE2',
  SPEC: '#AED6F1',
  BEGIN: '#85C1E9',
  NOTICE: '#AED6F1',
  
  // ========================================
  // 테이블/컬럼 (핑크색 계열 - 기존 유지)
  // ========================================
  Table: '#E35A5C',
  Column: '#F088A2',
  CREATE_TEMP_TABLE: '#E88400',
  Schema: '#D35A5A',      // 스키마도 핑크 계열
  
  // ========================================
  // 멀티라벨 아키텍처 - Primary 라벨 (역할)
  // ========================================
  MODULE: '#3B82F6',       // 블루 (클래스와 동일)
  VARIABLE: '#98A0A8',     // 회색
  CONSTANT: '#F59E0B',     // 앰버/노란색

  // ========================================
  // 클래스/인터페이스 (Java/Python/C) — Sub 라벨
  // ========================================
  CLASS: '#3B82F6',
  Class: '#3B82F6',
  INTERFACE: '#8B5CF6',
  Interface: '#8B5CF6',
  METHOD: '#10B981',
  Method: '#10B981',
  STRUCT: '#4B8BBE',       // 구조체 (청회색)
  UNION: '#6B7280',        // 유니온 (중회색)
  MEMBER: '#98A0A8',       // 멤버 변수 (회색)
  GLOBAL_VARIABLE: '#78716C', // 전역 변수 (갈회색)
  DEFINE: '#F59E0B',       // 매크로 상수 (앰버)
  CONSTRUCTOR: '#059669',  // 생성자 (진녹색)
  ENUM: '#A855F7',         // 열거형 (퍼플)
  Enum: '#A855F7',
  
  // ========================================
  // 스테레오타입 라벨 (아키텍처 역할)
  // ========================================
  Service: '#6366F1',        // 인디고
  Controller: '#EC4899',     // 핑크
  Repository: '#14B8A6',     // 틸
  Entity: '#F97316',         // 오렌지
  DTO: '#8B5CF6',            // 바이올렛
  Config: '#64748B',         // 슬레이트
  Component: '#0EA5E9',      // 스카이
  Util: '#78716C',           // 스톤
  ExceptionHandler: '#EF4444', // 레드
  Gateway: '#7C3AED',        // 퍼플
  Facade: '#2563EB',         // 블루
  Factory: '#D97706',        // 앰버
  Scheduler: '#059669',      // 에메랄드
  Client: '#0891B2',         // 시안
  Validator: '#DC2626',      // 레드
  Mapper: '#9333EA',         // 퍼플
  Filter: '#CA8A04',         // 옐로
  Listener: '#16A34A',       // 그린
  Aspect: '#7C2D12',         // 브라운
  DataStructure: '#57534E',  // 스톤

  // CQRS 라벨
  COMMAND: '#EF4444',        // 레드
  READMODEL: '#3B82F6',      // 블루

  // Method 스테레오타입
  Endpoint: '#EC4899',       // 핑크
  Query: '#3B82F6',          // 블루
  Command: '#EF4444',        // 레드
  BusinessLogic: '#6366F1',  // 인디고
  Init: '#64748B',           // 슬레이트
  Validation: '#F59E0B',     // 앰버
  Lifecycle: '#78716C',      // 스톤
  Scheduled: '#059669',      // 에메랄드
  Transactional: '#7C3AED',  // 퍼플

  // GWT
  GWT: '#10B981',            // 에메랄드

  // 기타
  DBLink: '#7D4A15',
  JOIN: '#85C1E9',
  
  // ========================================
  // 트리거 (주황색 계열)
  // ========================================
  TRIGGER: '#FB923C',
  TRIGGER_BLOCK: '#FDBA74',
  
  // ========================================
  // 프로젝트/사용자 스토리 (청록색 계열)
  // ========================================
  Project: '#06B6D4',
  UserStory: '#22D3EE',
  AcceptanceCriteria: '#67E8F9',
  
  // 기본값
  DEFAULT: '#5AA0E0'
}

// ============================================================================
// 관계 색상 설정
// ============================================================================

/**
 * 관계 타입별 색상
 */
export const RELATIONSHIP_COLORS: Record<string, string> = {
  CONTAINS: '#9CA3AB',
  PARENT_OF: '#9CA3AB',
  NEXT: '#9CA3AB',
  CALL: '#9CA3AB',
  FROM: '#9CA3AB',
  WRITES: '#9CA3AB',
  HAS_COLUMN: '#9CA3AB',
  DB_LINK: '#9CA3AB',
  FK_TO_TABLE: '#9CA3AB',
  FK_TO: '#9CA3AB',
  SCOPE: '#9CA3AB',
  EXTENDS: '#9CA3AB',
  IMPLEMENTS: '#9CA3AB',
  BELONGS_TO: '#9CA3AB',
  DECLARES: '#9CA3AB',
  HAS_AC: '#9CA3AB',
  HAS_USER_STORY: '#9CA3AB',
  DEFAULT: '#9CA3AB'
}

// ============================================================================
// 노드 크기 설정
// ============================================================================

/**
 * 노드 타입별 크기
 */
export const NODE_SIZES: Record<string, number> = {
  SYSTEM: 45,
  FILE: 35,
  PROCEDURE: 40,
  FUNCTION: 40,
  MODULE: 40,
  Table: 38,
  CLASS: 40,
  Class: 40,
  INTERFACE: 38,
  Interface: 38,
  STRUCT: 38,
  ENUM: 35,
  Enum: 35,
  DEFAULT: 30
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

import { getNodeStyle } from '@/utils/nodeStyleStorage'

/**
 * 노드 라벨에 따른 색상 반환
 * 사용자 설정 > Table 우선 > 라벨 매칭 > 기본값 순서로 반환
 */
// Primary 라벨 (일반적) — 우선순위가 낮은 라벨
const PRIMARY_LABELS = new Set(['MODULE', 'FUNCTION', 'VARIABLE', 'CONSTANT', 'FIELD'])

export function getNodeColor(labels: string[]): string {
  // 1. 사용자 커스텀 설정 확인 (가장 구체적인 라벨부터)
  try {
    // 서브라벨(구체적) 먼저, 프라이머리라벨(일반적) 나중에
    const sorted = [...labels].sort((a, b) => {
      const aIsPrimary = PRIMARY_LABELS.has(a.toUpperCase()) ? 1 : 0
      const bIsPrimary = PRIMARY_LABELS.has(b.toUpperCase()) ? 1 : 0
      return aIsPrimary - bIsPrimary
    })
    for (const label of sorted) {
      const style = getNodeStyle(label)
      if (style?.color) return style.color
      const upperStyle = getNodeStyle(label.toUpperCase())
      if (upperStyle?.color) return upperStyle.color
    }
  } catch (e) {
    // nodeStyleStorage가 없으면 기본 로직 사용
  }

  // 2. Table 우선 처리
  if (labels.includes('Table')) {
    return NODE_COLORS.Table
  }

  // 3. 서브라벨(구체적) 우선 매칭
  // 예: ['MODULE', 'CLASS', 'Service'] → Service > CLASS > MODULE 순
  for (const label of labels) {
    if (PRIMARY_LABELS.has(label.toUpperCase())) continue
    if (NODE_COLORS[label]) return NODE_COLORS[label]
    if (NODE_COLORS[label.toUpperCase()]) return NODE_COLORS[label.toUpperCase()]
  }

  // 4. 프라이머리 라벨 매칭
  for (const label of labels) {
    if (NODE_COLORS[label]) return NODE_COLORS[label]
    if (NODE_COLORS[label.toUpperCase()]) return NODE_COLORS[label.toUpperCase()]
  }

  return NODE_COLORS.DEFAULT
}

/**
 * 관계 타입에 따른 색상 반환
 */
export function getRelationshipColor(type: string): string {
  return RELATIONSHIP_COLORS[type] || RELATIONSHIP_COLORS.DEFAULT
}

/**
 * 노드 라벨에 따른 크기 반환
 * 사용자 설정 > 라벨 매칭 > 기본값 순서로 반환
 */
export function getNodeSize(labels: string[]): number {
  // 1. 사용자 커스텀 설정 확인 (서브라벨 우선)
  try {
    const sorted = [...labels].sort((a, b) => {
      const aIsPrimary = PRIMARY_LABELS.has(a.toUpperCase()) ? 1 : 0
      const bIsPrimary = PRIMARY_LABELS.has(b.toUpperCase()) ? 1 : 0
      return aIsPrimary - bIsPrimary
    })
    for (const label of sorted) {
      const style = getNodeStyle(label)
      if (style?.size) return style.size
      const upperStyle = getNodeStyle(label.toUpperCase())
      if (upperStyle?.size) return upperStyle.size
    }
  } catch (e) {
    // nodeStyleStorage가 없으면 기본 로직 사용
  }

  // 2. 서브라벨 우선 매칭
  for (const label of labels) {
    if (PRIMARY_LABELS.has(label.toUpperCase())) continue
    if (NODE_SIZES[label]) return NODE_SIZES[label]
    if (NODE_SIZES[label.toUpperCase()]) return NODE_SIZES[label.toUpperCase()]
  }

  // 3. 프라이머리 라벨 매칭
  for (const label of labels) {
    if (NODE_SIZES[label]) return NODE_SIZES[label]
    if (NODE_SIZES[label.toUpperCase()]) return NODE_SIZES[label.toUpperCase()]
  }

  return NODE_SIZES.DEFAULT
}
