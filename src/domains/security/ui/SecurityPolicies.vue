<script setup lang="ts">
import { IconSecurity } from '@/shared/icons'

const supportedCapabilities = [
  '사용자 및 역할 관리',
  '권한 목록 조회',
  '테이블 계층 접근 규칙',
  '감사 로그 조회',
]
</script>

<template>
  <section class="security-policies" aria-labelledby="security-policy-title">
    <header class="section-header">
      <h2 id="security-policy-title">보안 정책</h2>
      <p>SQL 쿼리에 적용되는 정책 관리 기능입니다.</p>
    </header>

    <div class="unavailable-card" role="status">
      <IconSecurity :size="32" />
      <div>
        <h3>정책 관리 API가 제공되지 않습니다</h3>
        <p>
          현재 Security 서비스 계약에는 정책 조회·저장·활성화 API가 없습니다.
          화면에서만 바뀌고 저장되지 않던 예시 정책 편집기는 제거했습니다.
        </p>
      </div>
    </div>

    <div class="capabilities-card">
      <h3>현재 백엔드가 제공하는 보안 기능</h3>
      <ul>
        <li v-for="capability in supportedCapabilities" :key="capability">
          {{ capability }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.security-policies {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 920px;
}

.section-header {
  h2 {
    margin: 0 0 6px;
    color: var(--color-text);
    font-size: 20px;
  }

  p {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 14px;
  }
}

.unavailable-card,
.capabilities-card {
  padding: 20px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
}

.unavailable-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  color: #fbbf24;

  h3 {
    margin: 0 0 8px;
    color: var(--color-text);
    font-size: 16px;
  }

  p {
    margin: 0;
    color: var(--color-text-muted);
    line-height: 1.65;
  }
}

.capabilities-card {
  h3 {
    margin: 0 0 12px;
    color: var(--color-text);
    font-size: 15px;
  }

  ul {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 24px;
    margin: 0;
    padding-left: 20px;
    color: var(--color-text-muted);
    font-size: 14px;
  }
}

@media (max-width: 720px) {
  .capabilities-card ul {
    grid-template-columns: 1fr;
  }
}
</style>
