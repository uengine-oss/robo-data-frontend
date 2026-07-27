<script setup lang="ts">
import { IconRefresh, IconUpload } from '@/shared/icons'
import type { BulkUploadResponse } from '../api.ts'

defineProps<{
  files: File[]
  uploadResponse: BulkUploadResponse | null
  uploading: boolean
  phaseMessage: string
}>()

const emit = defineEmits<{
  filesChange: [files: File[]]
  upload: []
}>()

function selectFiles(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  emit('filesChange', Array.from(event.target.files ?? []))
}
</script>

<template>
  <section class="step-section">
    <div class="upload-panel">
      <div class="upload-dropzone">
        <IconUpload :size="36" />
        <p>`.csv`, `.xlsx`, `.xls` 파일을 1개 이상 선택하세요.</p>
        <input type="file" multiple accept=".csv,.xlsx,.xls" @change="selectFiles" />
      </div>

      <div v-if="files.length > 0" class="selected-files">
        <p class="section-label">선택한 파일</p>
        <div class="chip-list">
          <span v-for="file in files" :key="file.name" class="chip">{{ file.name }}</span>
        </div>
      </div>

      <div v-if="phaseMessage" class="progress-line">
        <IconRefresh :size="14" class="spinning" />
        <span>{{ phaseMessage }}</span>
      </div>

      <button class="btn-primary" :disabled="uploading || files.length === 0" @click="emit('upload')">
        {{ uploading ? '분석 중...' : '업로드 시작' }}
      </button>
    </div>

    <div v-if="uploadResponse" class="summary-card-list">
      <div v-for="file in uploadResponse.files" :key="file.filename" class="summary-card">
        <div class="summary-card-header">
          <strong>{{ file.filename }}</strong>
          <span class="badge success">정상</span>
        </div>
        <p>
          {{ file.total_rows }}행, {{ file.headers.length }}칼럼{{
            file.detected_encoding ? `, ${file.detected_encoding}` : ''
          }}
        </p>
      </div>
    </div>
  </section>
</template>
