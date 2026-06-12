<script setup lang="ts">
/**
 * AlertsPage.vue
 * 알림 관리 페이지
 */
import { ref } from 'vue'
import { IconPlus, IconBell, IconEdit, IconTrash } from '@/components/icons'
import AlertForm from './AlertForm.vue'

// 현재 보기 모드
const currentView = ref<'list' | 'create'>('list')

// 알림 목록
interface Alert {
  id: string
  name: string
  description: string
  sources: string[]
  triggers: string[]
  destinations: string[]
  isActive: boolean
  createdAt: string
}

const alerts = ref<Alert[]>([
  {
    id: '1',
    name: '데이터 품질 실패 알림',
    description: '테스트 케이스 실패 시 Slack 알림 전송',
    sources: ['customer_360'],
    triggers: ['테스트 실패'],
    destinations: ['Slack #data-alerts'],
    isActive: true,
    createdAt: '12월 20, 2025'
  },
  {
    id: '2',
    name: '스키마 변경 알림',
    description: '테이블 스키마 변경 감지 시 이메일 발송',
    sources: ['orders', 'products'],
    triggers: ['스키마 변경'],
    destinations: ['Email: team@example.com'],
    isActive: true,
    createdAt: '12월 18, 2025'
  }
])

const handleCreateAlert = (alertData: any) => {
  console.log('New alert:', alertData)
  currentView.value = 'list'
}

const handleDeleteAlert = (id: string) => {
  alerts.value = alerts.value.filter(a => a.id !== id)
}

const toggleAlertStatus = (alert: Alert) => {
  alert.isActive = !alert.isActive
}
</script>

<template>
  <div class="alerts-page">
    <!-- 알림 목록 보기 -->
    <template v-if="currentView === 'list'">
      <!-- 헤더 -->
      <header class="page-header">
        <div class="header-content">
          <h1 class="page-title">알림들</h1>
          <p class="page-description">웹훅을 사용하여 시기적절한 알림으로 최신 정보를 유지하세요.</p>
        </div>
        <button class="btn btn--primary" @click="currentView = 'create'">
          <IconPlus :size="16" />
          알림 추가
        </button>
      </header>

      <!-- 알림 목록 -->
      <div class="alerts-list">
        <div v-if="alerts.length === 0" class="empty-state">
          <IconBell :size="48" class="empty-icon" />
          <p>설정된 알림이 없습니다.</p>
          <button class="btn btn--primary" @click="currentView = 'create'">
            첫 번째 알림 만들기
          </button>
        </div>

        <div v-else class="alert-cards">
          <div v-for="alert in alerts" :key="alert.id" class="alert-card">
            <div class="alert-header">
              <div class="alert-status" :class="{ active: alert.isActive }">
                <span class="status-dot"></span>
                {{ alert.isActive ? '활성' : '비활성' }}
              </div>
              <div class="alert-actions">
                <button class="action-btn" @click="toggleAlertStatus(alert)" :title="alert.isActive ? '비활성화' : '활성화'">
                  <IconBell :size="16" />
                </button>
                <button class="action-btn">
                  <IconEdit :size="16" />
                </button>
                <button class="action-btn danger" @click="handleDeleteAlert(alert.id)">
                  <IconTrash :size="16" />
                </button>
              </div>
            </div>
            
            <h3 class="alert-name">{{ alert.name }}</h3>
            <p class="alert-description">{{ alert.description }}</p>
            
            <div class="alert-meta">
              <div class="meta-item">
                <span class="meta-label">소스:</span>
                <span class="meta-value">{{ alert.sources.join(', ') }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">트리거:</span>
                <span class="meta-value">{{ alert.triggers.join(', ') }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">목적지:</span>
                <span class="meta-value">{{ alert.destinations.join(', ') }}</span>
              </div>
            </div>
            
            <div class="alert-footer">
              <span class="created-at">생성일: {{ alert.createdAt }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 알림 생성 폼 -->
    <template v-else>
      <AlertForm 
        @cancel="currentView = 'list'"
        @save="handleCreateAlert"
      />
    </template>
  </div>
</template>

<style lang="scss" scoped>
.alerts-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-lg);
  overflow-y: auto;
  background: var(--color-bg);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-lg);
}

.header-content {
  .page-title {
    font-size: 24px;
    font-weight: 600;
    color: var(--color-text-bright);
    margin-bottom: 4px;
  }
  
  .page-description {
    font-size: 14px;
    color: var(--color-text-light);
  }
}

.alerts-list {
  flex: 1;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: calc(var(--spacing-xl) * 2);
  color: var(--color-text-light);
  gap: var(--spacing-md);
  
  .empty-icon {
    opacity: 0.3;
    margin-bottom: var(--spacing-md);
  }
  
  p {
    font-size: 16px;
    margin-bottom: var(--spacing-md);
  }
}

.alert-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: var(--spacing-lg);
}

.alert-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  transition: all 0.15s ease;
  
  &:hover {
    border-color: var(--color-accent);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }
}

.alert-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
}

.alert-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-text-muted);
  }
  
  &.active {
    color: var(--color-success);
    
    .status-dot {
      background: var(--color-success);
    }
  }
}

.alert-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }
  
  &.danger:hover {
    background: rgba(250, 82, 82, 0.15);
    color: var(--color-error);
  }
}

.alert-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-bright);
  margin-bottom: 8px;
}

.alert-description {
  font-size: 13px;
  color: var(--color-text-light);
  margin-bottom: var(--spacing-md);
}

.alert-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: var(--spacing-md);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-md);
}

.meta-item {
  display: flex;
  gap: 8px;
  font-size: 12px;
  
  .meta-label {
    color: var(--color-text-muted);
    min-width: 60px;
  }
  
  .meta-value {
    color: var(--color-text);
  }
}

.alert-footer {
  .created-at {
    font-size: 11px;
    color: var(--color-text-muted);
  }
}
</style>

