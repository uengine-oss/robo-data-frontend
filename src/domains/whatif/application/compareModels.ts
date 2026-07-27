import type {
  CausalEdge,
  ComparisonResult,
  TTMComparisonResult,
} from '../model/contracts'

export interface ModelComparisonRequest {
  sessionId: string
  causalEdges: CausalEdge[]
  discoveredTables: string[]
}

export interface ModelComparisonDependencies {
  compareWithTTM: (
    sessionId: string,
    causalEdges: CausalEdge[],
    discoveredTables: string[],
    includeTTM: boolean,
  ) => Promise<TTMComparisonResult>
  compareWithMindsdb: (
    sessionId: string,
    causalEdges: CausalEdge[],
    discoveredTables: string[],
  ) => Promise<ComparisonResult>
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export function normalizeTTMComparison(result: TTMComparisonResult): ComparisonResult {
  return {
    comparison_source: 'ttm',
    comparisons: result.comparisons.map(comparison => {
      const ontologyR2 = comparison.ontology?.r2 ?? 0
      const ttmR2 = comparison.ttm?.r2
      return {
        edge: `${comparison.source} → ${comparison.target}`,
        source: comparison.source,
        target: comparison.target,
        source_label: comparison.source_label,
        target_label: comparison.target_label,
        ontology: comparison.ontology,
        ttm: comparison.ttm,
        causal_r2: ontologyR2,
        causal_mape: comparison.ontology?.mape,
        mindsdb_r2: null,
        difference: ttmR2 === undefined ? undefined : ontologyR2 - ttmR2,
        better: ttmR2 === undefined
          ? undefined
          : ontologyR2 >= ttmR2 ? 'Causal' : 'TTM',
        error: comparison.ontology?.error ?? comparison.ttm?.error,
        note: comparison.ttm?.note,
      }
    }),
    prediction_charts: result.prediction_charts,
    summary: {
      total_compared: result.summary.total_compared,
      mean_causal_r2: result.summary.ontology_mean_r2,
      mindsdb_wins: 0,
      causal_wins: result.summary.ontology_wins,
      ontology_mean_r2: result.summary.ontology_mean_r2,
      ttm_mean_r2: result.summary.ttm_mean_r2,
      ontology_wins: result.summary.ontology_wins,
      ttm_wins: result.summary.ttm_wins,
      ttm_available: result.summary.ttm_available,
      mindsdb_available: false,
      ttm_model: result.summary.ttm_model,
    },
  }
}

export async function compareModelsWithFallback(
  request: ModelComparisonRequest,
  dependencies: ModelComparisonDependencies,
): Promise<ComparisonResult> {
  try {
    return normalizeTTMComparison(await dependencies.compareWithTTM(
      request.sessionId,
      request.causalEdges,
      request.discoveredTables,
      true,
    ))
  } catch (ttmCause) {
    const ttmMessage = describeError(ttmCause)
    try {
      const mindsdbResult = await dependencies.compareWithMindsdb(
        request.sessionId,
        request.causalEdges,
        request.discoveredTables,
      )
      return {
        ...mindsdbResult,
        comparison_source: 'mindsdb',
        warning: `TTM 비교에 실패해 MindsDB 비교 결과를 표시합니다: ${ttmMessage}`,
      }
    } catch (mindsdbCause) {
      throw new Error(
        `모델 비교에 실패했습니다. TTM: ${ttmMessage}; MindsDB: ${describeError(mindsdbCause)}`,
      )
    }
  }
}
