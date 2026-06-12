<script setup lang="ts">
/**
 * OlapTab.vue
 * OLAP 분석 메인 탭 - 큐브 설계 및 피벗 분석
 */
import { ref, onMounted } from 'vue'
import { useOlapStore } from '@/stores/olap'
import * as olapApi from '@/services/olap-api'
import CubeDesigner from './CubeDesigner.vue'
import PivotAnalysis from './PivotAnalysis.vue'

const store = useOlapStore()
const activeSubTab = ref<'design' | 'analysis'>('analysis')
const showCubeManager = ref(false)
const deleting = ref<string | null>(null)

onMounted(async () => {
  try {
    await store.loadCubes()
  } catch (e) {
    console.warn('큐브 로드 실패:', e)
  }
})

// Delete a single cube
async function deleteCube(cubeName: string) {
  // 먼저 기본 삭제 확인
  if (!confirm(`'${cubeName}' 큐브를 삭제하시겠습니까?`)) return
  
  // DW 테이블도 삭제할지 물어봄
  const deleteDWTables = confirm(
    `관련 DW 테이블(dw.fact_*, dw.dim_*)도 함께 삭제하시겠습니까?\n\n` +
    `"확인"을 누르면 DW 테이블도 삭제됩니다.\n` +
    `"취소"를 누르면 큐브 메타데이터만 삭제됩니다.`
  )
  
  deleting.value = cubeName
  try {
    // 큐브 삭제
    await olapApi.deleteCube(cubeName)
    
    // ETL config 삭제
    try {
      await olapApi.deleteETLConfig(cubeName)
    } catch (e) {
      // ETL config might not exist, ignore
    }
    
    // DW 테이블 삭제 (사용자가 선택한 경우)
    if (deleteDWTables) {
      try {
        // 큐브 이름 기반으로 관련 테이블 삭제
        const normalizedName = cubeName.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const tablesToDelete = [
          `fact_${normalizedName}`,
          `dim_time`,
          `dim_site`, 
          `dim_tag`,
          // 일반적인 패턴의 테이블들도 포함
          ...await getDWTablesForCube(cubeName)
        ]
        await olapApi.deleteDWTables(tablesToDelete, 'dw')
      } catch (e) {
        console.warn('DW 테이블 삭제 실패:', e)
      }
    }
    
    await store.loadCubes()
  } catch (e: any) {
    alert(`삭제 실패: ${e.message}`)
  } finally {
    deleting.value = null
  }
}

// 큐브에 관련된 DW 테이블 목록 가져오기
async function getDWTablesForCube(_cubeName: string): Promise<string[]> {
  try {
    const result = await olapApi.listDWTables('dw')
    return result.tables || []
  } catch (e) {
    return []
  }
}

// Delete all cubes
async function deleteAllCubes() {
  if (!confirm('모든 큐브를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return
  
  // DW 테이블도 삭제할지 물어봄
  const deleteDWTables = confirm(
    `DW 스키마의 모든 테이블도 함께 삭제하시겠습니까?\n\n` +
    `"확인"을 누르면 dw 스키마의 모든 테이블이 삭제됩니다.`
  )
  
  try {
    await olapApi.deleteAllCubes()
    await olapApi.deleteAllETLConfigs()
    
    if (deleteDWTables) {
      try {
        await olapApi.deleteDWTables([], 'dw') // 빈 배열 = 모든 테이블 삭제
      } catch (e) {
        console.warn('DW 테이블 삭제 실패:', e)
      }
    }
    
    await store.loadCubes()
    showCubeManager.value = false
  } catch (e: any) {
    alert(`삭제 실패: ${e.message}`)
  }
}
</script>

<template>
  <div class="olap-tab">
    <!-- Header -->
    <header class="olap-header">
      <div class="header-left">
        <h1 class="title">
          <span class="icon">📊</span>
          OLAP 분석
        </h1>
        <p class="subtitle">피벗 테이블 분석 및 OLAP 큐브 설계</p>
      </div>
      
      <!-- Sub Tabs -->
      <nav class="sub-tabs">
        <button 
          class="sub-tab" 
          :class="{ active: activeSubTab === 'analysis' }"
          @click="activeSubTab = 'analysis'"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          피벗 테이블
        </button>
        <button 
          class="sub-tab" 
          :class="{ active: activeSubTab === 'design' }"
          @click="activeSubTab = 'design'"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
          큐브 설계
        </button>
      </nav>
      
      <!-- Cube Selector -->
      <div class="cube-selector" v-if="store.hasCubes && activeSubTab === 'analysis'">
        <label>큐브:</label>
        <select 
          :value="store.currentCube" 
          @change="(e) => store.selectCube((e.target as HTMLSelectElement).value)"
        >
          <option v-for="cube in store.cubes" :key="cube" :value="cube">
            {{ cube }}
          </option>
        </select>
        <button class="btn-icon" @click="showCubeManager = true" title="큐브 관리">
          ⚙️
        </button>
      </div>
      
      <!-- Cube Manager Button when no cubes -->
      <button 
        v-if="store.hasCubes" 
        class="btn-manage" 
        @click="showCubeManager = true"
        title="큐브 관리"
      >
        ⚙️ 큐브 관리
      </button>
    </header>
    
    <!-- Cube Manager Modal -->
    <div class="modal-overlay" v-if="showCubeManager" @click.self="showCubeManager = false">
      <div class="modal-content cube-manager">
        <header class="modal-header">
          <h2>📦 큐브 관리</h2>
          <button class="btn-close" @click="showCubeManager = false">×</button>
        </header>
        
        <div class="cube-list" v-if="store.cubes.length > 0">
          <div 
            v-for="cube in store.cubes" 
            :key="cube" 
            class="cube-item"
            :class="{ active: store.currentCube === cube }"
          >
            <div class="cube-info">
              <span class="cube-icon">📊</span>
              <span class="cube-name">{{ cube }}</span>
            </div>
            <button 
              class="btn-delete" 
              @click="deleteCube(cube)"
              :disabled="deleting === cube"
            >
              {{ deleting === cube ? '삭제 중...' : '🗑️ 삭제' }}
            </button>
          </div>
        </div>
        
        <div class="empty-state" v-else>
          <p>등록된 큐브가 없습니다.</p>
        </div>
        
        <footer class="modal-footer" v-if="store.cubes.length > 0">
          <button class="btn-danger" @click="deleteAllCubes">
            🗑️ 모든 큐브 삭제
          </button>
        </footer>
      </div>
    </div>
    
    <!-- Content -->
    <main class="olap-content">
      <CubeDesigner v-if="activeSubTab === 'design'" />
      <PivotAnalysis v-else-if="activeSubTab === 'analysis'" />
    </main>
  </div>
</template>

<style lang="scss" scoped>
.olap-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
}

.olap-header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 24px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
    color: var(--color-text);
    
    .icon {
      font-size: 1.5rem;
    }
  }
  
  .subtitle {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 4px 0 0 0;
  }
}

.sub-tabs {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.sub-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--color-text-light);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover:not(:disabled) {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }
  
  &.active {
    background: linear-gradient(135deg, rgba(34, 139, 230, 0.15) 0%, rgba(34, 139, 230, 0.08) 100%);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.cube-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  
  label {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }
  
  select {
    padding: 8px 12px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text);
    font-size: 0.875rem;
    min-width: 160px;
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
}

.olap-content {
  flex: 1;
  overflow: hidden;
  display: flex;
}

.btn-icon {
  padding: 6px 10px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
}

.btn-manage {
  padding: 8px 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-light);
  font-size: 0.8125rem;
  cursor: pointer;
  
  &:hover {
    background: var(--color-bg);
    color: var(--color-text);
  }
}

// Cube Manager Modal
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  
  h2 {
    margin: 0;
    font-size: 1.125rem;
    color: var(--color-text);
  }
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
  line-height: 1;
  
  &:hover {
    color: var(--color-text);
  }
}

.cube-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.cube-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin-bottom: 8px;
  
  &.active {
    border-color: var(--color-accent);
  }
}

.cube-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cube-icon {
  font-size: 1.25rem;
}

.cube-name {
  font-size: 0.9375rem;
  color: var(--color-text);
  font-weight: 500;
}

.btn-delete {
  padding: 6px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #ef4444;
  font-size: 0.8125rem;
  cursor: pointer;
  
  &:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.2);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-muted);
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
}

.btn-danger {
  padding: 8px 16px;
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  
  &:hover {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  }
}
</style>

