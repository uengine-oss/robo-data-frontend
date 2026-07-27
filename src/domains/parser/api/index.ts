import { getNormalizedUploadPath } from '../application/uploadFiles.ts'
import type { StreamCallback } from '@/shared/services/http'
import { ANTLR_BASE_URL } from './baseUrl'
import { createParserClient } from './client.ts'
import { parserHttp } from './http'

export const parserApi = createParserClient({
  baseUrl: ANTLR_BASE_URL,
  normalizeUploadPath: getNormalizedUploadPath,
  postJson: parserHttp.postJson,
  postFormData: parserHttp.postFormData,
  stream: (url, body, headers, onEvent) =>
    parserHttp.stream(url, body, headers, onEvent as unknown as StreamCallback),
})
