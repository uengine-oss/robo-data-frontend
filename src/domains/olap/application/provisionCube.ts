import {
  createDWSchema,
  createETLConfig,
  deployETLPipeline,
  provisionCube,
  runETLPipeline,
  uploadSchemaText,
} from '../api/client.ts'
import {
  describeOlapError,
  type AirflowRunResult,
  type CreateEtlConfigResult,
  type EtlConfig,
  type OlapAiSuggestion,
  type OlapCubeCollection,
  type OlapDesignerDimension,
  type OlapDesignerMeasure,
  type OlapMutationResult,
  type ProvisionResult,
} from '../model/contracts.ts'
import { requireSuccessfulOperation } from './operationResults.ts'

export type ProvisionStep =
  | 'dw-schema'
  | 'dw-tables'
  | 'cube-schema'
  | 'etl-config'
  | 'airflow-deploy'
  | 'initial-run'

export type ProvisionStepStatus = 'running' | 'completed' | 'failed'

export interface CubeProvisionInput {
  identity: string
  cubeName: string
  aiSuggestion: OlapAiSuggestion | null
  dimensions: OlapDesignerDimension[]
  measures: OlapDesignerMeasure[]
  factTable: string
  dwSchema: string
  schemaXml: string
  etlConfig: EtlConfig
}

export interface CubeProvisionCheckpoint {
  identity: string
  completed: ProvisionStep[]
  airflowResult: AirflowRunResult | null
}

export interface CubeProvisionResult {
  checkpoint: CubeProvisionCheckpoint
  airflowResult: AirflowRunResult
  warning: string | null
}

export interface CubeProvisionDependencies {
  createDWSchema: () => Promise<OlapMutationResult>
  provisionCube: (
    cubeName: string,
    aiSuggestion: OlapAiSuggestion | null,
    dimensions: OlapDesignerDimension[],
    measures: OlapDesignerMeasure[],
    factTable: string,
    dwSchema: string,
  ) => Promise<ProvisionResult>
  uploadSchemaText: (xml: string) => Promise<OlapCubeCollection>
  createETLConfig: (config: EtlConfig) => Promise<CreateEtlConfigResult>
  deployETLPipeline: (cubeName: string) => Promise<AirflowRunResult>
  runETLPipeline: (cubeName: string) => Promise<AirflowRunResult>
}

const defaultDependencies: CubeProvisionDependencies = {
  createDWSchema,
  provisionCube,
  uploadSchemaText,
  createETLConfig,
  deployETLPipeline: cubeName => deployETLPipeline(cubeName),
  runETLPipeline,
}

export class CubeProvisionError extends Error {
  constructor(
    public readonly step: ProvisionStep,
    public readonly checkpoint: CubeProvisionCheckpoint,
    cause: unknown,
  ) {
    super(describeOlapError(cause))
    this.name = 'CubeProvisionError'
  }
}

function checkpointFor(
  identity: string,
  checkpoint?: CubeProvisionCheckpoint | null,
): CubeProvisionCheckpoint {
  if (checkpoint?.identity === identity) {
    return {
      identity,
      completed: [...checkpoint.completed],
      airflowResult: checkpoint.airflowResult,
    }
  }
  return { identity, completed: [], airflowResult: null }
}

async function runStep(
  step: ProvisionStep,
  checkpoint: CubeProvisionCheckpoint,
  operation: () => Promise<void>,
  onStep?: (step: ProvisionStep, status: ProvisionStepStatus, message?: string) => void,
): Promise<void> {
  if (checkpoint.completed.includes(step)) return
  onStep?.(step, 'running')
  try {
    await operation()
    checkpoint.completed.push(step)
    onStep?.(step, 'completed')
  } catch (cause: unknown) {
    onStep?.(step, 'failed', describeOlapError(cause))
    throw new CubeProvisionError(step, checkpoint, cause)
  }
}

export async function executeCubeProvision(
  input: CubeProvisionInput,
  previousCheckpoint?: CubeProvisionCheckpoint | null,
  dependencies: CubeProvisionDependencies = defaultDependencies,
  onStep?: (step: ProvisionStep, status: ProvisionStepStatus, message?: string) => void,
): Promise<CubeProvisionResult> {
  const checkpoint = checkpointFor(input.identity, previousCheckpoint)

  await runStep('dw-schema', checkpoint, async () => {
    requireSuccessfulOperation(await dependencies.createDWSchema(), 'DW schema 생성')
  }, onStep)

  await runStep('dw-tables', checkpoint, async () => {
    const result = await dependencies.provisionCube(
      input.cubeName,
      input.aiSuggestion,
      input.dimensions,
      input.measures,
      input.factTable,
      input.dwSchema,
    )
    if (!result.success) {
      throw new Error(result.errors.join('; ') || 'OLAP 테이블 프로비저닝에 실패했습니다.')
    }
  }, onStep)

  await runStep('cube-schema', checkpoint, async () => {
    await dependencies.uploadSchemaText(input.schemaXml)
  }, onStep)

  await runStep('etl-config', checkpoint, async () => {
    requireSuccessfulOperation(
      await dependencies.createETLConfig(input.etlConfig),
      'ETL 설정 저장',
    )
  }, onStep)

  await runStep('airflow-deploy', checkpoint, async () => {
    checkpoint.airflowResult = requireSuccessfulOperation(
      await dependencies.deployETLPipeline(input.cubeName),
      'Airflow DAG 배포',
    )
  }, onStep)

  if (!checkpoint.airflowResult) {
    throw new CubeProvisionError(
      'airflow-deploy',
      checkpoint,
      new Error('완료된 Airflow 배포 결과가 없습니다.'),
    )
  }

  let warning: string | null = null
  if (!checkpoint.completed.includes('initial-run')) {
    onStep?.('initial-run', 'running')
    try {
      requireSuccessfulOperation(
        await dependencies.runETLPipeline(input.cubeName),
        '최초 ETL 실행',
      )
      checkpoint.completed.push('initial-run')
      onStep?.('initial-run', 'completed')
    } catch (cause: unknown) {
      warning = `DAG는 배포됐지만 최초 ETL 실행에 실패했습니다. ${describeOlapError(cause)}`
      onStep?.('initial-run', 'failed', describeOlapError(cause))
    }
  }

  return {
    checkpoint,
    airflowResult: checkpoint.airflowResult,
    warning,
  }
}
