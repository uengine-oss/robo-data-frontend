import { createApp, h, ref } from 'vue'
import { createPinia } from 'pinia'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import CardinalityModal, {
  type Cardinality,
} from '@/workflows/schema-modeling/ui/CardinalityModal.vue'
import CatalogRelationshipDialog from '@/workflows/schema-modeling/ui/CatalogRelationshipDialog.vue'
import EditRelationshipDialog from '@/workflows/schema-modeling/ui/EditRelationshipDialog.vue'
import type { EditingRelationship } from '@/workflows/schema-modeling/model/relationshipInteraction'
import '@/styles/main.scss'

const relationship: EditingRelationship = {
  id: 'catalog:orders:customer_id:customers:id',
  source: 'user',
  sourceType: 'orders',
  sourceColumn: 'customer_id',
  targetType: 'customers',
  targetColumn: 'id',
  fromSchema: 'public',
  toSchema: 'public',
}

export function mountModelingDialogLifecycleHarness(target: Element): () => void {
  const app = createApp({
    setup() {
      const showAction = ref(false)
      const actionPending = ref(false)
      const actionError = ref<string | null>(null)
      const actionAttempts = ref(0)
      const showCardinality = ref(false)
      const cardinalityPending = ref(false)
      const cardinalityError = ref<string | null>(null)
      const cardinalityAttempts = ref(0)
      const showOntologyRelationship = ref(false)
      const showCatalogRelationship = ref(false)
      const eventText = ref('')

      function confirmAction() {
        actionAttempts.value += 1
        actionPending.value = true
        actionError.value = null
        window.setTimeout(() => {
          actionPending.value = false
          if (actionAttempts.value === 1) {
            actionError.value = '첫 번째 삭제 요청 실패'
            return
          }
          eventText.value = 'action:confirmed'
          showAction.value = false
        }, 120)
      }

      function confirmCardinality(cardinality: Cardinality, description: string) {
        cardinalityAttempts.value += 1
        cardinalityPending.value = true
        cardinalityError.value = null
        window.setTimeout(() => {
          cardinalityPending.value = false
          if (cardinalityAttempts.value === 1) {
            cardinalityError.value = '첫 번째 관계 생성 실패'
            return
          }
          eventText.value = `cardinality:${cardinality}:${description}`
          showCardinality.value = false
        }, 120)
      }

      return () => h('main', {
        class: 'modeling-dialog-harness',
        style: {
          maxWidth: '100%',
          minHeight: '100dvh',
          padding: '16px',
          overflow: 'hidden',
          boxSizing: 'border-box',
        },
      }, [
        h('header', {
          class: 'modeling-dialog-harness__actions',
          style: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
        }, [
          h('button', {
            id: 'open-action',
            onClick: () => {
              actionAttempts.value = 0
              actionError.value = null
              showAction.value = true
            },
          }, '공용 삭제 열기'),
          h('button', {
            id: 'open-cardinality',
            onClick: () => {
              cardinalityAttempts.value = 0
              cardinalityError.value = null
              showCardinality.value = true
            },
          }, '카디널리티 열기'),
          h('button', {
            id: 'open-ontology-relationship',
            onClick: () => { showOntologyRelationship.value = true },
          }, 'Ontology 관계 열기'),
          h('button', {
            id: 'open-catalog-relationship',
            onClick: () => { showCatalogRelationship.value = true },
          }, 'Catalog 관계 열기'),
          h('output', {
            id: 'modeling-dialog-event',
            style: {
              flexBasis: '100%',
              maxWidth: '100%',
              overflowWrap: 'anywhere',
            },
          }, eventText.value),
        ]),
        h(ActionDialog, {
          open: showAction.value,
          dialogId: 'harness-action',
          title: '공용 삭제',
          message: '공용 삭제 수명주기 확인',
          confirmLabel: '삭제',
          pending: actionPending.value,
          error: actionError.value,
          onCancel: () => { showAction.value = false },
          onConfirm: confirmAction,
        }),
        h(CardinalityModal, {
          isOpen: showCardinality.value,
          connection: {
            fromTable: 'orders',
            fromSchema: 'public',
            fromColumn: 'customer_id',
            toTable: 'customers',
            toSchema: 'public',
            toColumn: 'id',
          },
          pending: cardinalityPending.value,
          error: cardinalityError.value,
          onClose: () => { showCardinality.value = false },
          onConfirm: confirmCardinality,
        }),
        h(EditRelationshipDialog, {
          visible: showOntologyRelationship.value,
          mode: 'create',
          sourceType: 'Customer',
          sourceColumn: 'id',
          targetType: 'Order',
          targetColumn: 'customer_id',
          onClose: () => { showOntologyRelationship.value = false },
          onCreated: (created: unknown) => {
            eventText.value = `ontology:${JSON.stringify(created)}`
            showOntologyRelationship.value = false
          },
        }),
        h(CatalogRelationshipDialog, {
          visible: showCatalogRelationship.value,
          relationship,
          deleting: false,
          error: null,
          onClose: () => { showCatalogRelationship.value = false },
          onDelete: () => {
            eventText.value = 'catalog:delete-requested'
            showCatalogRelationship.value = false
          },
        }),
      ])
    },
  })

  app.use(createPinia())
  app.mount(target)
  return () => app.unmount()
}
