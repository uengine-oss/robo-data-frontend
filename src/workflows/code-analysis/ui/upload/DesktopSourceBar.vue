<script setup lang="ts">
/**
 * 데스크톱 전용 소스 도구막대 — 「메타데이터 증강」 화면 맨 위.
 *
 * ## 왜 이 화면 안에 있는가
 *
 * 폴더를 고르고, 예제를 바꾸고, 데이터소스 메타데이터를 추출하는 세 가지는 **이 화면의
 * 도구**다. 한동안 데스크톱 셸(스튜디오) 쪽 헤더에 있었는데, 그러면 Ontologic 자기 헤더
 * 위에 헤더가 한 겹 더 쌓여 "제목이 두 번 나오는 화면" 이 된다.
 *
 * ## 다른 제품에는 나타나지 않는다
 *
 * `window.desktop` 이 있을 때만 그린다. 브라우저 배포에는 그 객체가 없으므로 이 막대도
 * 없다 — 이 저장소가 이미 쓰는 방식이고(`isPathMode`·`ScopeBrowser`), 그래서 데스크톱
 * 전용 UI 를 여기 두는 것이 예외가 아니라 기존 패턴이다.
 *
 * ## 무엇을 호출하는가
 *
 * - 파일시스템: `window.desktop.fs` (셸이 심어 준다)
 * - 메타데이터 추출: `/api/gateway/data-fabric/...` — 이 앱이 모든 HTTP 에 쓰는 그 접두사다
 * - 임베딩 설정 확인: `window.desktop.ensureEmbedding` — 없으면 묻지 않고 진행한다
 */
import { ref, onMounted } from 'vue'

const emit = defineEmits<{ (e: 'root-selected', path: string): void }>()

type Bridge = {
  fs?: {
    chooseRoot?: () => Promise<{ ok: boolean; data?: string; error?: string }>
    presetRoot?: () => Promise<{ ok: boolean; data?: string }>
    tutorialRoot?: () => Promise<{ ok: boolean; data?: string }>
    listExamples?: () => Promise<{ ok: boolean; data?: { names: string[]; current: string } }>
    chooseExample?: (name: string) => Promise<{ ok: boolean; data?: string; error?: string }>
  }
  ensureEmbedding?: () => Promise<unknown>
}

const bridge = (window as unknown as { desktop?: Bridge }).desktop
const hasDesktop = !!bridge?.fs?.chooseRoot

/** 폴더 이름이 곧 그래프의 데이터소스 이름이라 사용자가 무엇을 고르는지 알기 어렵다. */
const EXAMPLE_LABELS: Record<string, string> = {
  legacy: '레거시 예제 (이름이 코드 — 증강 필요)',
  manufacturing: '깨끗한 예제 (이름에 의미 있음)',
}

const projectRoot = ref('')
const rootIsTutorial = ref(false)
const picking = ref(false)
const note = ref('')

const exampleNames = ref<string[]>([])
const exampleCurrent = ref('')
const exampleSwitching = ref(false)

const datasources = ref<string[]>([])
const indexTarget = ref('')
const indexing = ref(false)
const indexNote = ref('')

async function pickFolder() {
  if (!bridge?.fs?.chooseRoot || picking.value) return
  picking.value = true
  note.value = ''
  try {
    const res = await bridge.fs.chooseRoot()
    if (res?.ok && res.data) {
      projectRoot.value = res.data
      rootIsTutorial.value = false
      emit('root-selected', res.data)
    } else if (res && !res.ok) {
      note.value = res.error || '폴더를 열지 못했습니다.'
    }
  } finally {
    picking.value = false
  }
}

async function switchExample(name: string) {
  if (!bridge?.fs?.chooseExample || !name || name === exampleCurrent.value) return
  exampleSwitching.value = true
  try {
    const res = await bridge.fs.chooseExample(name)
    if (res?.ok && res.data) {
      exampleCurrent.value = name
      projectRoot.value = res.data
      rootIsTutorial.value = true
      emit('root-selected', res.data)
    } else if (res?.error) {
      note.value = res.error
    }
  } finally {
    exampleSwitching.value = false
  }
}

async function loadDatasources() {
  try {
    const res = await fetch('/api/gateway/data-fabric/api/datasources?source=neo4j')
    const body = await res.json()
    datasources.value = (body?.datasources || []).map((d: { name: string }) => d.name)
  } catch {
    // 목록을 못 받아도 폴더 선택은 그대로 쓸 수 있다.
  }
}

async function augmentMetadata() {
  const name = indexTarget.value
  if (!name || indexing.value) return
  indexing.value = true
  indexNote.value = ''
  try {
    // **순서가 규칙이다** — 임베딩 설정을 먼저 확정한 뒤 추출을 시작한다. 반대로 하면
    // 사용자가 수십 초를 기다린 뒤에야 질문을 받는다.
    if (bridge?.ensureEmbedding) await bridge.ensureEmbedding()

    indexNote.value = '추출·색인 중…'
    const res = await fetch(
      `/api/gateway/data-fabric/api/datasources/${encodeURIComponent(name)}/extract-metadata-sync`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    )
    const body = await res.json().catch(() => ({}))
    indexNote.value = res.ok ? body.message || '완료' : `실패: ${body.detail || res.status}`
  } catch (err) {
    indexNote.value = `실패: ${(err as Error).message}`
  } finally {
    indexing.value = false
  }
}

onMounted(async () => {
  if (!hasDesktop) return
  void loadDatasources()

  // 열릴 때 폴더가 하나 들어와 있어야 경로 모드가 켜진다. 우선순위:
  // 검증용 환경변수 → 번들 예제. 사용자가 이미 고른 것이 있으면 상위가 유지한다.
  try {
    const preset = await bridge?.fs?.presetRoot?.()
    if (preset?.ok && preset.data) {
      projectRoot.value = preset.data
      emit('root-selected', preset.data)
      return
    }
  } catch { /* 검증용 경로다. 실패해도 사용자 흐름에 영향 없다. */ }

  try {
    const res = await bridge?.fs?.tutorialRoot?.()
    if (res?.ok && res.data) {
      projectRoot.value = res.data
      rootIsTutorial.value = true
      const list = await bridge?.fs?.listExamples?.()
      if (list?.ok && list.data) {
        exampleNames.value = list.data.names || []
        exampleCurrent.value = list.data.current || ''
      }
      emit('root-selected', res.data)
    }
  } catch { /* 예제를 못 펼쳐도 「폴더 선택」으로 고르는 길은 열려 있다. */ }
})
</script>

<template>
  <div v-if="hasDesktop" class="desktop-source-bar">
    <div class="dsb-row">
      <button class="dsb-btn" type="button" :disabled="picking" @click="pickFolder">
        📁 폴더 선택
      </button>
      <span v-if="projectRoot" class="dsb-path" :title="projectRoot">{{ projectRoot }}</span>
      <span v-else class="dsb-hint">
        폴더를 고르면 업로드 대신 그 폴더를 직접 엽니다.
      </span>
      <span v-if="rootIsTutorial" class="dsb-hint">
        설치본에 포함된 실습 예제입니다 — 「분석 시작」을 누르면 바로 인제스천이 시작됩니다.
      </span>
      <select
        v-if="exampleNames.length > 1"
        class="dsb-select"
        :value="exampleCurrent"
        :disabled="exampleSwitching"
        @change="switchExample(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="name in exampleNames" :key="name" :value="name">
          {{ EXAMPLE_LABELS[name] || name }}
        </option>
      </select>
      <span v-if="note" class="dsb-note">{{ note }}</span>
    </div>

    <div class="dsb-row">
      <select v-model="indexTarget" class="dsb-select" :disabled="indexing">
        <option value="">데이터소스 선택…</option>
        <option v-for="ds in datasources" :key="ds" :value="ds">{{ ds }}</option>
      </select>
      <button
        class="dsb-btn"
        type="button"
        :disabled="!indexTarget || indexing"
        @click="augmentMetadata"
      >
        🧭 메타데이터 증강 (추출 + 색인)
      </button>
      <span v-if="indexNote" class="dsb-note">{{ indexNote }}</span>
    </div>
  </div>
</template>

<style scoped>
.desktop-source-bar {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
}

.dsb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--border-color, #2a2f3a);
  background: var(--bg-secondary, #1b1e26);
  color: var(--text-primary, #e6e8eb);
}

.dsb-btn {
  flex: 0 0 auto;
  padding: 5px 12px;
  font-size: 12px;
  white-space: nowrap;
  border: 1px solid var(--border-color, #2a2f3a);
  border-radius: 4px;
  background: var(--bg-tertiary, #23262e);
  color: inherit;
  cursor: pointer;
}

.dsb-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 경로는 길다. 줄바꿈 대신 말줄임으로 한 줄을 지킨다 — 두 줄이 되면 아래 화면이 밀린다. */
.dsb-path,
.dsb-hint,
.dsb-note {
  overflow: hidden;
  flex: 1 1 auto;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary, #98a2b3);
}

.dsb-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.dsb-select {
  flex: 0 0 auto;
  padding: 4px 8px;
  font: inherit;
  border: 1px solid var(--border-color, #2a2f3a);
  border-radius: 6px;
  background: var(--bg-tertiary, #23262e);
  color: inherit;
}
</style>
