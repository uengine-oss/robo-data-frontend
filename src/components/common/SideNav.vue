<script setup lang="ts">
/**
 * SideNav.vue
 * 왼쪽 아이콘 사이드바 네비게이션 (코드 분석 핵심 메뉴 3개 + Graph Navigator 토글)
 */
import { useSessionStore } from '@/stores/session'
import { storeToRefs } from 'pinia'
import { IconDatabase, IconTable, IconFolder } from '@/components/icons'
import type { Component } from 'vue'
import { useNavigatorStore } from '@/stores/navigator'

const sessionStore = useSessionStore()
const navigatorStore = useNavigatorStore()
const { activeTab } = storeToRefs(sessionStore)
const { isPanelOpen: isNavigatorPanelOpen, activeView: graphActiveView }
  = storeToRefs(navigatorStore)

const toggleNavigator = () => {
  navigatorStore.setPanelOpen(!isNavigatorPanelOpen.value)
}

interface NavItem {
  id: string
  label: string
  icon: Component
}

// 코드 분석 핵심 메뉴: 코드 업로드 → 데이터 소스 → 스키마 관리
const navItems: NavItem[] = [
  { id: 'upload', label: '코드', icon: IconFolder },
  { id: 'datasources', label: '데이터 소스', icon: IconDatabase },
  { id: 'graph', label: '스키마 관리', icon: IconTable }
]

const setActiveTab = (tabId: string) => {
  sessionStore.setActiveTab(tabId)
}
</script>

<template>
  <nav class="side-nav">
    <div class="nav-items">
      <button v-for="item in navItems" :key="item.id" class="nav-item"
        :class="{ active: activeTab === item.id }" @click="setActiveTab(item.id)" :title="item.label">
        <span class="nav-icon">
          <component :is="item.icon" :size="24" />
        </span>
        <span class="nav-label">{{ item.label }}</span>
      </button>

      <!-- Navigator 패널 토글 (GraphTab 의 Graph 하위 뷰일 때만 노출) -->
      <template v-if="activeTab === 'graph' && graphActiveView === 'graph'">
        <div class="nav-divider"></div>
        <button class="nav-item" :class="{ active: isNavigatorPanelOpen }"
          @click="toggleNavigator" title="Project Navigator">
          <span class="nav-icon">
            <IconFolder :size="24" />
          </span>
          <span class="nav-label">Navigator</span>
        </button>
      </template>
    </div>
  </nav>
</template>

<style lang="scss" scoped>
.side-nav {
  width: 72px;
  height: 100%;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  padding: 12px 0;
  transition: width 0.2s ease;
  overflow-y: auto;
  overflow-x: hidden;

  &:hover {
    width: 180px;

    .nav-label {
      opacity: 1;
      max-width: 100px;
    }

    // 펼쳐지면 아이콘+라벨을 좌측 정렬 + 간격 복원
    .nav-item {
      justify-content: flex-start;
      gap: 12px;
    }
  }
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: center;  // 접힌 상태(72px): 아이콘 가로 중앙
  gap: 0;                   // 접힘: 라벨 너비0 + gap0 → 아이콘 정확히 가운데
  padding: 12px;
  background: transparent;
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  overflow: hidden;
  color: var(--color-text-light);
  width: 100%;
  text-align: left;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 0;
    background: linear-gradient(180deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
    border-radius: 0 2px 2px 0;
    transition: height 0.2s ease;
  }

  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }

  &.active {
    background: linear-gradient(135deg, rgba(34, 139, 230, 0.15) 0%, rgba(34, 139, 230, 0.08) 100%);
    color: var(--color-accent);

    &::before {
      height: 24px;
    }

    .nav-icon {
      transform: scale(1.1);
    }

    .nav-label {
      color: var(--color-accent);
      font-weight: 600;
    }
  }
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.nav-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-light);
  white-space: nowrap;
  opacity: 0;
  max-width: 0;
  overflow: hidden;
  transition: all 0.2s ease;
}

.nav-divider {
  height: 1px;
  background: var(--color-border);
  margin: 8px 12px;
  opacity: 0.5;
}
</style>
