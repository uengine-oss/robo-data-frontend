declare module '@/shared/utils/text2sqlProgress' {
  export function getText2SqlStageLabelKo(stage: string): string
  export function formatCountsSummaryKo(counts?: Record<string, number>): string[]
  export function buildProgressHeadlineKo(args: {
    stage?: string
    status?: string
    elapsed_ms?: number
    light?: { index?: number; total?: number } | null
  }): string
  export function estimateProgressPercent(args: {
    stageOrder: string[]
    stagesByName: Record<string, { status?: 'start' | 'done' | 'error' } | undefined>
    currentStage?: string | null
    light?: { index?: number; total?: number } | null
    inProgressPartial?: number
  }): number
}

