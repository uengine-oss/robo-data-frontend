<script setup lang="ts">
/**
 * SecurityGuardTab.vue
 * Data Secure Guard 통합 관리 UI
 */
import { ref } from 'vue'
import UserManagement from './UserManagement.vue'
import RoleManagement from './RoleManagement.vue'
import TablePermissions from './TablePermissions.vue'
import AuditLogs from './AuditLogs.vue'
import SecurityPolicies from './SecurityPolicies.vue'
import { IconSecurity } from '@/shared/icons'

type SubTab = 'users' | 'roles' | 'tables' | 'policies' | 'audit'

const activeSubTab = ref<SubTab>('users')

const subTabs = [
  { id: 'users', label: '사용자 관리', icon: '👤' },
  { id: 'roles', label: '역할 관리', icon: '🎭' },
  { id: 'tables', label: '테이블 권한', icon: '📊' },
  { id: 'policies', label: '보안 정책', icon: '🛡️' },
  { id: 'audit', label: '감사 로그', icon: '📋' }
]
</script>

<template>
  <div class="security-guard-tab">
    <!-- Header -->
    <header class="tab-header">
      <div class="header-content">
        <div class="header-icon">
          <IconSecurity :size="28" />
        </div>
        <div class="header-text">
          <h1>보안관리자</h1>
          <p>RBAC 기반 접근 제어 및 보안 관리</p>
        </div>
      </div>
    </header>

    <!-- Sub Navigation -->
    <nav class="sub-nav">
      <button
        v-for="tab in subTabs"
        :key="tab.id"
        type="button"
        class="sub-nav-btn"
        :class="{ active: activeSubTab === tab.id }"
        :aria-current="activeSubTab === tab.id ? 'page' : undefined"
        @click="activeSubTab = tab.id as SubTab"
      >
        <span class="sub-nav-icon">{{ tab.icon }}</span>
        <span class="sub-nav-label">{{ tab.label }}</span>
      </button>
    </nav>

    <!-- Content -->
    <main class="tab-content">
      <UserManagement v-if="activeSubTab === 'users'" />
      <RoleManagement v-else-if="activeSubTab === 'roles'" />
      <TablePermissions v-else-if="activeSubTab === 'tables'" />
      <SecurityPolicies v-else-if="activeSubTab === 'policies'" />
      <AuditLogs v-else-if="activeSubTab === 'audit'" />
    </main>
  </div>
</template>

<style lang="scss" scoped>
.security-guard-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
}

.tab-header {
  padding: 24px 32px;
  background: linear-gradient(135deg, rgba(34, 139, 230, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%);
  border-bottom: 1px solid var(--color-border);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-accent) 0%, #6366f1 100%);
  border-radius: 16px;
  color: white;
  box-shadow: 0 4px 12px rgba(34, 139, 230, 0.3);
}

.header-text {
  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text);
    letter-spacing: -0.5px;
  }

  p {
    margin: 4px 0 0;
    font-size: 14px;
    color: var(--color-text-light);
  }
}

.sub-nav {
  display: flex;
  gap: 8px;
  padding: 16px 32px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
}

.sub-nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--color-text-light);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;

  &:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-accent);
    color: var(--color-text);
  }

  &.active {
    background: linear-gradient(135deg, rgba(34, 139, 230, 0.15) 0%, rgba(34, 139, 230, 0.08) 100%);
    border-color: var(--color-accent);
    color: var(--color-accent);

    .sub-nav-label {
      font-weight: 600;
    }
  }
}

.sub-nav-icon {
  font-size: 18px;
}

.tab-content {
  flex: 1;
  overflow: auto;
  padding: 24px 32px;
}

@media (max-width: 720px) {
  .tab-header { padding: 16px; }
  .header-content { gap: 12px; }

  .header-icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
  }

  .header-text {
    min-width: 0;
    h1 { font-size: 21px; }
    p { font-size: 12px; }
  }

  .sub-nav {
    padding: 12px 16px;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
  }

  .sub-nav-btn {
    padding: 9px 14px;
    scroll-snap-align: start;
  }

  .tab-content { padding: 16px; }
}
</style>
