/**
 * 업로드 관련 유틸(단일 파일로 통일)
 *
 * 유지보수 원칙:
 * - “규칙/계산(도메인 로직)”만 여기에 둔다 (UI 상태/emit 등은 컴포넌트에 둔다)
 * - 업로드 경로는 항상 “projectName 최상위 + 상대경로(webkitRelativePath)” 규칙을 따른다
 *
 * 구성:
 * 1) 경로 유틸
 * 2) 파일 선택/경로 매핑
 * 3) 트리 모델/구성
 * 4) DDL/중복 제거(dedupe)
 * 5) 선택 기반 타겟 계산/이동
 */

// =============================================================================
// 1) 경로 유틸
// =============================================================================

export function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/')
}

export function splitPath(path: string): string[] {
  return normalizeSlashes(path)
    .split('/')
    .map(p => p.trim())
    .filter(Boolean)
}

/**
 * 업로드 파일의 "상대경로"를 프로젝트 루트 기준으로 정규화합니다.
 *
 * - projectName을 최상위에 추가 (이미 있으면 추가 안 함)
 * - 원본 폴더 구조를 그대로 유지
 * - ddl/로 시작하는 경로도 projectName을 앞에 붙임 (서버에서 projectName/ 접두사를 제거 후 처리)
 */
export function getNormalizedUploadPath(file: File, projectName: string): string {
  const raw = (file as any).webkitRelativePath || file.name
  const parts = splitPath(String(raw))

  const safeProject = (projectName || '').trim()
  if (!safeProject) return parts.join('/')

  // 이미 projectName으로 시작하면 그대로 반환
  if (parts[0] === safeProject) {
    return parts.join('/')
  }

  // DDL 경로는 projectName을 추가하지 않음 (ANTLR 서버에서 ddl/로 시작해야 인식)
  if (parts[0]?.toLowerCase() === 'ddl') {
    return parts.join('/')
  }

  // 소스 파일만 projectName을 앞에 추가
  return [safeProject, ...parts].join('/')
}

export function getNormalizedUploadPathWithoutProject(file: File, projectName: string): string {
  const full = getNormalizedUploadPath(file, projectName)
  const parts = splitPath(full)
  const safeProject = (projectName || '').trim()
  
  // projectName을 제거 (모든 경로에서)
  if (safeProject && parts[0] === safeProject) return parts.slice(1).join('/')
  return parts.join('/')
}

// =============================================================================
// 2) 파일 선택/경로 매핑
// =============================================================================

/**
 * 선택한 File[]에서 "공통 최상위 폴더"가 하나로 수렴하면 그 값을 반환합니다.
 * (자동 구조 인식은 이것만 수행)
 */
export function inferProjectNameFromPicked(picked: File[]): string {
  const firstParts = new Set<string>()
  for (const f of picked) {
    const raw = (f as any).webkitRelativePath || f.name
    const first = splitPath(String(raw))[0]
    if (first) firstParts.add(first)
  }
  return firstParts.size === 1 ? Array.from(firstParts)[0] : ''
}

export function forceWebkitRelativePath(file: File, relPath: string): File {
  Object.defineProperty(file, 'webkitRelativePath', {
    value: relPath,
    writable: false
  })
  return file
}

export function prefixPickedAsFolder(picked: File[], targetFolderRelPath: string, flattenDdl: boolean = false): File[] {
  if (!targetFolderRelPath) return picked
  
  return picked.map((f) => {
    const raw = (f as any).webkitRelativePath || f.name
    const parts = splitPath(String(raw))
    
    if (flattenDdl) {
      // DDL은 항상 파일명만 사용 (폴더 구조 평탄화)
      const fileName = parts[parts.length - 1] || f.name
      return forceWebkitRelativePath(f, `${targetFolderRelPath}/${fileName}`)
    } else {
      // 타겟 폴더 아래에 원본 폴더 구조 유지하여 배치
      return forceWebkitRelativePath(f, `${targetFolderRelPath}/${raw}`)
    }
  })
}

export function prefixPickedAsFiles(picked: File[], targetFolderRelPath: string): File[] {
  if (!targetFolderRelPath) return picked
  
  return picked.map((f) => {
    // 원본 webkitRelativePath를 무시하고 타겟 폴더 아래로 강제 배치
    return forceWebkitRelativePath(f, `${targetFolderRelPath}/${f.name}`)
  })
}

export type UploadPanelKind = 'file' | 'ddl'
export type UploadPickKind = 'folder' | 'file'

export function normalizeDdlTargetFolder(targetFolderRelPath: string): string {
  const target = targetFolderRelPath || 'ddl'
  return target.startsWith('ddl') ? target : `ddl/${target}`
}

/**
 * Picked 파일들을 panel/kind/targetFolder 규칙에 맞게 webkitRelativePath로 매핑합니다.
 * - ddl panel이면 무조건 ddl/ 아래로, 폴더 구조 무시하고 파일명만 사용 (평탄화)
 * - folder pick은 타겟 폴더 아래에 원본 폴더 구조 유지
 * - file pick은 파일명을 targetFolder 아래로 붙임
 */
export function mapPickedFilesToTarget(
  panel: UploadPanelKind,
  kind: UploadPickKind,
  picked: File[],
  targetFolderRelPath: string
): File[] {
  const target = panel === 'ddl' ? normalizeDdlTargetFolder(targetFolderRelPath) : targetFolderRelPath
  const flattenDdl = panel === 'ddl' // DDL은 항상 평탄화
  return kind === 'folder' 
    ? prefixPickedAsFolder(picked, target, flattenDdl) 
    : prefixPickedAsFiles(picked, target)
}

// =============================================================================
// 3) 트리 모델/구성
// =============================================================================

export type UploadNodeType = 'folder' | 'file'

export interface UploadTreeNode {
  type: UploadNodeType
  name: string
  /** projectName 제외 상대경로 (파일: 전체 경로, 폴더: 해당 폴더 경로) */
  relPath: string
  children?: UploadTreeNode[]
  /** type === 'file' 일 때만 존재 */
  file?: File
  /** 업로드된 파일 내용 (서버에서 받은 경우) */
  fileContent?: string
}

/**
 * 업로드 파일들을 "프로젝트 루트 기준 상대경로"로 정규화하여 트리로 구성합니다.
 * emptyFolders를 전달하면 파일이 없어도 해당 폴더를 트리에 유지합니다.
 */
export function buildUploadTree(
  files: File[], 
  projectName: string, 
  emptyFolders: Set<string> = new Set()
): UploadTreeNode {
  const safeProject = (projectName || '').trim()
  const root: UploadTreeNode = {
    type: 'folder',
    name: safeProject || '(project)',
    relPath: '',
    children: []
  }

  // 빈 폴더를 먼저 추가
  for (const folderPath of emptyFolders) {
    const parts = splitPath(folderPath)
    if (parts.length === 0) continue

    let current = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const childRelPath = parts.slice(0, i + 1).join('/')
      if (!current.children) current.children = []

      let child = current.children.find(c => c.name === name && c.type === 'folder')
      if (!child) {
        child = { type: 'folder', name, relPath: childRelPath, children: [] }
        current.children.push(child)
      }
      current = child
    }
  }

  const sorted = [...files].sort((a, b) => {
    const pa = getNormalizedUploadPathWithoutProject(a, safeProject)
    const pb = getNormalizedUploadPathWithoutProject(b, safeProject)
    return pa.localeCompare(pb)
  })

  for (const file of sorted) {
    const rel = getNormalizedUploadPathWithoutProject(file, safeProject)
    const parts = splitPath(rel)
    if (parts.length === 0) continue

    let current = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isLeaf = i === parts.length - 1

      const childRelPath = parts.slice(0, i + 1).join('/')
      if (!current.children) current.children = []

      let child = current.children.find(c => c.name === name && c.type === (isLeaf ? 'file' : 'folder'))
      if (!child) {
        child = {
          type: isLeaf ? 'file' : 'folder',
          name,
          relPath: childRelPath,
          ...(isLeaf ? { file } : { children: [] })
        }
        current.children.push(child)
      } else if (isLeaf) {
        child.file = file
      }

      if (!isLeaf) current = child
    }
  }

  const sortNode = (node: UploadTreeNode) => {
    if (!node.children) return
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortNode)
  }
  sortNode(root)

  return root
}

/**
 * 트리에서 모든 폴더 경로를 추출합니다.
 */
export function collectAllFolderPaths(node: UploadTreeNode): Set<string> {
  const folders = new Set<string>()
  const walk = (n: UploadTreeNode) => {
    if (n.type === 'folder' && n.relPath) {
      folders.add(n.relPath)
    }
    for (const child of n.children || []) walk(child)
  }
  walk(node)
  return folders
}

/**
 * 업로드된 파일들(UploadedFile[])을 트리 구조로 변환합니다.
 * fileName을 경로로 파싱하여 트리를 구성합니다.
 * 
 * 기존 buildUploadTree와 동일한 로직을 재사용하되, File 객체 대신 fileName/fileContent를 사용합니다.
 */
export function buildUploadTreeFromUploadedFiles(
  uploadedFiles: Array<{ fileName: string; fileContent?: string }>,
  projectName: string
): UploadTreeNode {
  const safeProject = (projectName || '').trim()
  const root: UploadTreeNode = {
    type: 'folder',
    name: safeProject || '(project)',
    relPath: '',
    children: []
  }

  const sorted = [...uploadedFiles].sort((a, b) => 
    a.fileName.localeCompare(b.fileName)
  )

  for (const uploadedFile of sorted) {
    // fileName에서 projectName 제거하여 상대경로 추출
    let relPath = uploadedFile.fileName
    if (safeProject && relPath.startsWith(safeProject + '/')) {
      relPath = relPath.substring(safeProject.length + 1)
    }
    
    const parts = splitPath(relPath)
    if (parts.length === 0) continue

    // buildUploadTree와 동일한 트리 구성 로직
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isLeaf = i === parts.length - 1

      const childRelPath = parts.slice(0, i + 1).join('/')
      if (!current.children) current.children = []

      let child = current.children.find(c => c.name === name && c.type === (isLeaf ? 'file' : 'folder'))
      if (!child) {
        child = {
          type: isLeaf ? 'file' : 'folder',
          name,
          relPath: childRelPath,
          ...(isLeaf ? { fileContent: uploadedFile.fileContent } : { children: [] })
        }
        current.children.push(child)
      } else if (isLeaf) {
        child.fileContent = uploadedFile.fileContent
      }

      if (!isLeaf) current = child
    }
  }

  // buildUploadTree와 동일한 정렬 로직
  const sortNode = (node: UploadTreeNode) => {
    if (!node.children) return
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortNode)
  }
  sortNode(root)

  return root
}

// =============================================================================
// 4) DDL / 중복 제거(dedupe)
// =============================================================================

/**
 * 사용자가 DDL 패널로 넣은 파일들의 파일명 목록을 추출합니다.
 * - relPath가 'ddl/...' 형태인 파일만 대상
 * - 반환값은 'ddl/' 제거한 파일명만 (폴더 구조 무시, ddl/ 아래 모든 파일)
 */
export function getDdlPathsFromFiles(files: File[], projectName: string): string[] {
  const safeProject = (projectName || '').trim()
  const ddlPaths: string[] = []
  for (const file of files) {
    const rel = getNormalizedUploadPathWithoutProject(file, safeProject)
    const parts = splitPath(rel)
    if (parts.length === 0) continue
    if (parts[0]?.toLowerCase() !== 'ddl') continue
    // ddl/ 제거하고 파일명만 추출 (폴더 구조 무시)
    const fileName = parts[parts.length - 1] // 마지막이 파일명
    if (fileName) ddlPaths.push(fileName)
  }
  return Array.from(new Set(ddlPaths)).sort((a, b) => a.localeCompare(b))
}

/**
 * 파일 목록을 "정규화된 프로젝트 루트 기준 상대경로"로 고유화합니다.
 */
export function uniqueFilesByRelPath(files: File[], projectName: string): File[] {
  const safeProject = (projectName || '').trim()
  const seen = new Set<string>()
  const out: File[] = []
  for (const f of files) {
    const rel = getNormalizedUploadPathWithoutProject(f, safeProject)
    if (seen.has(rel)) continue
    seen.add(rel)
    out.push(f)
  }
  return out
}

// =============================================================================
// 5) 선택 기반 타겟 계산 / 이동
// =============================================================================

export function getParentFolderRelPath(relPath: string): string {
  const parts = splitPath(relPath)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

export function findNodeByRelPath(root: UploadTreeNode, relPath: string): UploadTreeNode | null {
  if (!relPath && root.relPath === '') return root
  const walk = (node: UploadTreeNode): UploadTreeNode | null => {
    if (node.relPath === relPath) return node
    for (const c of node.children || []) {
      const hit = walk(c)
      if (hit) return hit
    }
    return null
  }
  return walk(root)
}

/**
 * 현재 선택(selectedRelPath)을 기준으로 "추가 대상 폴더"를 계산합니다.
 * - 선택이 없으면: file 패널은 root(''), ddl 패널은 'ddl'
 * - 선택이 현재 패널 트리 밖이면: 위와 동일한 기본값
 * - 선택이 파일이면: 해당 파일의 부모 폴더
 * - 선택이 폴더면: 해당 폴더
 */
export function resolveSelectedTargetFolder(
  panel: UploadPanelKind,
  selectedRelPath: string | null,
  panelRoot: UploadTreeNode
): string {
  const sel = selectedRelPath || ''
  if (!sel) return panel === 'ddl' ? 'ddl' : ''

  const node = findNodeByRelPath(panelRoot, sel)
  if (!node) return panel === 'ddl' ? 'ddl' : ''
  if (node.type === 'folder') return node.relPath
  return getParentFolderRelPath(node.relPath)
}

/**
 * sourceRelPath(프로젝트 제외) 파일을 targetFolderRelPath로 이동시킨 새 relPath를 계산합니다.
 */
export function moveRelPathToFolder(sourceRelPath: string, targetFolderRelPath: string): string {
  const sourceParts = splitPath(sourceRelPath)
  const fileName = sourceParts[sourceParts.length - 1] || ''
  const targetParts = splitPath(targetFolderRelPath)
  const target = targetParts.length ? `${targetParts.join('/')}/${fileName}` : fileName
  return target
}


