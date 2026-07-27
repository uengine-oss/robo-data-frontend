<script setup lang="ts">
defineProps<{
  saveError: string | null
  saveNotice: string | null
  savePending: boolean
  objectTypeNotice: string | null
  objectTypeRefreshWarning: string | null
  datasourceNotice: string | null
  datasourceWarning: string | null
}>()

const emit = defineEmits<{
  retrySave: []
  dismiss: [
    target:
      | 'saveNotice'
      | 'objectTypeNotice'
      | 'objectTypeRefreshWarning'
      | 'datasourceNotice'
      | 'datasourceWarning',
  ]
}>()
</script>

<template>
  <div
    v-if="saveError || saveNotice || objectTypeNotice || objectTypeRefreshWarning || datasourceNotice || datasourceWarning"
    class="ontology-operation-stack"
    aria-live="polite"
  >
    <div v-if="saveError" class="ontology-operation-status error" role="alert">
      <span>온톨로지 저장 실패: {{ saveError }}</span>
      <button type="button" :disabled="savePending" @click="emit('retrySave')">다시 시도</button>
    </div>
    <div v-if="saveNotice" class="ontology-operation-status success" role="status">
      <span>{{ saveNotice }}</span>
      <button type="button" @click="emit('dismiss', 'saveNotice')">닫기</button>
    </div>
    <div v-if="objectTypeNotice" class="ontology-operation-status success" role="status">
      <span>{{ objectTypeNotice }}</span>
      <button type="button" @click="emit('dismiss', 'objectTypeNotice')">닫기</button>
    </div>
    <div v-if="objectTypeRefreshWarning" class="ontology-operation-status warning" role="status">
      <span>{{ objectTypeRefreshWarning }}</span>
      <button type="button" @click="emit('dismiss', 'objectTypeRefreshWarning')">닫기</button>
    </div>
    <div v-if="datasourceNotice" class="ontology-operation-status success" role="status">
      <span>{{ datasourceNotice }}</span>
      <button type="button" @click="emit('dismiss', 'datasourceNotice')">닫기</button>
    </div>
    <div v-if="datasourceWarning" class="ontology-operation-status warning" role="status">
      <span>{{ datasourceWarning }}</span>
      <button type="button" @click="emit('dismiss', 'datasourceWarning')">닫기</button>
    </div>
  </div>
</template>

<style src="./OntologyOperationNotices.scss" lang="scss"></style>
