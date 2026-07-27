import { computed, reactive, ref } from 'vue'

export function useGraphTypeFilter() {
  const hidden = ref<string[]>([])
  const count = computed(() => hidden.value.length)

  function toggle(type: string) {
    const next = new Set(hidden.value)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    hidden.value = [...next]
  }

  function isShown(type: string): boolean {
    return !hidden.value.includes(type)
  }

  function clear() {
    hidden.value = []
  }

  return reactive({
    hidden,
    count,
    toggle,
    isShown,
    clear,
  })
}
