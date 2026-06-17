<script setup lang="ts">
/**
 * TableCard.vue
 * Table 노드 — 출처별 설명 (DDL / Code 분석) + 컬럼 목록 + 사용 흐름 + FK.
 *
 * description_source 가 'ddl' 이면 DDL 출처, 'code'/'procedure' 면 코드 분석 출처.
 * analyzed_description 은 항상 LLM 결과 (코드 분석 출처).
 */

import { computed, ref } from 'vue'
import type { GraphNode } from '@/shared/types'
import { useAnalyzerStore } from '@/features/code-analysis/analyzer'
import { getRelationshipGroups, getAttachedByType } from '@/shared/utils/nodeRelationships'
import NodeDetailBase from './NodeDetailBase.vue'
import TextViewer from '@/shared/components/TextViewer.vue'

interface Props {
  node: GraphNode
}
const props = defineProps<Props>()

const projectStore = useAnalyzerStore()

const subInfo = computed(() => {
  const p = props.node.properties || {}
  const schema = p.schema as string | undefined
  const db = p.db as string | undefined
  const tableType = p.table_type as string | undefined
  const parts = [schema, db, tableType].filter(Boolean) as string[]
  return parts.join(' · ')
})

const ddlDescription = computed(() => {
  const p = props.node.properties || {}
  const source = p.description_source as string | undefined
  // DDL 출처 description 만 뽑기. (코드 출처면 description 비어있고 analyzed_description 만 있음)
  if (source === 'ddl' && typeof p.description === 'string') return p.description
  return ''
})

const codeDescription = computed(() => {
  const p = props.node.properties || {}
  const analyzed = p.analyzed_description
  if (typeof analyzed === 'string') return analyzed
  // description_source 가 'code'/'procedure' 면 description 자체가 코드 분석
  const source = p.description_source as string | undefined
  if ((source === 'code' || source === 'procedure') && typeof p.description === 'string') {
    return p.description
  }
  return ''
})

type Tab = 'ddl' | 'code'
const activeTab = ref<Tab>(ddlDescription.value ? 'ddl' : 'code')

const groups = computed(() =>
  getRelationshipGroups(props.node.id, projectStore.linkMap.values()),
)

interface ColumnEntry {
  id: string
  name: string
  dtype: string
  nullable: boolean
  pk: boolean
  description: string
}

const columns = computed<ColumnEntry[]>(() =>
  getAttachedByType(groups.value, 'HAS_COLUMN').map(l => {
    const n = projectStore.nodeMap.get(l.target)
    const p = n?.properties || {}
    return {
      id: l.target,
      name: (p.name as string) || l.target,
      dtype: (p.dtype as string) || '',
      nullable: p.nullable !== false,
      pk: Boolean(p.pk || p.is_primary_key),
      description: (p.description as string) || (p.analyzed_description as string) || '',
    }
  }),
)

const fks = computed(() =>
  groups.value.fk.map(l => {
    const otherId = l.source === props.node.id ? l.target : l.source
    const direction = l.source === props.node.id ? 'out' : 'in'
    const n = projectStore.nodeMap.get(otherId)
    const name = (n?.properties?.name as string) || otherId
    return { type: l.type, direction, name }
  }),
)
</script>

<template>
  <NodeDetailBase :node="node" icon="🗂️" label-badge="TABLE" :sub-info="subInfo">
    <template #body>
      <!-- 설명 출처별 탭 -->
      <section v-if="ddlDescription || codeDescription" class="desc-section">
        <div class="tab-row">
          <button
            v-if="ddlDescription"
            class="tab-btn"
            :class="{ active: activeTab === 'ddl' }"
            @click="activeTab = 'ddl'"
            title="테이블 정의 SQL의 COMMENT/주석에서 가져온 설명"
          >테이블 정의 주석</button>
          <button
            v-if="codeDescription"
            class="tab-btn"
            :class="{ active: activeTab === 'code' }"
            @click="activeTab = 'code'"
          >코드 분석</button>
        </div>
        <TextViewer
          :content="activeTab === 'ddl' ? ddlDescription : codeDescription"
          :max-height="220"
          format="auto"
        />
      </section>

      <!-- 컬럼 목록 -->
      <section v-if="columns.length > 0" class="col-section">
        <h4 class="section-title">📊 컬럼 ({{ columns.length }})</h4>
        <table class="col-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>타입</th>
              <th>NULL</th>
              <th>PK</th>
              <th>설명</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in columns" :key="c.id">
              <td class="col-name">{{ c.name }}</td>
              <td class="col-type">{{ c.dtype || '-' }}</td>
              <td>{{ c.nullable ? '예' : '아니오' }}</td>
              <td>{{ c.pk ? '✓' : '' }}</td>
              <td class="col-desc" :title="c.description">{{ c.description }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- FK 관계 -->
      <section v-if="fks.length > 0" class="fk-section">
        <h4 class="section-title">🔑 FK 관계 ({{ fks.length }})</h4>
        <ul class="fk-list">
          <li v-for="(fk, i) in fks" :key="i">
            <span class="fk-type">{{ fk.type }}</span>
            <span class="fk-dir">{{ fk.direction === 'out' ? '→' : '←' }}</span>
            <span class="fk-name">{{ fk.name }}</span>
          </li>
        </ul>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.desc-section, .col-section, .fk-section {
  padding: 12px;
  background: color-mix(in srgb, var(--color-bg-secondary) 60%, var(--color-bg));
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.section-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-muted);
  margin: 0 0 8px;
  letter-spacing: 0.5px;
}

.tab-row {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.tab-btn {
  padding: 4px 12px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-bg);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;

  &:hover {
    color: var(--color-text);
    border-color: var(--color-text-muted);
  }

  &.active {
    background: var(--color-bg);
    color: var(--color-text-bright);
    border-color: var(--color-text-muted);
  }
}

.col-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.7rem;

  th, td {
    padding: 4px 6px;
    border-bottom: 1px solid var(--color-border);
    text-align: left;
  }

  th {
    color: var(--color-text-muted);
    font-weight: 700;
    font-size: 0.65rem;
  }

  .col-name {
    font-weight: 600;
    color: var(--color-text-bright);
    font-family: monospace;
  }

  .col-type {
    font-family: monospace;
    color: #a5b4fc;
  }

  .col-desc {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-muted);
  }
}

.fk-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  li {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    padding: 3px 6px;
  }

  .fk-type {
    font-size: 0.65rem;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    font-weight: 700;
  }

  .fk-dir {
    color: var(--color-text-muted);
  }

  .fk-name {
    color: var(--color-text);
    font-family: monospace;
  }
}
</style>
