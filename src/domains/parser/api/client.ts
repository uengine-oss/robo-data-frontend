import type {
  AnalyzeEvent,
  FileUploadResponse,
  ParseResponse,
} from '@/shared/types'
import type { Headers } from '@/shared/services/http'

export interface ParserClientDependencies {
  baseUrl: string
  normalizeUploadPath: (file: File) => string
  postJson: <T>(url: string, body: unknown, headers: Headers) => Promise<T>
  postFormData: <T>(url: string, body: FormData, headers: Headers) => Promise<T>
  stream: (
    url: string,
    body: unknown,
    headers: Headers,
    onEvent: (event: AnalyzeEvent) => void,
  ) => Promise<void>
  log?: (...values: unknown[]) => void
}

export interface ParserRequestMetadata {
  targetFolder?: string
  project_root?: string
}

export function createParserClient({
  baseUrl,
  normalizeUploadPath,
  postJson,
  postFormData,
  stream,
  log = console.log,
}: ParserClientDependencies) {
  return {
    async uploadFiles(
      metadata: ParserRequestMetadata,
      files: File[],
      headers: Headers,
    ): Promise<FileUploadResponse> {
      const formData = new FormData()
      if (metadata.targetFolder) {
        formData.append('metadata', JSON.stringify({ targetFolder: metadata.targetFolder }))
      }

      log('[API] uploadFiles - 업로드할 파일 목록:')
      for (const file of files) {
        const path = normalizeUploadPath(file)
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? ''
        log(`  - ${path} (webkitRelativePath: ${relativePath}, name: ${file.name})`)
        formData.append('files', file, path)
      }

      const ddlCount = files.filter((file) => normalizeUploadPath(file).startsWith('ddl/')).length
      log(`[API] DDL 파일 수: ${ddlCount}개`)

      return postFormData<FileUploadResponse>(`${baseUrl}/fileUpload`, formData, headers)
    },

    async parse(
      metadata: ParserRequestMetadata,
      headers: Headers,
    ): Promise<ParseResponse> {
      const request = metadata.project_root ? { project_root: metadata.project_root } : {}
      return postJson<ParseResponse>(`${baseUrl}/parsing`, request, headers)
    },

    async parseStream(
      metadata: ParserRequestMetadata,
      headers: Headers,
      onEvent: (event: AnalyzeEvent) => void,
    ): Promise<void> {
      const request = metadata.project_root ? { project_root: metadata.project_root } : {}
      await stream(`${baseUrl}/parsing`, request, headers, onEvent)
    },
  }
}
