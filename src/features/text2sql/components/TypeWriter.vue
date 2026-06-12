<template>
  <span class="typewriter">
    <span class="typed-text">{{ displayedText }}</span>
    <span v-if="isTyping" class="cursor">▌</span>
  </span>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  text: string
  speed?: number
}>(), {
  speed: 20
})

const emit = defineEmits<{
  complete: []
}>()

const displayedText = ref('')
const isTyping = ref(false)
let intervalId: ReturnType<typeof setInterval> | null = null

function startTyping() {
  displayedText.value = ''
  isTyping.value = true
  let idx = 0
  
  if (intervalId) clearInterval(intervalId)
  
  intervalId = setInterval(() => {
    if (idx < props.text.length) {
      displayedText.value += props.text[idx]
      idx++
    } else {
      if (intervalId) clearInterval(intervalId)
      isTyping.value = false
      emit('complete')
    }
  }, props.speed)
}

watch(() => props.text, (newText) => {
  if (newText) {
    startTyping()
  }
}, { immediate: true })

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})
</script>

<style scoped>
.typewriter {
  display: inline;
}

.typed-text {
  white-space: pre-wrap;
}

.cursor {
  color: var(--color-accent);
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>



