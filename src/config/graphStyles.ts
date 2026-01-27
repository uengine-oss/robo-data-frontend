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
  // 클래스/인터페이스 (Java/Python)
  // ========================================
  CLASS: '#3B82F6',
  Class: '#3B82F6',
  INTERFACE: '#8B5CF6',
  Interface: '#8B5CF6',
  METHOD: '#10B981',
  Method: '#10B981',
  
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
  Table: 38,
  CLASS: 40,
  Class: 40,
  INTERFACE: 38,
  Interface: 38,
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
export function getNodeColor(labels: string[]): string {
  // 사용자 설정 확인
  try {
    // 각 라벨에 대해 사용자 설정 확인
    for (const label of labels) {
      const style = getNodeStyle(label)
      if (style?.color) {
        return style.color
      }
      
      const upperLabel = label.toUpperCase()
      const upperStyle = getNodeStyle(upperLabel)
      if (upperStyle?.color) {
        return upperStyle.color
      }
    }
  } catch (e) {
    // nodeStyleStorage가 없으면 기본 로직 사용
  }
  
  // Table 우선 처리
  if (labels.includes('Table')) {
    return NODE_COLORS.Table
  }
  
  // 라벨 순회하며 색상 찾기
  for (const label of labels) {
    if (NODE_COLORS[label]) {
      return NODE_COLORS[label]
    }
    
    const upperLabel = label.toUpperCase()
    if (NODE_COLORS[upperLabel]) {
      return NODE_COLORS[upperLabel]
    }
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
  // 사용자 설정 확인
  try {
    // 각 라벨에 대해 사용자 설정 확인
    for (const label of labels) {
      const style = getNodeStyle(label)
      if (style?.size) {
        return style.size
      }
      
      const upperLabel = label.toUpperCase()
      const upperStyle = getNodeStyle(upperLabel)
      if (upperStyle?.size) {
        return upperStyle.size
      }
    }
  } catch (e) {
    // nodeStyleStorage가 없으면 기본 로직 사용
  }
  
  // 라벨 순회하며 크기 찾기
  for (const label of labels) {
    if (NODE_SIZES[label]) {
      return NODE_SIZES[label]
    }
    
    const upperLabel = label.toUpperCase()
    if (NODE_SIZES[upperLabel]) {
      return NODE_SIZES[upperLabel]
    }
  }
  
  return NODE_SIZES.DEFAULT
}
