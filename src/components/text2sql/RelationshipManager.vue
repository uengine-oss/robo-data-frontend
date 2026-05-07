<template>
  <div class="relationship-manager">
    <div class="manager-header">
      <h3>
        <IconLayers :size="16" />
        릴레이션 관리
      </h3>
      <button @click="loadUserRelationships" class="btn btn--primary btn--sm">
        <IconRefresh :size="14" />
        새로고침
      </button>
    </div>
    
    <!-- 기존 릴레이션 목록 -->
    <div class="existing-relationships">
      <h4>사용자 추가 릴레이션</h4>
      <div v-if="userRelationships.length === 0" class="no-data">
        사용자가 추가한 릴레이션이 없습니다.
      </div>
      <div v-else>
        <div 
          v-for="rel in userRelationships" 
          :key="`${rel.from_table}-${rel.from_column}-${rel.to_table}-${rel.to_column}`"
          class="relationship-item"
        >
          <div class="relationship-info">
            <span class="from">{{ rel.from_table }}.{{ rel.from_column }}</span>
            <IconChevronRight :size="14" class="arrow" />
            <span class="to">{{ rel.to_table }}.{{ rel.to_column }}</span>
            <span v-if="rel.description" class="description">({{ rel.description }})</span>
          </div>
          <button @click="removeRelationship(rel)" class="btn btn--danger btn--sm">
            <IconTrash :size="12" />
            삭제
          </button>
        </div>
      </div>
    </div>

    <!-- 새 릴레이션 추가 -->
    <div class="add-relationship">
      <h4>새 릴레이션 추가</h4>
      <form @submit.prevent="addRelationship" class="relationship-form">
        <div class="form-row">
          <div class="form-group">
            <label>From 테이블:</label>
            <select v-model="newRelationship.from_table" required>
              <option value="">선택하세요</option>
              <option v-for="table in tables" :key="table.name" :value="table.name">
                {{ table.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>From 컬럼:</label>
            <select v-model="newRelationship.from_column" required>
              <option value="">선택하세요</option>
              <option v-for="col in getTableColumns(newRelationship.from_table)" :key="col.name" :value="col.name">
                {{ col.name }}
              </option>
            </select>
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>To 테이블:</label>
            <select v-model="newRelationship.to_table" required>
              <option value="">선택하세요</option>
              <option v-for="table in tables" :key="table.name" :value="table.name">
                {{ table.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>To 컬럼:</label>
            <select v-model="newRelationship.to_column" required>
              <option value="">선택하세요</option>
              <option v-for="col in getTableColumns(newRelationship.to_table)" :key="col.name" :value="col.name">
                {{ col.name }}
              </option>
            </select>
          </div>
        </div>
        
        <div class="form-group full-width">
          <label>설명 (선택사항):</label>
          <input 
            v-model="newRelationship.description"
            type="text"
            placeholder="릴레이션 설명"
          />
        </div>
        
        <button type="submit" class="btn btn--success" :disabled="!isRelationshipFormValid">
          <IconPlus :size="14" />
          릴레이션 추가
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { logger } from '@/utils/logger'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { text2sqlApi } from '@/services/api'
import { useText2SqlSchemaStore } from '@/stores/text2sql'
import type { Text2SqlTableInfo } from '@/types'
import { IconLayers, IconRefresh, IconChevronRight, IconTrash, IconPlus } from '@/components/icons'

const schemaStore = useText2SqlSchemaStore()

defineProps<{
  tables: Text2SqlTableInfo[]
}>()

interface UserRelationship {
  from_table: string
  from_schema: string
  from_column: string
  to_table: string
  to_schema: string
  to_column: string
  description?: string
}

const userRelationships = ref<UserRelationship[]>([])

const newRelationship = reactive({
  from_table: '',
  from_column: '',
  to_table: '',
  to_column: '',
  description: ''
})

const isRelationshipFormValid = computed(() => {
  return newRelationship.from_table && 
         newRelationship.from_column && 
         newRelationship.to_table && 
         newRelationship.to_column &&
         newRelationship.from_table !== newRelationship.to_table
})

const loadUserRelationships = async () => {
  try {
    const response = await text2sqlApi.getUserRelationships()
    userRelationships.value = response.relationships as UserRelationship[]
  } catch (error) {
    logger.error('Failed to load user relationships:', error)
  }
}

const getTableColumns = (tableName: string) => {
  if (!tableName) return []
  return schemaStore.getTableColumns(tableName)
}

const addRelationship = async () => {
  try {
    await text2sqlApi.addRelationship({
      from_table: newRelationship.from_table,
      from_schema: 'public',
      from_column: newRelationship.from_column,
      to_table: newRelationship.to_table,
      to_schema: 'public',
      to_column: newRelationship.to_column,
      relationship_type: 'FK_TO_TABLE',
      description: newRelationship.description
    })
    
    Object.assign(newRelationship, {
      from_table: '',
      from_column: '',
      to_table: '',
      to_column: '',
      description: ''
    })
    
    await loadUserRelationships()
  } catch (error) {
    logger.error('Failed to add relationship:', error)
    alert('릴레이션 추가에 실패했습니다.')
  }
}

const removeRelationship = async (rel: UserRelationship) => {
  if (!confirm('이 릴레이션을 삭제하시겠습니까?')) return
  
  try {
    await text2sqlApi.removeRelationship({
      from_table: rel.from_table,
      from_schema: rel.from_schema,
      from_column: rel.from_column,
      to_table: rel.to_table,
      to_schema: rel.to_schema,
      to_column: rel.to_column
    })
    
    await loadUserRelationships()
  } catch (error) {
    logger.error('Failed to remove relationship:', error)
    alert('릴레이션 삭제에 실패했습니다.')
  }
}

watch(() => newRelationship.from_table, () => {
  newRelationship.from_column = ''
})

watch(() => newRelationship.to_table, () => {
  newRelationship.to_column = ''
})

onMounted(() => {
  loadUserRelationships()
})
</script>

<style scoped lang="scss">
.relationship-manager {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.manager-header h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--color-text-bright);
  font-size: 14px;
  font-weight: 600;
}

.existing-relationships {
  margin-bottom: 16px;
}

.existing-relationships h4 {
  margin: 0 0 12px 0;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
}

.relationship-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  font-size: 13px;
  background: var(--color-bg-tertiary);
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg-elevated);
  }
}

.relationship-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.from, .to {
  font-weight: 600;
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 12px;
}

.arrow {
  color: var(--color-text-muted);
}

.description {
  color: var(--color-text-light);
  font-size: 12px;
}

.add-relationship {
  border-top: 1px solid var(--color-border);
  padding-top: 16px;
}

.add-relationship h4 {
  margin: 0 0 12px 0;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
}

.relationship-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-group {
  flex: 1;
  
  &.full-width {
    flex: 100%;
  }
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 12px;
  color: var(--color-text-light);
}

.form-group select,
.form-group input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 13px;
  background: var(--color-bg);
  color: var(--color-text);
  transition: all 0.15s;
  
  &::placeholder {
    color: var(--color-text-muted);
  }
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15);
  }
}

.no-data {
  color: var(--color-text-light);
  font-style: italic;
  text-align: center;
  padding: 16px;
  font-size: 13px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
}
</style>
