import {
  createETLConfig,
  deployETLPipeline,
  getETLCatalog,
  suggestETLStrategy,
} from '../api/client'
import type {
  AirflowRunResult,
  EtlConfig,
  OlapAiSuggestion,
  OlapCatalogResponse,
} from '../model/contracts'
import { requireSuccessfulOperation } from './operationResults'

export function loadCubeDesignCatalog(): Promise<OlapCatalogResponse> {
  return getETLCatalog()
}

export async function requestCubeDesignSuggestion(description: string): Promise<OlapAiSuggestion> {
  const response = await suggestETLStrategy(description)
  if (response.error) throw new Error(response.error)
  if (!response.suggestion) {
    throw new Error('OLAP 서비스가 추천 결과를 반환하지 않았습니다.')
  }
  if (response.suggestion.error) throw new Error(response.suggestion.error)
  return response.suggestion
}

export async function deployCubeDesign(
  cubeName: string,
  config: EtlConfig,
  replace = false,
): Promise<AirflowRunResult> {
  requireSuccessfulOperation(await createETLConfig(config), 'ETL 설정 저장')
  return requireSuccessfulOperation(
    await deployETLPipeline(cubeName, replace),
    replace ? 'Airflow DAG 재배포' : 'Airflow DAG 배포',
  )
}
