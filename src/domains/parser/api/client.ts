import type {
  AnalyzeEvent,
  BackendRequestMetadata,
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
      metadata: BackendRequestMetadata,
      files: File[],
      headers: Headers,
    ): Promise<FileUploadResponse> {
      const formData = new FormData()
      formData.append('metadata', JSON.stringify(metadata))

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
      metadata: BackendRequestMetadata,
      headers: Headers,
    ): Promise<ParseResponse> {
      return postJson<ParseResponse>(`${baseUrl}/parsing`, metadata, headers)
    },

    async parseStream(
      metadata: BackendRequestMetadata,
      headers: Headers,
      onEvent: (event: AnalyzeEvent) => void,
    ): Promise<void> {
      await stream(`${baseUrl}/parsing`, metadata, headers, onEvent)
    },
  }
}
