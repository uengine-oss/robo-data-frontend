import { createApp, h, ref } from 'vue'
import { createPinia } from 'pinia'
import DataConfirmModal, {
  type DataAction,
  type NameCaseOption,
} from '@/shared/components/DataConfirmModal.vue'
import TablePermissions from '@/domains/security/ui/TablePermissions.vue'
import FeedbackModal from '@/domains/ontology/ui/extraction/FeedbackModal.vue'
import SynonymSuggestionModal from '@/domains/ontology/ui/modeling/SynonymSuggestionModal.vue'
import '@/styles/main.scss'

export function mountFormDialogLifecycleHarness(target: Element): () => void {
  const app = createApp({
    setup() {
      const showData = ref(false)
      const showFeedback = ref(false)
      const showSynonyms = ref(false)
      const feedback = ref('')
      const eventText = ref('')

      function recordData(action: DataAction, nameCase: NameCaseOption) {
        eventText.value = `data:${action}:${nameCase}`
        showData.value = false
      }

      return () => h('main', { class: 'dialog-harness' }, [
        h('header', { class: 'dialog-harness__actions' }, [
          h('button', { id: 'open-data', onClick: () => { showData.value = true } }, '기존 데이터 처리 열기'),
          h('button', { id: 'open-feedback', onClick: () => { showFeedback.value = true } }, '스키마 피드백 열기'),
          h('button', { id: 'open-synonyms', onClick: () => { showSynonyms.value = true } }, '동의어 제안 열기'),
          h('output', { id: 'harness-event' }, eventText.value),
        ]),
        h('section', { class: 'dialog-harness__security', 'aria-label': '보안 권한 테스트' }, [
          h(TablePermissions),
        ]),
        h(DataConfirmModal, {
          isOpen: showData.value,
          nodeCount: 42,
          onClose: () => { showData.value = false },
          onConfirm: recordData,
        }),
        h(FeedbackModal, {
          isOpen: showFeedback.value,
          isLoading: false,
          feedback: feedback.value,
          'onUpdate:feedback': (value: string) => { feedback.value = value },
          onClose: () => { showFeedback.value = false },
          onSubmit: () => {
            eventText.value = `feedback:${feedback.value}`
            showFeedback.value = false
          },
        }),
        showSynonyms.value
          ? h(SynonymSuggestionModal, {
              suggestions: [{
                termId: 'term-order',
                termName: '주문',
                glossaryId: 'commerce',
                glossaryName: '커머스',
                suggestedSynonym: '오더',
                similarity: 0.92,
                sourceNodeName: 'Order',
                sourceLayer: 'domain',
                accepted: false,
              }],
              onClose: () => { showSynonyms.value = false },
              onApplied: (count: number) => {
                eventText.value = `synonyms:${count}`
                showSynonyms.value = false
              },
            })
          : null,
      ])
    },
  })

  app.use(createPinia())
  app.mount(target)
  return () => app.unmount()
}
