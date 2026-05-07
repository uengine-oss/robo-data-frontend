/**
 * useResize.ts
 * 패널 리사이즈 로직을 위한 재사용 가능한 composable.
 *
 * origin 옵션으로 좌표 기준점을 결정:
 *   - 'window-end'  (default): window.innerWidth/Height - clientX/Y  (오른쪽/하단 패널)
 *   - 'window-start': clientX/Y                                       (왼쪽/상단 패널)
 *   - 'panel-left'  : clientX - panelRef.left  (가로) — 다른 패널 옆에 붙는 사이드 패널
 */

import { ref, onUnmounted, type Ref } from 'vue'

type ResizeDirection = 'horizontal' | 'vertical'

export type ResizeOrigin = 'window-end' | 'window-start' | 'panel-left'

interface ResizeOptions {
  /** 리사이즈 방향 */
  direction: ResizeDirection
  /** 초기값 */
  initialValue: number
  /** 최소값 */
  min: number
  /** 최대값 */
  max: number
  /** 좌표 기준점 (기본: 'window-end') */
  origin?: ResizeOrigin
  /** origin === 'panel-left' 일 때 panelRef 필수 */
  panelRef?: Ref<HTMLElement | null>
  /** 하위호환: true 이면 origin 무시 안 하고 'window-end' (기본) */
  fromEnd?: boolean
}

export function useResize(options: ResizeOptions) {
  const { direction, initialValue, min, max, panelRef } = options
  // fromEnd 가 명시적으로 false 이면 'window-start', 그 외엔 origin (없으면 'window-end')
  const origin: ResizeOrigin =
    options.origin ??
    (options.fromEnd === false ? 'window-start' : 'window-end')

  const value = ref(initialValue)
  const isResizing = ref(false)

  function startResize(e: MouseEvent): void {
    isResizing.value = true
    document.addEventListener('mousemove', onResize)
    document.addEventListener('mouseup', stopResize)
    e.preventDefault()
  }

  function onResize(e: MouseEvent): void {
    if (!isResizing.value) return

    let newValue: number

    if (origin === 'panel-left') {
      // 패널 왼쪽 경계 기준 — panelRef 필수
      if (!panelRef?.value) return
      const rect = panelRef.value.getBoundingClientRect()
      newValue = direction === 'horizontal' ? e.clientX - rect.left : e.clientY - rect.top
    } else if (origin === 'window-end') {
      newValue = direction === 'horizontal'
        ? window.innerWidth - e.clientX
        : window.innerHeight - e.clientY
    } else {
      // window-start
      newValue = direction === 'horizontal' ? e.clientX : e.clientY
    }

    value.value = Math.max(min, Math.min(max, newValue))
  }

  function stopResize(): void {
    isResizing.value = false
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
  }

  onUnmounted(() => {
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
  })

  return {
    value,
    isResizing,
    startResize,
  }
}
