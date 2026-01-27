<script setup lang="ts">
/**
 * DmnEditor.vue
 * BPMN.io의 dmn-js를 사용한 DMN 규칙 편집기
 */
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import DmnModeler from 'dmn-js/lib/Modeler'

// DMN CSS 임포트
import 'dmn-js/dist/assets/diagram-js.css'
import 'dmn-js/dist/assets/dmn-js-decision-table.css'
import 'dmn-js/dist/assets/dmn-js-drd.css'
import 'dmn-js/dist/assets/dmn-js-literal-expression.css'
import 'dmn-js/dist/assets/dmn-font/css/dmn.css'

const props = defineProps<{
  modelValue?: string  // DMN XML
  inputColumns?: Array<{ name: string; type: string }>  // 입력 컬럼 (ObjectType 필드)
  outputColumn?: string  // 출력 컬럼
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', xml: string): void
  (e: 'change', xml: string): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let modeler: DmnModeler | null = null

// 기본 DMN 템플릿 생성
function createDefaultDmn(): string {
  const inputCols = props.inputColumns || [{ name: 'input1', type: 'string' }]
  const outputCol = props.outputColumn || 'output'
  
  // 입력 컬럼 XML 생성
  const inputsXml = inputCols.map((col, idx) => `
        <input id="input${idx + 1}" label="${col.name}">
          <inputExpression id="inputExpr${idx + 1}" typeRef="${col.type === 'number' ? 'number' : 'string'}">
            <text>${col.name}</text>
          </inputExpression>
        </input>`).join('')
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" 
             xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" 
             xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" 
             xmlns:di="http://www.omg.org/spec/DMN/20180521/DI/" 
             id="Definitions_1" 
             name="DRD" 
             namespace="http://camunda.org/schema/1.0/dmn">
  <decision id="Decision_1" name="${outputCol}">
    <decisionTable id="DecisionTable_1">
      ${inputsXml}
      <output id="output1" label="${outputCol}" name="${outputCol}" typeRef="string" />
      <rule id="rule1">
        ${inputCols.map((_, idx) => `<inputEntry id="inputEntry${idx + 1}"><text></text></inputEntry>`).join('\n        ')}
        <outputEntry id="outputEntry1"><text>"결과값"</text></outputEntry>
      </rule>
    </decisionTable>
  </decision>
  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="DMNDiagram_1">
      <dmndi:DMNShape id="DMNShape_Decision_1" dmnElementRef="Decision_1">
        <dc:Bounds height="80" width="180" x="160" y="100" />
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>`
}

// 모델러 초기화
async function initModeler() {
  if (!containerRef.value) return
  
  // 기존 모델러 정리
  if (modeler) {
    modeler.destroy()
    modeler = null
  }
  
  await nextTick()
  
  modeler = new DmnModeler({
    container: containerRef.value,
    keyboard: {
      bindTo: document
    }
  })
  
  // 초기 DMN 로드
  const xml = props.modelValue || createDefaultDmn()
  
  try {
    await modeler.importXML(xml)
    console.log('[DmnEditor] DMN 로드 완료')
    
    // 변경 이벤트 리스너
    const eventBus = modeler.getActiveViewer()?.get('eventBus')
    if (eventBus) {
      eventBus.on('commandStack.changed', () => {
        saveDmn()
      })
    }
  } catch (err) {
    console.error('[DmnEditor] DMN 로드 실패:', err)
  }
}

// DMN 저장
async function saveDmn() {
  if (!modeler) return
  
  try {
    const { xml } = await modeler.saveXML({ format: true })
    if (xml) {
      emit('update:modelValue', xml)
      emit('change', xml)
    }
  } catch (err) {
    console.error('[DmnEditor] DMN 저장 실패:', err)
  }
}

// DMN XML 내보내기
async function exportXml(): Promise<string | null> {
  if (!modeler) return null
  
  try {
    const { xml } = await modeler.saveXML({ format: true })
    return xml || null
  } catch (err) {
    console.error('[DmnEditor] XML 내보내기 실패:', err)
    return null
  }
}

// 외부에서 사용할 수 있도록 노출
defineExpose({
  exportXml,
  saveDmn
})

// props.modelValue 변경 감지
watch(() => props.modelValue, async (newXml) => {
  if (modeler && newXml) {
    try {
      await modeler.importXML(newXml)
    } catch (err) {
      console.error('[DmnEditor] XML 업데이트 실패:', err)
    }
  }
})

onMounted(() => {
  initModeler()
})

onUnmounted(() => {
  if (modeler) {
    modeler.destroy()
    modeler = null
  }
})
</script>

<template>
  <div class="dmn-editor-container">
    <div ref="containerRef" class="dmn-canvas"></div>
  </div>
</template>

<style scoped>
.dmn-editor-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
  position: relative;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.dmn-canvas {
  width: 100%;
  height: 100%;
}
</style>

<style>
/* DMN 에디터 글로벌 스타일 오버라이드 */
.dmn-editor-container .djs-container {
  background: #fafafa !important;
}

.dmn-editor-container .dmn-decision-table-container {
  background: #fff;
}

/* 테이블 스타일 개선 */
.dmn-editor-container .tjs-table {
  border: 1px solid #e0e0e0;
}

.dmn-editor-container .tjs-table th,
.dmn-editor-container .tjs-table td {
  border: 1px solid #e0e0e0;
  padding: 8px 12px;
}

.dmn-editor-container .tjs-table th {
  background: #f5f5f5;
  font-weight: 600;
}

/* 입력/출력 헤더 색상 */
.dmn-editor-container .input-cell {
  background: rgba(66, 165, 245, 0.1);
}

.dmn-editor-container .output-cell {
  background: rgba(102, 187, 106, 0.1);
}
</style>
