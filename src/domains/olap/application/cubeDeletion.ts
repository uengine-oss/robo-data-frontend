import {
  deleteAllCubes,
  deleteAllETLConfigs,
  deleteCube,
  deleteDWTables,
  deleteETLConfig,
} from '../api/client.ts'
import { describeOlapError, type OlapMutationResult } from '../model/contracts.ts'
import { requireSuccessfulOperation } from './operationResults.ts'

export type CubeDeletionRequest =
  | { scope: 'single'; cubeName: string }
  | { scope: 'all'; deleteAllDwTables: boolean }

export interface CubeDeletionResult {
  request: CubeDeletionRequest
  cleanupErrors: string[]
}

export interface CubeDeletionDependencies {
  deleteCube: (cubeName: string) => Promise<OlapMutationResult>
  deleteAllCubes: () => Promise<OlapMutationResult>
  deleteETLConfig: (cubeName: string) => Promise<OlapMutationResult>
  deleteAllETLConfigs: () => Promise<OlapMutationResult>
  deleteDWTables: (tables: string[], schemaName: string) => Promise<OlapMutationResult>
}

const defaultDependencies: CubeDeletionDependencies = {
  deleteCube,
  deleteAllCubes,
  deleteETLConfig,
  deleteAllETLConfigs,
  deleteDWTables,
}

async function captureCleanup(
  label: string,
  operation: () => Promise<OlapMutationResult>,
  cleanupErrors: string[],
): Promise<void> {
  try {
    requireSuccessfulOperation(await operation(), label)
  } catch (cause: unknown) {
    cleanupErrors.push(`${label}: ${describeOlapError(cause)}`)
  }
}

export async function executeCubeDeletion(
  request: CubeDeletionRequest,
  dependencies: CubeDeletionDependencies = defaultDependencies,
): Promise<CubeDeletionResult> {
  const cleanupErrors: string[] = []

  if (request.scope === 'single') {
    requireSuccessfulOperation(
      await dependencies.deleteCube(request.cubeName),
      `'${request.cubeName}' 큐브 삭제`,
    )
    await captureCleanup(
      'ETL 설정 정리',
      () => dependencies.deleteETLConfig(request.cubeName),
      cleanupErrors,
    )
    return { request, cleanupErrors }
  }

  requireSuccessfulOperation(await dependencies.deleteAllCubes(), '모든 큐브 삭제')
  await captureCleanup('모든 ETL 설정 정리', dependencies.deleteAllETLConfigs, cleanupErrors)
  if (request.deleteAllDwTables) {
    await captureCleanup(
      'DW 전체 테이블 정리',
      () => dependencies.deleteDWTables([], 'dw'),
      cleanupErrors,
    )
  }
  return { request, cleanupErrors }
}
