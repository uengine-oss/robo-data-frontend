/**
 * code-analysis api — antlr 파싱 + robo 분석. 공유 http 코어(shared/services/http) 사용.
 */
import type { BackendRequestMetadata, FileUploadResponse, ParseResponse, AnalyzeEvent } from '@/types'
import { getNormalizedUploadPath } from '@/utils/upload'
import {
  ANTLR_BASE_URL, ROBO_BASE_URL,
  postJson, postFormData, streamFetch, handleHttpError,
  type StreamCallback, type Headers,
} from '@/shared/services/http'

export const antlrApi = {
  /**
   * 파일 업로드
   */
  async uploadFiles(
    metadata: BackendRequestMetadata,
    files: File[],
    headers: Headers
  ): Promise<FileUploadResponse> {
    const formData = new FormData()
    formData.append('metadata', JSON.stringify(metadata))
    
    // 디버그: 업로드 파일 경로 로깅
    console.log('[API] uploadFiles - 업로드할 파일 목록:')
    for (const file of files) {
      // 서버가 폴더 구조를 그대로 저장/복원할 수 있도록 "파일명" 자리에 상대경로를 넣어 전송
      const path = getNormalizedUploadPath(file)
      console.log(`  - ${path} (webkitRelativePath: ${(file as any).webkitRelativePath}, name: ${file.name})`)
      formData.append('files', file, path)
    }
    
    const ddlFiles = files.filter(f => getNormalizedUploadPath(f).startsWith('ddl/'))
    console.log(`[API] DDL 파일 수: ${ddlFiles.length}개`)
    
    return postFormData<FileUploadResponse>(
      `${ANTLR_BASE_URL}/fileUpload`, 
      formData, 
      headers
    )
  },
  
  /**
   * ANTLR 파싱 (일반 JSON 응답)
   */
  async parse(
    metadata: BackendRequestMetadata,
    headers: Headers
  ): Promise<ParseResponse> {
    return postJson<ParseResponse>(
      `${ANTLR_BASE_URL}/parsing`, 
      metadata, 
      headers
    )
  },
  
  /**
   * ANTLR 파싱 (스트림 방식)
   * ANTLR 서버가 스트림을 지원할 때 사용
   */
  async parseStream(
    metadata: BackendRequestMetadata,
    headers: Headers,
    onEvent: (event: AnalyzeEvent) => void
  ): Promise<void> {
    await streamFetch(
      `${ANTLR_BASE_URL}/parsing`,
      metadata,
      headers,
      onEvent as unknown as StreamCallback
    )
  }
}

// ============================================================================
// ROBO Analyzer API
// ============================================================================

/** 파일 타입 감지 결과 항목 */
export interface FileTypeResult {
  fileName: string
  fileType: 'java' | 'oracle_sp' | 'oracle_ddl' | 'postgresql_sp' | 'postgresql_ddl' | 'python' | 'xml' | 'sql_generic' | 'unknown'
  confidence: number
  details: string
  suggestedStrategy: 'framework' | 'dbms'
  suggestedTarget: 'java' | 'oracle' | 'postgresql' | 'python'
}

/** 파일 타입 감지 응답 */
export interface DetectTypesResponse {
  files: FileTypeResult[]
  summary: {
    total: number
    byType: Record<string, number>
    suggestedStrategy: 'framework' | 'dbms'
    suggestedTarget: 'java' | 'oracle' | 'postgresql' | 'python'
  }
}

export const roboApi = {
  // [주석] /detect-types/ 엔드포인트 삭제 예정
  // /**
  //  * 파일 내용을 분석하여 소스 코드 타입 자동 감지
  //  */
  // async detectTypes(files: FileContentForDetection[]): Promise<DetectTypesResponse> {
  //   const response = await fetch(`${ROBO_BASE_URL}/detect-types/`, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ files })
  //   })
  //   if (!response.ok) await handleHttpError(response)
  //   return response.json()
  // },

  /**
   * 소스 파일 분석 → Neo4j 그래프 생성
   * 
   * Request Body:
   *   strategy: "framework" | "dbms" (기본: framework)
   *   target: "java" | "oracle" | ... (기본: java)
   * 
   * Response: NDJSON 스트림
   */
  async analyze(
    metadata: BackendRequestMetadata,
    headers: Headers,
    onEvent: (event: AnalyzeEvent) => void
  ): Promise<void> {
    await streamFetch(
      `${ROBO_BASE_URL}/analyze`,
      metadata,
      headers,
      onEvent as unknown as StreamCallback
    )
  },
  
  /**
   * Neo4j에 기존 데이터 존재 여부 확인
   * 
   * Response: JSON { hasData: boolean, nodeCount: number }
   */
  async checkData(headers: Headers): Promise<{ hasData: boolean; nodeCount: number }> {
    const response = await fetch(`${ROBO_BASE_URL}/check-data/`, {
      method: 'GET',
      headers
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },
  
  /**
   * Neo4j에서 기존 그래프 데이터 조회
   * 
   * Response: JSON { Nodes: [...], Relationships: [...] }
   */
  async getGraphData(headers: Headers): Promise<{ 
    Nodes: Array<{ 'Node ID': string; Labels: string[]; Properties: Record<string, unknown> }>;
    Relationships: Array<{ 'Relationship ID': string; 'Start Node ID': string; 'End Node ID': string; Type: string; Properties: Record<string, unknown> }>;
  }> {
    const response = await fetch(`${ROBO_BASE_URL}/graph/`, {
      method: 'GET',
      headers
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },
  
  /**
   * 사용자 데이터 전체 삭제 (임시 파일 + Neo4j 그래프)
   * 
   * Response: JSON
   */
  async delete(headers: Headers): Promise<{ message: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/delete/`, {
      method: 'DELETE',
      headers
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  // ========== 파이프라인 제어 API ==========
  // 진행 상태는 분석 NDJSON 스트림의 phase_event 단일 채널 — 별도 폴링 엔드포인트(/pipeline/*) 없음.

  /**
   * 파이프라인 제어 (일시정지/재개/중단)
   */
  async controlPipeline(
    action: 'pause' | 'resume' | 'stop',
    headers: Headers
  ): Promise<PipelineControlResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/analyze/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ action })
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  }
}

// 파이프라인 타입 정의
export interface PipelinePhaseInfo {
  phase: string
  name: string
  description: string
  order: number
  canPause: boolean
}

export interface PipelineStatus {
  currentPhase: string
  phaseName: string
  phaseOrder: number
  isPaused: boolean
  isStopped: boolean
  phaseProgress: number
  phaseMessage: string
  phases: PipelinePhaseInfo[]
}

export interface PipelineControlResponse {
  success: boolean
  action: string
  status: PipelineStatus
}
