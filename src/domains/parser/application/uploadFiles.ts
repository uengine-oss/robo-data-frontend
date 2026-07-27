/**
 * 업로드 관련 유틸(단일 파일로 통일)
 *
 * 유지보수 원칙:
 * - "규칙/계산(도메인 로직)"만 여기에 둔다 (UI 상태/emit 등은 컴포넌트에 둔다)
 * - 업로드 경로는 상대경로(webkitRelativePath)를 기준으로 한다
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
 * 업로드 파일의 상대경로를 정규화합니다.
 */
export function getNormalizedUploadPath(file: File): string {
  const raw = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
  const parts = splitPath(String(raw))
  return parts.join('/')
}


// =============================================================================
// 2) 파일 선택/경로 매핑
// =============================================================================

export function forceWebkitRelativePath(file: File, relPath: string): File {
  Object.defineProperty(file, 'webkitRelativePath', {
    value: relPath,
    writable: true,
    configurable: true  // 재정의 가능하도록 설정
  })
  return file
}

export function prefixPickedAsFolder(picked: File[], targetFolderRelPath: string, flattenDdl: boolean = false): File[] {
  if (!targetFolderRelPath) return picked
  
  return picked.map((f) => {
    const raw = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
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
  /** 상대경로 (파일: 전체 경로, 폴더: 해당 폴더 경로) */
  relPath: string
  children?: UploadTreeNode[]
  /** type === 'file' 일 때만 존재 */
  file?: File
  /** 업로드된 파일 내용 (서버에서 받은 경우) */
  fileContent?: string
}

/**
 * 업로드 파일들을 상대경로로 정규화하여 트리로 구성합니다.
 * @param files 파일 목록
 * @param emptyFolders 빈 폴더 집합 (파일이 없어도 해당 폴더를 트리에 유지)
 */
export function buildUploadTree(
  files: File[], 
  emptyFolders: Set<string> = new Set()
): UploadTreeNode {
  const root: UploadTreeNode = {
    type: 'folder',
    name: 'Files',
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
    const pa = getNormalizedUploadPath(a)
    const pb = getNormalizedUploadPath(b)
    return pa.localeCompare(pb)
  })

  for (const file of sorted) {
    const rel = getNormalizedUploadPath(file)
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
 */
export function buildUploadTreeFromUploadedFiles(
  uploadedFiles: Array<{ fileName: string; fileContent?: string }>
): UploadTreeNode {
  const root: UploadTreeNode = {
    type: 'folder',
    name: 'Files',
    relPath: '',
    children: []
  }

  const sorted = [...uploadedFiles].sort((a, b) => 
    a.fileName.localeCompare(b.fileName)
  )

  for (const uploadedFile of sorted) {
    const relPath = uploadedFile.fileName
    
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
// 4) 중복 제거(dedupe)
// =============================================================================

/**
 * 파일 목록을 상대경로 기준으로 고유화합니다.
 */
export function uniqueFilesByRelPath(files: File[]): File[] {
  const seen = new Set<string>()
  const out: File[] = []
  for (const f of files) {
    const rel = getNormalizedUploadPath(f)
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

export function collectFileNodes(root: UploadTreeNode): UploadTreeNode[] {
  const files: UploadTreeNode[] = []
  const walk = (node: UploadTreeNode) => {
    if (node.type === 'file') files.push(node)
    for (const child of node.children || []) walk(child)
  }
  walk(root)
  return files
}

export interface UploadFileLookup {
  fileDirectory?: string
  fileName?: string
  procedureName?: string
}

function normalizedLookupPath(value: string): string {
  return normalizeSlashes(value).replace(/^\/+|\/+$/g, '').toLocaleLowerCase()
}

/**
 * Analyzer source metadata를 업로드 트리의 파일로 결정론적으로 연결합니다.
 * 경로+파일명, 전체 경로, 파일명, 정확한 확장자 제외 이름 순서로만 찾으며
 * 부분 문자열 추론은 하지 않습니다.
 */
export function findUploadFile(
  roots: UploadTreeNode[],
  lookup: UploadFileLookup,
): UploadTreeNode | null {
  const files = roots.flatMap(collectFileNodes)
  const fileName = lookup.fileName ? normalizedLookupPath(lookup.fileName) : ''
  const directory = lookup.fileDirectory ? normalizedLookupPath(lookup.fileDirectory) : ''

  if (directory && fileName) {
    const combined = `${directory}/${fileName}`
    const exact = files.find((file) => {
      const path = normalizedLookupPath(file.relPath || file.name)
      return path === combined || path.endsWith(`/${combined}`)
    })
    if (exact) return exact
  }

  if (directory) {
    const exact = files.find((file) => {
      const path = normalizedLookupPath(file.relPath || file.name)
      return path === directory || path.endsWith(`/${directory}`)
    })
    if (exact) return exact
  }

  if (fileName) {
    const exact = files.find((file) => {
      const path = normalizedLookupPath(file.relPath || file.name)
      return path.split('/').pop() === fileName
    })
    if (exact) return exact
  }

  if (lookup.procedureName) {
    const procedureName = normalizedLookupPath(lookup.procedureName)
    return files.find((file) => {
      const path = normalizedLookupPath(file.relPath || file.name)
      const baseName = path.split('/').pop() || ''
      return baseName.replace(/\.[^.]+$/, '') === procedureName
    }) ?? null
  }

  return null
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
 * 파일을 targetFolderRelPath로 이동시킨 새 relPath를 계산합니다.
 */
export function moveRelPathToFolder(sourceRelPath: string, targetFolderRelPath: string): string {
  const sourceParts = splitPath(sourceRelPath)
  const fileName = sourceParts[sourceParts.length - 1] || ''
  const targetParts = splitPath(targetFolderRelPath)
  const target = targetParts.length ? `${targetParts.join('/')}/${fileName}` : fileName
  return target
}

/** Project the shared upload tree into the flat DDL panel used by the analyzer. */
export function projectDdlUploadTree(root: UploadTreeNode): UploadTreeNode {
  const ddlNode = (root.children || []).find(
    node => node.type === 'folder' && node.relPath === 'ddl',
  )

  function flatten(node: UploadTreeNode): UploadTreeNode[] {
    if (node.type === 'file') {
      const parts = splitPath(node.relPath)
      const fileName = parts[parts.length - 1] || node.name
      return [{ ...node, relPath: `ddl/${fileName}`, name: fileName }]
    }
    return (node.children || []).flatMap(flatten)
  }

  return {
    type: 'folder',
    name: 'ddl',
    relPath: 'ddl',
    children: (ddlNode ? flatten(ddlNode) : [])
      .sort((left, right) => left.name.localeCompare(right.name)),
  }
}

/** Project the shared upload tree into the source-code panel without DDL entries. */
export function projectSourceUploadTree(root: UploadTreeNode): UploadTreeNode {
  function withoutDdl(nodes: UploadTreeNode[]): UploadTreeNode[] {
    return nodes
      .filter(node => node.relPath !== 'ddl' && !node.relPath.startsWith('ddl/'))
      .map(node => node.children?.length
        ? { ...node, children: withoutDdl(node.children) }
        : node)
  }

  return {
    type: 'folder',
    name: root.name,
    relPath: '',
    children: withoutDdl(root.children || []),
  }
}

export function isUploadPathRemovalTarget(filePath: string, targetPath: string): boolean {
  const file = normalizeSlashes(filePath)
  const target = normalizeSlashes(targetPath)
  if (file === target || file.startsWith(`${target}/`)) return true
  if (target === 'ddl' && file.startsWith('ddl/')) return true
  if (!target.startsWith('ddl/') || target === 'ddl' || !file.startsWith('ddl/')) {
    return false
  }
  const fileName = target.replace(/^ddl\//, '')
  const fileParts = splitPath(file)
  return fileParts[fileParts.length - 1] === fileName
}
