<script setup lang="ts">
/**
 * ModelDagNode.vue
 * VueFlow 커스텀 노드: 모델을 중앙 블록으로, 입력/출력 변수를 핸들로 표시
 *
 *   입력변수1 ──┐
 *   입력변수2 ──┤── [Model Name] ──── 출력변수 (값, Δ%)
 *   입력변수3 ──┘
 */
import { Handle, Position } from '@vue-flow/core'

const props = defineProps<{
  data: {
    modelName: string
    inputs: Array<{ key: string; label: string; value: number }>
    output: { key: string; label: string; baseline: number; predicted: number; delta: number; pct: number }
    wave: number
  }
}>()

function deltaClass(d: number) {
  if (d > 0.01) return 'positive'
  if (d < -0.01) return 'negative'
  return 'neutral'
}
</script>

<template>
  <div class="model-dag-node">
    <!-- 왼쪽: 입력 핸들들 -->
    <div class="input-handles">
      <div v-for="(inp, i) in data.inputs" :key="inp.key" class="input-handle-row">
        <Handle
          type="target"
          :position="Position.Left"
          :id="`input-${i}`"
          :style="{ top: `${20 + i * 24}px` }"
        />
        <span class="handle-label input-label" :title="inp.key">
          {{ inp.label }}
          <span class="handle-value">{{ inp.value.toFixed(1) }}</span>
        </span>
      </div>
    </div>

    <!-- 가운데: 모델 블록 -->
    <div class="model-block">
      <span class="wave-tag">W{{ data.wave }}</span>
      <span class="model-name">{{ data.modelName }}</span>
    </div>

    <!-- 오른쪽: 출력 핸들 -->
    <div class="output-handle-area">
      <Handle type="source" :position="Position.Right" id="output" />
      <div class="output-info" :class="deltaClass(data.output.delta)">
        <span class="output-label">{{ data.output.label }}</span>
        <span class="output-values">
          {{ data.output.baseline.toFixed(1) }} → {{ data.output.predicted.toFixed(1) }}
        </span>
        <span class="output-pct" :class="deltaClass(data.output.delta)">
          {{ data.output.delta > 0 ? '⬆' : data.output.delta < 0 ? '⬇' : '━' }}
          {{ data.output.pct > 0 ? '+' : '' }}{{ data.output.pct.toFixed(1) }}%
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-dag-node {
  display: flex;
  align-items: stretch;
  gap: 0;
  font-family: inherit;
  min-width: 200px;
}

.input-handles {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding-right: 6px;
  position: relative;
}

.input-handle-row {
  position: relative;
  display: flex;
  align-items: center;
}

.handle-label {
  font-size: 10px;
  white-space: nowrap;
  padding: 1px 6px;
  border-radius: 3px;
}

.input-label {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  font-weight: 600;
}

.handle-value {
  font-family: monospace;
  font-size: 9px;
  color: rgba(245, 158, 11, 0.7);
  margin-left: 3px;
}

.model-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #6366f1;
  color: #fff;
  border-radius: 8px;
  padding: 10px 16px;
  min-width: 100px;
  position: relative;
}

.wave-tag {
  position: absolute;
  top: -8px;
  right: -8px;
  background: #1e1b4b;
  color: #a5b4fc;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 6px;
  border: 1px solid #6366f1;
}

.model-name {
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.output-handle-area {
  display: flex;
  align-items: center;
  padding-left: 6px;
  position: relative;
}

.output-info {
  display: flex;
  flex-direction: column;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
  border: 1.5px solid #444;
  background: rgba(100, 100, 100, 0.1);
}

.output-info.positive {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.08);
}

.output-info.negative {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

.output-label {
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
}

.output-values {
  font-family: monospace;
  font-size: 9px;
  color: #94a3b8;
}

.output-pct {
  font-weight: 700;
  font-size: 10px;
}

.output-pct.positive { color: #22c55e; }
.output-pct.negative { color: #ef4444; }
.output-pct.neutral { color: #94a3b8; }
</style>
