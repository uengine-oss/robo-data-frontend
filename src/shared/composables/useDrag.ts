import { ref, onUnmounted, type Ref } from 'vue'

export interface UseDragOptions {
  initialX?: number
  initialY?: number
  boundToWindow?: boolean
  minX?: number
  minY?: number
}

export interface UseDragReturn {
  x: Ref<number>
  y: Ref<number>
  isDragging: Ref<boolean>
  startDrag: (e: MouseEvent) => void
  resetPosition: () => void
}

export function useDrag(options: UseDragOptions = {}): UseDragReturn {
  const {
    initialX = 0,
    initialY = 0,
    boundToWindow = true,
    minX = 0,
    minY = 0,
  } = options

  const x = ref(Math.max(minX, initialX))
  const y = ref(Math.max(minY, initialY))
  const isDragging = ref(false)
  
  let startX = 0
  let startY = 0
  let offsetX = 0
  let offsetY = 0

  function startDrag(e: MouseEvent) {
    // 버튼이나 다른 인터랙티브 요소에서 시작하면 무시
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('.collapse-btn')) {
      return
    }
    
    e.preventDefault()
    isDragging.value = true
    startX = e.clientX
    startY = e.clientY
    offsetX = x.value
    offsetY = y.value
    
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging.value) return

    let newX = offsetX + (e.clientX - startX)
    let newY = offsetY + (e.clientY - startY)

    if (boundToWindow) {
      // 화면 안에 최소 100px 은 보이도록 clamp (CSS left/top 기반 좌표).
      const PAD = 100
      newX = Math.max(minX, Math.min(window.innerWidth - PAD, newX))
      newY = Math.max(minY, Math.min(window.innerHeight - PAD, newY))
    }

    x.value = newX
    y.value = newY
  }

  function onMouseUp() {
    isDragging.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  function resetPosition() {
    x.value = Math.max(minX, initialX)
    y.value = Math.max(minY, initialY)
  }

  onUnmounted(() => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  })

  return {
    x,
    y,
    isDragging,
    startDrag,
    resetPosition
  }
}
