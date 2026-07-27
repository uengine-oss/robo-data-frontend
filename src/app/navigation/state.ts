import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'
import type { FeatureNavigationPort } from '@/shared/navigation/featureNavigation'

const DEFAULT_FEATURE_ID = 'upload'

/** App-owned active feature and one-shot handoff payloads. */
export const useAppNavigationStore = defineStore('app-navigation', () => {
  const activeFeatureId = ref(DEFAULT_FEATURE_ID)
  const handoffs = ref<Record<string, unknown>>({})

  function setActiveFeature(featureId: string): void {
    activeFeatureId.value = featureId
  }

  function openFeature<T>(featureId: string, payload?: T): void {
    if (payload !== undefined) {
      handoffs.value = { ...handoffs.value, [featureId]: payload }
    }
    activeFeatureId.value = featureId
  }

  function peekHandoff<T>(featureId: string): T | null {
    return Object.prototype.hasOwnProperty.call(handoffs.value, featureId)
      ? handoffs.value[featureId] as T
      : null
  }

  function consumeHandoff<T>(featureId: string): T | null {
    const payload = peekHandoff<T>(featureId)
    if (payload === null) return null
    const remaining = { ...handoffs.value }
    delete remaining[featureId]
    handoffs.value = remaining
    return payload
  }

  function resetNavigation(): void {
    handoffs.value = {}
    activeFeatureId.value = DEFAULT_FEATURE_ID
  }

  return {
    activeFeatureId,
    handoffs,
    setActiveFeature,
    openFeature,
    peekHandoff,
    consumeHandoff,
    resetNavigation,
  }
})

export function createFeatureNavigationPort(store: ReturnType<typeof useAppNavigationStore>): FeatureNavigationPort {
  const { activeFeatureId } = storeToRefs(store)
  return {
    activeFeatureId,
    open: (featureId, payload) => store.openFeature(featureId, payload),
    peek: featureId => store.peekHandoff(featureId),
    consume: featureId => store.consumeHandoff(featureId),
  }
}
