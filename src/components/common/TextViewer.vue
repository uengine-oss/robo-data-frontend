<script setup lang="ts">
/**
 * TextViewer.vue
 * 일반 텍스트(설명/요약 등)를 가독성 있게 표시하는 공용 뷰어.
 *
 * - format="plain" (기본): white-space: pre-wrap 으로 원본 보존
 * - format="auto" : 줄 단위 파싱
 *     · 콜론(:) 으로 끝나는 줄  → 작은 섹션 헤더
 *     · 들여쓰기로 시작하는 줄  → bullet 아이템
 *     · 빈 줄                    → 단락 구분
 *     · 그 외                    → 단락
 *
 * 사용:
 *   <TextViewer :content="table.description" />
 *   <TextViewer :content="ai.summary" format="auto" />
 */

import { computed } from 'vue'

interface Props {
  content?: string | null
  maxHeight?: string | number
  placeholder?: string
  compact?: boolean
  /** 표시 포맷. 'auto' 면 줄 단위로 헤더/bullet 자동 인식. */
  format?: 'plain' | 'auto'
}

const props = withDefaults(defineProps<Props>(), {
  content: '',
  placeholder: '',
  compact: false,
  format: 'plain',
})

const hasContent = computed(() => !!props.content && String(props.content).trim().length > 0)

const maxHeightStyle = computed(() => {
  if (props.maxHeight == null) return undefined
  return typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight
})

interface Block {
  // 같은 문장이 두 번 나올 수 있어 text 만으로는 key 가 되지 않는다. 만들면서
  // 순번을 붙여 둔다 — 템플릿에서 v-for 의 인덱스를 다시 꺼내지 않아도 된다.
  id: number
  kind: 'header' | 'bullet' | 'para'
  text: string
}

const blocks = computed<Block[]>(() => {
  if (props.format !== 'auto' || !hasContent.value) return []
  const raw = String(props.content)
  const lines = raw.split(/\r?\n/)
  const out: Block[] = []
  // bullet 들은 연속된 그룹 단위로 묶어서 동일 단락 안의 리스트가 끊기지 않게.
  for (const line of lines) {
    if (!line.trim()) continue
    const isIndented = /^\s+\S/.test(line)
    const trimmed = line.trim()
    const isHeader = !isIndented && /[:：]$/.test(trimmed)
    if (isHeader) {
      out.push({ id: out.length, kind: 'header', text: trimmed.replace(/[:：]$/, '') })
    } else if (isIndented) {
      out.push({ id: out.length, kind: 'bullet', text: trimmed })
    } else {
      out.push({ id: out.length, kind: 'para', text: trimmed })
    }
  }
  return out
})
</script>

<template>
  <div
    class="text-viewer"
    :class="{ 'is-compact': compact, 'is-empty': !hasContent, 'is-auto': format === 'auto' }"
    :style="maxHeightStyle ? { maxHeight: maxHeightStyle, overflowY: 'auto' } : undefined"
  >
    <template v-if="hasContent && format === 'auto'">
      <template v-for="b in blocks" :key="b.id">
        <h5 v-if="b.kind === 'header'" class="tv-header">{{ b.text }}</h5>
        <p v-else-if="b.kind === 'para'" class="tv-para">{{ b.text }}</p>
        <div v-else class="tv-bullet">
          <span class="tv-bullet__dot" aria-hidden="true">•</span>
          <span class="tv-bullet__text">{{ b.text }}</span>
        </div>
      </template>
    </template>
    <p
      v-else-if="hasContent"
      class="text-viewer__body"
    >{{ content }}</p>
    <span v-else-if="placeholder" class="text-viewer__placeholder">{{ placeholder }}</span>
  </div>
</template>

<style lang="scss" scoped>
.text-viewer {
  font-size: 0.9rem;
  line-height: 1.65;
  color: var(--color-text);

  &.is-compact {
    font-size: 0.825rem;
    line-height: 1.5;
  }

  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: var(--color-text-muted);
  }
}

.text-viewer__body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.text-viewer__placeholder {
  color: var(--color-text-muted);
  font-style: italic;
  font-size: 0.875em;
}

// ─── auto 모드 ───────────────────────────────────────────────────────
.is-auto {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tv-header {
  margin: 8px 0 2px;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--color-text-muted);
  text-transform: none;

  &:first-child {
    margin-top: 0;
  }
}

.tv-para {
  margin: 0;
  font-size: inherit;
  line-height: 1.55;
  color: var(--color-text);
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.tv-bullet {
  display: grid;
  grid-template-columns: 14px 1fr;
  align-items: start;
  column-gap: 6px;
  line-height: 1.5;
  padding-left: 2px;
}

.tv-bullet__dot {
  color: var(--color-text-muted);
  font-size: 0.9em;
  line-height: 1.5;
  text-align: center;
  user-select: none;
}

.tv-bullet__text {
  color: var(--color-text);
  word-break: keep-all;
  overflow-wrap: anywhere;
}
</style>
