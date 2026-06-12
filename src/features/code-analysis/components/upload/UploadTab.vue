<script setup lang="ts">
import { logger } from '@/utils/logger'
import { ref, computed, nextTick, watch } from 'vue'
import { useAnalyzerStore } from '@/features/code-analysis/analyzer'
import { useSessionStore } from '@/shared/stores/session'
import { storeToRefs } from 'pinia'
import DropZone from './DropZone.vue'
import UploadModal from './UploadModal.vue'
import UploadTree from './UploadTree.vue'
import JsonViewer from './JsonViewer.vue'
import DataConfirmModal from '@/shared/components/DataConfirmModal.vue'
import type { DataAction } from '@/shared/components/DataConfirmModal.vue'
import { buildUploadTreeFromUploadedFiles, uniqueFilesByRelPath } from '@/utils/upload'
import { IconFolder, IconDatabase, IconFile, IconFolderOpen, IconLightbulb, IconSettings, IconX, IconPlay, IconTrash } from '@/shared/icons'

const projectStore = useAnalyzerStore()
const sessionStore = useSessionStore()
const { 
  uploadedFiles, 
  uploadedDdlFiles,
  isProcessing,
  showDataConfirmModal,
  pendingNodeCount,
  isPathMode,
  projectRoot
} = storeToRefs(projectStore)

// 인제스천 재시작
const handleRestartPipeline = async () => {
  try {
    await projectStore.restartPipeline()
  } catch (error) {
    logger.error('인제스천 실패:', error)
  }
}

// 경로 모드(Electron): host가 준 로컬 폴더를 바로 분석
const handleAnalyzePath = async () => {
  try {
    await projectStore.analyzeProjectPath()
  } catch (error) {
    logger.error('경로 분석 실패:', error)
  }
}

// 프로세싱 시작 시 그래프 탭으로 바로 이동 (실시간 그래프 렌더링)
watch(isProcessing, (processing) => {
  if (processing) {
    sessionStore.setActiveTab('graph')
  }
})

// 업로드된 파일을 트리 구조로 표시
const uploadedFileTree = computed(() => 
  buildUploadTreeFromUploadedFiles(uploadedFiles.value)
)
const uploadedDdlTree = computed(() => 
  buildUploadTreeFromUploadedFiles(uploadedDdlFiles.value)
)
const selectedRelPath = ref<string | null>(null)

const showModal = ref(false)
const pendingFiles = ref<File[]>([])

// 열린 탭 관리
interface OpenTab {
  id: string
  fileName: string
  content: string
  type: 'file'
}

const openTabs = ref<OpenTab[]>([])
const activeTabId = ref<string | null>(null)

const activeTab = computed(() => 
  openTabs.value.find(t => t.id === activeTabId.value) || null
)

// 하이라이팅할 라인 번호
const highlightedLine = ref<number | null>(null)

// JSON 파일 여부 확인
const isJsonFile = computed(() => 
  activeTab.value?.fileName.toLowerCase().endsWith('.json') || false
)

const hasUploadedFiles = computed(() => 
  uploadedFiles.value.length > 0 || uploadedDdlFiles.value.length > 0
)

// 드롭존 클릭 시 - 빈 상태로 모달 열기
const handleOpenModal = () => {
  pendingFiles.value = []
  showModal.value = true
}

// 파일 드롭 시 - 모달 열기 (언어는 파싱 단계에서 antlr 가 자동 감지)
const handleFilesDrop = (files: File[]) => {
  pendingFiles.value = files
  showModal.value = true
}

// 모달에서 파일 추가 시
const handleAddFiles = (files: File[]) => {
  const merged = uniqueFilesByRelPath([...pendingFiles.value, ...files])
  pendingFiles.value = merged
}

// 모달에서 파일 목록 업데이트 시 (삭제/추가 후 동기화)
const handleFilesUpdated = (updatedFiles: File[]) => {
  pendingFiles.value = updatedFiles
}

// 업로드 확인
const handleUploadConfirm = async (metadata: { datasource?: any; inferFkRelations?: boolean }) => {
  showModal.value = false

  if (pendingFiles.value.length === 0) {
    alert('업로드할 파일이 없습니다. 파일을 먼저 추가해주세요.')
    return
  }

  // 데이터 소스 이름 설정 (있는 경우)
  if (metadata.datasource) {
    projectStore.setDatasourceName(metadata.datasource.name)
  }
  
  // FK 관계 자동 추론 옵션 설정
  projectStore.setInferFkRelations(metadata.inferFkRelations ?? false)
  
  try {
    await projectStore.uploadFiles(pendingFiles.value, projectStore.analyzeMeta)
  } catch (error) {
    alert(`업로드 실패: ${error}`)
  }
}

// 트리에서 파일 선택 (탭으로 열기)
const handleTreeSelect = (relPath: string) => {
  selectedRelPath.value = relPath
  
  // 파일 노드 찾기
  const findFileNode = (node: any, targetRelPath: string): any => {
    if (node.relPath === targetRelPath && node.type === 'file') {
      return node
    }
    for (const child of node.children || []) {
      const found = findFileNode(child, targetRelPath)
      if (found) return found
    }
    return null
  }
  
  const fileNode = findFileNode(uploadedFileTree.value, relPath) || 
                   findFileNode(uploadedDdlTree.value, relPath)
  
  if (!fileNode || !fileNode.fileContent) return
  
  const fileName = fileNode.relPath || fileNode.name
  const tabId = `file-${fileName}`
  
  // 이미 열려있으면 해당 탭으로 이동
  const existing = openTabs.value.find(t => t.id === tabId)
  if (existing) {
    activeTabId.value = tabId
    return
  }
  
  // 새 탭 추가
  openTabs.value.push({
    id: tabId,
    fileName,
    content: fileNode.fileContent,
    type: 'file'
  })
  activeTabId.value = tabId
}

// 파일 삭제 핸들러
const handleRemoveFile = (relPath: string) => {
  projectStore.removeFile(relPath, 'file')
  // 열려있는 탭도 닫기
  const tabId = `file-${relPath}`
  const tabIndex = openTabs.value.findIndex(t => t.id === tabId)
  if (tabIndex !== -1) {
    openTabs.value.splice(tabIndex, 1)
    if (activeTabId.value === tabId) {
      activeTabId.value = openTabs.value[0]?.id || null
    }
  }
}

// DDL 파일 삭제 핸들러
const handleRemoveDdlFile = (relPath: string) => {
  projectStore.removeFile(relPath, 'ddl')
  // 열려있는 탭도 닫기
  const tabId = `file-${relPath}`
  const tabIndex = openTabs.value.findIndex(t => t.id === tabId)
  if (tabIndex !== -1) {
    openTabs.value.splice(tabIndex, 1)
    if (activeTabId.value === tabId) {
      activeTabId.value = openTabs.value[0]?.id || null
    }
  }
}

// 모든 파일 삭제 핸들러
const handleClearAllFiles = () => {
  if (!confirm('모든 파일을 삭제하시겠습니까?')) return
  projectStore.clearAllFiles('file')
  // 모든 탭 닫기
  openTabs.value = []
  activeTabId.value = null
}

// 모든 DDL 파일 삭제 핸들러
const handleClearAllDdlFiles = () => {
  if (!confirm('모든 DDL 파일을 삭제하시겠습니까?')) return
  projectStore.clearAllFiles('ddl')
  // 모든 탭 닫기
  openTabs.value = []
  activeTabId.value = null
}

// 탭 닫기
const closeTab = (tabId: string) => {
  const index = openTabs.value.findIndex(t => t.id === tabId)
  if (index === -1) return
  
  openTabs.value.splice(index, 1)
  
  // 활성 탭이 닫히면 다른 탭으로 이동
  if (activeTabId.value === tabId) {
    if (openTabs.value.length > 0) {
      activeTabId.value = openTabs.value[Math.max(0, index - 1)].id
    } else {
      activeTabId.value = null
    }
  }
}

// 뷰어 콘텐츠 ref
const viewerContentRef = ref<HTMLElement>()

// 탭 활성화
const activateTab = (tabId: string) => {
  activeTabId.value = tabId
  // 탭 전환 시 스크롤 맨 위로
  nextTick(() => {
    viewerContentRef.value?.scrollTo(0, 0)
  })
}

// 파일 경로 또는 프로시저 이름으로 파일 찾기
const findFileByPathOrName = (
  fileName?: string, 
  fileDirectory?: string, 
  procedureName?: string
) => {
  // 트리에서 파일 노드들을 재귀적으로 찾기
  const findAllFileNodes = (node: any, result: any[] = []): any[] => {
    if (node.type === 'file') {
      result.push(node)
    }
    for (const child of node.children || []) {
      findAllFileNodes(child, result)
    }
    return result
  }
  
  const allFiles = [
    ...findAllFileNodes(uploadedFileTree.value),
    ...findAllFileNodes(uploadedDdlTree.value)
  ]
  
  // 1. 파일 경로(directory)로 정확히 매칭
  if (fileDirectory) {
    const normalizedDir = fileDirectory.toLowerCase()
    for (const file of allFiles) {
      const filePath = (file.relPath || file.name).toLowerCase()
      // 파일 경로가 directory와 일치하거나 끝나는 경우
      if (filePath === normalizedDir || 
          filePath.endsWith(normalizedDir) ||
          normalizedDir.endsWith(filePath)) {
        logger.debug(`파일 찾음 (directory 매칭): ${filePath}`)
        return file
      }
    }
  }
  
  // 2. 파일명으로 매칭
  if (fileName) {
    const normalizedFileName = fileName.toLowerCase()
    for (const file of allFiles) {
      const filePathName = (file.relPath || file.name).split('/').pop()?.toLowerCase() || ''
      if (filePathName === normalizedFileName) {
        logger.debug(`파일 찾음 (fileName 매칭): ${file.relPath || file.name}`)
        return file
      }
    }
  }
  
  // 3. 프로시저 이름으로 매칭 (fallback)
  if (procedureName) {
    const normalizedProcName = procedureName.toLowerCase()
    for (const file of allFiles) {
      const filePathName = (file.relPath || file.name).split('/').pop() || ''
      const fileNameWithoutExt = filePathName.replace(/\.[^.]+$/, '').toLowerCase()
      
      if (fileNameWithoutExt === normalizedProcName || 
          fileNameWithoutExt.includes(normalizedProcName) ||
          normalizedProcName.includes(fileNameWithoutExt)) {
        logger.debug(`파일 찾음 (procedureName 매칭): ${file.relPath || file.name}`)
        return file
      }
    }
  }
  
  logger.warn(`파일을 찾을 수 없음: fileName=${fileName}, directory=${fileDirectory}, procedure=${procedureName}`)
  return null
}

// 프로시저 파일 열기 및 라인 하이라이팅
const openProcedureFile = (
  procedureName: string, 
  lineNumber: number,
  fileName?: string,
  fileDirectory?: string
) => {
  const fileNode = findFileByPathOrName(fileName, fileDirectory, procedureName)
  
  if (!fileNode || !fileNode.fileContent) {
    logger.warn(`프로시저 파일을 찾을 수 없습니다: ${procedureName}`)
    return false
  }
  
  const fileFullName = fileNode.relPath || fileNode.name
  const tabId = `file-${fileFullName}`
  
  // 이미 열려있으면 해당 탭으로 이동
  const existing = openTabs.value.find(t => t.id === tabId)
  if (existing) {
    activeTabId.value = tabId
  } else {
    // 새 탭 추가
    openTabs.value.push({
      id: tabId,
      fileName: fileFullName,
      content: fileNode.fileContent,
      type: 'file'
    })
    activeTabId.value = tabId
  }
  
  // 라인 하이라이팅 설정 (영구 유지)
  highlightedLine.value = lineNumber
  
  // DOM 업데이트 후 해당 라인으로 스크롤
  nextTick(() => {
    scrollToHighlightedLine()
  })
  
  return true
}

// 하이라이팅된 라인으로 스크롤
const scrollToHighlightedLine = () => {
  if (!highlightedLine.value || !viewerContentRef.value) return
  
  const lineElement = viewerContentRef.value.querySelector(`.code-line[data-line="${highlightedLine.value}"]`)
  if (lineElement) {
    lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// pendingSourceNavigation 감지
watch(
  () => sessionStore.pendingSourceNavigation,
  (navigation) => {
    if (navigation && sessionStore.activeTab === 'upload') {
      const navData = sessionStore.consumeSourceNavigation()
      if (navData && navData.procedureName && navData.lineNumber) {
        // 약간의 지연 후 파일 열기 (탭 전환 완료 대기)
        setTimeout(() => {
          openProcedureFile(
            navData.procedureName, 
            navData.lineNumber,
            navData.fileName,
            navData.fileDirectory
          )
        }, 100)
      }
    }
  },
  { immediate: true }
)

// 데이터 확인 모달 핸들러
const handleDataConfirmClose = () => {
  projectStore.handleDataConfirmAction('cancel')
}

const handleDataConfirmAction = async (action: DataAction, nameCase: 'original' | 'uppercase' | 'lowercase' = 'original') => {
  try {
    await projectStore.handleDataConfirmAction(action, nameCase)
  } catch (error) {
    alert(`처리 실패: ${error}`)
  }
}

</script>

<template>
  <div class="upload-tab">
    <div class="upload-main">
      <!-- 좌측: (경로 모드) 폴더 분석 / (업로드 모드) 드롭존 또는 파일·DDL 목록 -->
      <div class="upload-left">
        <!-- 경로 모드(Electron): host가 준 로컬 폴더를 업로드 없이 바로 분석 -->
        <template v-if="isPathMode">
          <div class="path-mode-panel">
            <div class="path-mode-header">
              <IconFolder :size="18" />
              <span>로컬 폴더 분석</span>
            </div>
            <div class="path-mode-path" :title="projectRoot || ''">{{ projectRoot }}</div>
            <button
              class="btn btn--primary path-mode-btn"
              @click="handleAnalyzePath"
              :disabled="isProcessing"
            >
              <IconPlay :size="16" />
              <span>{{ isProcessing ? '분석 중...' : '분석 시작' }}</span>
            </button>
            <p class="path-mode-hint">이 폴더를 직접 분석합니다 (업로드 없음 · 언어 자동 감지).</p>
          </div>
        </template>

        <template v-else-if="!hasUploadedFiles">
          <DropZone
            @files-drop="handleFilesDrop"
            @open-modal="handleOpenModal"
          />
          
          <!-- 업로드 가이드 -->
          <div class="upload-guide">
            <div class="guide-header">
              <IconLightbulb :size="16" class="guide-icon" />
              <span class="guide-title">사용 가이드</span>
            </div>
            <div class="guide-content">
              <div class="guide-item">
                <span class="guide-step">1</span>
                <div class="guide-text">
                  <span class="guide-text-main">프로젝트 폴더 업로드</span>
                  <span class="guide-text-detail">업로드 시 자동 분석 절차가 진행됩니다</span>
                </div>
              </div>
              <div class="guide-item">
                <span class="guide-step">2</span>
                <div class="guide-text">
                  <span class="guide-text-main">그래프 시각화</span>
                  <span class="guide-text-detail">그래프 탭에서 여러가지 시각화된 자료를 확인할 수 있습니다</span>
                </div>
              </div>
              <div class="guide-item">
                <span class="guide-step">3</span>
                <div class="guide-text">
                  <span class="guide-text-main">자연어 질의 활용</span>
                  <span class="guide-text-detail">자연어 질의 탭에서 자연어로 SQL 쿼리를 생성할 수 있습니다</span>
                </div>
              </div>
            </div>
            <div class="guide-tips">
              <div class="tip-item">
                <IconSettings :size="12" class="tip-icon" />
                <span class="tip-label">설정:</span>
                <span class="tip-text">상단에서 소스/타겟 타입 선택, 설정 아이콘에서 노드 제한 및 UML 깊이 조정</span>
              </div>
            </div>
          </div>
        </template>
        
        <!-- 파일 업로드 후: Files/DDL 2영역 분리 -->
        <template v-else>
          <aside class="sidebar">
            <!-- 인제스천 시작 버튼 -->
            <div class="ingest-action">
              <button 
                class="btn btn--primary ingest-btn"
                @click="handleRestartPipeline"
                :disabled="isProcessing"
              >
                <IconPlay :size="16" />
                <span>{{ isProcessing ? '처리 중...' : '인제스천 시작' }}</span>
              </button>
            </div>
            
            <!-- 파일 트리 패널 -->
            <section class="files-panel">
              <div class="panel-header">
                <IconFolder :size="14" />
                <h3 class="panel-title">파일 ({{ uploadedFiles.length }})</h3>
                <button 
                  v-if="uploadedFiles.length > 0"
                  class="clear-all-btn"
                  @click="handleClearAllFiles"
                  title="모든 파일 삭제"
                >
                  <IconTrash :size="12" />
                </button>
              </div>
              <UploadTree
                v-if="uploadedFiles.length > 0"
                :root="uploadedFileTree"
                :show-header="false"
                :selected-rel-path="selectedRelPath"
                :enable-dn-d="false"
                :show-remove-button="true"
                @select="handleTreeSelect"
                @remove="handleRemoveFile"
              />
              <div v-else class="empty-section">파일 없음</div>
            </section>
            
            <!-- DDL 패널 -->
            <section class="ddl-panel">
              <div class="panel-header">
                <IconDatabase :size="14" />
                <h3 class="panel-title">DDL ({{ uploadedDdlFiles.length }})</h3>
                <button 
                  v-if="uploadedDdlFiles.length > 0"
                  class="clear-all-btn"
                  @click="handleClearAllDdlFiles"
                  title="모든 DDL 파일 삭제"
                >
                  <IconTrash :size="12" />
                </button>
              </div>
              <div class="ddl-content">
                <UploadTree
                  v-if="uploadedDdlFiles.length > 0"
                  :root="uploadedDdlTree"
                  :show-header="false"
                  :selected-rel-path="selectedRelPath"
                  :enable-dn-d="false"
                  :show-remove-button="true"
                  @select="handleTreeSelect"
                  @remove="handleRemoveDdlFile"
                />
                <div v-else class="empty-section">DDL 파일 없음</div>
              </div>
            </section>
          </aside>
        </template>
      </div>
      
      <!-- 우측: 탭 형식 파일 뷰어 -->
      <div class="upload-right">
        <!-- 탭 헤더 -->
        <div class="tabs-header" v-if="openTabs.length > 0">
          <div 
            v-for="tab in openTabs" 
            :key="tab.id"
            class="tab-item"
            :class="{ active: activeTabId === tab.id }"
            @click="activateTab(tab.id)"
          >
            <IconFile :size="14" class="tab-icon" />
            <span class="tab-name" :title="tab.fileName">{{ tab.fileName }}</span>
            <button class="tab-close" @click.stop="closeTab(tab.id)">
              <IconX :size="12" />
            </button>
          </div>
        </div>
        
        <!-- 탭 콘텐츠 -->
        <div class="viewer-content" ref="viewerContentRef" :class="{ 'has-content': activeTab }">
          <template v-if="activeTab">
            <div class="content-wrapper">
              <!-- JSON 파일 -->
              <JsonViewer v-if="isJsonFile" :json="activeTab.content" />
              <!-- 코드 파일 (라인 번호 및 하이라이팅 지원) -->
              <div v-else class="code-viewer-with-lines">
                <div 
                  v-for="(line, index) in activeTab.content.split('\n')" 
                  :key="index"
                  class="code-line"
                  :class="{ 'highlighted': highlightedLine === index + 1 }"
                  :data-line="index + 1"
                >
                  <span class="line-number">{{ index + 1 }}</span>
                  <span class="line-content">{{ line || ' ' }}</span>
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="empty-state">
              <IconFolderOpen :size="48" class="empty-icon" />
              <p>파일을 선택하면 내용이 여기에 표시됩니다</p>
            </div>
          </template>
        </div>
      </div>
    </div>
    
    <!-- 업로드 모달 -->
    <UploadModal
      v-if="showModal"
      :initial-files="pendingFiles"
      @confirm="handleUploadConfirm"
      @cancel="showModal = false"
      @add-files="handleAddFiles"
      @files-updated="handleFilesUpdated"
    />
    
    <!-- 데이터 확인 모달 -->
    <DataConfirmModal
      :is-open="showDataConfirmModal"
      :node-count="pendingNodeCount"
      @close="handleDataConfirmClose"
      @confirm="handleDataConfirmAction"
    />
  </div>
</template>

<style lang="scss" scoped>
.upload-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-md);
  gap: var(--spacing-md);
  overflow: hidden;
  background: var(--color-bg);
  position: relative;
}

.path-mode-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  height: 100%;
  padding: 40px;
  text-align: center;
}

.path-mode-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.path-mode-path {
  max-width: 100%;
  padding: 10px 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: monospace;
  font-size: 13px;
  color: var(--color-text-light);
  word-break: break-all;
}

.path-mode-hint {
  font-size: 12px;
  color: var(--color-text-light);
  margin: 0;
}

.upload-main {
  flex: 1;
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: var(--spacing-md);
  overflow: hidden;
  min-height: 0;
}

.upload-left {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  overflow: hidden;
  min-height: 0;
  
  .drop-zone {
    flex: 1;
    min-height: 0;
  }
  
  .upload-guide {
    flex: 1;
    min-height: 0;
  }
}

// ============================================================================
// 사이드바 레이아웃 (Files/DDL 2영역 분리)
// ============================================================================

.ingest-action {
  padding: 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.ingest-btn {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.files-panel {
  flex: 1 1 50%;
  min-height: 200px;
  max-height: 75%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  
  .panel-header {
    flex-shrink: 0;
    padding: 10px 12px;
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-light);
  }
  
  .panel-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    flex: 1;
  }
  
  .clear-all-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s ease;
    
    &:hover {
      background: var(--color-error);
      color: white;
    }
  }
  
  :deep(.tree) {
    flex: 1;
    min-height: 0;
    border: none;
    border-radius: 0;
    
    .tree-list {
      overflow: auto;
      flex: 1;
      min-height: 0;
    }
  }
}

.ddl-panel {
  flex: 1 1 50%;
  min-height: 200px;
  max-height: 75%;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--color-border);
  
  .panel-header {
    flex-shrink: 0;
    padding: 10px 12px;
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-light);
  }
  
  .panel-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    flex: 1;
  }
  
  .clear-all-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s ease;
    
    &:hover {
      background: var(--color-error);
      color: white;
    }
  }
  
  .ddl-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    
    :deep(.tree) {
      border: none;
      border-radius: 0;
      min-height: auto;
      
      .tree-list {
        overflow: auto;
      }
    }
  }
}

.upload-guide {
  padding: 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  min-height: 0;
  
  // 커스텀 스크롤바 스타일
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
    
    &:hover {
      background: var(--color-text-light);
    }
  }
  
  // Firefox
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
  
  .guide-header {
    display: flex;
    align-items: center;
    gap: 8px;
    
    .guide-icon {
      color: var(--color-warning);
    }
    
    .guide-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text-bright);
    }
  }
  
  .guide-content {
    display: flex;
    flex-direction: column;
    gap: 14px;
    
    .guide-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      
      .guide-step {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hover));
        color: white;
        border-radius: var(--radius-sm);
        font-size: 12px;
        font-weight: 600;
        flex-shrink: 0;
        margin-top: 1px;
      }
      
      .guide-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 5px;
        
        .guide-text-main {
          font-size: 13px;
          color: var(--color-text);
          font-weight: 600;
        }
        
        .guide-text-detail {
          font-size: 11px;
          color: var(--color-text-light);
          line-height: 1.4;
        }
      }
    }
  }
  
  .guide-tips {
    padding-top: 6px;
    margin-top: 6px;
    border-top: 1px solid var(--color-border);
    
    .tip-item {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      font-size: 11px;
      color: var(--color-text-light);
      line-height: 1.5;
      
      .tip-icon {
        flex-shrink: 0;
        margin-top: 2px;
      }
      
      .tip-label {
        font-weight: 600;
        color: var(--color-text);
        flex-shrink: 0;
      }
      
      .tip-text {
        flex: 1;
      }
    }
  }
}

.file-lists {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  overflow-y: auto;
}

.file-section {
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
  margin: 0;
  
  .icon {
    font-size: 16px;
  }
}

.btn-add {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent);
  border: none;
  border-radius: var(--radius-sm);
  color: white;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  
  &:hover {
    background: var(--color-accent-hover);
  }
  
  &:active {
    background: var(--color-accent-hover);
  }
}

.btn-add-sm {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }
  
  &:active {
    background: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }
}

.file-count {
  font-size: 11px;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: 10px;
}

.empty-section {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--spacing-md);
}


.upload-right {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  min-height: 0;
  height: 100%;
}

.tabs-header {
  display: flex;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  max-width: 100%;
  
  // 스크롤바 표시 (연한 색상)
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
  
  &::-webkit-scrollbar {
    height: 4px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 2px;
    
    &:hover {
      background: var(--color-text-light);
    }
  }
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-right: 1px solid var(--color-border);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
  background: var(--color-bg-tertiary);
  flex-shrink: 0;
  min-width: 0;
  max-width: 200px;
  
  &:hover {
    background: var(--color-bg-elevated);
  }
  
  &.active {
    background: var(--color-bg-secondary);
    border-bottom: 2px solid var(--color-accent);
    margin-bottom: -1px;
    
    .tab-icon {
      color: var(--color-accent);
    }
    
    .tab-name {
      color: var(--color-accent);
    }
  }
}

.tab-icon {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.tab-name {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-light);
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.tab-close {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  
  &:hover {
    background: rgba(250, 82, 82, 0.15);
    color: var(--color-error);
  }
}

.viewer-content {
  flex: 1;
  overflow: auto;
  padding: var(--spacing-md);
  min-height: 0;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  
  &.has-content {
    align-items: flex-start;
    justify-content: flex-start;
  }
  
  // 스크롤바 항상 표시
  &::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  
  &::-webkit-scrollbar-track {
    background: var(--color-bg-tertiary);
    border-radius: 5px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 5px;
    border: 2px solid transparent;
    background-clip: padding-box;
    
    &:hover {
      background: var(--color-text-light);
      background-clip: padding-box;
    }
  }
}

.content-wrapper {
  width: 100%;
  max-width: 100%;
}

.code-viewer {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  width: 100%;
  max-width: 100%;
  
  code {
    color: var(--color-text);
  }
}

.code-viewer-with-lines {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  width: 100%;
}

.code-line {
  display: flex;
  padding: 0 8px;
  transition: background 0.3s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  
  &.highlighted {
    background: rgba(56, 189, 248, 0.3);
    border-left: 3px solid #38bdf8;
    
    .line-number {
      color: #38bdf8;
      font-weight: 600;
      opacity: 1;
    }
    
    .line-content {
      color: var(--color-text);
    }
  }
}

.line-number {
  min-width: 50px;
  padding-right: 16px;
  text-align: right;
  color: var(--color-text-muted);
  user-select: none;
  opacity: 0.5;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  margin-right: 16px;
}

.line-content {
  white-space: pre;
  color: var(--color-text);
  flex: 1;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-light);
  gap: var(--spacing-md);
  
  .empty-icon {
    opacity: 0.3;
  }
  
  p {
    font-size: 14px;
  }
}

</style>
