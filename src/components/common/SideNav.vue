<script setup lang="ts">
/**
 * SideNav.vue — 왼쪽 아이콘 사이드바.
 * 메뉴는 features.config 단일 진실원천에서 파생한다(하드코딩 그룹/중복 함수 제거).
 *   - 임베드(host=architect) → embeddable 핵심만 플랫 렌더
 *   - 단독 실행            → 그룹 메뉴(확장 가능) + 분석/도구(bottom) 플랫
 */
import { ref, computed, inject } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useNavigatorStore } from '@/stores/navigator'
import { storeToRefs } from 'pinia'
import { IconChevronDown, IconFolder } from '@/components/icons'
import {
  FEATURE_GROUPS,
  FEATURES,
  EMBEDDED_FEATURES,
  type FeatureDef,
  type FeatureGroupId,
} from '@/config/features'

const sessionStore = useSessionStore()
const navigatorStore = useNavigatorStore()
const { activeTab } = storeToRefs(sessionStore)
const { isPanelOpen: isNavigatorPanelOpen, activeView: graphActiveView }
  = storeToRefs(navigatorStore)

const isEmbedded = inject<boolean>('isEmbedded', false)

// 표시 대상(임베드=핵심만) + 메뉴 숨김(hidden) 제외.
const visibleFeatures = computed<FeatureDef[]>(() =>
  (isEmbedded ? EMBEDDED_FEATURES : FEATURES).filter(f => !f.hidden)
)

// 그룹 헤더가 있는 그룹(비어있는 그룹 제외). 'bottom' 은 헤더 없이 플랫.
const groups = computed(() =>
  FEATURE_GROUPS
    .map(g => ({ ...g, children: visibleFeatures.value.filter(f => f.group === g.id) }))
    .filter(g => g.children.length > 0)
)
const bottomItems = computed(() => visibleFeatures.value.filter(f => f.group === 'bottom'))

// 그룹 펼침 상태 — defaultExpanded 로 초기화. (그룹별 중복 ref/함수 → 단일 맵으로 일반화)
const expanded = ref<Record<string, boolean>>(
  Object.fromEntries(FEATURE_GROUPS.map(g => [g.id, !!g.defaultExpanded]))
)
const toggleGroup = (id: FeatureGroupId) => { expanded.value[id] = !expanded.value[id] }
const isGroupActive = (children: FeatureDef[]) => children.some(c => c.id === activeTab.value)

const setActiveTab = (id: string) => sessionStore.setActiveTab(id)
const toggleNavigator = () => navigatorStore.setPanelOpen(!isNavigatorPanelOpen.value)
</script>

<template>
  <nav class="side-nav">
    <div class="nav-items">
      <!-- 임베드: 핵심 메뉴 플랫 렌더 -->
      <template v-if="isEmbedded">
        <button v-for="f in visibleFeatures" :key="f.id" class="nav-item"
          :class="{ active: activeTab === f.id }" @click="setActiveTab(f.id)" :title="f.label">
          <span class="nav-icon"><component :is="f.icon" :size="20" /></span>
          <span class="nav-label">{{ f.label }}</span>
        </button>
      </template>

      <!-- 단독: 그룹 메뉴 + 분석/도구 -->
      <template v-else>
        <template v-for="g in groups" :key="g.id">
          <div v-if="g.dividerBefore" class="nav-divider"></div>
          <div class="nav-group" :class="{ expanded: expanded[g.id], active: isGroupActive(g.children) }">
            <button class="nav-item nav-group-header" :class="{ active: isGroupActive(g.children) }"
              @click="toggleGroup(g.id)" :title="g.label">
              <span class="nav-icon"><component :is="g.icon" :size="20" /></span>
              <span class="nav-label">{{ g.label }}</span>
              <span class="nav-chevron" :class="{ rotated: expanded[g.id] }">
                <IconChevronDown :size="14" />
              </span>
            </button>
            <div class="nav-group-children" v-show="expanded[g.id]">
              <button v-for="child in g.children" :key="child.id" class="nav-item nav-child"
                :class="{ active: activeTab === child.id }" @click="setActiveTab(child.id)" :title="child.label">
                <span class="nav-icon"><component :is="child.icon" :size="18" /></span>
                <span class="nav-label">{{ child.label }}</span>
              </button>
            </div>
          </div>
        </template>

        <!-- 분석/도구 (그룹 헤더 없이 플랫) -->
        <button v-for="item in bottomItems" :key="item.id" class="nav-item"
          :class="{ active: activeTab === item.id }" @click="setActiveTab(item.id)" :title="item.label">
          <span class="nav-icon"><component :is="item.icon" :size="20" /></span>
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </template>

      <!-- Navigator 패널 토글 (GraphTab 의 Graph 하위 뷰일 때만) -->
      <template v-if="activeTab === 'graph' && graphActiveView === 'graph'">
        <div class="nav-divider"></div>
        <button class="nav-item" :class="{ active: isNavigatorPanelOpen }"
          @click="toggleNavigator" title="Project Navigator">
          <span class="nav-icon">
            <IconFolder :size="20" />
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
