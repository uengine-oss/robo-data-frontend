<template>
  <div
    id="ontology-node-panel-behavior"
    class="ontology-node-behavior-panel"
    role="tabpanel"
    aria-labelledby="ontology-node-tab-behavior"
  >
    <div v-if="loading" class="behavior-load-state" role="status">
      Behavior 모델을 불러오는 중...
    </div>
    <div v-if="error" class="behavior-load-state error" role="alert">
      <span>{{ error }}</span>
      <button type="button" :disabled="loading" @click="emit('retry')">다시 시도</button>
    </div>
    <AgentsMdEditor
      :node-type-name="nodeName"
      :behavior-models="models"
      @agent-created="emit('refresh')"
      @agent-deleted="emit('refresh')"
    />
  </div>
</template>

<script setup lang="ts">
import AgentsMdEditor from '../AgentsMdEditor.vue'
import type { NodeBehaviorPresentation } from './nodeBehaviorPresentation'

defineProps<{
  nodeName: string
  loading: boolean
  error: string
  models: NodeBehaviorPresentation[]
}>()

const emit = defineEmits<{
  (event: 'retry' | 'refresh'): void
}>()
</script>

<style scoped>
.ontology-node-behavior-panel {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.behavior-load-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.1);
  color: #bfdbfe;
  font-size: 0.8rem;
}

.behavior-load-state.error {
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
}

button {
  padding: 5px 9px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

button:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}
</style>
