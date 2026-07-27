<script setup lang="ts">
defineProps<{
  title: string
  description: string
  capabilities: readonly string[]
}>()
</script>

<template>
  <main class="capability-page">
    <header class="page-header">
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
    </header>

    <section class="connection-state" role="status" aria-live="polite">
      <div class="state-icon" aria-hidden="true">i</div>
      <div class="state-content">
        <h2>서비스 연결이 필요합니다</h2>
        <p>
          현재 확인된 백엔드 계약이 없어 샘플 데이터를 실제 결과처럼 표시하지 않습니다.
          API 계약이 제공되면 아래 기능을 연결할 수 있습니다.
        </p>
        <ul>
          <li v-for="capability in capabilities" :key="capability">
            {{ capability }}
          </li>
        </ul>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.capability-page {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: clamp(var(--spacing-md), 2vw, var(--spacing-xl));
  background: var(--color-bg);
}

.page-header {
  width: min(100%, 920px);
  margin: 0 auto var(--spacing-lg);

  h1 {
    margin: 0 0 var(--spacing-xs);
    color: var(--color-text-bright);
    font-size: clamp(22px, 2vw, 28px);
    font-weight: 650;
  }

  p {
    max-width: 760px;
    margin: 0;
    color: var(--color-text-light);
    font-size: 14px;
    line-height: 1.65;
  }
}

.connection-state {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--spacing-md);
  width: min(100%, 920px);
  margin: 0 auto;
  padding: clamp(var(--spacing-lg), 3vw, var(--spacing-xl));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
}

.state-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 45%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
  font-size: 18px;
  font-weight: 700;
}

.state-content {
  min-width: 0;

  h2 {
    margin: 2px 0 var(--spacing-sm);
    color: var(--color-text-bright);
    font-size: 17px;
    font-weight: 600;
  }

  p {
    margin: 0;
    color: var(--color-text-light);
    font-size: 14px;
    line-height: 1.65;
  }

  ul {
    display: grid;
    gap: var(--spacing-xs);
    margin: var(--spacing-md) 0 0;
    padding-left: 20px;
    color: var(--color-text);
    font-size: 13px;
    line-height: 1.55;
  }
}

@media (max-width: 640px) {
  .connection-state {
    grid-template-columns: 1fr;
  }
}
</style>
