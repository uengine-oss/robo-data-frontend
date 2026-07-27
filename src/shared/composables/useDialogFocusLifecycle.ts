import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export interface DialogFocusLifecycleOptions {
  active: () => boolean
  dialog: Ref<HTMLElement | null>
  requestClose: () => void
  initialFocus?: () => HTMLElement | null
  canClose?: () => boolean
  suspended?: () => boolean
}

export function resolveDialogFocusWrap<T>(
  focusable: T[],
  current: T | null,
  shiftKey: boolean,
): T | null {
  if (focusable.length === 0) return null
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (shiftKey && current === first) return last
  if (!shiftKey && current === last) return first
  return null
}

export function useDialogFocusLifecycle({
  active,
  dialog,
  requestClose,
  initialFocus,
  canClose = () => true,
  suspended = () => false,
}: DialogFocusLifecycleOptions): void {
  let trigger: HTMLElement | null = null
  let listening = false
  let activation = 0

  function focusableElements(): HTMLElement[] {
    if (!dialog.value) return []
    return [...dialog.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
      .filter((element) =>
        !element.hidden
        && element.getAttribute('aria-hidden') !== 'true'
        && element.getClientRects().length > 0)
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!active() || event.defaultPrevented || suspended()) return

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (canClose()) requestClose()
      return
    }

    if (event.key !== 'Tab') return
    const focusable = focusableElements()
    if (focusable.length === 0) {
      event.preventDefault()
      dialog.value?.focus()
      return
    }

    const wrapTarget = resolveDialogFocusWrap(
      focusable,
      document.activeElement instanceof HTMLElement ? document.activeElement : null,
      event.shiftKey,
    )
    if (wrapTarget) {
      event.preventDefault()
      wrapTarget.focus()
    }
  }

  function startListening(): void {
    if (listening) return
    document.addEventListener('keydown', handleKeydown, true)
    listening = true
  }

  function stopListening(): void {
    if (!listening) return
    document.removeEventListener('keydown', handleKeydown, true)
    listening = false
  }

  function restoreTriggerFocus(): void {
    if (trigger?.isConnected) trigger.focus()
    trigger = null
  }

  watch(
    active,
    async (isActive) => {
      const currentActivation = ++activation
      if (!isActive) {
        stopListening()
        restoreTriggerFocus()
        return
      }

      const current = document.activeElement
      trigger = current instanceof HTMLElement && current !== document.body ? current : null
      startListening()
      await nextTick()
      if (!active() || currentActivation !== activation) return

      const target = initialFocus?.() ?? focusableElements()[0] ?? dialog.value
      target?.focus()
    },
    { immediate: true, flush: 'post' },
  )

  onBeforeUnmount(() => {
    activation += 1
    stopListening()
    restoreTriggerFocus()
  })
}
