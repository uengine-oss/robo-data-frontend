<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Glossary } from '@/domains/catalog/glossary'
import type {
  OntologyDocumentGenerationForm,
  OntologyDocumentInputType,
} from '../../application/documentGeneration'

const props = defineProps<{
  form: OntologyDocumentGenerationForm
  uploadedFile: File | null
  draggingFile: boolean
  fileUploadError: string
  useAllGlossaries: boolean
  allGlossariesLabel: string
  glossaries: readonly Glossary[]
  glossaryLoading: boolean
  glossaryError: string
}>()

const emit = defineEmits<{
  acceptFile: [file: File]
  removeFile: []
  retryGlossaries: []
  toggleAllGlossaries: [value: boolean]
  'update:inputType': [value: OntologyDocumentInputType]
  'update:text': [value: string]
  'update:pdfUrl': [value: string]
  'update:selectedGlossaryIds': [value: string[]]
  'update:draggingFile': [value: boolean]
}>()

const fileInput = ref<HTMLInputElement | null>(null)

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function openPdfFilePicker(): void {
  fileInput.value?.click()
}

function acceptFirstFile(files: FileList | null | undefined): void {
  const file = files?.[0]
  if (file) emit('acceptFile', file)
}

function handleFileDrop(event: DragEvent): void {
  emit('update:draggingFile', false)
  acceptFirstFile(event.dataTransfer?.files)
}

function handleFileSelect(event: Event): void {
  acceptFirstFile((event.target as HTMLInputElement).files)
}

function removeSelectedPdfFile(): void {
  emit('removeFile')
}

function toggleGlossary(id: string, checked: boolean): void {
  const selected = new Set(props.form.selectedGlossaryIds)
  if (checked) selected.add(id)
  else selected.delete(id)
  emit('update:selectedGlossaryIds', [...selected])
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

watch(
  () => props.uploadedFile,
  file => {
    if (!file && fileInput.value) fileInput.value.value = ''
  },
)
</script>

<template>
  <div class="dialog-content">
    <div class="form-group">
      <label>입력 방식</label>
      <div class="input-type-tabs" role="tablist" aria-label="문서 입력 방식">
        <button
          type="button"
          role="tab"
          class="tab-btn"
          :class="{ active: form.inputType === 'text' }"
          :aria-selected="form.inputType === 'text'"
          @click="emit('update:inputType', 'text')"
        >
          📝 텍스트 입력
        </button>
        <button
          type="button"
          role="tab"
          class="tab-btn"
          :class="{ active: form.inputType === 'pdf' }"
          :aria-selected="form.inputType === 'pdf'"
          @click="emit('update:inputType', 'pdf')"
        >
          📎 PDF 업로드
        </button>
        <button
          type="button"
          role="tab"
          class="tab-btn"
          :class="{ active: form.inputType === 'url' }"
          :aria-selected="form.inputType === 'url'"
          @click="emit('update:inputType', 'url')"
        >
          🔗 URL 입력
        </button>
      </div>
    </div>

    <div v-if="form.inputType === 'text'" class="form-group">
      <label for="ontology-generation-text">문서 내용</label>
      <textarea
        id="ontology-generation-text"
        :value="form.text"
        rows="10"
        placeholder="분석할 문서 내용을 입력하세요..."
        @input="emit('update:text', inputValue($event))"
      ></textarea>
    </div>

    <div v-if="form.inputType === 'pdf'" class="form-group">
      <label>PDF 파일 업로드</label>
      <div
        class="file-drop-zone"
        :class="{ 'drag-over': draggingFile }"
        @dragover.prevent="emit('update:draggingFile', true)"
        @dragleave="emit('update:draggingFile', false)"
        @drop.prevent="handleFileDrop"
      >
        <input
          id="ontology-generation-pdf-input"
          ref="fileInput"
          type="file"
          accept=".pdf"
          aria-label="온톨로지 생성 PDF 파일"
          @change="handleFileSelect"
          style="display: none"
        />
        <button
          v-if="!uploadedFile"
          type="button"
          class="drop-zone-content"
          aria-controls="ontology-generation-pdf-input"
          @click="openPdfFilePicker"
        >
          <span class="drop-icon">📁</span>
          <p>PDF 파일을 드래그하거나 클릭하여 선택</p>
          <span class="drop-hint">대용량 PDF 지원 (1GB 이하 권장)</span>
        </button>
        <div v-else class="file-info">
          <span class="file-icon">📄</span>
          <span class="file-name">{{ uploadedFile.name }}</span>
          <span class="file-size">{{ formatFileSize(uploadedFile.size) }}</span>
          <button
            type="button"
            class="remove-file-btn"
            :aria-label="`${uploadedFile.name} 파일 제거`"
            @click.stop="removeSelectedPdfFile"
          >
            ✕
          </button>
        </div>
      </div>
      <p v-if="fileUploadError" class="file-upload-error" role="alert">{{ fileUploadError }}</p>
    </div>

    <div v-if="form.inputType === 'url'" class="form-group">
      <label for="ontology-generation-pdf-url">PDF URL</label>
      <input
        id="ontology-generation-pdf-url"
        type="url"
        :value="form.pdfUrl"
        placeholder="https://example.com/document.pdf"
        @input="emit('update:pdfUrl', inputValue($event))"
      />
    </div>

    <div class="form-group glossary-selector">
      <label>사용할 용어집</label>
      <p class="glossary-help">선택한 용어집의 표준 용어를 기반으로 온톨로지를 더 정확하게 생성합니다.</p>
      <div class="glossary-toggle">
        <label class="toggle-label">
          <input
            type="checkbox"
            :checked="useAllGlossaries"
            @change="emit('toggleAllGlossaries', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ allGlossariesLabel }}</span>
        </label>
      </div>
      <div v-if="glossaryError" class="glossary-load-error" role="alert">
        <span>{{ glossaryError }}</span>
        <button type="button" :disabled="glossaryLoading" @click="emit('retryGlossaries')">
          다시 시도
        </button>
      </div>

      <div v-if="!useAllGlossaries" class="glossary-checklist">
        <div v-if="glossaryLoading" class="glossary-loading">용어집 목록 로드 중...</div>
        <div v-else-if="!glossaryError && glossaries.length === 0" class="glossary-empty">
          등록된 용어집이 없습니다.
        </div>
        <template v-else>
          <label v-for="glossary in glossaries" :key="glossary.id" class="glossary-check-item">
            <input
              type="checkbox"
              :value="glossary.id"
              :checked="form.selectedGlossaryIds.includes(glossary.id)"
              @change="toggleGlossary(glossary.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="glossary-check-name">{{ glossary.name }}</span>
            <span class="glossary-check-count">{{ glossary.termCount }}개 용어</span>
          </label>
          <p v-if="form.selectedGlossaryIds.length === 0" class="glossary-validation-hint">
            용어집을 1개 이상 선택해주세요.
          </p>
        </template>
      </div>
    </div>
  </div>
</template>
