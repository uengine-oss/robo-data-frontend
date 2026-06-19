<script setup lang="ts">
/**
 * SideNav.vue — 왼쪽 아이콘 사이드바.
 * 메뉴는 features.config 단일 진실원천에서 파생한다(하드코딩 그룹/중복 함수 제거).
 *   - 임베드(host=architect) → embeddable 핵심만 플랫 렌더
 *   - 단독 실행            → 그룹 메뉴(확장 가능) + 분석/도구(bottom) 플랫
 */
import { ref, computed, inject } from 'vue'
import { useSessionStore } from '@/shared/stores/session'
import { storeToRefs } from 'pinia'
import { IconChevronDown } from '@/shared/icons'
import {
  FEATURE_GROUPS,
  FEATURES,
  EMBEDDED_FEATURES,
  type FeatureDef,
  type FeatureGroupId,
} from '@/shared/config/features'

const sessionStore = useSessionStore()
const { activeTab } = storeToRefs(sessionStore)

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

    </div>
  </nav>
</template>

<style lang="scss" scoped>
.side-nav {
  width: 52px;
  height: 100%;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  padding: 12px 0;
  transition: width 0.2s ease;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;                 // 스크롤바 숨김 → 아이콘이 폭 기준 정확히 중앙(스크롤바가 우측 먹어 좌측 치우치던 것 해결)
  &::-webkit-scrollbar { width: 0; height: 0; }

  &:hover {
    width: 180px;

    // 확장 시에만 좌측 정렬 + 자식 들여쓰기 (접힘 땐 중앙 정렬로 균형)
    .nav-item { justify-content: flex-start; gap: 12px; }
    .nav-child { padding-left: 20px; }

    .nav-label {
      display: block;
      opacity: 1;
      max-width: 100px;
    }

    .nav-chevron {
      display: flex;
      opacity: 1;
    }
  }
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 5px;
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: center;   // 접힘=아이콘 폭 중앙(근본). 펼침(hover) 때만 flex-start.
  gap: 0;                    // 접힘 땐 0 → 0폭 라벨과의 gap이 아이콘을 좌측으로 밀던 것 제거. 펼침 때만 12px.
  padding: 9px;
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

  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }

  // 선택 표시 = 둥근 배경 pill + accent 아이콘 (좌측 작대기 폐기 — 중앙정렬과 일관)
  &.active {
    background: rgba(34, 139, 230, 0.16);
    color: var(--color-accent);

    .nav-icon { color: var(--color-accent); }

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
  display: none;          // 접힘 땐 flex 흐름에서 완전 제거 → 아이콘만 남아 justify-center 로 정중앙(근본). 펼침 때만 표시.
  transition: max-width 0.2s ease, opacity 0.2s ease;
}

.nav-chevron {
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.2s ease;
  display: none;          // 접힘 땐 숨김(공간 0) → 헤더 아이콘도 중앙정렬. 펼침(hover) 때만 표시.
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
  padding: 0;   // 접힘 때 자식 아이콘이 헤더와 같은 세로축에 오도록(좌우 균형). 들여쓰기는 hover 시 .nav-child 가 담당.
}

.nav-divider {
  height: 1px;
  background: var(--color-border);
  margin: 8px 12px;
  opacity: 0.5;
}

.nav-child {
  padding: 10px 12px;
  border-radius: var(--radius-md);

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
