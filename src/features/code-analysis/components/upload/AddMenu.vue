<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { IconPlus, IconFile, IconFolder } from '@/components/icons'

interface Props {
  title?: string
}

defineProps<Props>()

const emit = defineEmits<{
  pickFile: []
  pickFolder: []
}>()

const open = ref(false)
const rootRef = ref<HTMLElement>()

const toggle = () => {
  open.value = !open.value
}

const close = () => {
  open.value = false
}

const onPickFile = () => {
  close()
  emit('pickFile')
}

const onPickFolder = () => {
  close()
  emit('pickFolder')
}

const onDocClick = (e: MouseEvent) => {
  const el = rootRef.value
  if (!el) return
  if (e.target instanceof Node && el.contains(e.target)) return
  close()
}

onMounted(() => document.addEventListener('click', onDocClick, true))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick, true))
</script>

<template>
  <div ref="rootRef" class="add-menu">
    <button class="add-btn" type="button" @click.stop="toggle" :title="title || '추가'">
      <IconPlus :size="16" :stroke-width="2.5" />
    </button>
    <Transition name="dropdown">
      <div v-if="open" class="menu">
        <button class="menu-item" type="button" @click="onPickFile">
          <IconFile :size="14" />
          <span>파일 추가</span>
        </button>
        <button class="menu-item" type="button" @click="onPickFolder">
          <IconFolder :size="14" />
          <span>폴더 추가</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.add-menu {
  position: relative;
}

.add-btn {
  width: 32px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  border: 1px solid rgba(34, 139, 230, 0.35);
  background: rgba(34, 139, 230, 0.08);
  color: var(--color-accent);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(34, 139, 230, 0.15);
    border-color: var(--color-accent);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
}

.menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  z-index: 10;
  min-width: 140px;
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 10px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text);
  transition: all 0.15s;

  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text-bright);
  }
  
  &:first-child {
    border-bottom: 1px solid var(--color-border);
  }
}

// Dropdown animation
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>