import {
  createETLConfig,
  deployETLPipeline,
  getETLConfig,
  uploadSchemaText,
} from '../api/client'
import type {
  AirflowRunResult,
  EtlConfig,
  OlapCubeCollection,
} from '../model/contracts'
import { requireSuccessfulOperation } from './operationResults'

export function loadCubeEtlConfig(cubeName: string): Promise<EtlConfig> {
  return getETLConfig(cubeName)
}

export function saveCubeSchema(xml: string): Promise<OlapCubeCollection> {
  return uploadSchemaText(xml)
}

export async function saveCubeEtlConfig(config: EtlConfig) {
  return requireSuccessfulOperation(
    await createETLConfig(config),
    'ETL 설정 저장',
  )
}

export async function redeployCubeDag(cubeName: string): Promise<AirflowRunResult> {
  return requireSuccessfulOperation(
    await deployETLPipeline(cubeName, true),
    'Airflow DAG 재배포',
  )
}
