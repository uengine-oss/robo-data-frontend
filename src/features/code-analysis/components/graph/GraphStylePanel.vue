<script setup lang="ts">
/**
 * GraphStylePanel.vue
 * 그래프 요소(노드/관계) 스타일 설정 플로팅 패널
 *
 * category prop으로 노드/관계를 구분하며,
 * 노드는 색상+크기, 관계는 색상+두께를 설정할 수 있습니다.
 */

import { computed, ref, watch, onMounted } from 'vue'
import {
  NODE_SIZES,
  RELATIONSHIP_WIDTHS,
  getNodeColor,
  getRelationshipColor,
} from '@/config/graphStyles'
import {
  getStyle,
  setColor,
  setSize,
  type StyleCategory,
  type StyleConfig
} from '@/utils/graphStyleStorage'

// ============================================================================
// Props & Emits
// ============================================================================

interface Props {
  /** 스타일 카테고리 (노드 또는 관계) */
  category: StyleCategory
  /** 노드 라벨 또는 관계 타입 */
  elementType: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'close': []
}>()

// ============================================================================
// 상수 정의
// ============================================================================

/** 사용 가능한 색상 팔레트 */
const COLOR_PALETTE = [
  '#D4A574', '#FFB6C1', '#87CEEB', '#90EE90',
  '#FFA07A', '#FFD700', '#DDA0DD', '#F0E68C',
  '#E0E0E0', '#FF8C00', '#48D1CC', '#CD5C5C'
]

/** 노드 크기 옵션 */
const NODE_SIZE_OPTIONS = [20, 25, 30, 35]

/** 관계 두께 옵션 */
const REL_WIDTH_OPTIONS = [1, 2, 3, 5]

// ============================================================================
// Computed
// ============================================================================

/** 라벨/타입의 기본 색 (사용자 커스텀 무시 — 그룹/자동생성 fallback) */
function resolveDefaultColor(type: string): string {
  return props.category === 'node' ? getNodeColor([type]) : getRelationshipColor(type)
}

/** 카테고리에 따른 기본 크기/두께 맵 */
const defaultSizeMap = computed(() =>
  props.category === 'node' ? NODE_SIZES : RELATIONSHIP_WIDTHS
)

/** 크기/두께 옵션 */
const sizeOptions = computed(() =>
  props.category === 'node' ? NODE_SIZE_OPTIONS : REL_WIDTH_OPTIONS
)

/** 크기/두께 라벨 */
const sizeLabel = computed(() =>
  props.category === 'node' ? 'Size' : 'Width'
)

// ============================================================================
// 상태
// ============================================================================

const savedStyle = ref<StyleConfig | null>(null)
const selectedColor = ref<string>('')
const selectedSize = ref<number>(0)

// ============================================================================
// Computed — 헤더 색상
// ============================================================================

const headerColor = computed(() => {
  if (!props.elementType) return '#5AA0E0'
  if (savedStyle.value?.color) return savedStyle.value.color
  return resolveDefaultColor(props.elementType)
})

// ============================================================================
// 이벤트 핸들러
// ============================================================================

function loadCurrentStyle(): void {
  if (!props.elementType) {
    savedStyle.value = null
    selectedColor.value = ''
    selectedSize.value = defaultSizeMap.value.DEFAULT ?? 30
    return
  }

  const style = getStyle(props.category, props.elementType)
  savedStyle.value = style

  if (style?.color) {
    selectedColor.value = style.color
  } else {
    selectedColor.value = resolveDefaultColor(props.elementType)
  }

  if (style?.size) {
    selectedSize.value = style.size
  } else {
    const type = props.elementType
    selectedSize.value = defaultSizeMap.value[type]
      || defaultSizeMap.value[type.toUpperCase()]
      || defaultSizeMap.value.DEFAULT
  }
}

function handleColorSelect(color: string): void {
  if (!props.elementType) return
  selectedColor.value = color
  setColor(props.category, props.elementType, color)
  savedStyle.value = { ...savedStyle.value, color }
}

function handleSizeSelect(size: number): void {
  if (!props.elementType) return
  selectedSize.value = size
  setSize(props.category, props.elementType, size)
  savedStyle.value = { ...savedStyle.value, size }
}

// ============================================================================
// Watch & Lifecycle
// ============================================================================

watch(() => props.elementType, () => loadCurrentStyle(), { immediate: true })
onMounted(() => loadCurrentStyle())

</script>

<template>
  <div class="graph-style-panel" v-if="elementType">
    <div class="style-panel-header" :style="{ background: headerColor }">
      {{ elementType }}
      <button class="close-btn" @click="emit('close')" title="닫기">&times;</button>
    </div>

    <!-- 색상 선택 -->
    <div class="style-section">
      <div class="style-label">Color</div>
      <div class="color-palette">
        <button
          v-for="color in COLOR_PALETTE"
          :key="color"
          class="color-swatch"
          :class="{ active: selectedColor === color }"
          :style="{ background: color }"
          @click="handleColorSelect(color)"
          :title="color"
        ></button>
        <label
          class="color-swatch custom"
          :class="{ active: selectedColor && !COLOR_PALETTE.includes(selectedColor) }"
          :style="{ background: selectedColor && !COLOR_PALETTE.includes(selectedColor) ? selectedColor : undefined }"
          title="커스텀 색상"
        >
          <span v-if="!selectedColor || COLOR_PALETTE.includes(selectedColor)">+</span>
          <input
            type="color"
            :value="selectedColor || '#5AA0E0'"
            @input="(e) => handleColorSelect((e.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </div>

    <!-- 크기/두께 선택 -->
    <div class="style-section">
      <div class="style-label">{{ sizeLabel }}</div>
      <div class="size-options">
        <button
          v-for="size in sizeOptions"
          :key="size"
          class="size-swatch"
          :class="{ active: selectedSize === size }"
          :style="category === 'node'
            ? { width: `${size * 0.6}px`, height: `${size * 0.6}px` }
            : { width: '28px', height: `${size * 3}px`, borderRadius: '4px' }"
          @click="handleSizeSelect(size)"
          :title="category === 'node' ? `Size: ${size}` : `Width: ${size}`"
        ></button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.graph-style-panel {
  position: relative;
  min-width: 240px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.style-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: white;
  background: #D4A574;

  .close-btn {
    width: 20px;
    height: 20px;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 18px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }
}

.style-section {
  padding: 10px 14px;
  border-top: 1px solid #f1f5f9;

  &:first-of-type {
    border-top: none;
  }
}

.style-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #64748b;
  margin-bottom: 8px;
}

.color-palette {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
  background: none;

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  &.active {
    border-color: #1e293b;
    box-shadow: 0 0 0 2px white, 0 0 0 4px #1e293b;
  }

  &.custom {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed #94a3b8;
    background: #f8fafc;
    color: #64748b;
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
    overflow: hidden;
    position: relative;

    input[type="color"] {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      border: none;
      padding: 0;
      cursor: pointer;
    }
  }
}

.size-options {
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-swatch {
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  background: #e2e8f0;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
  flex-shrink: 0;
  min-width: 20px;
  min-height: 20px;

  &:hover {
    border-color: #94a3b8;
    background: #cbd5e1;
  }

  &.active {
    border-color: #1e293b;
    background: #64748b;
    box-shadow: 0 0 0 2px white, 0 0 0 4px #1e293b;
  }
}
</style>
