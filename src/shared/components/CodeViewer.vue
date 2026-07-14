<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import 'monaco-editor/esm/vs/basic-languages/bat/bat.contribution'
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution'
import 'monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution'
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution'
import 'monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution'
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution'
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution'
import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution'
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution'
import 'monaco-editor/esm/vs/basic-languages/less/less.contribution'
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'
import 'monaco-editor/esm/vs/basic-languages/pgsql/pgsql.contribution'
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution'
import 'monaco-editor/esm/vs/basic-languages/powershell/powershell.contribution'
import 'monaco-editor/esm/vs/basic-languages/protobuf/protobuf.contribution'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
import 'monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution'
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution'
import 'monaco-editor/esm/vs/basic-languages/scss/scss.contribution'
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution'
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'
import { resolveCodeLanguage } from '@/shared/utils/codeLanguage'

interface Props {
  content: string
  filePath?: string
  languageHint?: string
  maxHeight?: number
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  filePath: '',
  languageHint: '',
  maxHeight: 380,
  ariaLabel: '원문 코드',
})

const host = ref<HTMLElement | null>(null)
const language = computed(() => resolveCodeLanguage(props.filePath, props.languageHint))
const height = computed(() => {
  const lines = Math.max(1, props.content.split(/\r?\n/).length)
  return Math.min(props.maxHeight, Math.max(112, lines * 19 + 20))
})

let editor: monaco.editor.IStandaloneCodeEditor | undefined

const globalWithMonaco = globalThis as typeof globalThis & {
  MonacoEnvironment?: { getWorker: (_moduleId: string, label: string) => Worker }
}
if (!globalWithMonaco.MonacoEnvironment) {
  globalWithMonaco.MonacoEnvironment = {
    getWorker: (_moduleId, label) => label === 'json' ? new JsonWorker() : new EditorWorker(),
  }
}

function createEditor(): void {
  if (!host.value || editor) return
  editor = monaco.editor.create(host.value, {
    value: props.content,
    language: language.value,
    theme: 'vs-dark',
    readOnly: true,
    domReadOnly: true,
    automaticLayout: true,
    minimap: { enabled: false },
    lineNumbers: 'on',
    lineNumbersMinChars: 3,
    folding: false,
    glyphMargin: false,
    scrollBeyondLastLine: false,
    renderLineHighlight: 'none',
    overviewRulerLanes: 0,
    wordWrap: 'off',
    tabSize: 4,
    fontFamily: "'Cascadia Code', 'Consolas', monospace",
    fontSize: 12,
    lineHeight: 19,
    padding: { top: 10, bottom: 10 },
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    contextmenu: true,
  })
}

onMounted(() => nextTick(createEditor))
onBeforeUnmount(() => {
  editor?.dispose()
  editor = undefined
})

watch(() => props.content, value => {
  const model = editor?.getModel()
  if (model && model.getValue() !== value) model.setValue(value)
})

watch(language, value => {
  const model = editor?.getModel()
  if (model) monaco.editor.setModelLanguage(model, value)
})
</script>

<template>
  <div
    ref="host"
    class="code-viewer"
    :style="{ height: `${height}px` }"
    role="region"
    :aria-label="ariaLabel"
    :data-language="language"
  />
</template>

<style lang="scss" scoped>
.code-viewer {
  width: 100%;
  min-width: 0;
  overflow: hidden;
  background: #1e1e1e;
}
</style>
