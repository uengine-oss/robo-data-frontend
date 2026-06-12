<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import type { ComputedRef } from 'vue'
import UploadTree from './UploadTree.vue'
import AddMenu from './AddMenu.vue'
import type { SourceType } from '@/types'
import type { DetectTypesResponse } from '@/features/code-analysis/api'
import { buildUploadTree, collectAllFolderPaths, forceWebkitRelativePath, getNormalizedUploadPath, getParentFolderRelPath, mapPickedFilesToTarget, moveRelPathToFolder, normalizeSlashes, resolveSelectedTargetFolder, splitPath, type UploadTreeNode, uniqueFilesByRelPath } from '@/utils/upload'
import { IconFolder, IconX, IconCheck, IconAlertTriangle, IconLoader } from '@/shared/icons'
import { useDatasourcesStore, type DataSource } from '@/features/datasources/datasources'

interface Props {
  initialFiles?: File[]
  /** 자동 감지된 파일 타입 정보 */
  detectedTypes?: DetectTypesResponse | null
  /** 타입 감지 중 여부 */
  isDetecting?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  confirm: [metadata: { sourceType: SourceType; datasource?: DataSource | null; inferFkRelations?: boolean }]
  cancel: []
  'add-files': [files: File[], reanalyze: boolean]
  'files-updated': [files: File[]]
}>()
const files = ref<File[]>([...(props.initialFiles || [])])
const sourceType = ref<SourceType>('java')
// 사용자가 수동으로 소스 타입을 변경했는지 추적
const userManuallySelectedType = ref(false)

// 데이터 소스 스토어
const datasourcesStore = useDatasourcesStore()
const selectedDatasource = ref<DataSource | null>(null)
const showDatasourceSelector = ref(false)
const showAddDatasourceModal = ref(false)
const newDatasourceType = ref<any>(null)
const newDatasourceForm = ref<Record<string, any>>({})
const newDatasourceName = ref('')
const isCreatingDatasource = ref(false)

// FK 관계 자동 추론 옵션 (기본: false - 시간이 오래 걸릴 수 있음)
const inferFkRelations = ref(false)

// 데이터 소스 아이콘
const datasourceIcons: Record<string, string> = {
  mysql: '🐬',
  postgresql: '🐘',
  postgres: '🐘',
  neo4j: '🔵',
  mongodb: '🍃',
}

// 데이터 소스 목록 로드
onMounted(async () => {
  await datasourcesStore.fetchDatasources()
})

// 자동 감지 결과 표시용
const autoDetectedType = ref<SourceType | null>(null)
const detectionConfidence = ref<string>('')

// 자동 감지 결과가 오면 sourceType 자동 설정 (사용자 수동 선택 존중)
watch(() => props.detectedTypes, (detected) => {
  if (detected?.summary) {
    const suggested = detected.summary.suggestedTarget as SourceType
    // 사용자가 이미 수동으로 선택한 경우 자동 감지로 덮어쓰지 않음
    if (!userManuallySelectedType.value) {
      sourceType.value = suggested
    }
    autoDetectedType.value = suggested
    
    // 신뢰도 계산 (상위 타입 비율)
    const total = detected.summary.total
    const byType = detected.summary.byType
    const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0]
    if (topType) {
      const ratio = Math.round((topType[1] / total) * 100)
      detectionConfidence.value = `${topType[0]} ${ratio}%`
    }
  }
}, { immediate: true })

// 데이터 소스 추가 모달 열기
async function openAddDatasourceModal() {
  showDatasourceSelector.value = false
  showAddDatasourceModal.value = true
  newDatasourceType.value = null
  newDatasourceForm.value = {}
  newDatasourceName.value = ''
  
  // 타입이 없으면 로드
  if (datasourcesStore.datasourceTypes.length === 0) {
    await datasourcesStore.fetchTypes()
  }
}

// 기본 데이터 소스 타입 (API 연결 안될 때 사용)
const defaultDatasourceTypes = [
  {
    type: 'postgres',
    display_name: 'PostgreSQL',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
      { name: 'port', label: 'Port', type: 'number', required: true, default: 5432 },
      { name: 'user', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'database', label: 'Database', type: 'text', required: true }
    ]
  },
  {
    type: 'mysql',
    display_name: 'MySQL',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
      { name: 'port', label: 'Port', type: 'number', required: true, default: 3306 },
      { name: 'user', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'database', label: 'Database', type: 'text', required: true }
    ]
  },
  {
    type: 'neo4j',
    display_name: 'Neo4j',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
      { name: 'port', label: 'Port', type: 'number', required: true, default: 7687 },
      { name: 'user', label: 'Username', type: 'text', required: true, default: 'neo4j' },
      { name: 'password', label: 'Password', type: 'password', required: true }
    ]
  },
  {
    type: 'mongodb',
    display_name: 'MongoDB',
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
      { name: 'port', label: 'Port', type: 'number', required: true, default: 27017 },
      { name: 'user', label: 'Username', type: 'text', required: false },
      { name: 'password', label: 'Password', type: 'password', required: false },
      { name: 'database', label: 'Database', type: 'text', required: true }
    ]
  }
]

// 사용할 데이터 소스 타입 목록
const availableDatasourceTypes = computed(() => {
  return datasourcesStore.datasourceTypes.length > 0 
    ? datasourcesStore.datasourceTypes 
    : defaultDatasourceTypes
})

// 데이터 소스 타입 선택
function selectDatasourceType(type: any) {
  newDatasourceType.value = type
  newDatasourceForm.value = {}
  // 기본값 설정
  type.fields?.forEach((field: any) => {
    if (field.default !== undefined) {
      newDatasourceForm.value[field.name] = field.default
    }
  })
}

// 데이터 소스 생성
async function createNewDatasource() {
  if (!newDatasourceType.value || !newDatasourceName.value) return
  
  isCreatingDatasource.value = true
  const success = await datasourcesStore.createDatasource(
    newDatasourceName.value,
    newDatasourceType.value.type,
    newDatasourceForm.value
  )
  isCreatingDatasource.value = false
  
  if (success) {
    // 새로 생성된 데이터 소스 선택
    await datasourcesStore.fetchDatasources()
    const newDs = datasourcesStore.datasources.find(ds => ds.name === newDatasourceName.value)
    if (newDs) {
      selectedDatasource.value = newDs
    }
    showAddDatasourceModal.value = false
  }
}

const folderInput = ref<HTMLInputElement>()
const fileInput = ref<HTMLInputElement>()
const ddlFolderInput = ref<HTMLInputElement>()
const ddlFileInput = ref<HTMLInputElement>()

// 패널별 선택 상태 분리 - 각 패널에서 독립적으로 선택 관리
const fileSelectedRelPath = ref<string | null>(null)
const ddlSelectedRelPath = ref<string | null>(null)

// 빈 폴더 유지를 위한 상태 (파일 삭제 후에도 상위 폴더 유지)
const emptyFolders = ref<Set<string>>(new Set())

// 파일 존재 여부
const hasFiles = computed(() => files.value.length > 0)

// 전체 파일 수
const totalFileCount = computed(() => files.value.length)

// 소스 타입 옵션 (antlr-code-parser에서 지원하는 타입만)
const sourceTypeOptions: { value: SourceType; label: string }[] = [
  { value: 'java', label: 'Java' },
  { value: 'python', label: 'Python' },
  { value: 'c', label: 'C' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'oracle', label: 'Oracle' }
]

// 파일 확장자로 소스 타입 자동 감지
const detectSourceType = (files: File[]): SourceType | null => {
  if (files.length === 0) return null
  
  const extensions = files.map(f => {
    const name = f.name.toLowerCase()
    if (name.endsWith('.sql')) return 'sql'
    if (name.endsWith('.java')) return 'java'
    if (name.endsWith('.py')) return 'python'
    if (name.endsWith('.c') || name.endsWith('.h')) return 'c'
    return 'other'
  })

  const hasJava = extensions.includes('java')
  const hasPython = extensions.includes('python')
  const hasC = extensions.includes('c')
  const hasSql = extensions.includes('sql')

  // Java 파일이 있으면 Java
  if (hasJava) return 'java'
  // C 파일이 있으면 C
  if (hasC) return 'c'
  // Python 파일이 있으면 Python
  if (hasPython) return 'python'
  // SQL 파일만 있으면 null (사용자가 PostgreSQL/Oracle 선택해야 함)
  if (hasSql && !hasJava && !hasPython) return null
  
  return null
}

// 파일이 변경되면 자동으로 소스 타입 감지 (초기 설정만, 사용자 수동 선택 존중)
watch(files, (newFiles) => {
  if (newFiles.length === 0) return
  // 사용자가 이미 수동으로 소스 타입을 선택한 경우 자동 감지로 덮어쓰지 않음
  if (userManuallySelectedType.value) return
  
  const detected = detectSourceType(newFiles)
  // 자동 감지가 가능한 경우(Java/Python/C)에 자동 설정
  // SQL인 경우는 사용자가 직접 PostgreSQL/Oracle 선택해야 함
  if (detected && detected !== 'oracle' && detected !== 'postgresql') {
    sourceType.value = detected
  }
}, { deep: true })

// 유효성 검사: 파일만 있으면 업로드 가능하도록 변경
const isValid = computed(() => hasFiles.value)

// 유효성 오류 메시지
const validationError = computed(() => {
  if (!hasFiles.value) return '파일을 추가해주세요'
  return ''
})

// 감지된 타입 포맷팅 함수
const formatDetectedTypes = (byType: Record<string, number>): string => {
  const typeLabels: Record<string, string> = {
    java: 'Java',
    c: 'C',
    oracle_sp: 'Oracle SP',
    oracle_ddl: 'Oracle DDL',
    postgresql_sp: 'PostgreSQL SP',
    postgresql_ddl: 'PostgreSQL DDL',
    python: 'Python',
    xml: 'XML',
    sql_generic: 'SQL',
    unknown: '기타'
  }
  
  const entries = Object.entries(byType)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)  // 상위 3개만 표시
    .map(([type, count]) => `${typeLabels[type] || type} ${count}개`)
  
  return entries.join(', ')
}

// isDetecting prop을 로컬에서 사용
const isDetecting = computed(() => props.isDetecting ?? false)

// detectedTypes prop을 로컬에서 사용
const detectedTypes = computed(() => props.detectedTypes ?? null)

watch(() => props.initialFiles, (val) => {
  files.value = [...(val || [])]
}, { deep: true })

const tree = computed(() => buildUploadTree(files.value, emptyFolders.value))

const ddlTree = computed(() => {
  const root = tree.value
  const ddlNode = (root.children || []).find(n => n.type === 'folder' && n.relPath === 'ddl')
  
  // DDL은 폴더 구조를 무시하고 파일만 평탄화하여 표시
  const flattenDdlFiles = (node: UploadTreeNode): UploadTreeNode[] => {
    const files: UploadTreeNode[] = []
    if (node.type === 'file') {
      // relPath를 ddl/파일명 형태로 변환
      const parts = splitPath(node.relPath)
      const fileName = parts[parts.length - 1] || node.name
      return [{
        ...node,
        relPath: `ddl/${fileName}`,
        name: fileName
      }]
    }
    if (node.children) {
      for (const child of node.children) {
        files.push(...flattenDdlFiles(child))
      }
    }
    return files
  }
  
  const flatFiles = ddlNode ? flattenDdlFiles(ddlNode) : []
  
  return {
    type: 'folder' as const,
    name: 'ddl',
    relPath: 'ddl',
    children: flatFiles.sort((a, b) => a.name.localeCompare(b.name))
  }
})
const fileTree = computed(() => {
  const root = tree.value
  
  // ddl 폴더와 ddl로 시작하는 모든 경로를 제외
  const filterDdlFiles = (nodes: UploadTreeNode[]): UploadTreeNode[] => {
    return nodes.filter(n => {
      if (n.type === 'folder' && n.relPath === 'ddl') return false
      if (n.relPath && n.relPath.startsWith('ddl/')) return false
      return true
    }).map(n => {
      if (n.children && n.children.length > 0) {
        return { ...n, children: filterDdlFiles(n.children) }
      }
      return n
    })
  }
  
  const children = filterDdlFiles(root.children || [])
  return {
    type: 'folder' as const,
    name: root.name,
    relPath: '',
    children
  }
})
const mergeFiles = (incoming: File[]) => {
  const next = uniqueFilesByRelPath([...files.value, ...incoming])
  files.value = next
}

type PickKind = 'folder' | 'file'
type PanelKind = 'file' | 'ddl'

const applyPicked = (panel: PanelKind, kind: PickKind, picked: File[], input: HTMLInputElement) => {
  if (!picked.length) return

  // 각 패널은 자신의 선택 상태만 사용
  const selectedPath = panel === 'ddl' ? ddlSelectedRelPath.value : fileSelectedRelPath.value
  const panelTree = panel === 'ddl' ? ddlTree.value : fileTree.value
  
  // DDL 패널은 무조건 'ddl' 폴더로, 파일 패널은 해당 패널의 선택 상태 기준
  const targetFolder = panel === 'ddl' ? 'ddl' : resolveSelectedTargetFolder(panel, selectedPath, panelTree)
  const mapped = mapPickedFilesToTarget(panel, kind, picked, targetFolder)
  
  mergeFiles(mapped)
  emit('add-files', mapped, false)
  input.value = ''
}

// === 확인 ===
const handleConfirm = () => {
  if (!isValid.value) {
    alert(validationError.value)
    return
  }
  emit('confirm', {
    sourceType: sourceType.value,
    datasource: selectedDatasource.value,
    inferFkRelations: inferFkRelations.value
  })
}

const handleFolderSelect = (e: Event) => {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files || [])
  applyPicked('file', 'folder', picked, input)
}

const handleFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files || [])
  applyPicked('file', 'file', picked, input)
}

const handleDdlFolderSelect = (e: Event) => {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files || [])
  applyPicked('ddl', 'folder', picked, input)
}

const handleDdlFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files || [])
  applyPicked('ddl', 'file', picked, input)
}

const chooseFileAddFile = () => {
  fileInput.value?.click()
}

const chooseFileAddFolder = () => {
  folderInput.value?.click()
}

const chooseDdlAddFile = () => {
  ddlFileInput.value?.click()
}

const chooseDdlAddFolder = () => {
  ddlFolderInput.value?.click()
}

// 파일 패널 선택 핸들러
const handleFileTreeSelect = (relPath: string) => {
  fileSelectedRelPath.value = relPath
}

// DDL 패널 선택 핸들러
const handleDdlTreeSelect = (relPath: string) => {
  ddlSelectedRelPath.value = relPath
}

// 파일이 삭제 대상인지 확인하는 헬퍼 함수
const shouldRemoveFile = (fileRelPath: string, targetRelPath: string): boolean => {
  const normalizedFile = normalizeSlashes(fileRelPath)
  const normalizedTarget = normalizeSlashes(targetRelPath)
  
  // 정확한 경로 매칭 (파일 삭제)
  if (normalizedFile === normalizedTarget) return true
  
  // 하위 경로 제거 (폴더 삭제 시) - 정확히 하위 경로인지 확인
  if (normalizedFile.startsWith(normalizedTarget + '/')) return true
  
  // DDL 폴더 삭제 시
  if (normalizedTarget === 'ddl' && normalizedFile.startsWith('ddl/')) return true
  
  // DDL 평탄화 경로(ddl/파일명)인 경우 파일명으로 매칭
  if (normalizedTarget.startsWith('ddl/') && normalizedTarget !== 'ddl') {
    const fileName = normalizedTarget.replace(/^ddl\//, '')
    if (normalizedFile.startsWith('ddl/')) {
      const fileParts = splitPath(normalizedFile)
      return fileParts[fileParts.length - 1] === fileName
    }
  }
  
  return false
}

// 파일 트리에서 삭제 핸들러
const handleFileTreeRemove = (relPath: string) => {
  if (!relPath) return
  
  // 삭제 전 현재 트리의 모든 폴더 경로 수집 (상위 폴더 유지용)
  const currentFolders = collectAllFolderPaths(fileTree.value)
  
  // 삭제 대상이 아닌 파일만 유지
  files.value = files.value.filter(f => {
    const fileRelPath = getNormalizedUploadPath(f)
    return !shouldRemoveFile(fileRelPath, relPath)
  })
  
  // 삭제된 경로의 상위 폴더들을 emptyFolders에 추가 (빈 폴더 유지)
  const parentPath = getParentFolderRelPath(relPath)
  if (parentPath) {
    // 부모 경로와 그 상위 경로들도 유지
    const parts = splitPath(parentPath)
    for (let i = 1; i <= parts.length; i++) {
      const folderPath = parts.slice(0, i).join('/')
      if (currentFolders.has(folderPath)) {
        emptyFolders.value.add(folderPath)
      }
    }
  }
  
  // 삭제된 경로 자체가 폴더인 경우 emptyFolders에서도 제거
  emptyFolders.value.delete(relPath)
  // 삭제된 폴더의 하위 폴더들도 제거
  for (const folder of emptyFolders.value) {
    if (folder.startsWith(relPath + '/')) {
      emptyFolders.value.delete(folder)
    }
  }
  
  emit('files-updated', files.value)
  if (fileSelectedRelPath.value === relPath) fileSelectedRelPath.value = null
}

// DDL 트리에서 삭제 핸들러
const handleDdlTreeRemove = (relPath: string) => {
  if (!relPath) return
  
  files.value = files.value.filter(f => {
    const fileRelPath = getNormalizedUploadPath(f)
    return !shouldRemoveFile(fileRelPath, relPath)
  })
  
  emit('files-updated', files.value)
  if (ddlSelectedRelPath.value === relPath) ddlSelectedRelPath.value = null
}

const moveFileRelPath = (sourceRelPath: string, targetFolderRelPath: string) => {
  const target = moveRelPathToFolder(sourceRelPath, targetFolderRelPath)
  if (sourceRelPath === target) return

  const next = files.value.map((f) => {
    const p = getNormalizedUploadPath(f)
    if (p !== sourceRelPath) return f
    return forceWebkitRelativePath(f, target)
  })
  files.value = next
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">
          <IconFolder :size="18" class="title-icon" />
          업로드 설정
        </h2>
        <button class="close-btn" @click="emit('cancel')">
          <IconX :size="18" />
        </button>
      </div>
      
      <div class="modal-body">
        <!-- 상단: 데이터 소스 + 소스 타입 선택 -->
        <div class="top-row">
          <!-- 타겟 데이터 소스 선택 -->
          <div class="source-type-group">
            <label class="form-label form-label--compact">
              타겟 데이터 소스
            </label>
            <div class="datasource-selector">
              <button 
                v-if="!selectedDatasource" 
                class="datasource-btn datasource-btn--empty"
                @click="showDatasourceSelector = true"
              >
                <span class="ds-icon">🔌</span>
                <span class="ds-text">데이터 소스 선택</span>
                <span class="ds-chevron">▼</span>
              </button>
              <button 
                v-else 
                class="datasource-btn"
                @click="showDatasourceSelector = true"
              >
                <span class="ds-icon">{{ datasourceIcons[selectedDatasource.engine] || '📦' }}</span>
                <span class="ds-text">{{ selectedDatasource.display_name || selectedDatasource.name }}</span>
                <span class="ds-chevron">▼</span>
              </button>
              
              <!-- 데이터 소스 드롭다운 -->
              <div v-if="showDatasourceSelector" class="datasource-dropdown">
                <div class="dropdown-header">
                  <span>데이터 소스 선택</span>
                  <button class="dropdown-close" @click="showDatasourceSelector = false">✕</button>
                </div>
                <div class="dropdown-list">
                  <button
                    v-for="ds in datasourcesStore.sortedDatasources"
                    :key="ds.name"
                    class="dropdown-item"
                    :class="{ selected: selectedDatasource?.name === ds.name }"
                    @click="selectedDatasource = ds; showDatasourceSelector = false"
                  >
                    <span class="item-icon">{{ datasourceIcons[ds.engine] || '📦' }}</span>
                    <div class="item-info">
                      <span class="item-name">{{ ds.display_name || ds.name }}</span>
                      <span class="item-engine">{{ ds.engine }}</span>
                    </div>
                  </button>
                  <div v-if="!datasourcesStore.hasDatasources" class="dropdown-empty">
                    등록된 데이터 소스가 없습니다
                  </div>
                </div>
                <div class="dropdown-footer">
                  <a href="#" class="add-datasource-link" @click.prevent="openAddDatasourceModal">
                    + 새 데이터 소스 추가
                  </a>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 소스 타입 선택 -->
          <div class="source-type-group">
            <label class="form-label form-label--compact">
              소스 타입 <span class="required">*</span>
              <span v-if="isDetecting" class="detecting-badge">
                <IconLoader :size="12" /> 감지중...
              </span>
              <span v-else-if="autoDetectedType" class="auto-detected-badge" :title="`자동 감지: ${detectionConfidence}`">
                <IconCheck :size="12" /> 자동 감지됨
              </span>
            </label>
            <select 
              v-model="sourceType" 
              class="select select--compact"
              :class="{ 'auto-detected': autoDetectedType && sourceType === autoDetectedType }"
              @change="userManuallySelectedType = true"
            >
              <option v-for="option in sourceTypeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>
        
        <!-- FK 관계 자동 추론 옵션 -->
        <div class="options-row">
          <label class="checkbox-option" :title="'컬럼명 유사도와 샘플 데이터를 분석하여 FK 관계를 자동으로 추론합니다.\n⚠️ 테이블이 많을 경우 시간이 오래 걸릴 수 있습니다.'">
            <input type="checkbox" v-model="inferFkRelations" />
            <span class="checkbox-label">FK 관계 자동 추론</span>
            <span class="option-hint">(시간이 오래 걸릴 수 있음)</span>
          </label>
        </div>
        
        <!-- 시스템 개념은 UI에 노출하지 않음 -->
        <!-- 안내문은 하단 요약 영역에 표시 (가독성 위해 상단은 최소화) -->

        <div class="tree-split">
          <div class="tree-panel">
            <div class="panel-title-row">
              <div class="panel-title">파일</div>
              <div class="panel-actions">
                <AddMenu title="추가" @pickFile="chooseFileAddFile" @pickFolder="chooseFileAddFolder" />
              </div>
            </div>
            <UploadTree
              :root="fileTree"
              :show-header="false"
              :selected-rel-path="fileSelectedRelPath"
              :enable-dn-d="true"
              :show-remove-button="true"
              @select="handleFileTreeSelect"
              @remove="handleFileTreeRemove"
              @move="({ sourceRelPath, targetFolderRelPath }) => moveFileRelPath(sourceRelPath, targetFolderRelPath)"
            />
          </div>
          <div class="tree-panel">
            <div class="panel-title-row">
              <div class="panel-title">DDL</div>
              <div class="panel-actions">
                <AddMenu title="DDL 추가" @pickFile="chooseDdlAddFile" @pickFolder="chooseDdlAddFolder" />
              </div>
            </div>
            <UploadTree
              :root="ddlTree"
              :show-header="false"
              :show-root-as-node="(ddlTree.children?.length || 0) > 0"
              :selected-rel-path="ddlSelectedRelPath"
              :enable-dn-d="true"
              :show-remove-button="true"
              @select="handleDdlTreeSelect"
              @remove="handleDdlTreeRemove"
              @move="({ sourceRelPath, targetFolderRelPath }) => moveFileRelPath(sourceRelPath, targetFolderRelPath || 'ddl')"
            />
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <!-- Hidden inputs -->
        <input ref="folderInput" type="file" webkitdirectory class="hidden" @change="handleFolderSelect" />
        <input ref="fileInput" type="file" multiple class="hidden" @change="handleFileSelect" />
        <input ref="ddlFolderInput" type="file" webkitdirectory class="hidden" @change="handleDdlFolderSelect" />
        <input ref="ddlFileInput" type="file" multiple class="hidden" @change="handleDdlFileSelect" />
        
        <div class="validation-info">
          <div class="file-summary" v-if="hasFiles">
            <div class="file-summary-row">
              <div class="file-summary-main">총 {{ totalFileCount }}개 파일</div>
              <!-- 감지 결과 표시 -->
              <div v-if="isDetecting" class="file-summary-detecting">
                <IconLoader :size="14" /> 파일 타입 분석 중...
              </div>
              <div v-else-if="detectedTypes?.summary" class="file-summary-detected">
                <IconCheck :size="14" class="detected-icon" />
                <span class="detected-types">
                  {{ formatDetectedTypes(detectedTypes.summary.byType) }}
                </span>
              </div>
              <div v-else class="file-summary-sub">· 수정 필요시, 원하는 폴더 선택 후 추가</div>
            </div>
          </div>
          <div class="validation-error" v-if="validationError && hasFiles">
            <IconAlertTriangle :size="14" class="warn-icon" />
            <span class="warn-text">{{ validationError }}</span>
          </div>
        </div>
        <div class="spacer"></div>
        <button class="btn btn--secondary" @click="emit('cancel')">취소</button>
        <button class="btn btn--primary" @click="handleConfirm" :disabled="!isValid">
          <IconCheck :size="14" />
          업로드
        </button>
      </div>
    </div>
  </div>
  
  <!-- 데이터 소스 추가 모달 -->
  <Teleport to="body">
    <div v-if="showAddDatasourceModal" class="ds-modal-overlay" @click.self="showAddDatasourceModal = false">
      <div class="ds-modal">
        <div class="ds-modal-header">
          <h3>{{ newDatasourceType ? `${newDatasourceType.display_name} 연결 추가` : '데이터 소스 추가' }}</h3>
          <button class="ds-close-btn" @click="showAddDatasourceModal = false">✕</button>
        </div>
        
        <div class="ds-modal-body">
          <!-- 타입 선택 -->
          <div v-if="!newDatasourceType" class="ds-type-selection">
            <p class="ds-hint">데이터 소스 유형을 선택하세요:</p>
            <div class="ds-type-grid">
              <button
                v-for="type in availableDatasourceTypes"
                :key="type.type"
                @click="selectDatasourceType(type)"
                class="ds-type-card"
              >
                <span class="ds-type-icon">{{ datasourceIcons[type.type] || '📦' }}</span>
                <p class="ds-type-name">{{ type.display_name }}</p>
              </button>
            </div>
          </div>
          
          <!-- 연결 폼 -->
          <div v-else class="ds-form">
            <button @click="newDatasourceType = null" class="ds-back-btn">← 유형 선택으로</button>
            
            <form @submit.prevent="createNewDatasource">
              <div class="ds-form-group">
                <label>연결 이름 *</label>
                <input v-model="newDatasourceName" type="text" placeholder="my_database" required />
              </div>
              
              <div v-for="field in newDatasourceType.fields" :key="field.name" class="ds-form-group">
                <label>{{ field.label }} {{ field.required ? '*' : '' }}</label>
                <input
                  v-model="newDatasourceForm[field.name]"
                  :type="field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'"
                  :placeholder="field.default?.toString() || ''"
                  :required="field.required"
                />
              </div>
              
              <div v-if="datasourcesStore.error" class="ds-error">
                ⚠️ {{ datasourcesStore.error }}
              </div>
              
              <button type="submit" class="ds-submit-btn" :disabled="isCreatingDatasource || !newDatasourceName">
                {{ isCreatingDatasource ? '생성 중...' : '연결 생성' }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  animation: fadeIn var(--transition-fast);
}

.modal {
  width: 90%;
  max-width: 800px;
  max-height: 92vh;
  min-height: 72vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: slideUp var(--transition-normal);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 600;
  
  .title-icon {
    color: var(--color-accent);
  }
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  min-height: 0;
}

.top-row {
  display: flex;
  align-items: flex-end;
  gap: var(--spacing-md);
}

.options-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: 8px 12px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.checkbox-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text);
  
  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--color-accent);
    cursor: pointer;
  }
  
  .checkbox-label {
    font-weight: 500;
  }
  
  .option-hint {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  
  &:hover {
    color: var(--color-text-bright);
  }
}

.source-type-group {
  flex: 1;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
  
  .form-label {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  
  .detecting-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--color-warning, #f59e0b);
    font-weight: 500;
  }
  
  .auto-detected-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--color-success, #22c55e);
    font-weight: 500;
    cursor: help;
  }
  
  .select {
    font-size: 13px;
    padding: 8px 10px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    cursor: pointer;
    transition: all var(--transition-fast);
    
    &.auto-detected {
      border-color: var(--color-success, #22c55e);
      background: rgba(34, 197, 94, 0.08);
    }
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 2px rgba(34, 139, 230, 0.2);
    }
    
    &:hover {
      border-color: var(--color-text-muted);
    }
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.form-label--compact {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-light);
}

.select--compact {
  font-size: 13px;
  padding: 8px 10px;
}

.tree-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
  flex: 1;
  min-height: 0;
}

.tree-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
}

.panel-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
  padding: 0 4px;
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.panel-actions {
  display: flex;
  gap: 6px;
}

.btn--ghost {
  background: transparent;
  border: 1px solid rgba(34, 139, 230, 0.4);
  color: var(--color-accent);
  cursor: pointer;
  border-radius: var(--radius-sm);
  line-height: 1;
  
  &:hover {
    background: rgba(34, 139, 230, 0.1);
    border-color: var(--color-accent);
    color: var(--color-accent);
}
}

.btn--xs {
  padding: 4px 6px;
  font-size: 12px;
  min-width: 64px;
  min-height: 26px;
}

.btn--icon-only {
  min-width: 28px;
  padding: 4px 6px;
  font-size: 16px;
  line-height: 1;
}



.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-bright);
}

.modal-footer {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  border-top: 1px solid var(--color-border);
  flex-wrap: nowrap;
}

.modal-footer .btn {
  white-space: nowrap;
}

.modal-footer .btn.btn--secondary,
.modal-footer .btn.btn--primary {
  min-width: 92px;
}

.validation-info {
  display: flex;
  flex-direction: column;
  gap: 8px; /* 요약/경고 간격 */
  width: 100%;
}

.file-summary {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.file-summary-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: nowrap;
}

.file-summary-main {
  font-size: 13px;
  color: var(--color-text);
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
}

.file-summary-sub {
  font-size: 12px;
  color: var(--color-text-light);
  font-weight: 400;
  line-height: 1.2;
  white-space: nowrap;
}

.file-summary-detecting {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-warning, #f59e0b);
  font-weight: 500;
}

.file-summary-detected {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-success, #22c55e);
  font-weight: 500;
  
  .detected-icon {
    flex-shrink: 0;
  }
  
  .detected-types {
    color: var(--color-text-secondary, var(--color-text-light));
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.validation-error {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-error);
  line-height: 1.2;
  padding-left: 0;
}

.warn-icon {
  flex-shrink: 0;
}

.warn-text {
  min-width: 0;
}

.spacer {
  flex: 1;
}

.hidden {
  display: none;
}

.required {
  color: var(--color-error);
}

.input--error {
  border-color: var(--color-error) !important;
  
  &:focus {
    box-shadow: 0 0 0 2px rgba(250, 82, 82, 0.2);
  }
}

// ============================================================================
// 데이터 소스 선택자 스타일
// ============================================================================

.datasource-selector {
  position: relative;
}

.datasource-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  color: var(--color-text);
  
  &:hover {
    border-color: var(--color-accent);
  }
  
  &--empty {
    color: var(--color-text-muted);
  }
}

.ds-icon {
  font-size: 1.1rem;
}

.ds-text {
  flex: 1;
  text-align: left;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-chevron {
  font-size: 10px;
  color: var(--color-text-muted);
}

.datasource-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  overflow: hidden;
  animation: slideDown var(--transition-fast);
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-light);
}

.dropdown-close {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px 6px;
  
  &:hover {
    color: var(--color-text);
  }
}

.dropdown-list {
  max-height: 200px;
  overflow-y: auto;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: none;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast);
  text-align: left;
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
  
  &.selected {
    background: rgba(34, 139, 230, 0.1);
  }
}

.item-icon {
  font-size: 1.25rem;
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-size: 13px;
  color: var(--color-text);
}

.item-engine {
  font-size: 11px;
  color: var(--color-text-muted);
}

.dropdown-empty {
  padding: 16px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 12px;
}

.dropdown-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--color-border);
}

.add-datasource-link {
  display: block;
  text-align: center;
  color: var(--color-accent);
  font-size: 12px;
  text-decoration: none;
  
  &:hover {
    text-decoration: underline;
  }
}

// ============================================================================
// 데이터 소스 추가 모달 스타일
// ============================================================================

.ds-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 1rem;
}

.ds-modal {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
  animation: slideUp var(--transition-normal);
}

.ds-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  
  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
}

.ds-close-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  
  &:hover {
    color: var(--color-text);
  }
}

.ds-modal-body {
  padding: 20px;
  overflow-y: auto;
  max-height: 60vh;
}

.ds-hint {
  color: var(--color-text-muted);
  margin: 0 0 16px 0;
  font-size: 13px;
}

.ds-type-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.ds-type-card {
  padding: 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  
  &:hover {
    border-color: var(--color-accent);
    transform: translateY(-2px);
  }
}

.ds-type-icon {
  font-size: 2rem;
  display: block;
  margin-bottom: 8px;
}

.ds-type-name {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
}

.ds-back-btn {
  background: none;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  margin-bottom: 16px;
  padding: 0;
  font-size: 13px;
  
  &:hover {
    text-decoration: underline;
  }
}

.ds-form form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ds-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  
  label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-light);
  }
  
  input {
    padding: 10px 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text);
    font-size: 13px;
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
}

.ds-error {
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #f87171;
  font-size: 12px;
}

.ds-submit-btn {
  margin-top: 8px;
  padding: 12px 16px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  
  &:hover:not(:disabled) {
    background: var(--color-accent-hover, #5457e5);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
