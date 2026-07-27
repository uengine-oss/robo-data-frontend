<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  MarkerType,
  Position,
  VueFlow,
  useVueFlow,
  type Edge,
  type Node,
  type NodeMouseEvent,
  type NodeTypesObject,
} from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useFeatureNavigation } from '@/shared/navigation/featureNavigation'
import {
  type AgentDebugResult,
  type AgentProfile,
  type AgentTestResult,
  type CreateAgentProfileRequest,
  type ProcessGptProcess,
} from '@/domains/agent-scheduler'
import {
  type WhatIfScenarioProfileResponse,
} from '@/domains/ontology'
import { ResultTable } from '@/domains/text2sql'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import { IconCheck, IconPlay, IconPlus, IconRefresh, IconTrash } from '@/shared/icons'
import { commitMutationThenRefresh } from '../application/commitMutationThenRefresh'
import { watchAgentGateway } from '../application/watchAgentGateway'
import ActionNode from './nodes/ActionNode.vue'
import ConditionNode from './nodes/ConditionNode.vue'
import SqlNode from './nodes/SqlNode.vue'
import WhatIfNode from './nodes/WhatIfNode.vue'

type StepStatus = 'idle' | 'running' | 'success' | 'error'
type SelectedStep = 'source' | 'condition' | 'action'

interface GraphNodeData {
  label: string
  status: StepStatus
  sql?: string
  conditionType?: string
  expression?: string
  description?: string
  actionType?: 'process' | 'alarm'
  processName?: string
  scenarioName?: string
  outputField?: string
  schemaId?: string
  scenarioId?: string
}

interface DraftProfile {
  name: string
  description: string
  naturalLanguageQuery: string
  dataSourceType: 'sql' | 'whatif_scenario'
  generatedSql: string
  checkIntervalMinutes: number
  conditionExpression: string
  processId: string
  processName: string
  whatifScenarioId: string
  whatifScenarioName: string
  whatifSchemaId: string
  whatifOutputField: string
}

const featureNavigation = useFeatureNavigation()
const { fitView } = useVueFlow()

const nodeTypes: NodeTypesObject = {
  sql: SqlNode as unknown as NodeTypesObject[string],
  condition: ConditionNode as unknown as NodeTypesObject[string],
  action: ActionNode as unknown as NodeTypesObject[string],
  whatif: WhatIfNode as unknown as NodeTypesObject[string],
}

const profiles = ref<AgentProfile[]>([])
const selectedProfile = ref<AgentProfile | null>(null)
const draft = ref<DraftProfile | null>(null)
const selectedStep = ref<SelectedStep>('source')
const nodes = ref<Node<GraphNodeData>[]>([])
const edges = ref<Edge[]>([])

const isLoadingProfiles = ref(false)
const isSaving = ref(false)
const isTesting = ref(false)
const isDebugging = ref(false)
const profileLoadError = ref('')
const profileActionError = ref('')
const profileDeleteTarget = ref<AgentProfile | null>(null)
const profileDeletePending = ref(false)
const profileDeleteError = ref<string | null>(null)
const saveError = ref('')
const saveSuccess = ref('')

const processes = ref<ProcessGptProcess[]>([])
const isLoadingProcesses = ref(false)
const processLoadError = ref('')
const scenarios = ref<WhatIfScenarioProfileResponse[]>([])
const isLoadingScenarios = ref(false)
const scenarioLoadError = ref('')

const testResult = ref<AgentTestResult | null>(null)
const debugResult = ref<AgentDebugResult | null>(null)
const executionError = ref('')
const currentStep = ref<SelectedStep | null>(null)

const activeProfile = computed(() => draft.value ?? selectedProfile.value)
const activeProfilesCount = computed(() => profiles.value.filter(profile => profile.isActive).length)
const isCreating = computed(() => draft.value !== null)
const canRunSql = computed(() => selectedProfile.value?.dataSourceType === 'sql')

const resultTableData = computed(() => {
  if (!testResult.value) return null
  const columns = testResult.value.columns.length > 0
    ? testResult.value.columns
    : Object.keys(testResult.value.sampleData[0] ?? {})
  return {
    row_count: testResult.value.rowCount,
    execution_time_ms: testResult.value.executionTimeMs,
    columns,
    rows: testResult.value.sampleData.map(row => columns.map(column => row[column])),
  }
})

function profileValue<K extends keyof DraftProfile>(draftKey: K): DraftProfile[K] | undefined {
  return draft.value?.[draftKey]
}

function statusFor(step: SelectedStep): StepStatus {
  if (currentStep.value === step) return 'running'
  if (!debugResult.value) return 'idle'
  const backendStep = step === 'source'
    ? 'sql_execution'
    : step === 'condition'
      ? 'condition_evaluation'
      : 'action_simulation'
  const result = debugResult.value.steps.find(item => item.step === backendStep)
  if (!result || result.status === 'skipped') return 'idle'
  return result.status === 'error' ? 'error' : 'success'
}

function rebuildGraph(): void {
  const profile = activeProfile.value
  if (!profile) {
    nodes.value = []
    edges.value = []
    return
  }

  const isWhatif = profileValue('dataSourceType') === 'whatif_scenario'
    || (!draft.value && selectedProfile.value?.dataSourceType === 'whatif_scenario')
  const sql = draft.value?.generatedSql ?? selectedProfile.value?.generatedSql ?? ''
  const conditionExpression = draft.value?.conditionExpression
    ?? selectedProfile.value?.conditionExpression
    ?? 'rows > 0'
  const processName = draft.value?.processName ?? selectedProfile.value?.processName ?? ''
  const scenarioName = draft.value?.whatifScenarioName ?? selectedProfile.value?.whatifScenarioName ?? ''
  const outputField = draft.value?.whatifOutputField ?? selectedProfile.value?.whatifOutputField ?? ''
  const schemaId = draft.value?.whatifSchemaId ?? selectedProfile.value?.whatifSchemaId ?? ''
  const scenarioId = draft.value?.whatifScenarioId ?? selectedProfile.value?.whatifScenarioId ?? ''

  const sourceNode: Node<GraphNodeData> = isWhatif
    ? {
        id: 'source',
        type: 'whatif',
        position: { x: 60, y: 120 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: 'What-If 시나리오',
          scenarioName,
          outputField,
          schemaId,
          scenarioId,
          status: statusFor('source'),
        },
      }
    : {
        id: 'source',
        type: 'sql',
        position: { x: 60, y: 120 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: 'SQL 쿼리',
          sql,
          status: statusFor('source'),
        },
      }

  nodes.value = [
    sourceNode,
    {
      id: 'condition',
      type: 'condition',
      position: { x: 410, y: 120 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        label: '조건 평가',
        conditionType: conditionExpression === 'rows > 0' ? 'exists' : 'custom',
        expression: conditionExpression,
        description: '조회 결과를 기준으로 서버에서 평가합니다.',
        status: statusFor('condition'),
      },
    },
    {
      id: 'action',
      type: 'action',
      position: { x: 760, y: 120 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        label: 'ProcessGPT 조치',
        actionType: 'process',
        processName,
        status: statusFor('action'),
      },
    },
  ]
  edges.value = [
    {
      id: 'source-condition',
      source: 'source',
      target: 'condition',
      style: { stroke: '#6366f1', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
    },
    {
      id: 'condition-action',
      source: 'condition',
      sourceHandle: 'true',
      target: 'action',
      label: '[true]',
      style: { stroke: '#6366f1', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
    },
  ]

  nextTick(() => fitView({ padding: 0.24 }))
}

async function refreshProfiles(preferredId?: string): Promise<void> {
  isLoadingProfiles.value = true
  profileLoadError.value = ''
  try {
    profiles.value = await watchAgentGateway.listProfiles()
    const id = preferredId ?? selectedProfile.value?.id
    selectedProfile.value = id
      ? profiles.value.find(profile => profile.id === id) ?? null
      : selectedProfile.value
    if (!selectedProfile.value && profiles.value.length > 0 && !draft.value) {
      selectedProfile.value = profiles.value[0]
    }
  } catch (cause: unknown) {
    profileLoadError.value = cause instanceof Error
      ? cause.message
      : '감시 에이전트 목록 조회에 실패했습니다.'
  } finally {
    isLoadingProfiles.value = false
  }
}

async function loadProcesses(): Promise<void> {
  isLoadingProcesses.value = true
  processLoadError.value = ''
  try {
    processes.value = await watchAgentGateway.listProcesses()
  } catch (cause: unknown) {
    processLoadError.value = cause instanceof Error
      ? cause.message
      : 'ProcessGPT 프로세스 목록 조회에 실패했습니다.'
  } finally {
    isLoadingProcesses.value = false
  }
}

async function loadScenarios(): Promise<void> {
  isLoadingScenarios.value = true
  scenarioLoadError.value = ''
  try {
    scenarios.value = await watchAgentGateway.listScenarioProfiles()
  } catch (cause: unknown) {
    scenarioLoadError.value = cause instanceof Error
      ? cause.message
      : 'What-If 시나리오 목록 조회에 실패했습니다.'
  } finally {
    isLoadingScenarios.value = false
  }
}

function selectProfile(profile: AgentProfile): void {
  selectedProfile.value = profile
  draft.value = null
  selectedStep.value = 'source'
  saveError.value = ''
  saveSuccess.value = ''
  testResult.value = null
  debugResult.value = null
  executionError.value = ''
  rebuildGraph()
}

function startNewAgent(): void {
  const transfer = featureNavigation.consume<{
    question: string
    sql: string
    rowCount?: number | null
    executionTimeMs?: number | null
  }>('watch-agent')
  const question = transfer?.question ?? ''
  draft.value = {
    name: question ? `${question.slice(0, 36)}${question.length > 36 ? '…' : ''}` : '',
    description: '',
    naturalLanguageQuery: question,
    dataSourceType: 'sql',
    generatedSql: transfer?.sql ?? '',
    checkIntervalMinutes: 10,
    conditionExpression: 'rows > 0',
    processId: '',
    processName: '',
    whatifScenarioId: '',
    whatifScenarioName: '',
    whatifSchemaId: '',
    whatifOutputField: '',
  }
  selectedProfile.value = null
  selectedStep.value = 'source'
  saveError.value = ''
  saveSuccess.value = ''
  testResult.value = null
  debugResult.value = null
  executionError.value = ''
  rebuildGraph()
}

function cancelNewAgent(): void {
  draft.value = null
  selectedProfile.value = profiles.value[0] ?? null
  rebuildGraph()
}

function onNodeClick(event: NodeMouseEvent): void {
  selectedStep.value = event.node.id as SelectedStep
}

function onProcessSelected(): void {
  if (!draft.value) return
  const selected = processes.value.find(process => process.id === draft.value?.processId)
  if (selected) draft.value.processName = selected.name
}

function onScenarioSelected(): void {
  if (!draft.value) return
  const selected = scenarios.value.find(scenario => scenario.id === draft.value?.whatifScenarioId)
  draft.value.whatifScenarioName = selected?.name ?? ''
  draft.value.whatifSchemaId = selected?.schemaId ?? ''
  draft.value.whatifOutputField = ''
}

const selectedScenarioOutputFields = computed(() => {
  const scenario = scenarios.value.find(item => item.id === draft.value?.whatifScenarioId)
  if (!scenario) return []
  if (scenario.outputFields?.length) return scenario.outputFields
  const result = scenario.last_simulation_results
  if (!result) return []
  const finalState = typeof result.final_state === 'object' && result.final_state !== null
    && !Array.isArray(result.final_state)
    ? result.final_state as Record<string, unknown>
    : result
  return Object.keys(finalState).map(key => ({ key, label: key }))
})

function validateDraft(value: DraftProfile): string {
  if (!value.name.trim()) return '에이전트 이름을 입력해주세요.'
  if (!value.naturalLanguageQuery.trim()) return '감시 목적을 입력해주세요.'
  if (!Number.isInteger(value.checkIntervalMinutes) || value.checkIntervalMinutes < 1) {
    return '감시 주기는 1분 이상의 정수여야 합니다.'
  }
  if (!value.conditionExpression.trim()) return '조건식을 입력해주세요.'
  if (value.dataSourceType === 'sql' && !value.generatedSql.trim()) {
    return '실행할 SQL을 입력해주세요.'
  }
  if (value.dataSourceType === 'whatif_scenario'
    && (!value.whatifScenarioId || !value.whatifOutputField)) {
    return 'What-If 시나리오와 감시할 출력 필드를 선택해주세요.'
  }
  return ''
}

async function saveAgent(): Promise<void> {
  if (!draft.value || isSaving.value) return
  saveError.value = validateDraft(draft.value)
  saveSuccess.value = ''
  if (saveError.value) return

  isSaving.value = true
  try {
    const value = draft.value
    const request: CreateAgentProfileRequest = {
      name: value.name.trim(),
      description: value.description.trim(),
      natural_language_query: value.naturalLanguageQuery.trim(),
      generated_sql: value.dataSourceType === 'sql' ? value.generatedSql.trim() : '',
      check_interval_minutes: value.checkIntervalMinutes,
      condition_expression: value.conditionExpression.trim(),
      process_id: value.processId.trim(),
      process_name: value.processName.trim(),
      data_source_type: value.dataSourceType,
      whatif_scenario_id: value.dataSourceType === 'whatif_scenario' ? value.whatifScenarioId : undefined,
      whatif_scenario_name: value.dataSourceType === 'whatif_scenario' ? value.whatifScenarioName : undefined,
      whatif_schema_id: value.dataSourceType === 'whatif_scenario' ? value.whatifSchemaId : undefined,
      whatif_output_field: value.dataSourceType === 'whatif_scenario' ? value.whatifOutputField : undefined,
    }
    const saved = await watchAgentGateway.createProfile(request)
    draft.value = null
    saveSuccess.value = `“${saved.name}” 감시 에이전트를 저장했습니다.`
    await refreshProfiles(saved.id)
  } catch (cause: unknown) {
    saveError.value = cause instanceof Error ? cause.message : '감시 에이전트 저장에 실패했습니다.'
  } finally {
    isSaving.value = false
  }
}

async function toggleProfile(profile: AgentProfile, event: Event): Promise<void> {
  event.stopPropagation()
  profileActionError.value = ''
  try {
    const outcome = await commitMutationThenRefresh({
      currentItems: profiles.value,
      mutate: () => watchAgentGateway.toggleProfile(profile.id),
      commit: (items, active) => items.map(item =>
        item.id === profile.id ? { ...item, isActive: active } : item,
      ),
      refresh: () => watchAgentGateway.listProfiles(),
      describeRefreshError: cause => cause instanceof Error
        ? `상태는 변경되었지만 목록을 새로 고치지 못했습니다. ${cause.message}`
        : '상태는 변경되었지만 목록을 새로 고치지 못했습니다.',
    })
    profiles.value = outcome.items
    profileLoadError.value = outcome.refreshError ?? ''
    if (selectedProfile.value?.id === profile.id) {
      selectedProfile.value = profiles.value.find(item => item.id === profile.id) ?? null
    }
    rebuildGraph()
  } catch (cause: unknown) {
    profileActionError.value = cause instanceof Error
      ? cause.message
      : '감시 에이전트 상태 변경에 실패했습니다.'
  }
}

function requestProfileDeletion(profile: AgentProfile, event: Event): void {
  event.stopPropagation()
  profileDeleteTarget.value = profile
  profileDeleteError.value = null
}

function cancelProfileDeletion(): void {
  if (profileDeletePending.value) return
  profileDeleteTarget.value = null
  profileDeleteError.value = null
}

async function confirmProfileDeletion(): Promise<void> {
  const target = profileDeleteTarget.value
  if (!target || profileDeletePending.value) return
  profileDeletePending.value = true
  profileDeleteError.value = null
  try {
    const outcome = await commitMutationThenRefresh({
      currentItems: profiles.value,
      mutate: () => watchAgentGateway.deleteProfile(target.id),
      commit: items => items.filter(item => item.id !== target.id),
      refresh: () => watchAgentGateway.listProfiles(),
      describeRefreshError: cause => cause instanceof Error
        ? `삭제는 완료됐지만 목록을 새로 고치지 못했습니다. ${cause.message}`
        : '삭제는 완료됐지만 목록을 새로 고치지 못했습니다.',
    })
    profiles.value = outcome.items
    profileLoadError.value = outcome.refreshError ?? ''
    if (selectedProfile.value?.id === target.id) {
      selectedProfile.value = profiles.value[0] ?? null
    }
    profileDeleteTarget.value = null
    rebuildGraph()
  } catch (cause: unknown) {
    profileDeleteError.value = cause instanceof Error
      ? cause.message
      : '감시 에이전트 삭제에 실패했습니다.'
  } finally {
    profileDeletePending.value = false
  }
}

async function testSql(): Promise<void> {
  if (!selectedProfile.value || !canRunSql.value || isTesting.value) return
  isTesting.value = true
  executionError.value = ''
  testResult.value = null
  debugResult.value = null
  currentStep.value = 'source'
  rebuildGraph()
  try {
    const result = await watchAgentGateway.testProfile(selectedProfile.value.id)
    testResult.value = result
    if (!result.success) executionError.value = result.error || 'SQL 테스트에 실패했습니다.'
  } catch (cause: unknown) {
    executionError.value = cause instanceof Error ? cause.message : 'SQL 테스트에 실패했습니다.'
  } finally {
    currentStep.value = null
    isTesting.value = false
    rebuildGraph()
  }
}

async function debugAgent(): Promise<void> {
  if (!selectedProfile.value || !canRunSql.value || isDebugging.value) return
  isDebugging.value = true
  executionError.value = ''
  testResult.value = null
  debugResult.value = null
  currentStep.value = 'source'
  rebuildGraph()
  try {
    debugResult.value = await watchAgentGateway.debugProfile(selectedProfile.value.id)
  } catch (cause: unknown) {
    executionError.value = cause instanceof Error ? cause.message : '서버 디버그 실행에 실패했습니다.'
  } finally {
    currentStep.value = null
    isDebugging.value = false
    rebuildGraph()
  }
}

watch(draft, rebuildGraph, { deep: true })
watch(selectedProfile, rebuildGraph)
watch(() => featureNavigation.peek('watch-agent'), transfer => {
  if (transfer) startNewAgent()
})

onMounted(async () => {
  await Promise.all([refreshProfiles(), loadProcesses()])
  if (featureNavigation.peek('watch-agent')) startNewAgent()
  else rebuildGraph()
})
</script>

<template>
  <div class="watch-agent-page">
    <aside class="profile-panel" aria-label="감시 에이전트 목록">
      <header class="panel-header">
        <div>
          <h1>감시 에이전트</h1>
          <p>{{ activeProfilesCount }}개 활성</p>
        </div>
        <button class="icon-button primary" type="button" title="새 감시 에이전트" @click="startNewAgent">
          <IconPlus :size="17" />
        </button>
      </header>

      <div class="panel-actions">
        <button type="button" :disabled="isLoadingProfiles" @click="refreshProfiles()">
          <IconRefresh :size="14" :class="{ spinning: isLoadingProfiles }" />
          새로고침
        </button>
      </div>

      <p v-if="profileLoadError" class="inline-message error" role="alert">{{ profileLoadError }}</p>
      <p v-if="profileActionError" class="inline-message error" role="alert">{{ profileActionError }}</p>

      <div class="profile-list">
        <article
          v-for="profile in profiles"
          :key="profile.id"
          class="profile-card"
          :class="{ selected: selectedProfile?.id === profile.id && !isCreating }"
        >
          <button
            type="button"
            class="profile-select"
            :aria-pressed="selectedProfile?.id === profile.id && !isCreating"
            @click="selectProfile(profile)"
          >
            <span class="profile-card-header">
              <span class="status-dot" :class="{ active: profile.isActive }" aria-hidden="true"></span>
              <strong>{{ profile.name }}</strong>
            </span>
            <span class="profile-meta">
              {{ profile.checkIntervalMinutes }}분 주기
              <span v-if="profile.executionCount">· {{ profile.executionCount }}회 실행</span>
            </span>
          </button>
          <span class="profile-card-actions">
            <button
              type="button"
              class="card-action"
              :title="profile.isActive ? '비활성화' : '활성화'"
              :aria-label="`“${profile.name}” 감시 에이전트 ${profile.isActive ? '비활성화' : '활성화'}`"
              @click="toggleProfile(profile, $event)"
            >{{ profile.isActive ? '활성' : '중지' }}</button>
            <button
              type="button"
              class="card-action danger"
              :title="`“${profile.name}” 삭제`"
              :aria-label="`“${profile.name}” 감시 에이전트 삭제`"
              @click="requestProfileDeletion(profile, $event)"
            ><IconTrash :size="13" /></button>
          </span>
        </article>

        <div v-if="!isLoadingProfiles && profiles.length === 0 && !profileLoadError" class="empty-state">
          저장된 감시 에이전트가 없습니다.
        </div>
      </div>
    </aside>

    <main class="workspace">
      <header class="workspace-header">
        <div>
          <h2>{{ draft?.name || selectedProfile?.name || '감시 에이전트' }}</h2>
          <p v-if="isCreating">실제 scheduler 프로필의 세 단계를 설정합니다.</p>
          <p v-else-if="selectedProfile">{{ selectedProfile.naturalLanguageQuery }}</p>
          <p v-else>에이전트를 선택하거나 새로 만드세요.</p>
        </div>
        <div v-if="selectedProfile && !isCreating" class="run-actions">
          <button type="button" :disabled="!canRunSql || isTesting || isDebugging" @click="testSql">
            <IconCheck :size="15" /> SQL 테스트
          </button>
          <button class="primary" type="button" :disabled="!canRunSql || isTesting || isDebugging" @click="debugAgent">
            <IconPlay :size="15" /> 전체 디버그
          </button>
        </div>
      </header>

      <p v-if="selectedProfile?.dataSourceType === 'whatif_scenario'" class="workspace-notice">
        What-If 프로필은 scheduler가 주기 실행하지만 현재 서버의 디버그 API는 SQL 프로필만 지원합니다.
      </p>
      <p v-if="saveSuccess" class="workspace-notice success" role="status">{{ saveSuccess }}</p>
      <p v-if="executionError" class="workspace-notice error" role="alert">{{ executionError }}</p>

      <section class="graph-area" aria-label="감시 에이전트 실행 단계">
        <VueFlow
          :nodes="nodes"
          :edges="edges"
          :node-types="nodeTypes"
          :nodes-draggable="false"
          :nodes-connectable="false"
          :delete-key-code="null"
          :min-zoom="0.35"
          :max-zoom="1.5"
          fit-view-on-init
          @node-click="onNodeClick"
        >
          <Background :gap="20" :size="1" />
          <Controls :show-interactive="false" />
        </VueFlow>
        <div v-if="!activeProfile" class="graph-empty">
          왼쪽 목록에서 에이전트를 선택하거나 새 에이전트를 만드세요.
        </div>
      </section>

      <section v-if="testResult || debugResult" class="result-panel" aria-live="polite">
        <header>
          <h3>{{ debugResult ? '서버 디버그 결과' : 'SQL 테스트 결과' }}</h3>
          <span v-if="debugResult" class="result-badge" :class="debugResult.finalResult">
            {{ debugResult.finalResult }}
          </span>
          <span v-else-if="testResult" class="result-badge" :class="testResult.success ? 'success' : 'error'">
            {{ testResult.success ? 'success' : 'error' }}
          </span>
        </header>

        <div v-if="debugResult" class="debug-steps">
          <article v-for="step in debugResult.steps" :key="step.step" :class="step.status">
            <span class="step-status" aria-hidden="true"></span>
            <div>
              <strong>{{ step.title }}</strong>
              <p>{{ step.description }}</p>
            </div>
            <time v-if="step.durationMs !== undefined">{{ Math.round(step.durationMs) }} ms</time>
          </article>
        </div>

        <ResultTable v-if="resultTableData" :data="resultTableData" />
      </section>
    </main>

    <aside class="detail-panel" aria-label="감시 에이전트 설정">
      <template v-if="draft">
        <header class="detail-header">
          <div>
            <h2>새 감시 에이전트</h2>
            <p>저장하면 즉시 scheduler의 활성 프로필이 됩니다.</p>
          </div>
        </header>

        <form class="profile-form" @submit.prevent="saveAgent">
          <section>
            <h3>기본 정보</h3>
            <label>이름 <input v-model="draft.name" required /></label>
            <label>감시 목적 <textarea v-model="draft.naturalLanguageQuery" rows="3" required></textarea></label>
            <label>설명 <textarea v-model="draft.description" rows="2"></textarea></label>
            <label>감시 주기(분) <input v-model.number="draft.checkIntervalMinutes" type="number" min="1" step="1" required /></label>
          </section>

          <section :class="{ highlighted: selectedStep === 'source' }">
            <h3>1단계 · 데이터 소스</h3>
            <div class="segmented-control">
              <button type="button" :class="{ active: draft.dataSourceType === 'sql' }" @click="draft.dataSourceType = 'sql'">SQL</button>
              <button type="button" :class="{ active: draft.dataSourceType === 'whatif_scenario' }" @click="draft.dataSourceType = 'whatif_scenario'; loadScenarios()">What-If</button>
            </div>
            <label v-if="draft.dataSourceType === 'sql'">
              SQL
              <textarea v-model="draft.generatedSql" class="code-input" rows="7" spellcheck="false" required></textarea>
            </label>
            <template v-else>
              <label>
                시나리오
                <select v-model="draft.whatifScenarioId" :disabled="isLoadingScenarios" required @change="onScenarioSelected">
                  <option value="">시나리오 선택</option>
                  <option v-for="scenario in scenarios" :key="scenario.id" :value="scenario.id">{{ scenario.name }}</option>
                </select>
              </label>
              <label>
                출력 필드
                <select v-model="draft.whatifOutputField" :disabled="!draft.whatifScenarioId" required>
                  <option value="">출력 필드 선택</option>
                  <option v-for="field in selectedScenarioOutputFields" :key="field.key" :value="field.key">{{ field.label }}</option>
                </select>
              </label>
              <p v-if="scenarioLoadError" class="form-message error">{{ scenarioLoadError }}</p>
            </template>
          </section>

          <section :class="{ highlighted: selectedStep === 'condition' }">
            <h3>2단계 · 조건</h3>
            <label>
              조건식
              <input v-model="draft.conditionExpression" class="code-input" required />
            </label>
            <p class="field-help">현재 서버가 제공하는 기본 조건은 <code>rows &gt; 0</code>입니다.</p>
          </section>

          <section :class="{ highlighted: selectedStep === 'action' }">
            <h3>3단계 · ProcessGPT 조치</h3>
            <label>
              프로세스
              <select v-model="draft.processId" :disabled="isLoadingProcesses" @change="onProcessSelected">
                <option value="">조치 없이 감시만 수행</option>
                <option v-for="process in processes" :key="process.id" :value="process.id">{{ process.name }}</option>
              </select>
            </label>
            <p v-if="processLoadError" class="form-message error">{{ processLoadError }}</p>
            <button v-if="processLoadError" class="text-button" type="button" @click="loadProcesses">프로세스 목록 다시 불러오기</button>
          </section>

          <p v-if="saveError" class="form-message error" role="alert">{{ saveError }}</p>
          <footer class="form-actions">
            <button type="button" @click="cancelNewAgent">취소</button>
            <button class="primary" type="submit" :disabled="isSaving">
              {{ isSaving ? '저장 중…' : '에이전트 저장' }}
            </button>
          </footer>
        </form>
      </template>

      <template v-else-if="selectedProfile">
        <header class="detail-header">
          <div>
            <h2>{{ selectedProfile.name }}</h2>
            <p>저장된 scheduler 프로필</p>
          </div>
        </header>
        <dl class="profile-details">
          <div><dt>상태</dt><dd>{{ selectedProfile.isActive ? '활성' : '중지' }}</dd></div>
          <div><dt>데이터 소스</dt><dd>{{ selectedProfile.dataSourceType === 'sql' ? 'SQL' : 'What-If' }}</dd></div>
          <div><dt>감시 주기</dt><dd>{{ selectedProfile.checkIntervalMinutes }}분</dd></div>
          <div><dt>조건식</dt><dd><code>{{ selectedProfile.conditionExpression }}</code></dd></div>
          <div><dt>프로세스</dt><dd>{{ selectedProfile.processName || '조치 없음' }}</dd></div>
          <div v-if="selectedProfile.lastExecutedAt"><dt>최근 실행</dt><dd>{{ selectedProfile.lastExecutedAt }}</dd></div>
          <div><dt>실행 횟수</dt><dd>{{ selectedProfile.executionCount }}회</dd></div>
        </dl>
        <p class="read-only-note">
          현재 scheduler 백엔드는 프로필 수정 API를 제공하지 않습니다. 설정을 바꾸려면 새 프로필을 만든 뒤 기존 프로필을 삭제해야 합니다.
        </p>
      </template>

      <div v-else class="detail-empty">설정할 에이전트가 없습니다.</div>
    </aside>

    <ActionDialog
      :open="profileDeleteTarget !== null"
      dialog-id="watch-agent-delete"
      title="감시 에이전트 삭제"
      :message="profileDeleteTarget
        ? `“${profileDeleteTarget.name}” 감시 에이전트를 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
        : ''"
      confirm-label="삭제"
      pending-label="삭제 중…"
      :pending="profileDeletePending"
      :error="profileDeleteError"
      @cancel="cancelProfileDeletion"
      @confirm="confirmProfileDeletion"
    />
  </div>
</template>

<style scoped lang="scss">
.watch-agent-page {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 340px;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--color-bg);
}

.profile-panel,
.detail-panel {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: var(--color-bg-secondary);
}

.profile-panel { border-right: 1px solid var(--color-border); }
.detail-panel { border-left: 1px solid var(--color-border); }

.panel-header,
.workspace-header,
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--color-border);

  h1, h2 { margin: 0; color: var(--color-text-bright); font-size: 17px; }
  p { margin: 4px 0 0; color: var(--color-text-light); font-size: 12px; line-height: 1.45; }
}

button,
input,
textarea,
select { font: inherit; }

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 7px 11px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  cursor: pointer;

  &:hover:not(:disabled) { border-color: var(--color-accent); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  &:disabled { cursor: not-allowed; opacity: .5; }
  &.primary { border-color: var(--color-accent); background: var(--color-accent); color: white; }
}

.icon-button { width: 34px; padding: 0; }
.panel-actions { padding: var(--spacing-sm) var(--spacing-md); }
.panel-actions button { width: 100%; }

.profile-list { display: grid; gap: 6px; padding: 0 var(--spacing-sm) var(--spacing-md); }
.profile-card {
  position: relative;
  display: grid;
  justify-items: stretch;
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
  overflow: hidden;

  &.selected { border-color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 10%, transparent); }
}
.profile-select {
  display: grid;
  justify-items: stretch;
  gap: 7px;
  width: 100%;
  min-width: 0;
  padding: 12px 12px 7px;
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: left;
}
.profile-card-header { display: flex; align-items: center; gap: 8px; min-width: 0; }
.profile-card-header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: var(--color-text-muted); }
.status-dot.active { background: var(--color-success); }
.profile-meta { color: var(--color-text-light); font-size: 11px; }
.profile-card-actions { display: flex; gap: 6px; padding: 0 12px 10px; }
.card-action {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 3px 7px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-light);
  font-size: 11px;
}
.card-action:hover { border-color: var(--color-accent); color: var(--color-text); }
.card-action.danger:hover { border-color: var(--color-error); color: var(--color-error); }

.empty-state,
.detail-empty,
.graph-empty { color: var(--color-text-light); font-size: 13px; text-align: center; }
.empty-state { padding: var(--spacing-xl) var(--spacing-md); }

.workspace {
  display: grid;
  grid-template-rows: auto auto minmax(280px, 1fr) auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.workspace-header { align-items: center; background: var(--color-bg-secondary); }
.workspace-header > div:first-child { min-width: 0; }
.workspace-header h2,
.workspace-header p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-actions { display: flex; flex: 0 0 auto; gap: var(--spacing-sm); }

.workspace-notice,
.inline-message,
.form-message {
  margin: var(--spacing-sm) var(--spacing-md) 0;
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--color-warning) 45%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-text);
  font-size: 12px;
  line-height: 1.45;
}
.inline-message { margin: 0 var(--spacing-sm) var(--spacing-sm); }
.form-message { margin: 0; }
.error { border-color: color-mix(in srgb, var(--color-error) 45%, transparent); background: color-mix(in srgb, var(--color-error) 9%, transparent); }
.success { border-color: color-mix(in srgb, var(--color-success) 45%, transparent); background: color-mix(in srgb, var(--color-success) 9%, transparent); }

.graph-area { position: relative; min-width: 0; min-height: 0; margin: var(--spacing-md); overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-bg-secondary); }
.graph-empty { position: absolute; inset: 0; display: grid; place-items: center; padding: var(--spacing-xl); pointer-events: none; }

.result-panel { max-height: 330px; overflow: auto; border-top: 1px solid var(--color-border); background: var(--color-bg-secondary); }
.result-panel > header { display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-md); }
.result-panel h3 { margin: 0; color: var(--color-text-bright); font-size: 15px; }
.result-badge { padding: 3px 7px; border-radius: 999px; background: var(--color-bg-tertiary); color: var(--color-text-light); font-size: 11px; text-transform: uppercase; }
.result-badge.success,
.result-badge.triggered { color: var(--color-success); }
.result-badge.error { color: var(--color-error); }
.debug-steps { display: grid; gap: 7px; padding: 0 var(--spacing-md) var(--spacing-md); }
.debug-steps article { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 10px; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.debug-steps strong { color: var(--color-text); font-size: 12px; }
.debug-steps p { margin: 3px 0 0; color: var(--color-text-light); font-size: 11px; }
.debug-steps time { color: var(--color-text-muted); font-size: 11px; }
.step-status { width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: var(--color-text-muted); }
.debug-steps .success .step-status { background: var(--color-success); }
.debug-steps .error .step-status { background: var(--color-error); }

.profile-form { display: grid; gap: var(--spacing-md); padding: var(--spacing-md); }
.profile-form section { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.profile-form section.highlighted { border-color: var(--color-accent); }
.profile-form h3 { margin: 0; color: var(--color-text-bright); font-size: 13px; }
.profile-form label { display: grid; gap: 5px; color: var(--color-text-light); font-size: 12px; }
.profile-form input,
.profile-form textarea,
.profile-form select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 8px 9px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-tertiary);
  color: var(--color-text);
}
.profile-form textarea { resize: vertical; line-height: 1.5; }
.profile-form input:focus,
.profile-form textarea:focus,
.profile-form select:focus { outline: 2px solid color-mix(in srgb, var(--color-accent) 40%, transparent); border-color: var(--color-accent); }
.code-input { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.field-help { margin: 0; color: var(--color-text-muted); font-size: 11px; line-height: 1.45; }
.field-help code { color: var(--color-accent); }
.segmented-control { display: grid; grid-template-columns: 1fr 1fr; }
.segmented-control button { border-radius: 0; }
.segmented-control button:first-child { border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
.segmented-control button:last-child { border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
.segmented-control button.active { border-color: var(--color-accent); color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 10%, transparent); }
.text-button { min-height: auto; padding: 0; border: 0; background: transparent; color: var(--color-accent); justify-content: flex-start; }
.form-actions { display: flex; justify-content: flex-end; gap: var(--spacing-sm); position: sticky; bottom: 0; padding-top: var(--spacing-sm); background: var(--color-bg-secondary); }

.profile-details { display: grid; margin: 0; padding: var(--spacing-md); }
.profile-details div { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: var(--spacing-sm); padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.profile-details dt { color: var(--color-text-light); font-size: 12px; }
.profile-details dd { min-width: 0; margin: 0; overflow-wrap: anywhere; color: var(--color-text); font-size: 12px; }
.read-only-note { margin: 0 var(--spacing-md) var(--spacing-md); padding: 11px; border-radius: var(--radius-md); background: var(--color-bg-tertiary); color: var(--color-text-light); font-size: 11px; line-height: 1.55; }
.detail-empty { padding: var(--spacing-xl); }

.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 1180px) {
  .watch-agent-page { grid-template-columns: 240px minmax(0, 1fr); }
  .detail-panel { position: absolute; z-index: 8; top: 0; right: 0; bottom: 0; width: min(360px, 90vw); box-shadow: -8px 0 24px rgba(0, 0, 0, .18); }
}

@media (max-width: 760px) {
  .watch-agent-page { grid-template-columns: 1fr; overflow-y: auto; }
  .profile-panel { max-height: 260px; border-right: 0; border-bottom: 1px solid var(--color-border); }
  .workspace { min-height: 620px; }
  .workspace-header { align-items: flex-start; flex-direction: column; }
  .run-actions { width: 100%; }
  .run-actions button { flex: 1; }
  .detail-panel {
    position: static;
    width: auto;
    max-height: none;
    border-top: 1px solid var(--color-border);
    border-left: 0;
    box-shadow: none;
  }
}
</style>
