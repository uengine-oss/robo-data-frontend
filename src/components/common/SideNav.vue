<script setup lang="ts">
/**
 * SideNav.vue
 * 왼쪽 아이콘 사이드바 네비게이션
 */
import { ref } from 'vue'
import { useSessionStore } from '@/stores/session'
import { storeToRefs } from 'pinia'
import {
  IconFolder,
  IconDatabase,
  IconMessageSquare,
  IconLineage,
  IconBook,
  IconBarChart,
  IconObservability,
  IconDataQuality,
  IconIncident,
  IconAlertConfig,
  IconEventDetection,
  IconWatchAgent,
  IconChevronDown,
  IconOntology,
  IconSearch,
  IconWhatIf,
  IconSecurity
} from '@/components/icons'
import type { Component } from 'vue'

const sessionStore = useSessionStore()
const { activeTab } = storeToRefs(sessionStore)

// 메뉴 확장 상태
const isPhysicalLayerExpanded = ref(true)  // 피지컬 레이어 기본 펼침
const isDomainLayerExpanded = ref(false)
const isDynamicLayerExpanded = ref(false)

interface NavItem {
  id: string
  label: string
  icon: Component
}

interface NavGroup {
  id: string
  label: string
  icon: Component
  children: NavItem[]
}

// 피지컬 레이어 그룹 (코드 + 데이터 소스 + 스키마 관리 + 자연어 질의 + Security Guard)
const physicalLayerGroup: NavGroup = {
  id: 'physical-layer',
  label: '피지컬 레이어',
  icon: IconDatabase,
  children: [
    { id: 'upload', label: '코드', icon: IconFolder },
    { id: 'datasources', label: '데이터 소스', icon: IconDatabase },
    { id: 'graph', label: '스키마 관리', icon: IconDatabase },
    { id: 'text2sql', label: '자연어 질의', icon: IconMessageSquare },
    { id: 'security-guard', label: '보안관리자', icon: IconSecurity }
  ]
}

// 도메인 레이어 그룹 (도메인 스키마 + 온톨로지 관리 + 오브젝트 탐색기 + 자연어 질의)
// 참고: '문서에서 스키마 추출' (id: 'ontology')은 숨김 처리
const domainLayerGroup: NavGroup = {
  id: 'domain-layer',
  label: '도메인 레이어',
  icon: IconOntology,
  children: [
    { id: 'schema-modeling', label: '도메인 스키마', icon: IconDatabase },
    { id: 'multi-layer-ontology', label: '온톨로지 관리', icon: IconLineage },
    { id: 'object-explorer', label: '오브젝트 탐색기', icon: IconSearch },
    // { id: 'ontology', label: '문서에서 스키마 추출', icon: IconOntology },  // 임시 숨김
    { id: 'domain-text2sql', label: '자연어 질의', icon: IconMessageSquare }
  ]
}

// 다이나믹 레이어 그룹 (What-If 시뮬레이터 + 관찰 가능성)
const dynamicLayerGroup: NavGroup = {
  id: 'dynamic-layer',
  label: '다이나믹 레이어',
  icon: IconObservability,
  children: [
    { id: 'whatif', label: 'What-If 시뮬레이터', icon: IconWhatIf },
    { id: 'data-quality', label: '데이터 품질', icon: IconDataQuality },
    { id: 'incident-manager', label: '사고 관리자', icon: IconIncident },
    { id: 'alerts', label: '알림들', icon: IconAlertConfig },
    { id: 'event-detection', label: '이벤트 감지', icon: IconEventDetection },
    { id: 'watch-agent', label: '감시 에이전트', icon: IconWatchAgent }
  ]
}

// 하단 메뉴 (분석/도구) - What-If 제거됨
const bottomNavItems: NavItem[] = [
  { id: 'lineage', label: '데이터 리니지', icon: IconLineage },
  { id: 'glossary', label: '용어 관리', icon: IconBook },
  { id: 'olap', label: 'OLAP 분석', icon: IconBarChart }
]

const setActiveTab = (tabId: string) => {
  sessionStore.setActiveTab(tabId)
}

// 피지컬 레이어 그룹 토글
const togglePhysicalLayer = () => {
  isPhysicalLayerExpanded.value = !isPhysicalLayerExpanded.value
}

const isPhysicalLayerActive = () => {
  return physicalLayerGroup.children.some(child => activeTab.value === child.id)
}

// 도메인 레이어 그룹 토글
const toggleDomainLayer = () => {
  isDomainLayerExpanded.value = !isDomainLayerExpanded.value
}

const isDomainLayerActive = () => {
  return domainLayerGroup.children.some(child => activeTab.value === child.id)
}

// 다이나믹 레이어 그룹 토글
const toggleDynamicLayer = () => {
  isDynamicLayerExpanded.value = !isDynamicLayerExpanded.value
}

const isDynamicLayerActive = () => {
  return dynamicLayerGroup.children.some(child => activeTab.value === child.id)
}
</script>

<template>
  <nav class="side-nav">
    <div class="nav-items">
      <!-- 피지컬 레이어 그룹 (코드 + 데이터 소스 + 스키마 관리 + 자연어 질의) -->
      <div class="nav-group" :class="{ expanded: isPhysicalLayerExpanded, active: isPhysicalLayerActive() }">
        <button class="nav-item nav-group-header" :class="{ active: isPhysicalLayerActive() }"
          @click="togglePhysicalLayer" :title="physicalLayerGroup.label">
          <span class="nav-icon">
            <component :is="physicalLayerGroup.icon" :size="20" />
          </span>
          <span class="nav-label">{{ physicalLayerGroup.label }}</span>
          <span class="nav-chevron" :class="{ rotated: isPhysicalLayerExpanded }">
            <IconChevronDown :size="14" />
          </span>
        </button>

        <div class="nav-group-children" v-show="isPhysicalLayerExpanded">
          <button v-for="child in physicalLayerGroup.children" :key="child.id" class="nav-item nav-child"
            :class="{ active: activeTab === child.id }" @click="setActiveTab(child.id)" :title="child.label">
            <span class="nav-icon">
              <component :is="child.icon" :size="18" />
            </span>
            <span class="nav-label">{{ child.label }}</span>
          </button>
        </div>
      </div>

      <!-- 도메인 레이어 그룹 (확장 가능) -->
      <div class="nav-group" :class="{ expanded: isDomainLayerExpanded, active: isDomainLayerActive() }">
        <button class="nav-item nav-group-header" :class="{ active: isDomainLayerActive() }"
          @click="toggleDomainLayer" :title="domainLayerGroup.label">
          <span class="nav-icon">
            <component :is="domainLayerGroup.icon" :size="20" />
          </span>
          <span class="nav-label">{{ domainLayerGroup.label }}</span>
          <span class="nav-chevron" :class="{ rotated: isDomainLayerExpanded }">
            <IconChevronDown :size="14" />
          </span>
        </button>

        <div class="nav-group-children" v-show="isDomainLayerExpanded">
          <button v-for="child in domainLayerGroup.children" :key="child.id" class="nav-item nav-child"
            :class="{ active: activeTab === child.id }" @click="setActiveTab(child.id)" :title="child.label">
            <span class="nav-icon">
              <component :is="child.icon" :size="18" />
            </span>
            <span class="nav-label">{{ child.label }}</span>
          </button>
        </div>
      </div>

      <!-- 다이나믹 레이어 그룹 (확장 가능) -->
      <div class="nav-group" :class="{ expanded: isDynamicLayerExpanded, active: isDynamicLayerActive() }">
        <button class="nav-item nav-group-header" :class="{ active: isDynamicLayerActive() }"
          @click="toggleDynamicLayer" :title="dynamicLayerGroup.label">
          <span class="nav-icon">
            <component :is="dynamicLayerGroup.icon" :size="20" />
          </span>
          <span class="nav-label">{{ dynamicLayerGroup.label }}</span>
          <span class="nav-chevron" :class="{ rotated: isDynamicLayerExpanded }">
            <IconChevronDown :size="14" />
          </span>
        </button>

        <div class="nav-group-children" v-show="isDynamicLayerExpanded">
          <button v-for="child in dynamicLayerGroup.children" :key="child.id" class="nav-item nav-child"
            :class="{ active: activeTab === child.id }" @click="setActiveTab(child.id)" :title="child.label">
            <span class="nav-icon">
              <component :is="child.icon" :size="18" />
            </span>
            <span class="nav-label">{{ child.label }}</span>
          </button>
        </div>
      </div>
      
      <!-- 구분선 -->
      <div class="nav-divider"></div>
      
      <!-- 하단 메뉴: 분석/도구 -->
      <button v-for="item in bottomNavItems" :key="item.id" class="nav-item" :class="{ active: activeTab === item.id }"
        @click="setActiveTab(item.id)" :title="item.label">
        <span class="nav-icon">
          <component :is="item.icon" :size="20" />
        </span>
        <span class="nav-label">{{ item.label }}</span>
      </button>
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

    .nav-chevron {
      opacity: 1;
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
  gap: 12px;
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

.nav-chevron {
  margin-left: auto;
  opacity: 0;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;

  &.rotated {
    transform: rotate(180deg);
  }
}

// Observability 그룹 스타일
.nav-group {
  display: flex;
  flex-direction: column;

  &.active .nav-group-header {
    color: var(--color-accent);

    .nav-icon {
      color: var(--color-accent);
    }
  }

  &.expanded {
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-lg);
    margin-top: 4px;

    .nav-group-header {
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    }
  }
}

.nav-group-header {
  .nav-chevron {
    color: var(--color-text-muted);
  }
}

.nav-group-children {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  padding-top: 0;
}

.nav-divider {
  height: 1px;
  background: var(--color-border);
  margin: 8px 12px;
  opacity: 0.5;
}

.nav-child {
  padding: 10px 12px;
  padding-left: 20px;
  border-radius: var(--radius-md);

  &::before {
    left: 8px;
  }

  .nav-icon {
    color: var(--color-text-muted);
  }

  &:hover .nav-icon {
    color: var(--color-text);
  }

  &.active {
    background: linear-gradient(135deg, rgba(34, 139, 230, 0.2) 0%, rgba(34, 139, 230, 0.1) 100%);

    .nav-icon {
      color: var(--color-accent);
    }
  }
}
</style>
