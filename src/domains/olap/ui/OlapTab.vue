<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'
import { executeCubeDeletion } from '../application/cubeDeletion.ts'
import { describeOlapError } from '../model/contracts.ts'
import { useOlapStore } from '../state/olap.ts'
import CubeDesigner from './CubeDesigner.vue'
import PivotAnalysis from './PivotAnalysis.vue'

type DeletionTarget =
  | { scope: 'single'; cubeName: string }
  | { scope: 'all' }

const store = useOlapStore()
const activeSubTab = ref<'design' | 'analysis'>('analysis')
const showCubeManager = ref(false)
const cubeManager = ref<HTMLElement | null>(null)
const managerCloseButton = ref<HTMLButtonElement | null>(null)
const deletionTarget = ref<DeletionTarget | null>(null)
const deletionPending = ref(false)
const deletionError = ref<string | null>(null)
const deleteAllDwTables = ref(false)
const operationStatus = ref<{ tone: 'success' | 'warning'; message: string } | null>(null)

const cubeLoadError = computed(() => store.cubeListError
  ? `OLAP 큐브 목록을 불러오지 못했습니다. ${store.cubeListError}`
  : null)
const deletionTitle = computed(() => deletionTarget.value?.scope === 'single'
  ? `'${deletionTarget.value.cubeName}' 큐브 삭제`
  : '모든 큐브 삭제')
const deletionMessage = computed(() => deletionTarget.value?.scope === 'single'
  ? '큐브 메타데이터를 삭제하고 같은 이름의 ETL 설정 정리를 시도합니다.\n큐브별 DW 소유 계약이 없어 DW 테이블은 추정 삭제하지 않습니다.'
  : '모든 큐브 메타데이터와 ETL 설정을 삭제합니다. 이 작업은 되돌릴 수 없습니다.')

async function loadCubeList() {
  try {
    await store.loadCubes()
  } catch {
    // The store owns the visible list error and preserves the last successful list.
  }
}

async function selectCube(event: Event) {
  const cubeName = (event.target as HTMLSelectElement).value
  try {
    await store.selectCube(cubeName)
  } catch {
    // The previous selection remains active and the selection error is visible.
  }
}

function openCubeManager() {
  showCubeManager.value = true
}

function closeCubeManager() {
  if (deletionPending.value || deletionTarget.value) return
  showCubeManager.value = false
}

useDialogFocusLifecycle({
  active: () => showCubeManager.value,
  dialog: cubeManager,
  requestClose: closeCubeManager,
  initialFocus: () => managerCloseButton.value,
  canClose: () => !deletionPending.value && deletionTarget.value === null,
  suspended: () => deletionTarget.value !== null,
})

function requestDeleteCube(cubeName: string) {
  deletionTarget.value = { scope: 'single', cubeName }
  deletionError.value = null
  deleteAllDwTables.value = false
}

function requestDeleteAllCubes() {
  deletionTarget.value = { scope: 'all' }
  deletionError.value = null
  deleteAllDwTables.value = false
}

function cancelDeletion() {
  if (deletionPending.value) return
  deletionTarget.value = null
  deletionError.value = null
  deleteAllDwTables.value = false
}

async function confirmDeletion() {
  const target = deletionTarget.value
  if (!target || deletionPending.value) return
  deletionPending.value = true
  deletionError.value = null
  operationStatus.value = null

  try {
    const request = target.scope === 'single'
      ? { scope: 'single' as const, cubeName: target.cubeName }
      : { scope: 'all' as const, deleteAllDwTables: deleteAllDwTables.value }
    const result = await executeCubeDeletion(request)
    store.commitCubeDeletion(target.scope === 'single' ? target.cubeName : undefined)

    const warnings = [...result.cleanupErrors]
    try {
      await store.loadCubes()
    } catch (cause: unknown) {
      warnings.push(`목록 새로고침: ${describeOlapError(cause)}`)
    }

    operationStatus.value = warnings.length
      ? {
          tone: 'warning',
          message: `큐브 삭제는 완료됐지만 일부 후속 작업에 실패했습니다. ${warnings.join(' / ')}`,
        }
      : {
          tone: 'success',
          message: target.scope === 'single'
            ? `'${target.cubeName}' 큐브를 삭제했습니다.`
            : '모든 큐브를 삭제했습니다.',
        }
    deletionTarget.value = null
    if (target.scope === 'all') showCubeManager.value = false
  } catch (cause: unknown) {
    deletionError.value = `삭제 실패: ${describeOlapError(cause)}`
  } finally {
    deletionPending.value = false
  }
}

onMounted(() => void loadCubeList())
</script>

<template>
  <div class="olap-tab">
    <!-- Header -->
    <header class="olap-header">
      <div class="header-left">
        <h1 class="title">
          <span class="icon">📊</span>
          OLAP 분석
        </h1>
        <p class="subtitle">피벗 테이블 분석 및 OLAP 큐브 설계</p>
      </div>

      <!-- Sub Tabs -->
      <nav class="sub-tabs">
        <button
          class="sub-tab"
          :class="{ active: activeSubTab === 'analysis' }"
          @click="activeSubTab = 'analysis'"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          피벗 테이블
        </button>
        <button
          class="sub-tab"
          :class="{ active: activeSubTab === 'design' }"
          @click="activeSubTab = 'design'"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
          큐브 설계
        </button>
      </nav>

      <!-- Cube Selector -->
      <div class="cube-selector" v-if="store.hasCubes && activeSubTab === 'analysis'">
        <label>큐브:</label>
        <select
          :value="store.currentCube"
          :disabled="store.cubeSelectionLoading"
          @change="selectCube"
        >
          <option v-for="cube in store.cubes" :key="cube" :value="cube">
            {{ cube }}
          </option>
        </select>
        <button class="btn-icon" @click="openCubeManager" title="큐브 관리">
          ⚙️
        </button>
      </div>

      <!-- Cube Manager Button when no cubes -->
      <button
        v-if="store.hasCubes"
        class="btn-manage"
        @click="openCubeManager"
        title="큐브 관리"
      >
        ⚙️ 큐브 관리
      </button>
    </header>

    <div v-if="cubeLoadError" class="olap-load-error" role="alert">
      <span class="error-icon" aria-hidden="true">⚠️</span>
      <span class="error-text">{{ cubeLoadError }}</span>
      <button type="button" class="retry-button" :disabled="store.cubeListLoading" @click="loadCubeList">
        {{ store.cubeListLoading ? '불러오는 중...' : '다시 시도' }}
      </button>
    </div>

    <div v-if="store.cubeSelectionError" class="olap-load-error" role="alert">
      <span class="error-icon" aria-hidden="true">⚠️</span>
      <span class="error-text">
        큐브 상세를 불러오지 못했습니다. {{ store.cubeSelectionError }}
      </span>
      <button
        v-if="store.currentCube"
        type="button"
        class="retry-button"
        :disabled="store.cubeSelectionLoading"
        @click="store.selectCube(store.currentCube).catch(() => undefined)"
      >
        {{ store.cubeSelectionLoading ? '불러오는 중...' : '다시 시도' }}
      </button>
    </div>

    <div
      v-if="operationStatus"
      class="olap-operation-status"
      :class="operationStatus.tone"
      :role="operationStatus.tone === 'warning' ? 'alert' : 'status'"
    >
      {{ operationStatus.message }}
    </div>

    <!-- Cube Manager Modal -->
    <div class="modal-overlay" v-if="showCubeManager" @click.self="closeCubeManager">
      <section
        ref="cubeManager"
        class="modal-content cube-manager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cube-manager-title"
        :aria-busy="deletionPending"
        tabindex="-1"
      >
        <header class="modal-header">
          <h2 id="cube-manager-title">📦 큐브 관리</h2>
          <button
            ref="managerCloseButton"
            type="button"
            class="btn-close"
            aria-label="큐브 관리 닫기"
            :disabled="deletionPending"
            @click="closeCubeManager"
          >
            ×
          </button>
        </header>

        <div class="cube-list" v-if="store.cubes.length > 0">
          <div
            v-for="cube in store.cubes"
            :key="cube"
            class="cube-item"
            :class="{ active: store.currentCube === cube }"
          >
            <div class="cube-info">
              <span class="cube-icon">📊</span>
              <span class="cube-name">{{ cube }}</span>
            </div>
            <button
              type="button"
              class="btn-delete"
              @click="requestDeleteCube(cube)"
              :disabled="deletionPending"
            >
              🗑️ 삭제
            </button>
          </div>
        </div>

        <div class="empty-state" v-else>
          <p>등록된 큐브가 없습니다.</p>
        </div>

        <footer class="modal-footer" v-if="store.cubes.length > 0">
          <button type="button" class="btn-danger" :disabled="deletionPending" @click="requestDeleteAllCubes">
            🗑️ 모든 큐브 삭제
          </button>
        </footer>
      </section>
    </div>

    <ActionDialog
      :open="deletionTarget !== null"
      dialog-id="olap-cube-delete"
      :title="deletionTitle"
      :message="deletionMessage"
      confirm-label="삭제"
      pending-label="삭제 중…"
      :pending="deletionPending"
      :error="deletionError"
      :option-label="deletionTarget?.scope === 'all'
        ? 'DW 스키마의 모든 테이블도 함께 삭제'
        : undefined"
      :option-selected="deleteAllDwTables"
      @update:option-selected="deleteAllDwTables = $event"
      @cancel="cancelDeletion"
      @confirm="confirmDeletion"
    />

    <!-- Content -->
    <main class="olap-content">
      <CubeDesigner v-if="activeSubTab === 'design'" />
      <PivotAnalysis v-else-if="activeSubTab === 'analysis'" />
    </main>
  </div>
</template>

<style lang="scss" scoped>
.olap-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
}

.olap-header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 24px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.olap-load-error {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 24px 0;
  padding: 14px 16px;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.22);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 10px;

  .error-text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .retry-button {
    flex: 0 0 auto;
    padding: 7px 12px;
    color: white;
    font-size: 12px;
    font-weight: 600;
    background: #ef4444;
    border: 0;
    border-radius: 6px;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: #dc2626;
    }

    &:disabled {
      opacity: 0.65;
      cursor: wait;
    }
  }
}

.olap-operation-status {
  margin: 12px 24px 0;
  padding: 12px 16px;
  border-radius: 10px;
  line-height: 1.5;
  overflow-wrap: anywhere;

  &.success {
    border: 1px solid rgba(34, 197, 94, 0.35);
    background: rgba(20, 83, 45, 0.22);
    color: #bbf7d0;
  }

  &.warning {
    border: 1px solid rgba(245, 158, 11, 0.4);
    background: rgba(120, 53, 15, 0.22);
    color: #fde68a;
  }
}

.header-left {
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
    color: var(--color-text);

    .icon {
      font-size: 1.5rem;
    }
  }

  .subtitle {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 4px 0 0 0;
  }
}

.sub-tabs {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.sub-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--color-text-light);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }

  &.active {
    background: linear-gradient(135deg, rgba(34, 139, 230, 0.15) 0%, rgba(34, 139, 230, 0.08) 100%);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.cube-selector {
  display: flex;
  align-items: center;
  gap: 8px;

  label {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  select {
    padding: 8px 12px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text);
    font-size: 0.875rem;
    min-width: 160px;

    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
}

.olap-content {
  flex: 1;
  overflow: hidden;
  display: flex;
}

.btn-icon {
  padding: 6px 10px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;

  &:hover {
    background: var(--color-bg-tertiary);
  }
}

.btn-manage {
  padding: 8px 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-light);
  font-size: 0.8125rem;
  cursor: pointer;

  &:hover {
    background: var(--color-bg);
    color: var(--color-text);
  }
}

// Cube Manager Modal
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);

  h2 {
    margin: 0;
    font-size: 1.125rem;
    color: var(--color-text);
  }
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
  line-height: 1;

  &:hover {
    color: var(--color-text);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.cube-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.cube-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin-bottom: 8px;

  &.active {
    border-color: var(--color-accent);
  }
}

.cube-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cube-icon {
  font-size: 1.25rem;
}

.cube-name {
  font-size: 0.9375rem;
  color: var(--color-text);
  font-weight: 500;
}

.btn-delete {
  padding: 6px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #ef4444;
  font-size: 0.8125rem;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.2);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-muted);
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
}

.btn-danger {
  padding: 8px 16px;
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

@media (max-width: 900px) {
  .olap-header {
    align-items: stretch;
    flex-wrap: wrap;
    gap: 12px;
    padding: 14px 16px;
  }

  .header-left {
    flex: 1 1 100%;
  }

  .sub-tabs {
    order: 2;
    margin-left: 0;
  }

  .cube-selector {
    order: 3;
    min-width: 0;

    select {
      min-width: 0;
      max-width: 180px;
    }
  }

  .btn-manage {
    order: 4;
  }

  .olap-load-error {
    align-items: flex-start;
    flex-wrap: wrap;
    margin-inline: 16px;

    .retry-button {
      margin-left: auto;
    }
  }

  .olap-operation-status {
    margin-inline: 16px;
  }
}

@media (max-width: 480px) {
  .sub-tabs {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sub-tab {
    justify-content: center;
    padding-inline: 10px;
  }

  .cube-selector {
    width: 100%;

    select {
      flex: 1;
      max-width: none;
    }
  }

  .btn-manage {
    width: 100%;
  }

  .modal-overlay {
    padding: 8px;
  }

  .modal-content {
    max-height: calc(100dvh - 16px);
  }

  .cube-item {
    align-items: flex-start;
    gap: 10px;
  }

  .cube-info {
    min-width: 0;
  }

  .cube-name {
    overflow-wrap: anywhere;
  }
}
</style>
