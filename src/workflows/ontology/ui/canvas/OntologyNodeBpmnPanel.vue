<template>
  <div
    id="ontology-node-panel-bpmn"
    class="ontology-node-bpmn-panel"
    role="tabpanel"
    aria-labelledby="ontology-node-tab-bpmn"
  >
    <BpmnViewer
      v-if="bpmnXml"
      :model-value="bpmnXml"
      :title="`${nodeName} – BPMN`"
      :node-id="nodeId"
      @saved="emit('saved', $event)"
    />
    <div v-else class="bpmn-empty-state">
      <p>이 프로세스에 연결된 BPMN 다이어그램이 없습니다.</p>
      <p class="bpmn-hint">문서에서 온톨로지를 생성하면 PDF2BPMN이 자동으로 BPMN을 추출합니다.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BpmnViewer } from '@/domains/ontology/ui/modeling'

defineProps<{
  nodeId: string
  nodeName: string
  bpmnXml?: string
}>()

const emit = defineEmits<{
  (event: 'saved', xml: string): void
}>()
</script>

<style scoped>
.ontology-node-bpmn-panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.bpmn-empty-state {
  margin: 20px;
  padding: 22px;
  border: 1px dashed rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
}

.bpmn-hint {
  color: rgba(255, 255, 255, 0.42);
  font-size: 0.75rem;
}

:global(.light-mode) .bpmn-empty-state {
  border-color: rgba(15, 23, 42, 0.16);
  color: #475569;
}

:global(.light-mode) .bpmn-hint {
  color: #94a3b8;
}
</style>
