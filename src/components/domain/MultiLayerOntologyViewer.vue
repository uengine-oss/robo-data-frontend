<template>
  <div class="multi-layer-ontology-viewer" :class="{ 'light-mode': !isDarkMode }">
    <!-- 헤더 -->
    <div class="viewer-header">
      <h2>🌐 온톨로지 관리</h2>
      <div class="header-actions">
        <select v-model="currentLayout" class="layout-select header-layout-select" @change="applyLayout">
          <option value="hierarchical">계층형 (Hierarchical)</option>
          <option value="cose">물리 기반 (Cose)</option>
          <option value="circle">원형 (Circle)</option>
          <option value="grid">격자 (Grid)</option>
        </select>
        <button class="action-btn" @click="openGenerateDialog('document')">
          <span>📄</span> 문서에서 생성
        </button>
        <button class="action-btn" @click="openGenerateDialog('schema')">
          <span>🗃️</span> DB 스키마에서 생성
        </button>
        <div class="ontology-list-dropdown" :class="{ 'dropdown-open': showOntologyListDropdown }">
          <button 
            class="action-btn" 
            @click="toggleOntologyListDropdown" 
            :disabled="loading"
          >
            <span>📂</span> 온톨로지 목록
            <span class="dropdown-arrow">{{ showOntologyListDropdown ? '▲' : '▼' }}</span>
          </button>
          <div v-if="showOntologyListDropdown" class="dropdown-menu">
            <div v-if="loadingSchemalist" class="dropdown-loading">
              <div class="loading-spinner small"></div>
              <span>로딩 중...</span>
            </div>
            <div v-else-if="savedSchemas.length === 0" class="dropdown-empty">
              <p>저장된 온톨로지가 없습니다.</p>
            </div>
            <div v-else class="dropdown-list">
              <div 
                v-for="schema in savedSchemas" 
                :key="schema.id"
                class="dropdown-item"
                :class="{ 
                  'schema-invalid': !schema.hasSchemaJson,
                  'editing': editingSchemaId === schema.id,
                  'active': currentSchemaId === schema.id
                }"
                @click.stop="!editingSchemaId && loadSchema(schema.id)"
              >
                <div class="dropdown-item-info">
                  <input 
                    v-if="editingSchemaId === schema.id"
                    v-model="editingSchemaName"
                    @blur="saveSchemaName(schema.id)"
                    @keyup.enter="saveSchemaName(schema.id)"
                    @keyup.esc="cancelEditSchemaName"
                    class="schema-name-input"
                    ref="schemaNameInput"
                    @click.stop
                  />
                  <span 
                    v-else 
                    class="dropdown-item-name" 
                    @dblclick.stop="startEditSchemaName(schema.id, schema.name)"
                  >
                    {{ schema.name }}
                  </span>
                  <span v-if="!schema.hasSchemaJson" class="schema-warning" title="schemaJson이 없어 로드할 수 없습니다">⚠️</span>
                  <button 
                    v-if="editingSchemaId !== schema.id"
                    class="edit-name-btn-small"
                    @click.stop="startEditSchemaName(schema.id, schema.name)"
                    title="이름 편집"
                  >
                    ✏️
                  </button>
                </div>
                <div class="dropdown-item-meta">
                  <span class="node-count-small">{{ schema.nodeCount }} 노드</span>
                  <span class="updated-at-small" v-if="schema.updatedAt">
                    {{ new Date(schema.updatedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) }}
                  </span>
                  <button 
                    type="button"
                    class="delete-schema-btn"
                    @click.stop="requestDeleteSchema(schema)"
                    title="온톨로지 삭제"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 온톨로지 삭제 확인 다이얼로그 -->
        <div v-if="schemaToDelete" class="dialog-overlay" @click.self="schemaToDelete = null">
          <div class="delete-confirm-dialog">
            <h3>온톨로지 삭제 확인</h3>
            <p class="delete-confirm-message">
              다음 온톨로지를 삭제하시겠습니까?<br />
              <strong class="delete-schema-name">「{{ schemaToDelete.name }}」</strong>
            </p>
            <p class="delete-confirm-warning">삭제된 온톨로지는 복구할 수 없습니다.</p>
            <div class="delete-confirm-actions">
              <button type="button" class="cancel-btn" @click="schemaToDelete = null">취소</button>
              <button type="button" class="delete-confirm-btn" @click="confirmDeleteSchema">삭제</button>
            </div>
          </div>
        </div>
        <button 
          class="action-btn" 
          @click="saveToNeo4j" 
          :disabled="loading || nodes.length === 0"
        >
          <span>💾</span> 저장
        </button>
        <button 
          class="action-btn whatif-toggle-btn" 
          :class="{ active: isWhatIfPanelOpen }"
          @click="() => { whatifFilters = JSON.parse(JSON.stringify(nodeFilters || {})); isWhatIfPanelOpen = !isWhatIfPanelOpen }"
          :disabled="loading || nodes.length === 0 || !currentSchemaId"
        >
          <span>🔬</span> What-if 분석
        </button>
      </div>
    </div>

    <!-- 필터 다이얼로그 (노드 우클릭 → 필터 적용 시 표시) -->
    <div v-if="showFilterDialog && filterTargetNode" class="dialog-overlay" @click.self="closeFilterDialog">
      <div class="filter-dialog">
        <div class="filter-dialog-header">
          <div class="filter-dialog-title">
            <span class="filter-dialog-icon">🔍</span>
            <span>{{ filterTargetNode.name }} 필터</span>
          </div>
          <div class="filter-dialog-actions-top">
            <button 
              v-if="hasActiveFilters" 
              class="clear-all-filters-btn"
              @click="clearAllFilters"
            >
              모두 초기화
            </button>
            <button class="filter-dialog-close" @click="closeFilterDialog">✕</button>
          </div>
        </div>
        
        <div class="filter-dialog-body">
          <!-- 상위 노드에서 상속된 cascading 필터 표시 -->
          <div v-if="getCascadingFiltersForNode(filterTargetNode.id).length > 0" class="cascading-filters-info">
            <h5>🔗 상위 노드에서 상속된 필터</h5>
            <div 
              v-for="cf in getCascadingFiltersForNode(filterTargetNode.id)" 
              :key="cf.field"
              class="cascading-filter-item"
            >
              <span class="cf-from">{{ getNodeName(cf.fromNode) }}.{{ cf.fromField }}</span>
              <span class="cf-arrow">→</span>
              <span class="cf-field">{{ cf.field }}</span>
              <span class="cf-equals">=</span>
              <code class="cf-value">{{ cf.value }}</code>
            </div>
          </div>
          
          <!-- 필터 필드가 없는 경우 -->
          <div v-if="!filterTargetNode.filterFields || filterTargetNode.filterFields.length === 0" class="no-filter-fields">
            <span>📋 이 노드에는 필터 가능한 필드가 없습니다.</span>
            <span class="hint">(DB 스키마에서 새로 생성한 온톨로지에만 필터 필드가 포함됩니다)</span>
          </div>
          
          <!-- 필터 필드가 있는 경우 -->
          <div v-else class="filter-dialog-fields">
            <div 
              v-for="field in filterTargetNode.filterFields" 
              :key="field.column"
              class="filter-field-row"
            >
              <label>{{ field.label }}</label>
              
              <!-- 날짜 범위 필터 -->
              <div v-if="field.type === 'date_range'" class="date-range-filter">
                <input 
                  type="date" 
                  v-model="activeFilters[`${filterTargetNode.id}.${field.column}.from`]"
                  @change="onFilterChange"
                />
                <span>~</span>
                <input 
                  type="date" 
                  v-model="activeFilters[`${filterTargetNode.id}.${field.column}.to`]"
                  @change="onFilterChange"
                />
              </div>
              
              <!-- 선택/카테고리 필터 -->
              <div v-else-if="field.type === 'select' || field.type === 'category'" class="select-filter-wrapper">
                <select 
                  v-model="activeFilters[`${filterTargetNode.id}.${field.column}`]"
                  @change="onFilterChange"
                  class="select-filter"
                >
                  <option value="">전체</option>
                  <option 
                    v-for="val in (filterDistinctValues[field.column] || [])" 
                    :key="val" 
                    :value="val"
                  >
                    {{ val }}
                  </option>
                </select>
                <span v-if="filterDistinctLoading && (!filterDistinctValues[field.column] || filterDistinctValues[field.column].length === 0)" class="filter-loading-hint">
                  로딩 중...
                </span>
                <span v-else-if="filterDistinctValues[field.column]" class="filter-count-hint">
                  {{ filterDistinctValues[field.column].length }}개 항목
                </span>
              </div>
              
              <!-- 범위 필터 -->
              <div v-else-if="field.type === 'range'" class="range-filter">
                <input 
                  type="number" 
                  v-model="activeFilters[`${filterTargetNode.id}.${field.column}.min`]"
                  @change="onFilterChange"
                  placeholder="최소"
                />
                <span>~</span>
                <input 
                  type="number" 
                  v-model="activeFilters[`${filterTargetNode.id}.${field.column}.max`]"
                  @change="onFilterChange"
                  placeholder="최대"
                />
              </div>
              
              <!-- 검색 필터 (distinct 값이 있으면 datalist 사용) -->
              <div v-else-if="field.type === 'search'" class="search-filter-wrapper">
                <input 
                  type="text" 
                  v-model="activeFilters[`${filterTargetNode.id}.${field.column}`]"
                  @input="onFilterChange"
                  :list="filterDistinctValues[field.column]?.length ? `datalist-${field.column}` : undefined"
                  placeholder="검색..."
                  class="search-filter"
                />
                <datalist v-if="filterDistinctValues[field.column]?.length" :id="`datalist-${field.column}`">
                  <option v-for="val in filterDistinctValues[field.column]" :key="val" :value="val" />
                </datalist>
              </div>
            </div>
          </div>
        </div>
        
        <div class="filter-dialog-footer">
          <button class="filter-apply-btn" @click="applyAndCloseFilterDialog">확인</button>
        </div>
      </div>
    </div>

    <!-- 로딩 오버레이 (v-show로 컨텐츠 DOM을 유지하면서 표시) -->
    <div v-show="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>{{ loadingMessage }}</p>
    </div>

    <!-- 메인 컨텐츠 (v-show로 전환하여 저장 시 Cytoscape DOM이 파괴되지 않도록 함) -->
    <div v-show="!loading" class="viewer-content">
      <!-- 왼쪽: 레이어 패널 -->
      <div class="layer-panel" :class="{ 'layer-panel-collapsed': isLayerPanelCollapsed }">
        <h3 class="layer-panel-header">
          <span v-if="!isLayerPanelCollapsed">📊 레이어별 노드</span>
          <button 
            class="layer-panel-toggle-btn"
            @click="isLayerPanelCollapsed = !isLayerPanelCollapsed"
            :title="isLayerPanelCollapsed ? '패널 펼치기' : '패널 접기'"
          >
            {{ isLayerPanelCollapsed ? '▶' : '◀' }}
          </button>
        </h3>
        <div v-if="!isLayerPanelCollapsed" class="layer-list">
          <div 
            v-for="layer in layers" 
            :key="layer.id"
            class="layer-item"
            :class="{ collapsed: collapsedLayers.has(layer.id) }"
          >
            <div 
              class="layer-header"
              :style="{ borderLeftColor: layer.color }"
              @click="toggleLayer(layer.id)"
            >
              <span class="layer-icon">{{ layer.icon }}</span>
              <span class="layer-name">{{ layer.name }}</span>
              <span class="layer-count">{{ getLayerNodes(layer.id).length }}</span>
              <span class="collapse-icon">{{ collapsedLayers.has(layer.id) ? '▶' : '▼' }}</span>
            </div>
            <div v-if="!collapsedLayers.has(layer.id)" class="layer-nodes">
              <div 
                v-for="node in getLayerNodes(layer.id)" 
                :key="node.id"
                class="node-item"
                :class="{ selected: selectedNodeId === node.id }"
                @click="selectNode(node.id)"
              >
                <span class="node-name">{{ node.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 중앙: Cytoscape 그래프 -->
      <div class="graph-panel">
        <div 
          ref="cytoscapeContainer" 
          class="cytoscape-container"
          @contextmenu.prevent="onCanvasContextMenu"
        ></div>

        <!-- 소스 노드 선택 후 타겟 대기 안내 -->
        <div v-if="pendingRelationSourceId" class="relation-pending-banner">
          <span class="relation-pending-badge">🔗 관계 생성</span>
          <span class="relation-pending-text">
            <strong>{{ getNodeName(pendingRelationSourceId!) }}</strong>에서 연결할 노드를 클릭하세요
          </span>
          <button type="button" class="relation-pending-cancel" @click="cancelPendingRelation">취소</button>
        </div>

        <!-- 플로팅 미니 툴바 (연결 모드 토글) -->
        <div class="graph-floating-toolbar">
          <button
            type="button"
            class="floating-tool-btn"
            :class="{ active: isRelationDrawModeEnabled }"
            @click="toggleRelationDrawMode"
            :disabled="loading || nodes.length < 2"
            :title="isRelationDrawModeEnabled ? '연결 모드 끄기 (노드 이동 모드로 전환)' : '연결 모드 켜기 (노드 가장자리 드래그로 관계 생성)'"
          >
            <span class="floating-tool-icon">🔗</span>
          </button>
        </div>
        
        <!-- 캔버스 우클릭 컨텍스트 메뉴 (빈 영역 우클릭 → 새 노드 추가) -->
        <div 
          v-if="showContextMenu && contextMenuMode === 'canvas'" 
          class="canvas-context-menu"
          :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
        >
          <div class="context-menu-header">새 노드 추가</div>
          <div 
            v-for="layer in layers" 
            :key="layer.id"
            class="context-menu-item"
            @click="addNewNodeAtPosition(layer.id, contextMenuGraphPos)"
          >
            <span class="context-menu-icon" :style="{ color: layer.color }">{{ layer.icon }}</span>
            <span class="context-menu-label">{{ layer.name }}</span>
            <span class="context-menu-dot" :style="{ backgroundColor: layer.color }"></span>
          </div>
        </div>
        
        <!-- 노드 우클릭 컨텍스트 메뉴 (기존 노드 우클릭 → 필터/삭제) -->
        <div 
          v-if="showContextMenu && contextMenuMode === 'node'" 
          class="canvas-context-menu"
          :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
        >
          <div class="context-menu-header">{{ contextMenuNodeName }}</div>
          <div 
            class="context-menu-item"
            @click="startRelationFromContextMenu"
          >
            <span class="context-menu-icon" style="color: #22d3ee;">🔗</span>
            <span class="context-menu-label">관계 생성</span>
          </div>
          <div 
            class="context-menu-item"
            @click="openFilterFromContextMenu"
          >
            <span class="context-menu-icon" style="color: #a78bfa;">🔍</span>
            <span class="context-menu-label">필터 적용</span>
          </div>
          <div 
            class="context-menu-item"
            @click="openWhatIfFromContextMenu"
          >
            <span class="context-menu-icon" style="color: #818cf8;">🔬</span>
            <span class="context-menu-label">What-if 분석 (현재 필터)</span>
          </div>
          <div 
            class="context-menu-item"
            @click="openNodeRenameFromContextMenu"
          >
            <span class="context-menu-icon" style="color: #63b3ed;">✏️</span>
            <span class="context-menu-label">이름 변경</span>
          </div>
          <div class="context-menu-divider"></div>
          <div 
            class="context-menu-item context-menu-danger"
            @click="deleteNodeFromContextMenu"
          >
            <span class="context-menu-icon">🗑️</span>
            <span class="context-menu-label">삭제</span>
          </div>
        </div>
        
        <!-- 엣지 우클릭 컨텍스트 메뉴 -->
        <div 
          v-if="showContextMenu && contextMenuMode === 'edge'" 
          class="canvas-context-menu"
          :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
        >
          <div class="context-menu-header">{{ contextMenuEdgeLabel }}</div>
          <div 
            class="context-menu-item"
            @click="openEdgePropertiesFromContextMenu"
          >
            <span class="context-menu-icon" style="color: #63b3ed;">⚙️</span>
            <span class="context-menu-label">속성 편집</span>
          </div>
          <div class="context-menu-divider"></div>
          <div 
            class="context-menu-item context-menu-danger"
            @click="deleteEdgeFromContextMenu"
          >
            <span class="context-menu-icon">🗑️</span>
            <span class="context-menu-label">삭제</span>
          </div>
        </div>
        
        <!-- 레전드 -->
        <div class="graph-legend">
          <div 
            v-for="layer in layers" 
            :key="layer.id"
            class="legend-item"
            :style="{ color: layer.color }"
          >
            <span class="legend-dot" :style="{ backgroundColor: layer.color }"></span>
            {{ layer.name }}
          </div>
          <div class="legend-divider">|</div>
          <div class="legend-item edge-legend">
            <span class="edge-line causes"></span> CAUSES
          </div>
          <div class="legend-item edge-legend">
            <span class="edge-line measured"></span> MEASURED_AS
          </div>
          <div class="legend-item edge-legend">
            <span class="edge-line produces"></span> PRODUCES
          </div>
        </div>
      </div>

      <!-- 오른쪽: 상세 패널 (노드 선택 또는 릴레이션 편집) -->
      <div class="detail-panel" v-if="selectedNode || (showRelationEditor && editingRelation)" :style="{ width: detailPanelWidth + 'px' }">
        <!-- 리사이즈 핸들 -->
        <div 
          class="resize-handle"
          @mousedown="startResize"
          @dblclick="resetPanelWidth"
          title="드래그하여 폭 조절 (더블클릭: 기본값)"
        ></div>
        
        <!-- ===== 릴레이션 속성 편집 패널 ===== -->
        <template v-if="showRelationEditor && editingRelation && !selectedNode">
          <div class="detail-header">
            <h3>🔗 릴레이션 속성</h3>
            <button class="delete-node-btn" @click="deleteRelationFromEditor" title="릴레이션 삭제">🗑️ 삭제</button>
          </div>
          
          <div class="detail-content">
            <!-- 관계 미리보기 -->
            <div class="relation-preview-panel">
              <div class="rel-endpoint">
                <span class="rel-dot" :style="{ backgroundColor: getLayerColor(getNodeLayer(editingRelation.source)) }"></span>
                <span class="rel-name">{{ getNodeName(editingRelation.source) }}</span>
              </div>
              <div class="rel-arrow-panel">→</div>
              <div class="rel-endpoint">
                <span class="rel-dot" :style="{ backgroundColor: getLayerColor(getNodeLayer(editingRelation.target)) }"></span>
                <span class="rel-name">{{ getNodeName(editingRelation.target) }}</span>
              </div>
            </div>
            
            <div class="detail-row">
              <label>관계 유형</label>
              <select v-model="editingRelationForm.type" class="form-select" @change="saveRelationEditor">
                <option v-for="opt in relationTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            
            <div class="detail-row">
              <label>설명</label>
              <input 
                v-model="editingRelationForm.description" 
                type="text" 
                class="form-input"
                placeholder="관계에 대한 설명"
                @blur="saveRelationEditor"
                @keyup.enter="saveRelationEditor"
              />
            </div>
            
            <!-- 필드 매핑 -->
            <div class="field-mapping-section">
              <h4>📌 필드 매핑</h4>
              <p class="field-mapping-hint">상위 노드 필터 → 하위 노드 자동 필터링</p>
              
              <div class="detail-row">
                <label>From 필드 <span class="field-node-hint">({{ getNodeName(editingRelation.source) }})</span></label>
                <span v-if="sourceColumnStatus === 'loading'" class="field-status loading">컬럼 정보 로딩 중...</span>
                <div v-else-if="sourceColumnStatus === 'no_datasource'" class="field-status no-datasource">
                  <span>데이터 소스가 연결되지 않았습니다.</span>
                  <button type="button" class="link-datasource-btn-sm" @click="openNodeDataSourceDialog(editingRelation.source)">연결</button>
                </div>
                <div v-else-if="sourceColumnStatus === 'error'" class="field-status error">
                  {{ sourceColumnError || 'From 노드의 컬럼 정보를 조회할 수 없습니다.' }}
                </div>
                <select v-else v-model="editingRelationForm.fromField" class="form-select" @change="saveRelationEditor">
                  <option value="">(미설정)</option>
                  <option v-for="col in sourceNodeColumns" :key="col" :value="col">{{ col }}</option>
                </select>
              </div>
              
              <div class="detail-row">
                <label>To 필드 <span class="field-node-hint">({{ getNodeName(editingRelation.target) }})</span></label>
                <span v-if="targetColumnStatus === 'loading'" class="field-status loading">컬럼 정보 로딩 중...</span>
                <div v-else-if="targetColumnStatus === 'no_datasource'" class="field-status no-datasource">
                  <span>데이터 소스가 연결되지 않았습니다.</span>
                  <button type="button" class="link-datasource-btn-sm" @click="openNodeDataSourceDialog(editingRelation.target)">연결</button>
                </div>
                <div v-else-if="targetColumnStatus === 'error'" class="field-status error">
                  {{ targetColumnError || 'To 노드의 컬럼 정보를 조회할 수 없습니다.' }}
                </div>
                <select v-else v-model="editingRelationForm.toField" class="form-select" @change="saveRelationEditor">
                  <option value="">(미설정)</option>
                  <option v-for="col in targetNodeColumns" :key="col" :value="col">{{ col }}</option>
                </select>
              </div>
            </div>
            
            <div class="relation-panel-actions">
              <button class="cancel-btn" @click="closeRelationEditor">닫기</button>
            </div>
          </div>
        </template>
        
        <!-- ===== 노드 상세 패널 ===== -->
        <template v-else-if="selectedNode">
        <div class="detail-header">
          <h3>📋 노드 상세</h3>
          <button 
            class="delete-node-btn" 
            @click="confirmDeleteNode"
            title="노드 삭제"
          >
            🗑️ 삭제
          </button>
        </div>
        
        <!-- 탭 헤더 -->
        <div class="detail-tabs">
          <button 
            :class="['tab-btn', { active: detailPanelTab === 'info' }]"
            @click="detailPanelTab = 'info'"
          >
            ℹ️ 정보
          </button>
          <button 
            :class="['tab-btn', { active: detailPanelTab === 'data' }]"
            @click="detailPanelTab = 'data'; fetchNodeData(selectedNode.id)"
            :disabled="!selectedNode.dataSource"
            :title="selectedNode.dataSource ? '데이터 조회' : '연결된 데이터 소스 없음'"
          >
            📊 데이터
            <span v-if="selectedNode.dataSource" class="data-indicator">●</span>
          </button>
          <button 
            :class="['tab-btn', { active: detailPanelTab === 'analysis' }]"
            @click="handleAnalysisTabClick"
            :disabled="!selectedNode.dataSource || !isKPIOrMeasure(selectedNode)"
            :title="!selectedNode.dataSource ? '연결된 데이터 소스 없음' : !isKPIOrMeasure(selectedNode) ? 'KPI/Measure 노드만 분석 가능' : '원인 분석'"
          >
            🔍 분석
            <span v-if="selectedNode.dataSource && isKPIOrMeasure(selectedNode)" class="data-indicator">●</span>
          </button>
          <button 
            :class="['tab-btn', { active: detailPanelTab === 'behavior' }]"
            @click="detailPanelTab = 'behavior'; loadNodeBehaviors(selectedNode.id)"
          >
            🧠 Behavior
            <span v-if="nodeBehaviors.length > 0" class="data-indicator">●</span>
          </button>
          <button 
            v-if="isProcessNode(selectedNode)"
            :class="['tab-btn', { active: detailPanelTab === 'bpmn' }]"
            @click="detailPanelTab = 'bpmn'"
            :disabled="!selectedNode.bpmnXml"
            :title="selectedNode.bpmnXml ? 'BPMN 다이어그램 보기' : 'BPMN 데이터 없음'"
          >
            📐 BPMN
            <span v-if="selectedNode.bpmnXml" class="data-indicator">●</span>
          </button>
        </div>
        
        <!-- 정보 탭 -->
        <div class="detail-content" v-if="detailPanelTab === 'info'">
          <div class="detail-row">
            <label>이름</label>
            <div class="editable-name-container">
              <input
                v-if="isEditingNodeName"
                ref="nodeNameInput"
                v-model="editingNodeNameValue"
                class="node-name-edit-input"
                @blur="saveNodeName"
                @keyup.enter="saveNodeName"
                @keyup.esc="cancelEditNodeName"
              />
              <span 
                v-else 
                class="editable-node-name"
                @dblclick="startEditNodeName"
                title="더블클릭하여 이름 편집"
              >
                {{ selectedNode.name }}
              </span>
              <button 
                v-if="!isEditingNodeName"
                class="edit-name-btn"
                @click="startEditNodeName"
                title="이름 편집"
              >
                ✏️
              </button>
            </div>
          </div>
          <div class="detail-row">
            <label>레이어</label>
            <div class="layer-selector-wrapper" style="position: relative;">
              <span
                class="layer-badge layer-badge-clickable"
                :style="{ backgroundColor: getLayerColor(selectedNode.layer || selectedNode.label) }"
                @click="toggleLayerSelector"
                title="클릭하여 레이어 변경"
              >
                {{ selectedNode.layer || selectedNode.label }}
                <span class="layer-badge-arrow">▾</span>
              </span>
              <div v-if="isLayerSelectorOpen" class="layer-selector-dropdown">
                <div
                  v-for="layer in layers"
                  :key="layer.id"
                  class="layer-selector-item"
                  :class="{ active: (selectedNode.layer || selectedNode.label) === layer.id }"
                  :style="{ '--layer-color': layer.color }"
                  @click="changeNodeLayer(layer.id)"
                >
                  <span class="layer-selector-icon">{{ layer.icon }}</span>
                  <span class="layer-selector-name">{{ layer.name }}</span>
                  <span
                    class="layer-selector-dot"
                    :style="{ backgroundColor: layer.color }"
                  ></span>
                </div>
              </div>
            </div>
          </div>
          <div class="detail-row" v-if="selectedNode.description">
            <label>설명</label>
            <span>{{ selectedNode.description }}</span>
          </div>
          <div class="detail-row" v-if="selectedNode.unit">
            <label>단위</label>
            <span>{{ selectedNode.unit }}</span>
          </div>
          <div class="detail-row" v-if="selectedNode.formula">
            <label>공식</label>
            <code>{{ selectedNode.formula }}</code>
          </div>
          <div class="detail-row" v-if="selectedNode.targetValue">
            <label>목표값</label>
            <span>{{ selectedNode.targetValue }}</span>
          </div>
          
          <!-- 적용된 필터 칩 표시 -->
          <div class="detail-row" v-if="getNodeFilterChips(selectedNode.id).length > 0">
            <label>🔍 적용된 필터</label>
            <div class="filter-chips">
              <div 
                v-for="chip in getNodeFilterChips(selectedNode.id)" 
                :key="chip.label + chip.value"
                class="filter-chip"
                :class="chip.type === 'cascade' ? 'cascade' : 'direct'"
              >
                <span class="chip-label">{{ chip.label }}</span>
                <span class="chip-equals">=</span>
                <span class="chip-value">{{ chip.value }}</span>
                <span v-if="chip.type === 'cascade'" class="chip-source" :title="'상위 노드: ' + getNodeName(chip.fromNode!)">
                  ← {{ getNodeName(chip.fromNode!) }}
                </span>
              </div>
            </div>
          </div>
          
          <!-- 데이터 소스 정보 -->
          <div class="detail-row" v-if="selectedNode.dataSource">
            <label>데이터 소스</label>
            <div class="datasource-info">
              <div class="datasource-content">
                <code class="datasource-badge">{{ selectedNode.dataSource }}</code>
                <span v-if="selectedNode.dataSourceSchema" class="datasource-meta">
                  {{ selectedNode.dataSourceSchema.columns?.length || 0 }}개 컬럼
                </span>
              </div>
              <button 
                class="reset-datasource-btn" 
                @click="openNodeDataSourceDialog(selectedNode.id)"
                title="데이터 소스 재설정"
              >
                🔄 재설정
              </button>
            </div>
          </div>
          <div v-else class="detail-row">
            <label>데이터 소스</label>
            <span class="no-datasource">연결되지 않음</span>
            <button class="link-datasource-btn" @click="openNodeDataSourceDialog(selectedNode.id)">
              🔗 연결하기
            </button>
          </div>
          
          <!-- 연결된 관계 -->
          <div class="related-section">
            <h4>🔗 연결된 관계</h4>
            <div class="relation-list">
              <div 
                v-for="rel in getNodeRelations(selectedNode.id)" 
                :key="rel.id"
                class="relation-item"
                @dblclick="openRelationEditor(rel.id)"
                title="더블클릭하여 릴레이션 편집"
                style="cursor: pointer;"
              >
                <div class="rel-main">
                  <span class="rel-source">{{ getNodeName(rel.source) }}</span>
                  <span class="rel-type" :class="rel.type.toLowerCase()">{{ rel.type }}</span>
                  <span class="rel-target">{{ getNodeName(rel.target) }}</span>
                </div>
                <div v-if="rel.fromField && rel.toField" class="rel-field-mapping">
                  <span class="rel-field">{{ rel.fromField }}</span>
                  <span class="rel-field-arrow">→</span>
                  <span class="rel-field">{{ rel.toField }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 분석 탭 -->
        <div class="detail-content analysis-tab" v-if="detailPanelTab === 'analysis'">
          <div v-if="analysisState?.result && !analysisState?.loading" class="analysis-result-header">
            <div class="result-summary">
              <span class="result-metric">{{ analysisState.result.target_metric }}</span>
              <span class="result-range">
                {{ analysisState.result.time_range?.start }} ~ {{ analysisState.result.time_range?.end }}
              </span>
              <span class="result-type">
                {{ analysisState.result.analysis_type === 'increase' ? '📈 상승' : '📉 하락' }}
              </span>
            </div>
            <div class="result-reanalyze">
              <div v-if="causalBrushSelection" class="config-metric-control">
                <span
                  class="config-color-dot"
                  :style="{ background: getMetricOptionColor(causalBrushSelection.targetMetric) }"
                ></span>
                <select
                  v-model="causalBrushSelection.targetMetric"
                  @change="recalcAnalysisType"
                  class="result-metric-select"
                >
                  <option
                    v-for="col in analysisMetricOptions"
                    :key="col"
                    :value="col"
                    :style="{ color: getMetricOptionColor(col) }"
                  >
                    ● {{ col }}
                  </option>
                </select>
              </div>
              <button type="button" class="reanalyze-btn" @click="startAnalysisFromConfig">
                재분석
              </button>
              <button type="button" class="reconfigure-btn" @click="goBackToDataTab">
                구간 변경
              </button>
            </div>
          </div>

          <div v-if="!analysisState?.loading && !analysisState?.result && !analysisState?.error" class="analysis-empty">
            <p>
              데이터 탭의 추이 차트에서 분석할 구간을 드래그한 후,<br />
              설정 바에서 "분석 시작"을 클릭하세요.
            </p>
            <button type="button" class="goto-data-btn" @click="goBackToDataTab">
              📊 데이터 탭으로 이동
            </button>
          </div>

          <CausalAnalysisPanel
            v-if="selectedNode && (analysisState?.loading || analysisState?.result || analysisState?.error)"
            :node="selectedNode"
            :schema-id="currentSchemaId"
            :node-data-result="nodeDataResult"
            :analysis-result="analysisState?.result ?? null"
            :analysis-loading="analysisState?.loading ?? false"
            :analysis-error="analysisState?.error ?? null"
            :analysis-progress="analysisState?.progress ?? null"
            :streaming-report="displayedStreamingReport || null"
            @analysis-complete="handleAnalysisComplete"
          />
        </div>
        
        <!-- Behavior 탭 (Agents.md 에디터 + 연결된 모델 정보) -->
        <div class="detail-content behavior-tab" v-if="detailPanelTab === 'behavior'">
          <AgentsMdEditor 
            v-if="selectedNode"
            :node-type-name="selectedNode.name"
            :behavior-models="nodeBehaviors"
            @agent-created="loadNodeBehaviors(selectedNode.id)"
            @agent-deleted="loadNodeBehaviors(selectedNode.id)"
          />
        </div>
        
        <!-- BPMN 탭 -->
        <div class="detail-content bpmn-tab" v-if="detailPanelTab === 'bpmn' && isProcessNode(selectedNode)">
          <BpmnViewer
            v-if="selectedNode.bpmnXml"
            :model-value="selectedNode.bpmnXml"
            :title="selectedNode.name + ' – BPMN'"
            :node-id="selectedNode.id"
            @saved="(xml: string) => { if (selectedNode) selectedNode.bpmnXml = xml }"
          />
          <div v-else class="bpmn-empty-state">
            <p>이 프로세스에 연결된 BPMN 다이어그램이 없습니다.</p>
            <p class="bpmn-hint">문서에서 온톨로지를 생성하면 PDF2BPMN이 자동으로 BPMN을 추출합니다.</p>
          </div>
        </div>
        
        <!-- 데이터 탭 -->
        <div class="detail-content data-tab" v-if="detailPanelTab === 'data'">
          <!-- 로딩 상태 -->
          <div v-if="nodeDataLoading" class="data-loading">
            <div class="loading-spinner small"></div>
            <span>데이터 조회 중...</span>
          </div>
          
          <!-- 데이터 없음 (노드에 dataSource가 없거나 조회 실패) -->
          <div v-else-if="!selectedNode?.dataSource || !nodeDataResult?.hasDataSource" class="no-data">
            <span>📭</span>
            <p v-if="!selectedNode?.dataSource">연결된 데이터 소스가 없습니다.</p>
            <p v-else-if="nodeDataResult?.message">{{ nodeDataResult.message }}</p>
            <p v-else>데이터 조회에 실패했습니다. 다시 시도해주세요.</p>
            <div v-if="lastDataError" class="error-detail" style="margin-top: 12px; padding: 8px; background: rgba(239, 68, 68, 0.1); border-radius: 4px; font-size: 0.75rem; color: #ef4444; max-width: 100%; word-break: break-word;">
              <strong>에러 상세:</strong> {{ lastDataError }}
            </div>
            <div class="no-data-actions">
              <button 
                v-if="selectedNode?.dataSource" 
                class="action-btn small" 
                @click="fetchNodeData(selectedNode.id)"
              >
                🔄 다시 조회
              </button>
              <button 
                v-else
                class="action-btn small" 
                @click="showDataSourceDialog = true; selectedMappingNodeId = selectedNode?.id"
              >
                🔗 데이터 소스 연결
              </button>
              <button 
                v-if="selectedNode && !selectedNode.dataSource && (selectedNode.layer === 'Measure' || selectedNode.label === 'Measure')"
                class="action-btn small secondary" 
                @click="createMeasureObjectType"
              >
                📦 ObjectType 생성
              </button>
            </div>
          </div>
          
          <!-- 데이터 있음 -->
          <div v-else-if="nodeDataResult" class="data-view">
            <!-- 데이터 소스 정보 -->
            <div class="data-source-info">
              <span class="source-label">{{ nodeDataResult.isObjectType ? '📦 ObjectType' : '🗄️ 테이블' }}</span>
              <code>{{ nodeDataResult.dataSource }}</code>
              <span class="row-count">{{ nodeDataResult.rowCount }}행</span>
              <span v-if="nodeDataResult.businessDayFiltered" class="biz-day-badge">📅 영업일 필터 적용됨</span>
            </div>
            
            <!-- 영업일 캘린더 필터 토글 -->
            <div class="business-day-filter-toggle">
              <label class="toggle-label">
                <input 
                  type="checkbox" 
                  v-model="businessDayFilterEnabled"
                  @change="selectedNode && fetchNodeData(selectedNode.id)"
                />
                <span class="toggle-switch"></span>
                <span class="toggle-text">📅 영업일 캘린더 적용</span>
              </label>
              <span class="toggle-desc">비영업일(주말/공휴일) 데이터를 타임시리즈에서 제외합니다</span>
            </div>
            
            <!-- 차트 영역 -->
            <div 
              v-if="nodeDataResult.chartRecommendation?.type !== 'table'"
              class="chart-section"
            >
              <div class="chart-header">
                <h5>📈 {{ nodeDataResult.chartRecommendation?.type === 'line' ? '추이 차트' : '막대 차트' }}</h5>
              </div>
              <!-- ECharts가 chart-container 내부 DOM을 직접 관리하므로 자식 노드를 두지 않는다 -->
              <div class="chart-shell">
                <div
                  v-if="nodeDataResult.chartRecommendation?.type === 'line' && !isChartReady"
                  class="chart-loading chart-loading-overlay"
                >
                  차트 데이터 준비 중...
                </div>
                <div
                  ref="chartContainerRef"
                  class="chart-container"
                ></div>
              </div>

              <div
                v-if="causalBrushSelection && isKPIOrMeasure(selectedNode)"
                ref="analysisConfigBarRef"
                class="analysis-config-bar"
              >
                <div class="config-hint">분석 대상 메트릭을 확인하세요</div>
                <div class="config-row">
                  <span class="config-label">구간</span>
                  <span class="config-value">{{ causalBrushSelection.start }} ~ {{ causalBrushSelection.end }}</span>
                </div>
                <div class="config-row">
                  <span class="config-label">메트릭</span>
                  <div class="config-metric-control">
                    <span
                      class="config-color-dot"
                      :style="{ background: getMetricOptionColor(causalBrushSelection.targetMetric) }"
                    ></span>
                    <select
                      v-model="causalBrushSelection.targetMetric"
                      @change="recalcAnalysisType"
                      class="config-metric-select config-metric-highlight"
                    >
                      <option
                        v-for="col in analysisMetricOptions"
                        :key="col"
                        :value="col"
                        :style="{ color: getMetricOptionColor(col) }"
                      >
                        ● {{ col }}
                      </option>
                    </select>
                  </div>
                </div>
                <div class="config-row">
                  <span class="config-label">추세</span>
                  <div class="trend-toggle">
                    <button
                      type="button"
                      :class="['trend-btn', { active: causalBrushSelection.analysisType === 'increase' }]"
                      @click="causalBrushSelection.analysisType = 'increase'"
                    >
                      📈 상승
                    </button>
                    <button
                      type="button"
                      :class="['trend-btn', { active: causalBrushSelection.analysisType === 'decrease' }]"
                      @click="causalBrushSelection.analysisType = 'decrease'"
                    >
                      📉 하락
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  class="config-analyze-btn"
                  @click="startAnalysisFromConfig"
                  :disabled="analysisState?.loading"
                >
                  <template v-if="analysisState?.loading">
                    <span class="btn-spinner"></span>
                    분석 중...
                  </template>
                  <template v-else>
                    🔍 분석 시작
                  </template>
                </button>
              </div>
            </div>
            
            <!-- 데이터 테이블 -->
            <div class="data-table-section">
              <div class="table-header">
                <h5>📋 원천 데이터</h5>
                <span class="column-count">{{ nodeDataResult.columns.length }}개 컬럼</span>
              </div>
              <div class="data-table-wrapper">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th v-for="col in nodeDataResult.columns" :key="col">
                        {{ col }}
                        <span v-if="nodeDataResult.timeColumns.includes(col)" class="col-type time">📅</span>
                        <span v-else-if="nodeDataResult.numericColumns.includes(col)" class="col-type numeric">#</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in nodeDataResult.rows.slice(0, 50)" :key="idx">
                      <td v-for="col in nodeDataResult.columns" :key="col">
                        {{ formatCellValue(row[col]) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-if="nodeDataResult.rows.length > 50" class="table-footer">
                처음 50개 행만 표시됨 (전체 {{ nodeDataResult.rowCount }}행)
              </div>
            </div>
          </div>
        </div>
        </template>
      </div>
    </div>

    <div v-if="showSynonymSuggestionToast" class="synonym-toast-banner">
      <span class="toast-message">
        동의어 {{ synonymSuggestions.length }}건이 발견되었습니다. 수락하면 용어집에 자동 추가됩니다.
      </span>
      <button
        type="button"
        class="toast-action"
        @click="showSynonymSuggestionModal = true; showSynonymSuggestionToast = false"
      >
        리뷰하기
      </button>
      <button type="button" class="toast-dismiss" @click="dismissSynonymSuggestions">
        닫기
      </button>
    </div>

    <div v-if="showSynonymAppliedToast" class="synonym-applied-banner">
      <span class="toast-message">
        {{ synonymAppliedCount }}개의 동의어가 용어집에 추가되었습니다.
      </span>
      <button type="button" class="toast-dismiss" @click="showSynonymAppliedToast = false">
        닫기
      </button>
    </div>

    <!-- 생성 다이얼로그 (오류 시 배경 클릭으로 닫히지 않음) -->
    <div v-if="showGenerateDialog" class="dialog-overlay" @click.self="!generating && !generateError && (showGenerateDialog = false, generationCompleted = false)">
        <div class="generate-dialog" :class="{ 'dialog-expanded': generating || !!generateError || generationCompleted }">
        <div class="dialog-header">
          <h3>{{ generationMode === 'schema' ? '🗃️ DB 스키마에서 온톨로지 생성' : '📄 문서에서 온톨로지 생성' }}</h3>
          <button class="close-btn" @click="onCloseGenerateDialog" :disabled="generating">✕</button>
        </div>
        
        <!-- 생성 모드 탭 -->
        <div class="generation-mode-tabs" v-if="!generating && !generateError && !generationCompleted">
          <button 
            :class="['mode-tab', { active: generationMode === 'document' }]"
            @click="generationMode = 'document'"
          >
            <span>📄</span> 문서 기반
          </button>
          <button 
            :class="['mode-tab', { active: generationMode === 'schema' }]"
            @click="generationMode = 'schema'"
          >
            <span>🗃️</span> DB 스키마 기반
          </button>
        </div>
        
        <!-- 스키마 기반 생성 모드 -->
        <div v-if="generationMode === 'schema' && !generating && !generateError && !generationCompleted" class="schema-generation-content">
          <SchemaBasedGenerator 
            @generated="handleSchemaBasedGenerated"
            @cancel="showGenerateDialog = false"
          />
        </div>
        
        <!-- 오류 전용 화면 (폼으로 돌아가지 않고 먼저 표시) -->
        <div class="error-result-view" v-else-if="generateError && !generating">
          <div class="error-result-icon">⚠️</div>
          <h4 class="error-result-title">온톨로지 생성 오류</h4>
          <p class="error-result-message">{{ generateError }}</p>
          <div class="error-result-actions">
            <button type="button" class="retry-btn" @click="generateError = ''">다시 시도</button>
            <button type="button" class="close-error-btn" @click="onCloseGenerateDialog">닫기</button>
          </div>
        </div>
        
        <!-- 문서 기반 입력 폼 (생성 중도 아니고 오류도 완료도 아닐 때만) -->
        <div class="dialog-content" v-else-if="generationMode === 'document' && !generating && !generationCompleted">
          <div class="form-group">
            <label>입력 방식</label>
            <div class="input-type-tabs">
              <button 
                :class="['tab-btn', { active: generateForm.inputType === 'text' }]"
                @click="generateForm.inputType = 'text'"
              >
                📝 텍스트 입력
              </button>
              <button 
                :class="['tab-btn', { active: generateForm.inputType === 'pdf' }]"
                @click="generateForm.inputType = 'pdf'"
              >
                📎 PDF 업로드
              </button>
              <button 
                :class="['tab-btn', { active: generateForm.inputType === 'url' }]"
                @click="generateForm.inputType = 'url'"
              >
                🔗 URL 입력
              </button>
            </div>
          </div>
          
          <!-- 텍스트 입력 -->
          <div class="form-group" v-if="generateForm.inputType === 'text'">
            <label>문서 내용</label>
            <textarea 
              v-model="generateForm.text" 
              rows="10" 
              placeholder="분석할 문서 내용을 입력하세요..."
            ></textarea>
          </div>
          
          <!-- PDF 업로드 -->
          <div class="form-group" v-if="generateForm.inputType === 'pdf'">
            <label>PDF 파일 업로드</label>
            <div 
              class="file-drop-zone"
              :class="{ 'drag-over': isDraggingFile }"
              @dragover.prevent="isDraggingFile = true"
              @dragleave="isDraggingFile = false"
              @drop.prevent="handleFileDrop"
            >
              <input 
                type="file" 
                ref="fileInput"
                accept=".pdf"
                @change="handleFileSelect"
                style="display: none"
              />
              <div v-if="!uploadedFile" class="drop-zone-content" @click="($refs.fileInput as HTMLInputElement)?.click()">
                <span class="drop-icon">📁</span>
                <p>PDF 파일을 드래그하거나 클릭하여 선택</p>
                <span class="drop-hint">대용량 PDF 지원 (1GB 이하 권장)</span>
              </div>
              <div v-else class="file-info">
                <span class="file-icon">📄</span>
                <span class="file-name">{{ uploadedFile.name }}</span>
                <span class="file-size">{{ formatFileSize(uploadedFile.size) }}</span>
                <button class="remove-file-btn" @click.stop="uploadedFile = null">✕</button>
              </div>
            </div>
          </div>
          
          <!-- URL 입력 -->
          <div class="form-group" v-if="generateForm.inputType === 'url'">
            <label>PDF URL</label>
            <input 
              type="url" 
              v-model="generateForm.pdfUrl" 
              placeholder="https://example.com/document.pdf"
            />
          </div>
          
          <div class="form-group glossary-selector">
            <label>사용할 용어집</label>
            <p class="glossary-help">선택한 용어집의 표준 용어를 기반으로 온톨로지를 더 정확하게 생성합니다.</p>
            <div class="glossary-toggle">
              <label class="toggle-label">
                <input type="checkbox" v-model="useAllGlossaries" @change="onToggleAllGlossaries" />
                <span>{{ allGlossariesLabel }}</span>
              </label>
            </div>

            <div v-if="!useAllGlossaries" class="glossary-checklist">
              <div v-if="glossaryLoading" class="glossary-loading">용어집 목록 로드 중...</div>
              <div v-else-if="glossariesForSelect.length === 0" class="glossary-empty">
                등록된 용어집이 없습니다.
              </div>
              <template v-else>
                <label
                  v-for="glossary in glossariesForSelect"
                  :key="glossary.id"
                  class="glossary-check-item"
                >
                  <input
                    v-model="generateForm.selectedGlossaryIds"
                    type="checkbox"
                    :value="glossary.id"
                  />
                  <span class="glossary-check-name">{{ glossary.name }}</span>
                  <span class="glossary-check-count">{{ glossary.termCount }}개 용어</span>
                </label>
                <p v-if="generateForm.selectedGlossaryIds.length === 0" class="glossary-validation-hint">
                  용어집을 1개 이상 선택해주세요.
                </p>
              </template>
            </div>
          </div>
          
        </div>
        
        <!-- 생성 완료 결과 화면 -->
        <div class="generation-complete-view" v-else-if="generationCompleted">
          <div class="complete-icon-row">
            <span class="complete-icon">&#x2705;</span>
            <h4 class="complete-title">온톨로지 생성 완료</h4>
          </div>

          <div class="complete-summary">
            <div class="summary-stat">
              <span class="stat-value">{{ generationResult.nodeCount }}</span>
              <span class="stat-label">노드</span>
            </div>
            <div class="summary-stat">
              <span class="stat-value">{{ generationResult.relationshipCount }}</span>
              <span class="stat-label">관계</span>
            </div>
            <div class="summary-stat">
              <span class="stat-value">{{ Object.keys(generationResult.layerBreakdown).length }}</span>
              <span class="stat-label">레이어</span>
            </div>
          </div>

          <div class="complete-layer-tags">
            <span
              v-for="(count, layerName) in generationResult.layerBreakdown"
              :key="layerName"
              class="layer-tag"
            >
              {{ layerName }}: {{ count }}개
            </span>
          </div>

          <div class="complete-save-status">
            <template v-if="generationSaveStatus === 'saving'">
              <span class="save-spinner"></span>
              <span>Neo4j에 저장 중...</span>
            </template>
            <template v-else-if="generationSaveStatus === 'saved'">
              <span class="save-check">&#x2714;</span>
              <span>Neo4j에 저장 완료</span>
            </template>
            <template v-else-if="generationSaveStatus === 'failed'">
              <span class="save-fail">&#x2716;</span>
              <span>저장 실패: {{ generationSaveError }}</span>
            </template>
          </div>

          <div class="complete-synonym-section" v-if="generationResult.synonymSuggestionCount > 0">
            <p class="synonym-info-text">
              문서에서 추출된 용어 중 기존 용어집 항목과 유사한 <strong>{{ generationResult.synonymSuggestionCount }}건</strong>이 발견되었습니다.
              수락하면 해당 용어의 동의어로 용어집에 자동 추가됩니다.
            </p>
            <button
              type="button"
              class="synonym-review-btn"
              @click="showSynonymSuggestionModal = true; showGenerateDialog = false; generationCompleted = false"
            >
              동의어 리뷰하기
            </button>
          </div>
          <div class="complete-synonym-section no-suggestions" v-else>
            <p class="synonym-info-text">
              용어집에 추가할 동의어 후보가 발견되지 않았습니다.
            </p>
          </div>

          <div class="complete-actions">
            <button
              type="button"
              class="complete-close-btn"
              @click="showGenerateDialog = false; generationCompleted = false"
            >
              온톨로지 보기
            </button>
          </div>
        </div>

        <!-- 진행 상태 뷰어 (생성 중일 때) -->
        <div class="progress-viewer" v-else-if="generating">
          <div class="progress-header">
            <div class="progress-title-row">
              <h4>🤖 에이전트 진행 상태</h4>
              <span class="progress-step-label">{{ currentStep }}</span>
            </div>
            <div class="progress-summary-bar">
              <div class="summary-track">
                <div 
                  class="summary-fill" 
                  :style="{ width: overallProgressPercent + '%' }"
                ></div>
              </div>
              <div class="summary-stats">
                <span class="summary-percent">{{ overallProgressPercent }}%</span>
                <span class="summary-detail">
                  {{ completedStageCount }}/{{ totalStageCount }} 단계 완료<template v-if="totalExtractedNodes > 0"> · {{ totalExtractedNodes }}개 추출</template>
                </span>
              </div>
            </div>
          </div>
          
          <!-- 파이프라인 단계별 진행 상태 -->
          <div class="layer-progress-list">
            <div 
              v-for="stage in activePipelineStages" 
              :key="stage"
              class="layer-progress-row"
              :class="pipelineProgress[stage]?.status || 'pending'"
            >
              <span class="lp-icon" :style="{ color: STAGE_LABELS[stage]?.color || '#888' }">{{ STAGE_LABELS[stage]?.icon || '⚙️' }}</span>
              <span class="lp-name">{{ STAGE_LABELS[stage]?.label || stage }}</span>
              <div class="lp-bar-wrap">
                <div class="lp-bar-track">
                  <div 
                    class="lp-bar-fill" 
                    :style="{ width: (pipelineProgress[stage]?.progress || 0) + '%', backgroundColor: STAGE_LABELS[stage]?.color || '#888' }"
                  ></div>
                </div>
              </div>
              <span class="lp-badge" :class="pipelineProgress[stage]?.status">
                {{ getStatusLabel(pipelineProgress[stage]?.status) }}
              </span>
              <span class="lp-detail" :title="pipelineProgress[stage]?.message || ''">
                <template v-if="stage === 'Sanitize' && sanitizeChunkProgress.total > 0">
                  청크 {{ sanitizeChunkProgress.current }}/{{ sanitizeChunkProgress.total }}
                </template>
                <template v-else-if="stage === 'Unified' && chunkProgress.total > 0">
                  청크 {{ chunkProgress.current }}/{{ chunkProgress.total }}
                  <template v-if="chunkProgress.substepTotal > 0">
                    · 단계 {{ chunkProgress.substepCurrent }}/{{ chunkProgress.substepTotal }}
                  </template>
                  <template v-if="chunkProgress.totalSteps > 0">
                    · {{ chunkProgress.completedSteps }}/{{ chunkProgress.totalSteps }} 세부단계
                  </template>
                </template>
                <template v-if="getStageDisplayMessage(stage)"> · {{ getStageDisplayMessage(stage) }}</template>
              </span>
            </div>
            <!-- Unified 단계 하위: 레이어별 노드 수 요약 -->
            <div v-if="Object.keys(layerResults).length > 0 && pipelineProgress['Unified']?.status !== 'pending'" class="layer-results-summary">
              <span v-for="(result, layerName) in layerResults" :key="layerName" class="layer-result-tag">
                {{ layerName }}: {{ result.nodeCount }}개
              </span>
            </div>
          </div>
          
          <!-- 접이식 추출 로그 -->
          <div class="generation-logs" :class="{ expanded: logsExpanded }">
            <div class="logs-toggle" @click="logsExpanded = !logsExpanded">
              <span class="logs-toggle-icon">{{ logsExpanded ? '▼' : '▶' }}</span>
              <span class="logs-toggle-label">📝 추출 로그</span>
              <span class="logs-count">{{ generationLogs.length }}건</span>
            </div>
            <div v-if="logsExpanded" class="log-list" ref="logListRef">
              <div v-for="(log, idx) in generationLogs" :key="idx" class="log-item" :class="log.type">
                <span class="log-time">{{ log.time }}</span>
                <span class="log-message">{{ log.message }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="dialog-footer" v-if="!generating && !generateError && !generationCompleted">
          <button class="cancel-btn" @click="showGenerateDialog = false">취소</button>
          <button class="generate-btn" @click="generateOntology" :disabled="!canGenerate">
            🚀 온톨로지 생성
          </button>
        </div>
        <div class="dialog-footer" v-else-if="generating">
          <button class="cancel-btn" @click="cancelGeneration">취소</button>
        </div>
      </div>
    </div>

    <SynonymSuggestionModal
      v-if="showSynonymSuggestionModal"
      :suggestions="synonymSuggestions"
      @close="dismissSynonymSuggestions"
      @applied="handleSynonymSuggestionsApplied"
    />

    <!-- 데이터 소스 연결 다이얼로그 -->
    <div v-if="showDataSourceDialog" class="dialog-overlay" @click.self="!linkingDataSources && (showDataSourceDialog = false)">
      <div class="datasource-dialog">
        <div class="dialog-header">
          <h3>🔗 데이터 소스 자동 연결</h3>
          <button class="close-btn" @click="showDataSourceDialog = false" :disabled="linkingDataSources">✕</button>
        </div>
        
        <div class="dialog-body">
          <!-- 로딩 상태 with 진행 바 -->
          <div v-if="linkingDataSources" class="linking-status">
            <div class="progress-container">
              <div class="progress-header">
                <span class="progress-text">
                  Text2SQL 에이전트로 데이터 소스 검색 중...
                </span>
                <span class="progress-count">
                  {{ linkingProgress.completed }} / {{ linkingProgress.total }}
                </span>
              </div>
              <div class="progress-bar-wrapper">
                <div 
                  class="progress-bar-fill" 
                  :style="{ width: `${(linkingProgress.completed / linkingProgress.total) * 100}%` }"
                ></div>
              </div>
            </div>
            
            <!-- 노드별 진행 상황 -->
            <div class="node-progress-list">
              <div 
                v-for="node in nodes" 
                :key="node.id"
                class="node-progress-item"
                :class="linkingProgress.nodeStatuses[node.id]?.status || 'pending'"
              >
                <span class="node-status-icon">
                  <span v-if="linkingProgress.nodeStatuses[node.id]?.status === 'searching'" class="searching-icon">⏳</span>
                  <span v-else-if="linkingProgress.nodeStatuses[node.id]?.status === 'found'">✅</span>
                  <span v-else-if="linkingProgress.nodeStatuses[node.id]?.status === 'not_found'">❌</span>
                  <span v-else-if="linkingProgress.nodeStatuses[node.id]?.status === 'error'">⚠️</span>
                  <span v-else>⏸️</span>
                </span>
                <span class="node-name">{{ node.name }}</span>
                <span class="node-layer-badge" :style="{ background: getLayerColor(node.layer || node.label) }">
                  {{ node.layer || node.label }}
                </span>
                <span class="node-status-text">
                  {{ linkingProgress.nodeStatuses[node.id]?.message || '대기 중' }}
                </span>
              </div>
            </div>
          </div>
          
          <!-- 결과 -->
          <div v-else class="mapping-results">
            <!-- 통계 요약 -->
            <div class="mapping-stats">
              <div class="stat-item">
                <span class="stat-value">{{ getMappingStats().total }}</span>
                <span class="stat-label">전체 노드</span>
              </div>
              <div class="stat-item found">
                <span class="stat-value">{{ getMappingStats().found }}</span>
                <span class="stat-label">후보 발견</span>
              </div>
              <div class="stat-item confirmed">
                <span class="stat-value">{{ getMappingStats().confirmed }}</span>
                <span class="stat-label">확정됨</span>
              </div>
              <div class="stat-item not-found">
                <span class="stat-value">{{ getMappingStats().notFound }}</span>
                <span class="stat-label">미발견</span>
              </div>
              <div class="stat-item error">
                <span class="stat-value">{{ getMappingStats().error }}</span>
                <span class="stat-label">오류</span>
              </div>
            </div>
            
            <!-- 노드별 매핑 목록 -->
            <div class="mapping-list">
              <div 
                v-for="(mapping, nodeId) in dataSourceMappings" 
                :key="nodeId"
                class="mapping-item"
                :class="{ selected: selectedMappingNodeId === nodeId }"
                @click="selectedMappingNodeId = nodeId as string"
              >
                <div class="mapping-header">
                  <span class="mapping-status">{{ getStatusIcon(mapping.status) }}</span>
                  <span class="mapping-name">{{ mapping.node_name }}</span>
                  <span class="mapping-layer" :style="{ color: getLayerColor(mapping.node_layer) }">
                    {{ mapping.node_layer }}
                  </span>
                </div>
                
                <!-- 확장된 상세 -->
                <div v-if="selectedMappingNodeId === nodeId" class="mapping-details">
                  <div class="search-query">
                    <span class="label">검색 쿼리:</span>
                    <span class="value">{{ mapping.search_query }}</span>
                  </div>
                  
                  <!-- 후보 목록 -->
                  <div v-if="mapping.candidates.length > 0" class="candidates-list">
                    <h5>📋 데이터 소스 후보 ({{ mapping.candidates.length }}개)</h5>
                    <div 
                      v-for="(candidate, idx) in mapping.candidates" 
                      :key="idx"
                      class="candidate-item"
                      :class="{ 
                        selected: mapping.selected_candidate?.table_name === candidate.table_name,
                        confirmed: mapping.status === 'confirmed' && mapping.selected_candidate?.table_name === candidate.table_name,
                        expanded: expandedCandidates.has(`${nodeId}-${idx}`)
                      }"
                    >
                      <div class="candidate-header" @click.stop="toggleCandidateExpanded(nodeId as string, idx)">
                        <div class="candidate-info">
                          <div class="candidate-name">
                            <span class="expand-icon">{{ expandedCandidates.has(`${nodeId}-${idx}`) ? '▼' : '▶' }}</span>
                            <span class="table-icon">📊</span>
                            <strong>{{ candidate.table_name }}</strong>
                            <span class="relevance-badge">{{ (candidate.relevance_score * 100).toFixed(0) }}%</span>
                            <span v-if="mapping.status === 'confirmed' && mapping.selected_candidate?.table_name === candidate.table_name" class="confirmed-tag">✅ 확정됨</span>
                          </div>
                          <div class="candidate-meta">
                            <span v-if="candidate.row_count === null">📊 ... rows</span>
                            <span v-else-if="candidate.row_count === -1">📊 - rows</span>
                            <span v-else-if="candidate.row_count_approx">📊 {{ candidate.row_count.toLocaleString() }}+ rows</span>
                            <span v-else>📊 {{ candidate.row_count.toLocaleString() }} rows</span>
                            <span>📋 {{ candidate.columns.length }} columns</span>
                          </div>
                          <div class="candidate-reason">{{ candidate.match_reason }}</div>
                        </div>
                        <div class="candidate-actions">
                          <button 
                            class="preview-btn" 
                            @click.stop="loadSampleData(candidate)"
                            title="샘플 데이터 보기"
                          >
                            👁️ 미리보기
                          </button>
                          <button 
                            v-if="mapping.status !== 'confirmed' || mapping.selected_candidate?.table_name !== candidate.table_name"
                            class="confirm-btn" 
                            @click.stop="confirmDataSourceMapping(nodeId as string, candidate)"
                            title="이 데이터 소스 선택"
                          >
                            ✓ 선택
                          </button>
                        </div>
                      </div>
                      
                      <!-- 확장된 상세 정보 -->
                      <div v-if="expandedCandidates.has(`${nodeId}-${idx}`)" class="candidate-details">
                        <!-- 컬럼 목록 -->
                        <div class="candidate-columns">
                          <h6>📋 컬럼 목록 ({{ candidate.columns.length }}개)</h6>
                          <div class="columns-grid">
                            <span 
                              v-for="(col, colIdx) in candidate.columns" 
                              :key="colIdx"
                              class="column-badge"
                            >
                              {{ col }}
                            </span>
                          </div>
                        </div>
                        
                        <!-- SQL 쿼리 -->
                        <div v-if="candidate.suggested_sql" class="candidate-sql">
                          <h6>🔍 추천 SQL 쿼리</h6>
                          <code class="sql-code">{{ candidate.suggested_sql }}</code>
                        </div>
                        
                        <!-- 샘플 데이터 미리보기 -->
                        <div v-if="candidate.sample_data && candidate.sample_data.length > 0" class="candidate-sample">
                          <h6>👀 샘플 데이터 ({{ candidate.sample_data.length }}행)</h6>
                          <div class="sample-table-wrapper">
                            <table class="sample-table">
                              <thead>
                                <tr>
                                  <th v-for="col in candidate.columns.slice(0, 5)" :key="col">{{ col }}</th>
                                  <th v-if="candidate.columns.length > 5">...</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr v-for="(row, rowIdx) in candidate.sample_data.slice(0, 3)" :key="rowIdx">
                                  <td v-for="col in candidate.columns.slice(0, 5)" :key="col">
                                    {{ formatSampleValue(row[col]) }}
                                  </td>
                                  <td v-if="candidate.columns.length > 5">...</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- 후보 없음 -->
                  <div v-else class="no-candidates">
                    <p>❌ 관련 데이터 소스를 찾지 못했습니다.</p>
                    <p class="hint">Text2SQL에서 직접 검색하거나, 수동으로 데이터 소스를 연결하세요.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="dialog-footer">
          <button class="cancel-btn" @click="showDataSourceDialog = false">닫기</button>
          <button 
            v-if="!linkingDataSources && getMappingStats().found > 0"
            class="action-btn success" 
            @click="confirmAllSelectedMappings"
            :disabled="getMappingStats().confirmed >= getMappingStats().found"
          >
            ✅ 선택된 후보 모두 확정 ({{ getMappingStats().confirmed }}/{{ getMappingStats().found }})
          </button>
          <button 
            class="action-btn primary" 
            @click="autoLinkDataSources"
            :disabled="linkingDataSources"
          >
            🔄 다시 검색
          </button>
        </div>
      </div>
    </div>

    <!-- 개별 노드 데이터 소스 연결 다이얼로그 -->
    <div v-if="showNodeDataSourceDialog" class="dialog-overlay" @click.self="showNodeDataSourceDialog = false">
      <div class="node-datasource-dialog">
        <div class="dialog-header">
          <h3>🔗 데이터 소스 연결: {{ currentNodeForDataSource?.name }}</h3>
          <button class="close-btn" @click="showNodeDataSourceDialog = false">✕</button>
        </div>
        
        <div class="dialog-body">
          <!-- 노드 정보 -->
          <div class="node-info-section">
            <div class="node-info-item">
              <span class="label">레이어:</span>
              <span class="layer-badge" :style="{ backgroundColor: currentNodeForDataSource ? getLayerColor(currentNodeForDataSource.layer || currentNodeForDataSource.label) : '' }">
                {{ currentNodeForDataSource?.layer || currentNodeForDataSource?.label }}
              </span>
            </div>
            <div class="node-info-item" v-if="currentNodeForDataSource?.description">
              <span class="label">설명:</span>
              <span>{{ currentNodeForDataSource.description }}</span>
            </div>
          </div>
          
          <!-- 탭 -->
          <div class="datasource-tabs">
            <button 
              :class="['tab-btn', { active: nodeDataSourceTab === 'search' }]"
              @click="nodeDataSourceTab = 'search'"
            >
              🔍 자연어 검색
            </button>
            <button 
              :class="['tab-btn', { active: nodeDataSourceTab === 'manual' }]"
              @click="nodeDataSourceTab = 'manual'"
            >
              📋 테이블 선택
            </button>
          </div>
          
          <!-- 자연어 검색 탭 -->
          <div v-if="nodeDataSourceTab === 'search'" class="search-tab">
            <div class="search-input-section">
              <label>검색어 (노드 정보 기반 자동 생성)</label>
              <div class="search-input-wrapper">
                <select
                  class="search-datasource-select"
                  v-model="selectedDatasource"
                  @change="handleDatasourceChange"
                  :disabled="loadingTables"
                  :title="selectedDatasource || '데이터 소스 선택'"
                >
                  <option value="">데이터 소스</option>
                  <option v-for="ds in availableDatasources" :key="ds" :value="ds">
                    {{ ds }}
                  </option>
                </select>
                <input 
                  v-model="nodeSearchQuery"
                  type="text"
                  class="search-input"
                  placeholder="예: 탁도 측정 데이터, KPI 시계열..."
                  @keyup.enter="searchNodeDataSource"
                />
                <button 
                  class="search-btn"
                  @click="searchNodeDataSource"
                  :disabled="nodeSearchLoading || !selectedDatasource"
                >
                  {{ nodeSearchLoading ? '검색 중...' : '🔍 검색' }}
                </button>
              </div>
              <div class="search-hint">
                {{ !selectedDatasource ? '⚠️ 데이터 소스를 먼저 선택하세요.' : '💡 노드 이름과 레이어를 기반으로 검색어가 자동 생성됩니다. 필요시 수정하세요.' }}
              </div>
              
              <!-- 검색 진행 상황 표시 -->
              <div v-if="nodeSearchStatus" class="search-status">
                <div v-if="nodeSearchLoading" class="search-spinner-small"></div>
                <span>{{ nodeSearchStatus }}</span>
              </div>
              
              <!-- 스트리밍 대화 내용 표시 -->
              <div v-if="nodeSearchLoading && nodeSearchConversation.length > 0" class="search-conversation">
                <div class="conversation-header">
                  <span>💬 AI 대화 내용</span>
                </div>
                <div class="conversation-content">
                  <div 
                    v-for="(message, idx) in nodeSearchConversation" 
                    :key="idx"
                    class="conversation-message"
                  >
                    {{ message }}
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 검색 결과 -->
            <div v-if="nodeSearchResults.length > 0" class="search-results">
              <h4>검색 결과 ({{ nodeSearchResults.length }}개)</h4>
              <div class="result-list">
                <div 
                  v-for="(result, idx) in nodeSearchResults" 
                  :key="idx"
                  class="result-item"
                  :class="{ selected: selectedSearchResult === idx }"
                  @click="selectedSearchResult = idx"
                >
                  <div class="result-header">
                    <span class="table-icon">📊</span>
                    <strong>{{ result.table_name }}</strong>
                    <span class="relevance-badge">{{ (result.relevance_score * 100).toFixed(0) }}%</span>
                  </div>
                  <div class="result-meta">
                    <span v-if="result.row_count === null">... rows</span>
                    <span v-else-if="result.row_count === -1">- rows</span>
                    <span v-else-if="result.row_count_approx">{{ result.row_count.toLocaleString() }}+ rows</span>
                    <span v-else>{{ result.row_count.toLocaleString() }} rows</span>
                    <span>{{ result.columns?.length || 0 }} columns</span>
                  </div>
                  <div class="result-reason">{{ result.match_reason }}</div>
                  <div class="result-actions">
                    <button class="preview-btn" @click.stop="previewSearchResult(result)">
                      👁️ 미리보기
                    </button>
                    <button class="select-btn" @click.stop="selectSearchResult(result)">
                      ✓ 선택
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div v-else-if="nodeSearchQuery && !nodeSearchLoading && !nodeSearchStatus" class="no-results">
              <p>검색 결과가 없습니다. 다른 검색어를 시도해보세요.</p>
            </div>
          </div>
          
          <!-- 테이블 선택 탭 -->
          <div v-if="nodeDataSourceTab === 'manual'" class="manual-tab">
            <div class="table-selector-section">
              <label>데이터 소스/스키마/테이블 선택</label>
              <div class="table-selector-wrapper">
                <!-- 데이터 소스 선택 -->
                <div class="datasource-selector">
                  <label>데이터 소스:</label>
                  <select 
                    v-model="selectedDatasource" 
                    @change="handleDatasourceChange"
                  >
                    <option value="">선택하세요</option>
                    <option v-for="ds in availableDatasources" :key="ds" :value="ds">
                      {{ ds }}
                    </option>
                    <option value="__ontology__">온톨로지 (ObjectType)</option>
                  </select>
                </div>
                
                <!-- 스키마 선택 (데이터 소스 선택 시에만 표시, 온톨로지 제외) -->
                <div class="schema-selector" v-if="selectedDatasource && selectedDatasource !== '__ontology__'">
                  <label>스키마:</label>
                  <select 
                    v-model="selectedSchema"
                    @change="handleSchemaChange"
                    :disabled="!selectedDatasource || loadingTables"
                  >
                    <option value="">선택하세요</option>
                    <option v-for="schema in availableSchemas" :key="schema" :value="schema">
                      {{ schema }}
                    </option>
                  </select>
                </div>
                
                <!-- 테이블 검색 -->
                <div class="table-search">
                  <input 
                    v-model="tableSearchQuery"
                    type="text"
                    placeholder="테이블 검색..."
                  />
                </div>
              </div>
              
              <!-- 테이블 목록 -->
              <div class="table-list-container">
                <div v-if="loadingTables" class="loading-tables">
                  <div class="loading-spinner small"></div>
                  <span>테이블 목록 로딩 중...</span>
                </div>
                <div v-else-if="filteredTables.length > 0" class="table-list">
                  <div 
                    v-for="table in filteredTables" 
                    :key="table.fullName"
                    class="table-item"
                    :class="{ selected: selectedManualTable === table.fullName }"
                    @click="selectedManualTable = table.fullName"
                  >
                    <div class="table-header">
                      <span class="table-icon">📊</span>
                      <strong>{{ table.name }}</strong>
                      <span v-if="table.datasource" class="datasource-badge-small">{{ table.datasource }}</span>
                      <span v-if="table.schema" class="schema-badge">{{ table.schema }}</span>
                      <span v-if="selectedManualTable === table.fullName" class="selected-check">✓</span>
                    </div>
                    <div class="table-meta">
                      <span>{{ table.columnCount || 0 }} 컬럼</span>
                    </div>
                  </div>
                </div>
                <div v-else class="no-tables">
                  <p>테이블을 찾을 수 없습니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="dialog-footer">
          <button class="cancel-btn" @click="showNodeDataSourceDialog = false">취소</button>
          <button 
            v-if="selectedSearchResult !== null || selectedManualTable"
            class="action-btn primary" 
            @click="confirmNodeDataSource"
          >
            ✓ 연결 확정
          </button>
        </div>
      </div>
    </div>

    <!-- 샘플 데이터 미리보기 다이얼로그 -->
    <div v-if="showSampleDataDialog" class="dialog-overlay" @click.self="showSampleDataDialog = false">
      <div class="sample-data-dialog">
        <div class="dialog-header">
          <h3>📊 샘플 데이터</h3>
          <button class="close-btn" @click="showSampleDataDialog = false">✕</button>
        </div>
        <div class="dialog-body">
          <div v-if="sampleDataLoading" class="loading-state">
            <div class="loading-spinner"></div>
            <p>데이터 로딩 중...</p>
          </div>
          <div v-else-if="sampleData.length > 0" class="sample-data-table">
            <table>
              <thead>
                <tr>
                  <th v-for="key in Object.keys(sampleData[0] || {})" :key="key">{{ key }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in sampleData" :key="idx">
                  <td v-for="key in Object.keys(row)" :key="key">{{ row[key] }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="no-data">
            <p>데이터가 없습니다.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 새 관계 생성 다이얼로그 -->
    <div v-if="showNewRelationDialog" class="dialog-overlay" @click.self="cancelRelation">
      <div class="new-relation-dialog">
        <div class="dialog-header">
          <h3>🔗 새 관계 생성</h3>
          <button class="close-btn" @click="cancelRelation">✕</button>
        </div>
        <div class="dialog-body">
          <div class="relation-preview">
            <div class="node-preview source">
              <span class="node-icon">◉</span>
              <span class="node-name">{{ getNodeName(newRelation.sourceId) }}</span>
            </div>
            <div class="relation-arrow">
              →
            </div>
            <div class="node-preview target">
              <span class="node-icon">◉</span>
              <span class="node-name">{{ getNodeName(newRelation.targetId) }}</span>
            </div>
          </div>
          
          <div class="form-group">
            <label>관계 유형</label>
            <select v-model="newRelation.type" class="form-select">
              <option 
                v-for="opt in relationTypeOptions" 
                :key="opt.value" 
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
          
          <div class="form-group">
            <label>설명 (선택)</label>
            <input 
              v-model="newRelation.description" 
              type="text" 
              class="form-input"
              placeholder="관계에 대한 설명을 입력하세요"
            />
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn" @click="cancelRelation">취소</button>
          <button class="confirm-btn" @click="createRelation">✓ 관계 생성</button>
        </div>
      </div>
    </div>


    <!-- 릴레이션 속성 편집 다이얼로그는 우측 패널로 이동 (아래 detail-panel 참조) -->

    <!-- 엣지 삭제 확인 다이얼로그 -->
    <div v-if="showEdgeDeleteDialog" class="dialog-overlay" @click.self="cancelDeleteEdge">
      <div class="edge-delete-dialog">
        <div class="dialog-header">
          <h3>🔗 관계 삭제</h3>
          <button class="close-btn" @click="cancelDeleteEdge">✕</button>
        </div>
        <div class="dialog-body">
          <p class="delete-warning">다음 관계를 삭제하시겠습니까?</p>
          <div v-if="edgeToDelete" class="edge-info">
            <div class="edge-detail">
              <span class="node-label">{{ getNodeName(edgeToDelete.source) }}</span>
              <span class="edge-arrow">→</span>
              <span class="edge-type-label">{{ edgeToDelete.type }}</span>
              <span class="edge-arrow">→</span>
              <span class="node-label">{{ getNodeName(edgeToDelete.target) }}</span>
            </div>
          </div>
          <p class="undo-hint">💡 삭제 후 Ctrl+Z로 실행 취소할 수 있습니다.</p>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn" @click="cancelDeleteEdge">취소</button>
          <button class="delete-btn" @click="confirmDeleteEdge">🗑 삭제</button>
        </div>
      </div>
    </div>

    <!-- What-if 분석 하단 패널 (드래그 가능한 세퍼레이터 포함) -->
    <template v-if="isWhatIfPanelOpen && currentSchemaId">
      <!-- 드래그 세퍼레이터 -->
      <div
        class="whatif-separator"
        @mousedown="startResizeWhatIf"
      >
        <div class="separator-handle"></div>
      </div>
      <!-- 패널 -->
      <div
        class="whatif-panel-container"
        :style="{ height: whatifPanelHeight + 'px' }"
      >
        <WhatIfPanel
          :schema-id="currentSchemaId"
          :filters="whatifFilters"
          @close="isWhatIfPanelOpen = false"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed, onUnmounted, watchEffect, Transition } from 'vue'
import cytoscape from 'cytoscape'
import edgehandles from 'cytoscape-edgehandles'
import * as echarts from 'echarts'
import WhatIfPanel from '@/components/ontology/whatif/WhatIfPanel.vue'
import LineChart from '@/components/charts/LineChart.vue'
import CausalAnalysisPanel from '@/components/domain/CausalAnalysisPanel.vue'
import BpmnViewer from '@/components/domain/BpmnViewer.vue'
import AgentsMdEditor from '@/components/domain/AgentsMdEditor.vue'
import SynonymSuggestionModal from '@/components/domain/SynonymSuggestionModal.vue'
import SchemaBasedGenerator from '@/components/ontology/SchemaBasedGenerator.vue'
import { glossaryApi, text2sqlApi, type Glossary } from '@/services/api'
import { useSessionStore } from '@/stores/session'
import type { ReactRequest, ReactStreamEvent } from '@/types'

// Register edgehandles extension
cytoscape.use(edgehandles)

const sessionStore = useSessionStore()

// Types
interface FilterField {
  column: string
  label: string
  type: string
  dataType: string
}

interface OntologyNode {
  id: string
  name: string
  label: string
  layer?: string
  description?: string
  unit?: string
  formula?: string
  targetValue?: number
  thresholds?: Record<string, number>
  dataSource?: string
  dataSourceSchema?: any
  filterFields?: FilterField[]
  position?: { x: number; y: number }
}

interface OntologyRelationship {
  id: string
  source: string
  target: string
  type: string
  description?: string
  weight?: number
  lag?: number
  sourceLayer?: string
  targetLayer?: string
  fromField?: string  // source 노드의 연결 필드 (FK/join key)
  toField?: string    // target 노드의 연결 필드 (FK/join key)
}

type FieldMappingStatus = 'no_datasource' | 'loading' | 'ready' | 'error'

interface FetchColumnsResult {
  status: FieldMappingStatus
  columns: string[]
  error?: string
}

interface LayerInfo {
  id: string
  name: string
  color: string
  icon: string
}

interface NodeSearchCandidate {
  table_name: string
  datasource?: string
  full_table_name?: string
  columns: string[]
  sample_data: any[]
  row_count: number | null
  row_count_approx: boolean
  relevance_score: number
  match_reason: string
  suggested_sql: string
  materializedView?: string
}

// Layer 정의 (KPI가 맨 위, 위에서 아래로 계층 순서)
const layers: LayerInfo[] = [
  { id: 'KPI', name: 'KPI', color: '#ef4444', icon: '📊' },         // 최상위: 핵심 성과 지표
  { id: 'Measure', name: 'Measure', color: '#f97316', icon: '📏' }, // 측정치 (KPI 구성)
  { id: 'Process', name: 'Process', color: '#22c55e', icon: '⚙️' }, // 프로세스 (Measure 생산)
  { id: 'Driver', name: 'Driver', color: '#eab308', icon: '🔧' },   // 드라이버 (Process 영향)
  { id: 'Resource', name: 'Resource', color: '#3b82f6', icon: '💾' }, // 최하위: 자원
]

// State
const cytoscapeContainer = ref<HTMLElement | null>(null)
let cy: cytoscape.Core | null = null
let themeObserver: MutationObserver | null = null
let edgehandlesInstance: any = null
let tempEdgeFromEdgehandles: any = null  // edgehandles가 자동 생성한 임시 엣지 참조
let edgehandlesBoundCy: cytoscape.Core | null = null
let edgehandlesStartHandler: ((evt?: any) => void) | null = null
let edgehandlesCompleteHandler: ((evt: any, sourceNode: any, targetNode: any, addedEles: any) => void) | null = null
let edgehandlesStopHandler: ((evt?: any) => void) | null = null
let edgehandlesShowHandler: ((evt: any, targetNode: any) => void) | null = null
let edgehandlesHideHandler: ((evt: any, targetNode: any) => void) | null = null
let edgehandlesMousemoveHandler: ((evt: any) => void) | null = null
let edgehandlesMouseoutHandler: ((evt: any) => void) | null = null
let edgehandlesHoverSuspendUntil = 0

// 드래그 앤 드롭 연결 상태
const isDraggingHandle = ref(false)
const hoveredNodeId = ref<string | null>(null)
const isRelationDrawModeEnabled = ref(false)
const pendingRelationSourceId = ref<string | null>(null)
const showNewRelationDialog = ref(false)
const newRelation = ref({
  relationId: '',
  sourceId: '',
  targetId: '',
  type: 'CAUSES',
  description: ''
})

const loading = ref(false)
const isDarkMode = ref(document.documentElement.getAttribute('data-theme') !== 'light')
const loadingMessage = ref('')
const nodes = ref<OntologyNode[]>([])
const relationships = ref<OntologyRelationship[]>([])
const collapsedLayers = ref(new Set<string>())
const isLayerPanelCollapsed = ref(false)
const selectedNodeId = ref<string | null>(null)
const currentLayout = ref('cose')  // 물리 기반 레이아웃을 기본값으로

// 필터 관련 상태
const activeFilters = ref<Record<string, any>>({})
const hasActiveFilters = computed(() => {
  return Object.values(activeFilters.value).some(v => v !== '' && v !== null && v !== undefined)
})

function removeTransientCanvasEdges() {
  if (!cy) return

  const relationshipIds = new Set(relationships.value.map(rel => rel.id))
  cy.edges().forEach((edge) => {
    if (edge.hasClass('model-overlay')) return
    if (!relationshipIds.has(edge.id())) {
      edge.remove()
    }
  })
}

function resetEdgehandlesInteractionState(options?: { removeTransientEdges?: boolean }) {
  hoveredNodeId.value = null
  isDraggingHandle.value = false
  tempEdgeFromEdgehandles = null

  if (!cy) return

  cy.nodes().removeClass('eh-presumptive-target eh-hover eh-source eh-target')
  cy.nodes().grabify()
  edgehandlesInstance?.disableDrawMode()

  if (options?.removeTransientEdges) {
    removeTransientCanvasEdges()
  }
}

function detachEdgehandleCyEvents() {
  if (!edgehandlesBoundCy) return

  if (edgehandlesStartHandler) {
    edgehandlesBoundCy.off('ehstart', edgehandlesStartHandler)
  }
  if (edgehandlesCompleteHandler) {
    edgehandlesBoundCy.off('ehcomplete', edgehandlesCompleteHandler)
  }
  if (edgehandlesStopHandler) {
    edgehandlesBoundCy.off('ehstop', edgehandlesStopHandler)
    edgehandlesBoundCy.off('ehcancel', edgehandlesStopHandler)
  }
  if (edgehandlesShowHandler) {
    edgehandlesBoundCy.off('ehshow', edgehandlesShowHandler)
  }
  if (edgehandlesHideHandler) {
    edgehandlesBoundCy.off('ehhide', edgehandlesHideHandler)
  }
  if (edgehandlesMousemoveHandler) {
    edgehandlesBoundCy.off('mousemove', 'node', edgehandlesMousemoveHandler)
  }
  if (edgehandlesMouseoutHandler) {
    edgehandlesBoundCy.off('mouseout', 'node', edgehandlesMouseoutHandler)
  }

  edgehandlesBoundCy = null
  edgehandlesStartHandler = null
  edgehandlesCompleteHandler = null
  edgehandlesStopHandler = null
  edgehandlesShowHandler = null
  edgehandlesHideHandler = null
  edgehandlesMousemoveHandler = null
  edgehandlesMouseoutHandler = null
}

function suspendEdgehandlesHover(ms: number) {
  edgehandlesHoverSuspendUntil = Date.now() + ms
}

function setRelationDrawMode(enabled: boolean) {
  isRelationDrawModeEnabled.value = enabled
  showContextMenu.value = false
  resetEdgehandlesInteractionState({ removeTransientEdges: true })

  if (enabled) {
    suspendEdgehandlesHover(150)
  }
}

function toggleRelationDrawMode() {
  if (loading.value || nodes.value.length < 2) return
  setRelationDrawMode(!isRelationDrawModeEnabled.value)
}

function handleEdgehandlesComplete(_evt: any, sourceNode: any, targetNode: any, addedEles: any) {
  const sourceId = sourceNode?.id?.() ?? null
  const targetId = targetNode?.id?.() ?? null

  tempEdgeFromEdgehandles = addedEles ?? null

  const removeAddedEles = () => {
    if (tempEdgeFromEdgehandles && typeof tempEdgeFromEdgehandles.remove === 'function') {
      tempEdgeFromEdgehandles.remove()
    }
    tempEdgeFromEdgehandles = null
  }

  if (!sourceId || !targetId) {
    removeAddedEles()
    return
  }

  const exists = relationships.value.some(
    r => r.source === sourceId && r.target === targetId
  )

  if (exists || sourceId === targetId) {
    removeAddedEles()
    return
  }

  saveState()
  removeAddedEles()

  const draftRelation: OntologyRelationship = {
    id: `rel_${Date.now()}`,
    source: sourceId,
    target: targetId,
    type: 'CAUSES',
    description: undefined,
    fromField: undefined,
    toField: undefined
  }

  relationships.value.push(draftRelation)
  upsertRelationEdgeInCy(draftRelation)

  newRelation.value = {
    relationId: draftRelation.id,
    sourceId,
    targetId,
    type: 'CAUSES',
    description: ''
  }
  showNewRelationDialog.value = true
}

function upsertRelationEdgeInCy(rel: OntologyRelationship) {
  if (!cy) return

  const existingEdge = cy.getElementById(rel.id)
  if (existingEdge.length > 0) {
    existingEdge.data({
      source: rel.source,
      target: rel.target,
      type: rel.type,
      label: rel.type
    })
    return
  }

  cy.add({
    data: {
      id: rel.id,
      source: rel.source,
      target: rel.target,
      type: rel.type,
      label: rel.type
    }
  })
}

function removeRelationEdgeFromCy(relationId: string) {
  if (!cy) return
  cy.$(`#${relationId}`).remove()
}

function onFilterChange() {
  // 필터 변경 시 데이터 새로고침
  const targetNodeId = filterTargetNode.value?.id || selectedNodeId.value
  if (targetNodeId) {
    // cascading 필터 전파: 현재 노드의 필터를 하위 노드들에 전파
    const effectiveFilters = getEffectiveFilters(targetNodeId)
    propagateFiltersFromNode(targetNodeId, effectiveFilters)
    
    // 현재 노드 데이터 새로고침
    fetchNodeData(targetNodeId)
    
    // 필터된 노드 시각화 업데이트
    updateFilteredNodeVisuals()
  }
}

function clearAllFilters() {
  activeFilters.value = {}
  nodeFilters.value = {}
  
  // 시각적 하이라이트 제거
  updateFilteredNodeVisuals()
  
  if (selectedNodeId.value) {
    fetchNodeData(selectedNodeId.value)
  }
}

// 스키마 로드 중 플래그 (watch가 initCytoscape를 덮어쓰지 않도록)
const isLoadingSchema = ref(false)

// Undo/Redo 히스토리
interface HistoryState {
  nodes: OntologyNode[]
  relationships: OntologyRelationship[]
}
const undoStack = ref<HistoryState[]>([])
const redoStack = ref<HistoryState[]>([])
const maxHistorySize = 50

// 노드 추가 드롭다운
const showAddNodeDropdown = ref(false)

// 노드 이름 편집
const isEditingNodeName = ref(false)
const editingNodeNameValue = ref('')
const nodeNameInput = ref<HTMLInputElement | null>(null)

// 레이어(스테레오타입) 변경
const isLayerSelectorOpen = ref(false)

// 캔버스 우클릭 컨텍스트 메뉴
const showContextMenu = ref(false)
const contextMenuMode = ref<'canvas' | 'node' | 'edge'>('canvas')
const contextMenuPos = ref({ x: 0, y: 0 })
const contextMenuGraphPos = ref({ x: 0, y: 0 })
const contextMenuNodeId = ref<string | null>(null)
const contextMenuNodeName = ref('')
const contextMenuEdgeId = ref<string | null>(null)
const contextMenuEdgeLabel = ref('')

watch(() => nodes.value.length, (count) => {
  if (count < 2 && isRelationDrawModeEnabled.value) {
    setRelationDrawMode(false)
  }
})

// 필터 다이얼로그
const showFilterDialog = ref(false)
const filterTargetNode = ref<OntologyNode | null>(null)
const filterDistinctValues = ref<Record<string, any[]>>({})
const filterDistinctLoading = ref(false)

// 릴레이션 속성 편집 다이얼로그
const showRelationEditor = ref(false)
const editingRelation = ref<OntologyRelationship | null>(null)
const editingRelationForm = ref({
  type: '',
  description: '',
  fromField: '',
  toField: ''
})
const sourceNodeColumns = ref<string[]>([])
const targetNodeColumns = ref<string[]>([])
const sourceColumnStatus = ref<FieldMappingStatus>('no_datasource')
const targetColumnStatus = ref<FieldMappingStatus>('no_datasource')
const sourceColumnError = ref('')
const targetColumnError = ref('')

// 노드별 필터 상태 (cascading filter용) - { nodeId: { field: value } }
const nodeFilters = ref<Record<string, Record<string, any>>>({})

// 엣지 삭제 확인 다이얼로그
const showEdgeDeleteDialog = ref(false)
const edgeToDelete = ref<{ id: string; source: string; target: string; type: string } | null>(null)

// Generate dialog
const showGenerateDialog = ref(false)
const generationMode = ref<'document' | 'schema'>('document')
const generating = ref(false)
const generationLogs = ref<{ time: string; message: string; type?: string }[]>([])
const glossariesForSelect = ref<Glossary[]>([])
const glossaryLoading = ref(false)
const useAllGlossaries = ref(true)
const allGlossariesLabel = computed(() => (
  glossaryLoading.value
    ? '전체 용어집 사용 (확인 중...)'
    : `전체 용어집 사용 (${glossariesForSelect.value.length}개)`
))
interface SynonymSuggestion {
  termId: string
  termName: string
  glossaryId: string
  glossaryName: string
  suggestedSynonym: string
  similarity: number
  sourceNodeName: string
  sourceLayer: string
  accepted: boolean
}
const synonymSuggestions = ref<SynonymSuggestion[]>([])
const showSynonymSuggestionModal = ref(false)
const showSynonymSuggestionToast = ref(false)
const showSynonymAppliedToast = ref(false)
const synonymAppliedCount = ref(0)

// 생성 완료 결과 화면 상태
const generationCompleted = ref(false)
const generationSaveStatus = ref<'saving' | 'saved' | 'failed'>('saving')
const generationSaveError = ref('')
interface GenerationResultSummary {
  nodeCount: number
  relationshipCount: number
  layerBreakdown: Record<string, number>
  synonymSuggestionCount: number
}
const generationResult = ref<GenerationResultSummary>({
  nodeCount: 0,
  relationshipCount: 0,
  layerBreakdown: {},
  synonymSuggestionCount: 0,
})

// 온톨로지 생성 다이얼로그 열기
function openGenerateDialog(mode: 'document' | 'schema') {
  generationMode.value = mode
  if (mode === 'document') {
    glossaryLoading.value = true
  }
  showGenerateDialog.value = true
  generateError.value = ''
}

watch([showGenerateDialog, generationMode], ([isOpen, mode]) => {
  if (isOpen && mode === 'document') {
    void loadGlossariesForGeneration()
  }
})

const generateForm = ref({
  inputType: 'text',
  text: '',
  pdfUrl: '',
  selectedGlossaryIds: [] as string[]
})

async function loadGlossariesForGeneration() {
  glossaryLoading.value = true
  try {
    const headers = sessionStore.getHeaders()
    const result = await glossaryApi.getGlossaries(headers)
    glossariesForSelect.value = result.glossaries
  } catch (error) {
    console.warn('용어집 목록 로드 실패:', error)
    glossariesForSelect.value = []
  } finally {
    glossaryLoading.value = false
  }
}

function onToggleAllGlossaries() {
  if (useAllGlossaries.value) {
    generateForm.value.selectedGlossaryIds = []
  }
}

function dismissSynonymSuggestions() {
  showSynonymSuggestionToast.value = false
  showSynonymSuggestionModal.value = false
  synonymSuggestions.value = []
}

function handleSynonymSuggestionsApplied(count: number) {
  showSynonymSuggestionModal.value = false
  showSynonymSuggestionToast.value = false
  synonymSuggestions.value = []
  synonymAppliedCount.value = count
  showSynonymAppliedToast.value = count > 0
}

// File upload
const fileInput = ref<HTMLInputElement | null>(null)
const uploadedFile = ref<File | null>(null)
const isDraggingFile = ref(false)

// 생성 오류 메시지 (화면에 고정 표시, 초기화면으로 돌아가도 배너로 남김)
const generateError = ref('')

// Progress tracking — 파이프라인 단계 기반
const currentStep = ref('')
const logListRef = ref<HTMLElement | null>(null)
const logsExpanded = ref(false)

interface PipelineProgressDetail {
  chunkCurrent?: number
  chunkTotal?: number
  substepCurrent?: number
  substepTotal?: number
  completedSteps?: number
  totalSteps?: number
  substepLabel?: string
}

interface PipelineProgressState {
  status: string
  progress: number
  message?: string
  detail?: PipelineProgressDetail
}

interface UnifiedChunkProgressState {
  current: number
  total: number
  substepCurrent: number
  substepTotal: number
  completedSteps: number
  totalSteps: number
}

const DEFAULT_PIPELINE_STAGES = ['Normalization', 'Chunking', 'Sanitize', 'Unified', 'MergeRefine'] as const
const activePipelineStages = ref<string[]>([...DEFAULT_PIPELINE_STAGES])
const pipelineProgress = ref<Record<string, PipelineProgressState>>({})
const chunkProgress = ref<UnifiedChunkProgressState>({
  current: 0,
  total: 0,
  substepCurrent: 0,
  substepTotal: 0,
  completedSteps: 0,
  totalSteps: 0
})
const sanitizeChunkProgress = ref<{ current: number; total: number }>({ current: 0, total: 0 })
const layerResults = ref<Record<string, { nodeCount: number; relationCount: number }>>({})

const STAGE_WEIGHTS: Record<string, number> = {
  Normalization: 5,
  BPMN: 10,
  Chunking: 5,
  Sanitize: 10,
  Unified: 60,
  MergeRefine: 10,
}

const STAGE_LABELS: Record<string, { icon: string; label: string; color: string }> = {
  Normalization: { icon: '📄', label: '문서 정규화', color: '#6366f1' },
  BPMN: { icon: '📐', label: 'BPMN 추출', color: '#8b5cf6' },
  Chunking: { icon: '📦', label: '청크 분할', color: '#0ea5e9' },
  Sanitize: { icon: '🧹', label: '청크 정제', color: '#8b5cf6' },
  Unified: { icon: '🔍', label: '개념 추출', color: '#f59e0b' },
  MergeRefine: { icon: '🔗', label: '병합 & 정제', color: '#10b981' },
}

const totalStageCount = computed(() => activePipelineStages.value.length)

const completedStageCount = computed(() =>
  activePipelineStages.value.filter(s => pipelineProgress.value[s]?.status === 'completed').length
)

const totalExtractedNodes = computed(() =>
  Object.values(layerResults.value).reduce((sum, r) => sum + (r.nodeCount || 0), 0)
)

const overallProgressPercent = computed(() => {
  const stages = activePipelineStages.value
  let weightedSum = 0
  let totalWeight = 0
  for (const stage of stages) {
    const weight = STAGE_WEIGHTS[stage] || 10
    const progress = pipelineProgress.value[stage]?.progress || 0
    weightedSum += weight * progress
    totalWeight += weight
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
})

// Abort controller for cancellation
let abortController: AbortController | null = null

// Data source linking
const showDataSourceDialog = ref(false)
const linkingDataSources = ref(false)

// 개별 노드 데이터 소스 연결
const showNodeDataSourceDialog = ref(false)
const currentNodeForDataSource = ref<OntologyNode | null>(null)
const nodeDataSourceTab = ref<'search' | 'manual'>('search')
const nodeSearchQuery = ref('')
const nodeSearchLoading = ref(false)
const nodeSearchStatus = ref<string>('') // 검색 진행 상황 메시지
const nodeSearchConversation = ref<string[]>([]) // 스트리밍 대화 내용
const nodeSearchResults = ref<NodeSearchCandidate[]>([])
const selectedSearchResult = ref<number | null>(null)
const nodeSearchAbortController = ref<AbortController | null>(null)
const nodeSearchProbeRunId = ref(0)
const selectedManualTable = ref<string | null>(null)
const availableDatasources = ref<string[]>([])
const availableSchemas = ref<string[]>([])
const selectedDatasource = ref<string>('')
const selectedSchema = ref('')
const tableSearchQuery = ref('')
const availableTables = ref<Array<{ name: string; schema: string; datasource?: string; fullName: string; columnCount?: number; materializedView?: string }>>([])
const loadingTables = ref(false)

const dataSourceMappings = ref<Record<string, {
  node_id: string
  node_name: string
  node_layer: string
  search_query: string
  candidates: Array<NodeSearchCandidate>
  selected_candidate: any | null
  status: string
}>>({})
const selectedMappingNodeId = ref<string | null>(null)
const expandedCandidates = ref<Set<string>>(new Set())  // 확장된 후보 목록
const showSampleDataDialog = ref(false)
const sampleDataLoading = ref(false)
const sampleData = ref<any[]>([])

// 노드 데이터 소스 뷰어 상태
const detailPanelTab = ref<'info' | 'data' | 'analysis' | 'behavior' | 'bpmn'>('info')
const nodeDataLoading = ref(false)
const lastDataError = ref<string | null>(null)
const businessDayFilterEnabled = ref(false)  // 영업일 캘린더 필터 적용 여부
const nodeDataResult = ref<{
  hasDataSource: boolean
  dataSource?: string
  isObjectType?: boolean
  columns: string[]
  rows: any[]
  rowCount: number
  timeColumns: string[]
  numericColumns: string[]
  businessDayFiltered?: boolean
  chartRecommendation?: {
    type: 'line' | 'bar' | 'table'
    xAxis: string | null
    yAxis: string[]
  }
  message?: string
} | null>(null)
const chartContainerRef = ref<HTMLElement | null>(null)
let chartInstance: echarts.ECharts | null = null
const isChartReady = ref(false)

// 원인 분석 상태 (진행·보고서 스트리밍용)
const analysisState = ref<{
  loading: boolean
  result: any | null
  error: string | null
  progress?: { step: string; message: string; detail?: any }
  streamingReport?: string
} | null>(null)

// 스트리밍 보고서 타이핑 효과: 서버가 한꺼번에 보내도 글자가 차례로 보이도록
const streamingRevealedLength = ref(0)
const displayedStreamingReport = computed(() => {
  const full = analysisState.value?.streamingReport ?? ''
  if (!analysisState.value?.loading) return full
  return full.slice(0, streamingRevealedLength.value)
})
watchEffect((onCleanup) => {
  if (!analysisState.value?.loading) return
  const id = setInterval(() => {
    const full = (analysisState.value?.streamingReport ?? '').length
    const cur = streamingRevealedLength.value
    if (cur < full) streamingRevealedLength.value = Math.min(cur + 10, full)
  }, 25)
  onCleanup(() => clearInterval(id))
})

const analysisConfigBarRef = ref<HTMLElement | null>(null)
const chartSeriesPalette = [
  '#06b6d4',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
  '#14b8a6'
]
const causalBrushSelection = ref<{
  start: string
  end: string
  targetMetric: string
  analysisType: 'increase' | 'decrease'
} | null>(null)
const analysisMetricOptions = computed(() => {
  const preferred = nodeDataResult.value?.chartRecommendation?.yAxis ?? []
  const numeric = nodeDataResult.value?.numericColumns ?? []
  return Array.from(new Set([...preferred, ...numeric].filter(Boolean)))
})

const highlightedCausalNodeIds = ref<Set<string>>(new Set())
const highlightedCausalEdgePairs = ref<Set<string>>(new Set())

function handleAnalysisComplete(result: any) {
  analysisState.value = {
    loading: false,
    result,
    error: null
  }
}

function getMetricOptionColor(metric: string): string {
  const idx = analysisMetricOptions.value.indexOf(metric)
  if (idx < 0) return chartSeriesPalette[0]
  return chartSeriesPalette[idx % chartSeriesPalette.length]
}

function resolvePreferredCausalMetric(candidateMetrics: string[]): string | null {
  const availableMetrics = Array.from(new Set([
    ...analysisMetricOptions.value,
    ...candidateMetrics
  ].filter(Boolean)))
  if (availableMetrics.length === 0) return null

  const currentMetric = causalBrushSelection.value?.targetMetric
  if (currentMetric && availableMetrics.includes(currentMetric)) {
    return currentMetric
  }

  return availableMetrics[0] ?? null
}

function getAnalysisXAxis(): string | null {
  return nodeDataResult.value?.chartRecommendation?.xAxis
    || nodeDataResult.value?.timeColumns?.[0]
    || nodeDataResult.value?.columns?.[0]
    || null
}

function coerceMetricNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function resolveBrushRowRange(rows: any[], xAxis: string, start: string, end: string) {
  const startIdx = rows.findIndex((row) => String(row?.[xAxis] ?? '') >= start)
  if (startIdx < 0) return null

  let endIdx = -1
  for (let i = rows.length - 1; i >= startIdx; i--) {
    if (String(rows[i]?.[xAxis] ?? '') <= end) {
      endIdx = i
      break
    }
  }

  if (endIdx <= startIdx) return null
  return { startIdx, endIdx }
}

function inferAnalysisTypeFromRange(rows: any[], metric: string, startIdx: number, endIdx: number): 'increase' | 'decrease' {
  const startValue = coerceMetricNumber(rows[startIdx]?.[metric])
  const endValue = coerceMetricNumber(rows[endIdx]?.[metric])
  if (startValue != null && endValue != null) {
    return endValue > startValue ? 'increase' : 'decrease'
  }

  let sumStart = 0
  let sumEnd = 0
  let countStart = 0
  let countEnd = 0
  const midIdx = Math.floor((startIdx + endIdx) / 2)

  for (let i = startIdx; i <= midIdx; i++) {
    const val = coerceMetricNumber(rows[i]?.[metric])
    if (val != null) {
      sumStart += val
      countStart++
    }
  }

  for (let i = midIdx + 1; i <= endIdx; i++) {
    const val = coerceMetricNumber(rows[i]?.[metric])
    if (val != null) {
      sumEnd += val
      countEnd++
    }
  }

  if (countStart > 0 && countEnd > 0) {
    return (sumEnd / countEnd) > (sumStart / countStart) ? 'increase' : 'decrease'
  }

  return 'increase'
}

function restoreCausalBrushSelection(chart: echarts.ECharts, rows: any[], xAxis: string) {
  const sel = causalBrushSelection.value
  if (!sel) return

  const range = resolveBrushRowRange(rows, xAxis, sel.start, sel.end)
  if (!range) return

  nextTick(() => {
    chart.dispatchAction({
      type: 'brush',
      areas: [{
        brushType: 'lineX',
        coordRange: [range.startIdx, range.endIdx],
        xAxisIndex: 0
      }]
    })
  })
}

function startAnalysisFromConfig() {
  if (analysisState.value?.loading || !causalBrushSelection.value) return

  detailPanelTab.value = 'analysis'
  nextTick(() => {
    runCausalAnalysisFromBrush()
  })
}

function recalcAnalysisType() {
  const sel = causalBrushSelection.value
  const rows = nodeDataResult.value?.rows
  const xAxis = getAnalysisXAxis()
  if (!sel || !rows?.length || !xAxis) return

  const range = resolveBrushRowRange(rows, xAxis, sel.start, sel.end)
  if (!range) return

  sel.analysisType = inferAnalysisTypeFromRange(rows, sel.targetMetric, range.startIdx, range.endIdx)
}

function goBackToDataTab() {
  analysisState.value = null
  detailPanelTab.value = 'data'
  if (selectedNode.value?.id && !nodeDataResult.value) {
    fetchNodeData(selectedNode.value.id)
  }
}

function applyCausalHighlight() {
  if (!cy) return
  
  // 모든 노드와 엣지에서 하이라이트 클래스 제거
  cy.elements().removeClass('causal-highlight')
  cy.elements().removeClass('causal-faded')
  
  // 하이라이트된 노드 ID 집합
  const highlightedIds = highlightedCausalNodeIds.value
  
  if (highlightedIds.size > 0) {
    // 모든 노드를 먼저 반투명으로 만들기
    cy.nodes().addClass('causal-faded')
    
    // 하이라이트된 노드만 불투명하게 만들고 테두리 추가
    highlightedIds.forEach((id) => {
      const n = cy!.$(`#${id}`)
      if (n.length) {
        n.removeClass('causal-faded')
        n.addClass('causal-highlight')
      }
    })
    
    // 하이라이트된 엣지 쌍 집합
    const highlightedEdgePairs = new Set(highlightedCausalEdgePairs.value)
    
    // 모든 엣지를 먼저 반투명으로 만들기
    cy.edges().addClass('causal-faded')
    
    // 하이라이트된 엣지만 불투명하게 만들기
    highlightedEdgePairs.forEach((key) => {
      const [s, t] = key.split('\t')
      const es = cy!.edges().filter((e: any) => e.data('source') === s && e.data('target') === t)
      if (es.length) {
        es.removeClass('causal-faded')
        es.addClass('causal-highlight')
      }
    })
  }
}

function clearCausalHighlight() {
  highlightedCausalNodeIds.value = new Set()
  highlightedCausalEdgePairs.value = new Set()
  if (cy) {
    cy.elements().removeClass('causal-highlight')
    cy.elements().removeClass('causal-faded')
  }
}

async function runCausalAnalysisFromBrush(analysisType?: 'increase' | 'decrease') {
  console.log('runCausalAnalysisFromBrush 호출됨', { analysisType })
  const sel = causalBrushSelection.value
  const node = selectedNode.value
  const schemaId = currentSchemaId.value
  console.log('조건 확인:', { hasSel: !!sel, hasNode: !!node?.id, hasSchema: !!schemaId })
  if (!sel || !node?.id || !schemaId) {
    console.log('조건 불만족으로 종료')
    return
  }
  
  // analysisType이 제공되지 않으면 저장된 값 사용
  const finalAnalysisType = analysisType || sel.analysisType
  
  streamingRevealedLength.value = 0
  analysisState.value = { loading: true, result: null, error: null, progress: undefined, streamingReport: '' }
  // detailPanelTab.value = 'analysis' 제거 (이미 분석 탭으로 전환된 상태)
  try {
    const incRes = await fetch(
      `/api/gateway/ontology/schemas/${encodeURIComponent(schemaId)}/nodes/${encodeURIComponent(node.id)}/incoming-network`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_depth: 3 })
      }
    )
    if (incRes.ok) {
      const incData = await incRes.json()
      highlightedCausalNodeIds.value = new Set((incData.nodes || []).map((n: any) => n.id).filter(Boolean))
      highlightedCausalEdgePairs.value = new Set(
        (incData.relationships || []).map((r: any) => `${r.source}\t${r.target}`)
      )
      applyCausalHighlight()
    }

    const requestBody = {
      time_range: { start: sel.start, end: sel.end },
      target_metric: sel.targetMetric,
      analysis_type: finalAnalysisType,
      max_lag: 7
    }
    console.log('서버 요청 본문:', requestBody)
    
    const basePath = `/api/gateway/ontology/schemas/${encodeURIComponent(schemaId)}/nodes/${encodeURIComponent(node.id)}`
    const streamUrl = `${basePath}/causal-analysis/stream`
    let res = await fetch(streamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    // 404면 스트림 미지원 백엔드 → 비스트림 엔드포인트로 폴백
    if (res.status === 404) {
      res = await fetch(`${basePath}/causal-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
    }
    
    if (!res.ok) {
      const text = await res.text()
      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        data = {
          success: false,
          error: {
            type: 'server_error',
            message: '서버 오류',
            detail: text,
            user_friendly_message: `## 서버 오류\n\n${text.substring(0, 500)}`
          }
        }
      }
      handleAnalysisComplete(data)
      return
    }
    
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('ndjson') && !contentType.includes('stream')) {
      // 스트림이 아닌 일반 JSON 응답 (폴백)
      const data = await res.json()
      handleAnalysisComplete(data)
      return
    }
    
    // NDJSON 스트림 파싱: 진행 상황·결과를 실시간 반영 (스트리밍 검증용 로그)
    const reader = res.body?.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let data: any = null
    let reportChunkCount = 0
    let firstReportChunkAt: number | null = null
    const streamLogPrefix = '[causal-stream]'

    if (reader) {
      while (true) {
        const readStart = Date.now()
        const { value, done } = await reader.read()
        if (done) break
        const readEnd = Date.now()
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const item = JSON.parse(trimmed)
            if (item.type === 'progress') {
              const step = item.step || ''
              const msg = item.message || ''
              if (step === 'report_chunk') {
                reportChunkCount += 1
                if (firstReportChunkAt == null) firstReportChunkAt = Date.now()
                const cumulative = (analysisState.value?.streamingReport || '').length + (msg?.length || 0)
                console.log(
                  `${streamLogPrefix} chunk #${reportChunkCount} at ${new Date().toISOString()} read_duration_ms=${readEnd - readStart} len=${msg?.length ?? 0} cumulative=${cumulative}`
                )
              }
              const prev = analysisState.value!
              const streamingReport = step === 'report_chunk' ? (prev.streamingReport || '') + msg : prev.streamingReport
              analysisState.value = {
                ...prev,
                progress: { step, message: step === 'report_chunk' ? '보고서 생성 중...' : msg, detail: item.detail },
                streamingReport: streamingReport ?? prev.streamingReport
              }
            } else if (item.type === 'result' && item.data) {
              if (reportChunkCount > 0 && firstReportChunkAt != null) {
                const span = Date.now() - firstReportChunkAt
                console.log(
                  `${streamLogPrefix} summary: ${reportChunkCount} report_chunks over ${span}ms (${(reportChunkCount / (span / 1000)).toFixed(1)} chunks/s)`
                )
              }
              data = item.data
              break
            }
          } catch (_) {
            // 라인 파싱 무시
          }
        }
        if (data) break
      }
      if (buffer.trim()) {
        try {
          const item = JSON.parse(buffer.trim())
          if (item.type === 'result' && item.data) data = item.data
        } catch (_) {}
      }
    }
    
    if (data) {
      handleAnalysisComplete(data)
    } else {
      analysisState.value = {
        loading: false,
        result: null,
        error: '스트림에서 최종 결과를 받지 못했습니다.'
      }
    }
  } catch (e: any) {
    analysisState.value = {
      loading: false,
      result: null,
      error: e?.message || String(e)
    }
    clearCausalHighlight()
  }
}

// 분석 탭 클릭 핸들러
function handleAnalysisTabClick() {
  detailPanelTab.value = 'analysis'
}

// 상세 패널 리사이즈
const detailPanelWidth = ref(440)
const isResizing = ref(false)
const resizeStartX = ref(0)
const resizeStartWidth = ref(380)

function startResize(e: MouseEvent) {
  isResizing.value = true
  resizeStartX.value = e.clientX
  resizeStartWidth.value = detailPanelWidth.value
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  e.preventDefault()
}

function handleResize(e: MouseEvent) {
  if (!isResizing.value) return
  
  const deltaX = resizeStartX.value - e.clientX // 오른쪽에서 왼쪽으로 드래그하면 증가
  const newWidth = resizeStartWidth.value + deltaX
  const minWidth = 280
  const maxWidth = 800
  
  if (newWidth >= minWidth && newWidth <= maxWidth) {
    detailPanelWidth.value = newWidth
  }
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
}

function resetPanelWidth() {
  detailPanelWidth.value = 440
}

// Computed
const selectedNode = computed(() => {
  if (!selectedNodeId.value) return null
  return nodes.value.find(n => n.id === selectedNodeId.value) || null
})

const canGenerate = computed(() => {
  let hasInput = false
  if (generateForm.value.inputType === 'text') {
    hasInput = generateForm.value.text.trim().length > 0
  } else if (generateForm.value.inputType === 'pdf') {
    hasInput = uploadedFile.value !== null
  } else if (generateForm.value.inputType === 'url') {
    hasInput = generateForm.value.pdfUrl.trim().length > 0
  }
  if (!hasInput) {
    return false
  }
  if (!useAllGlossaries.value && generateForm.value.selectedGlossaryIds.length === 0) {
    return false
  }
  return true
})

// LineChart 컴포넌트용 데이터 변환
const chartDataForLineChart = computed(() => {
  console.log('chartDataForLineChart computed 실행', {
    hasNodeDataResult: !!nodeDataResult.value,
    chartType: nodeDataResult.value?.chartRecommendation?.type,
    hasRows: !!nodeDataResult.value?.rows?.length
  })
  
  if (!nodeDataResult.value) {
    console.log('LineChart: No nodeDataResult')
    return null
  }
  
  // 라인 차트가 아니면 null 반환
  if (nodeDataResult.value.chartRecommendation?.type !== 'line') {
    console.log('LineChart: Not a line chart', nodeDataResult.value.chartRecommendation?.type)
    return null
  }
  
  // 데이터가 없으면 null 반환
  if (!nodeDataResult.value.rows || !nodeDataResult.value.rows.length) {
    console.warn('LineChart: No rows data', nodeDataResult.value)
    return null
  }
  
  const { rows, chartRecommendation, timeColumns, numericColumns, columns } = nodeDataResult.value
  
  console.log('LineChart: Processing data', {
    rowsCount: rows.length,
    chartRecommendation,
    timeColumns,
    numericColumns,
    columns
  })
  
  // xAxis 결정: chartRecommendation에서 우선, 없으면 timeColumns에서, 없으면 첫 번째 컬럼
  let xAxis = chartRecommendation?.xAxis
  if (!xAxis && timeColumns.length > 0) {
    xAxis = timeColumns[0]
  }
  if (!xAxis && columns.length > 0) {
    xAxis = columns[0]
  }
  
  // yAxis 결정: chartRecommendation에서 우선, 없으면 numericColumns에서, 없으면 두 번째 컬럼
  let yAxes = chartRecommendation?.yAxis.length > 0 
    ? chartRecommendation.yAxis 
    : (numericColumns.length > 0 ? numericColumns : (columns.length > 1 ? [columns[1]] : [columns[0]]))
  
  if (!xAxis) {
    console.warn('LineChart: No xAxis found', { chartRecommendation, timeColumns, columns })
    return null
  }
  
  if (!yAxes || yAxes.length === 0) {
    console.warn('LineChart: No yAxis found', { chartRecommendation, numericColumns, columns })
    return null
  }
  
  console.log('LineChart: Using axes', { xAxis, yAxis: yAxes[0] })
  
  // X축 데이터 (라벨)
  const labels = rows.map((r, idx) => {
    const val = r[xAxis]
    if (val == null || val === undefined) {
      return `Item ${idx + 1}`
    }
    if (typeof val === 'string' && (val.includes('T') || (val.includes('-') && val.length > 10))) {
      try {
        const date = new Date(val)
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('ko-KR', { 
            month: 'short', 
            day: 'numeric',
            ...(val.includes('T') ? { hour: '2-digit', minute: '2-digit' } : {})
          })
        }
      } catch {
        // 날짜 파싱 실패 시 원본 반환
      }
    }
    return String(val)
  })
  
  // Y축 데이터 (값) - 첫 번째 yAxis만 사용
  const values = rows.map((r, idx) => {
    const val = r[yAxes[0]]
    if (val == null || val === undefined) {
      console.warn(`LineChart: Null value at row ${idx} for column ${yAxes[0]}`)
      return 0
    }
    if (typeof val === 'number') {
      return val
    }
    if (typeof val === 'string') {
      const num = Number(val)
      if (!isNaN(num) && val.trim() !== '') {
        return num
      }
    }
    console.warn(`LineChart: Invalid value at row ${idx}`, val)
    return 0
  })
  
  // 유효한 데이터가 있는지 확인
  if (labels.length === 0 || values.length === 0) {
    console.warn('LineChart: Empty labels or values', { labels, values, rows: rows.slice(0, 3) })
    return null
  }
  
  // 실제 숫자 값이 있는지 확인
  const hasValidValues = values.some(v => v !== 0 || typeof v === 'number')
  if (!hasValidValues) {
    console.warn('LineChart: No valid numeric values', { values: values.slice(0, 5) })
    return null
  }
  
  const result = {
    labels,
    values,
    rawData: rows
  }
  
  console.log('LineChart data prepared successfully:', { 
    labelsCount: labels.length, 
    valuesCount: values.length,
    xAxis,
    yAxis: yAxes[0],
    sampleLabels: labels.slice(0, 3),
    sampleValues: values.slice(0, 3)
  })
  
  return result
})

// Methods
function getLayerNodes(layerId: string): OntologyNode[] {
  return nodes.value.filter(n => (n.layer || n.label) === layerId)
}

function getLayerColor(layerId: string): string {
  return layers.find(l => l.id === layerId)?.color || '#888'
}

function toggleLayer(layerId: string) {
  if (collapsedLayers.value.has(layerId)) {
    collapsedLayers.value.delete(layerId)
  } else {
    collapsedLayers.value.add(layerId)
  }
}

function selectNode(nodeId: string) {
  if (showRelationEditor.value || editingRelation.value) {
    closeRelationEditor()
  }

  selectedNodeId.value = nodeId
  detailPanelTab.value = 'info'  // 탭 초기화
  nodeDataResult.value = null    // 데이터 초기화
  isEditingNodeName.value = false  // 이름 편집 초기화
  isLayerSelectorOpen.value = false  // 레이어 셀렉터 초기화

  // 분석 탭 상태 초기화
  if (analysisState.value) {
    analysisState.value = null
  }
  causalBrushSelection.value = null
  clearCausalHighlight()
  
  if (cy) {
    cy.nodes().removeClass('selected')
    cy.$(`#${nodeId}`).addClass('selected')
  }
  
  // 선택된 노드를 로컬스토리지에 저장
  if (currentSchemaId.value) {
    saveSelectedNode(currentSchemaId.value, nodeId)
  }
  
  // 선택된 노드에 데이터 소스가 있으면 자동으로 데이터 탭 표시 가능
  const node = nodes.value.find(n => n.id === nodeId)
  if (node?.dataSource) {
    // 데이터가 있으면 자동으로 데이터 로드 (선택 사항)
    // fetchNodeData(nodeId)
  }
}

// 노드 선택 해제
function deselectNode() {
  // 선택 해제 시 로컬스토리지에서 제거
  if (currentSchemaId.value && selectedNodeId.value) {
    removeSelectedNode(currentSchemaId.value, selectedNodeId.value)
  }
  selectedNodeId.value = null
  detailPanelTab.value = 'info'
  nodeDataResult.value = null
  causalBrushSelection.value = null
  analysisState.value = null
  clearCausalHighlight()
  
  if (cy) {
    cy.nodes().removeClass('selected')
  }
}

// 노드 데이터 조회
async function fetchNodeData(nodeId: string) {
  if (nodeDataLoading.value) return
  
  nodeDataLoading.value = true
  isChartReady.value = false
  nodeDataResult.value = null
  lastDataError.value = null
  analysisState.value = null
  causalBrushSelection.value = null
  clearCausalHighlight()
  
  // 노드 정보 확인
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) {
    nodeDataResult.value = {
      hasDataSource: false,
      columns: [],
      rows: [],
      rowCount: 0,
      timeColumns: [],
      numericColumns: []
    }
    nodeDataLoading.value = false
    return
  }
  
  // 노드에 dataSource가 없으면 조회 불가
  if (!node.dataSource) {
    nodeDataResult.value = {
      hasDataSource: false,
      columns: [],
      rows: [],
      rowCount: 0,
      timeColumns: [],
      numericColumns: []
    }
    nodeDataLoading.value = false
    return
  }
  
  try {
    // cascading 필터 조건 수집
    const effectiveFilters = getEffectiveFilters(nodeId)
    const filterParams = new URLSearchParams({ limit: '500' })
    
    // 필터 조건을 쿼리 파라미터로 추가
    Object.entries(effectiveFilters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        filterParams.append(`filter_${key}`, String(value))
      }
    })
    
    // 영업일 캘린더 필터 적용 여부
    if (businessDayFilterEnabled.value) {
      filterParams.append('apply_business_day_filter', 'true')
    }
    
    console.log(`[Filter] fetchNodeData(${nodeId}): effectiveFilters=`, effectiveFilters, `businessDayFilter=${businessDayFilterEnabled.value}`, `URL params: ${filterParams.toString()}`)
    
    // 1차: 백엔드 API 시도
    const response = await fetch(`/api/gateway/ontology/ontology-nodes/${nodeId}/data?${filterParams.toString()}`)
    
    if (response.ok) {
      const result = await response.json()
      if (result.hasDataSource) {
        nodeDataResult.value = result
        
    nodeDataLoading.value = false
    
    // 차트 렌더링 (막대 차트와 라인 차트 모두 직접 렌더링)
    if (result.chartRecommendation?.type !== 'table') {
      await nextTick()
      // DOM이 준비될 때까지 대기
      setTimeout(() => {
        renderChart()
      }, 100)
    }
    return
      } else {
        // 데이터 소스가 없거나 조회 실패
        console.warn('백엔드 API: hasDataSource가 false', result)
        if (result.message) {
          console.warn('백엔드 API 메시지:', result.message)
        }
      }
    } else {
      // HTTP 에러 응답
      const errorText = await response.text().catch(() => '')
      let errorDetail = ''
      try {
        const errorJson = JSON.parse(errorText)
        errorDetail = errorJson.detail || errorJson.message || errorText
      } catch {
        errorDetail = errorText || `HTTP ${response.status} ${response.statusText}`
      }
      console.error(`백엔드 API 실패 (${response.status}):`, errorDetail)
      lastDataError.value = `백엔드 API 오류 (${response.status}): ${errorDetail}`
    }
    
    // 2차: 백엔드 API 실패 시 Text2SQL Direct SQL API 사용
    console.log('백엔드 API 실패, Text2SQL Direct SQL로 fallback')
    await fetchDataViaText2SQL(node, nodeId)
    
  } catch (error: any) {
    console.error('노드 데이터 조회 오류:', error)
    // 에러 발생 시에도 Text2SQL 시도
    try {
      await fetchDataViaText2SQL(node, nodeId)
    } catch (fallbackError) {
      console.error('Text2SQL fallback도 실패:', fallbackError)
      nodeDataResult.value = {
        hasDataSource: false,
        columns: [],
        rows: [],
        rowCount: 0,
        timeColumns: [],
        numericColumns: []
      }
    }
  } finally {
    nodeDataLoading.value = false
  }
}

// Text2SQL Direct SQL API를 통한 데이터 조회
async function fetchDataViaText2SQL(node: OntologyNode, nodeId: string) {
  // SQL 쿼리 생성
  let sql = ''
  
  if (node.dataSourceSchema?.sql) {
    // 저장된 SQL이 있으면 사용
    sql = node.dataSourceSchema.sql
    // LIMIT 추가 (없으면)
    if (!sql.toUpperCase().includes('LIMIT')) {
      sql = `${sql} LIMIT 200`
    }
  } else {
    // 기본 SELECT 쿼리
    const dsTable = node.dataSource
    if (!dsTable) {
      throw new Error('데이터소스 테이블 바인딩이 없습니다')
    }
    const tableName = dsTable.includes('.')
      ? dsTable // (스키마.)테이블 또는 datasource.schema.table 형식
      : `\`${dsTable}\`` // 테이블만 있는 경우(최소한의 MySQL 호환 quoting)
    sql = `SELECT * FROM ${tableName} LIMIT 200`
  }
  
  try {
    // MindsDB-only: datasource is mandatory for /direct-sql
    const ds =
      node.dataSourceSchema?.datasource
        ? String(node.dataSourceSchema.datasource)
        : selectedDatasource.value && selectedDatasource.value !== '__ontology__'
        ? selectedDatasource.value
        : (node.dataSource || '').split('.').length === 3
          ? (node.dataSource || '').split('.')[0]
          : ''
    if (!ds) {
      throw new Error('데이터소스를 선택해주세요')
    }
    const response = await fetch('/api/gateway/text2sql/direct-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, datasource: ds })
    })
    
    if (!response.ok) {
      throw new Error('Text2SQL API 호출 실패')
    }
    
    const result = await response.json()
    
    // Text2SQL 응답 형식에 맞게 변환
    const columns = result.columns || []
    const rows = result.data || result.rows || []
    
    // 데이터 특성 분석
    const timeColumns: string[] = []
    const numericColumns: string[] = []
    
    if (rows.length > 0) {
      for (const col of columns) {
        const sampleValues = rows.slice(0, 10).map((r: any) => {
          if (Array.isArray(r)) {
            const idx = columns.indexOf(col)
            return idx >= 0 ? r[idx] : null
          }
          return r[col]
        }).filter((v: any) => v != null)
        
        if (sampleValues.length > 0) {
          const firstVal = sampleValues[0]
          // 시간 컬럼 감지
          if (typeof firstVal === 'string' && (firstVal.includes('T') || firstVal.includes('-') && firstVal.length > 10)) {
            try {
              new Date(firstVal)
              timeColumns.push(col)
            } catch {
              // 날짜 파싱 실패
            }
          }
          // 숫자 컬럼 감지
          if (typeof firstVal === 'number' || (typeof firstVal === 'string' && !isNaN(Number(firstVal)) && firstVal.trim() !== '')) {
            numericColumns.push(col)
          }
        }
      }
    }
    
    // 차트 추천
    let chartRecommendation: any = {
      type: 'table',
      xAxis: null,
      yAxis: []
    }
    
    // 기본은 라인 차트 (시간 컬럼 없어도 숫자 컬럼만 있으면 라인)
    if (numericColumns.length > 0) {
      chartRecommendation = {
        type: 'line',
        xAxis: (timeColumns.length > 0 ? timeColumns[0] : columns[0]) || null,
        yAxis: numericColumns.slice(0, 3)
      }
    }
    
    // rows를 dict 형태로 변환 (배열 형태인 경우)
    const formattedRows = rows.map((row: any) => {
      if (Array.isArray(row)) {
        const rowDict: any = {}
        columns.forEach((col, idx) => {
          rowDict[col] = row[idx]
        })
        return rowDict
      }
      return row
    })
    
    nodeDataResult.value = {
      nodeId: nodeId,
      nodeName: node.name,
      layer: node.layer || node.label || '',
      unit: node.unit || '',
      hasDataSource: true,
      dataSource: node.dataSource,
      isObjectType: false,
      columns: columns,
      rows: formattedRows,
      rowCount: formattedRows.length,
      timeColumns: timeColumns,
      numericColumns: numericColumns,
      chartRecommendation: chartRecommendation
    }
    
    // 차트 렌더링 (막대 차트와 라인 차트 모두 직접 렌더링)
    if (chartRecommendation.type !== 'table') {
      await nextTick()
      // DOM이 준비될 때까지 대기
      setTimeout(() => {
        renderChart()
      }, 100)
    }
    
  } catch (error: any) {
    console.error('Text2SQL Direct SQL 조회 오류:', error)
    throw error
  }
}

// 차트 렌더링 (막대 차트 및 라인 차트용 - 다중 시리즈 지원)
function renderChart() {
  console.log('renderChart 호출됨', {
    hasContainer: !!chartContainerRef.value,
    hasData: !!nodeDataResult.value,
    chartType: nodeDataResult.value?.chartRecommendation?.type
  })
  isChartReady.value = false
  
  if (!chartContainerRef.value) {
    console.warn('renderChart: chartContainerRef가 없음')
    return
  }
  
  if (!nodeDataResult.value) {
    console.warn('renderChart: nodeDataResult가 없음')
    return
  }
  
  const { rows, chartRecommendation, timeColumns, numericColumns } = nodeDataResult.value
  
  // 차트 타입이 없거나 테이블이면 리턴
  if (!chartRecommendation || chartRecommendation.type === 'table') {
    console.log('renderChart: 차트 타입이 없거나 테이블', chartRecommendation)
    return
  }
  
  if (rows.length === 0) {
    console.warn('renderChart: 데이터 행이 없음')
    return
  }
  
  // 기존 차트 정리
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
  
  try {
    chartInstance = echarts.init(chartContainerRef.value, isDarkMode.value ? 'dark' : undefined)
    console.log('ECharts 인스턴스 생성됨', chartInstance)
  } catch (error) {
    console.error('ECharts 초기화 실패:', error)
    return
  }
  
  const xAxis = chartRecommendation.xAxis || (timeColumns.length > 0 ? timeColumns[0] : null)
  const yAxes = chartRecommendation.yAxis.length > 0 ? chartRecommendation.yAxis : numericColumns.slice(0, 5) // 최대 5개 컬럼
  
  if (!xAxis || yAxes.length === 0) {
    return
  }
  
  // X축 데이터 (날짜 포맷팅)
  const xData = rows.map(r => {
    const val = r[xAxis]
    if (val == null) return ''
    if (typeof val === 'string' && (val.includes('T') || (val.includes('-') && val.length > 10))) {
      try {
        const date = new Date(val)
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('ko-KR', { 
            month: 'short', 
            day: 'numeric',
            ...(val.includes('T') ? { hour: '2-digit', minute: '2-digit' } : {})
          })
        }
      } catch {
        // 날짜 파싱 실패
      }
    }
    return String(val)
  })
  
  // 시리즈 데이터 생성 (라인 차트 또는 막대 차트)
  const series = yAxes.map((yCol, idx) => {
    const color = chartSeriesPalette[idx % chartSeriesPalette.length]
    const data = rows.map(r => {
      const val = r[yCol]
      if (val == null) return null
      if (typeof val === 'number') return val
      if (typeof val === 'string') {
        const num = Number(val)
        return !isNaN(num) ? num : null
      }
      return null
    })
    
    if (chartRecommendation.type === 'line') {
      return {
        name: yCol,
        type: 'line',
        data: data,
        smooth: 0.4,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: rows.length <= 20,
        lineStyle: {
          width: 2.5,
          color: color
        },
        itemStyle: {
          color: color,
          borderColor: isDarkMode.value ? '#fff' : '#000',
          borderWidth: 1.5
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: color + '40' },
            { offset: 1, color: color + '05' }
          ])
        },
        emphasis: {
          focus: 'series',
          lineStyle: {
            width: 3.5
          }
        }
      }
    } else {
      // 막대 차트
      return {
        name: yCol,
        type: 'bar',
        data: data,
        itemStyle: {
          color: color,
          borderRadius: [4, 4, 0, 0]
        }
      }
    }
  })
  
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        label: {
          backgroundColor: isDarkMode.value ? 'rgba(30, 30, 46, 0.95)' : 'rgba(255, 255, 255, 0.95)'
        }
      },
      backgroundColor: isDarkMode.value ? 'rgba(30, 30, 46, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      borderColor: isDarkMode.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      textStyle: {
        color: isDarkMode.value ? '#fff' : '#333'
      },
      formatter: (params: any) => {
        if (Array.isArray(params)) {
          let result = `<div style="font-weight: 600; margin-bottom: 8px;">${params[0].axisValue}</div>`
          params.forEach((param: any) => {
            const color = param.color
            const value = typeof param.value === 'number' ? param.value.toLocaleString() : param.value
            result += `<div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
              <span style="display: inline-block; width: 10px; height: 10px; background: ${color}; border-radius: 50%;"></span>
              <span style="font-weight: 500;">${param.seriesName}:</span>
              <span style="font-weight: 600; color: ${color};">${value}</span>
            </div>`
          })
          return result
        }
        return ''
      }
    },
    legend: {
      data: yAxes,
      bottom: 0,
      left: 'center',
      itemGap: 20,
      textStyle: {
        color: isDarkMode.value ? '#fff' : '#333',
        fontSize: 12
      },
      icon: 'circle',
      type: 'scroll'
    },
    grid: {
      left: '3%',
      right: '4%',
      top: 40,
      bottom: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: {
        lineStyle: {
          color: isDarkMode.value ? '#555' : '#ccc'
        }
      },
      axisLabel: {
        color: isDarkMode.value ? '#aaa' : '#666',
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      axisLine: {
        lineStyle: {
          color: isDarkMode.value ? '#555' : '#ccc'
        }
      },
      axisLabel: {
        color: isDarkMode.value ? '#aaa' : '#666'
      },
      splitLine: {
        lineStyle: {
          color: isDarkMode.value ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
        }
      }
    },
    series
  }

  if (chartRecommendation.type === 'line') {
    (option as any).brush = {
      toolbox: ['rect', 'keep', 'clear'],
      xAxisIndex: 0,
      brushType: 'lineX'
    }
  }

  try {
    chartInstance.setOption(option, true) // notMerge: true로 설정하여 완전히 새로 그리기
    isChartReady.value = true
    console.log('차트 옵션 설정 완료', { seriesCount: series.length, xDataLength: xData.length })
    if (chartRecommendation.type === 'line') {
      restoreCausalBrushSelection(chartInstance, rows, xAxis)
    }
  } catch (error) {
    console.error('차트 옵션 설정 실패:', error)
    return
  }

  if (chartRecommendation.type === 'line' && chartInstance) {
    chartInstance.off('brushSelected')
    chartInstance.on('brushSelected', (params: any) => {
      console.log('=== 브러시 선택 이벤트 발생 ===')
      try {
        console.log('전체 params:', JSON.parse(JSON.stringify(params)))
      } catch (e) {
        console.log('params (직렬화 실패):', params)
      }
      
      // 노드와 스키마 확인
      if (!selectedNode.value?.id || !currentSchemaId.value) {
        console.log('❌ 노드 ID 또는 스키마 ID가 없음')
        return
      }
      
      // ECharts brush 이벤트에서 브러시 범위 추출
      // - coordRange: [[xStart, xEnd], [yStart, yEnd]] (축 좌표)
      // - range: [[x1, y1], [x2, y2]] 또는 [start, end] (픽셀/단순 범위)
      let range: any = null
      let rangeSource: 'coordRange' | 'pixelRange' | null = null
      
      // 1. params.areas에서 직접 찾기
      if (params?.areas?.length > 0 && params.areas[0]?.coordRange) {
        range = params.areas[0].coordRange
        rangeSource = 'coordRange'
        console.log('✅ params.areas[0].coordRange에서 찾음:', range)
      }
      // 2. params.batch[0]에서 찾기
      else if (params?.batch?.length > 0) {
        const batchItem = params.batch[0]
        try {
          console.log('batch 항목:', JSON.parse(JSON.stringify(batchItem)))
        } catch (e) {
          console.log('batch 항목 (직렬화 실패):', batchItem)
        }
        
        // batchItem에 직접 coordRange가 있는지
        if (batchItem?.coordRange) {
          range = batchItem.coordRange
          rangeSource = 'coordRange'
          console.log('✅ batchItem.coordRange에서 찾음:', range)
        }
        // batchItem.areas[0].coordRange에서 찾기
        else if (batchItem?.areas?.[0]?.coordRange) {
          range = batchItem.areas[0].coordRange
          rangeSource = 'coordRange'
          console.log('✅ batchItem.areas[0].coordRange에서 찾음:', range)
        }
        // batchItem.selected[0].areas[0].coordRange에서 찾기
        else if (batchItem?.selected?.[0]?.areas?.[0]?.coordRange) {
          range = batchItem.selected[0].areas[0].coordRange
          rangeSource = 'coordRange'
          console.log('✅ batchItem.selected[0].areas[0].coordRange에서 찾음:', range)
        }
        // batchItem.range에서 찾기 (다른 형식일 수 있음)
        else if (batchItem?.range) {
          if (Array.isArray(batchItem.range)) {
            range = batchItem.range
            rangeSource = 'pixelRange'
          } else if (typeof batchItem.range === 'object' && batchItem.range.start != null && batchItem.range.end != null) {
            range = [batchItem.range.start, batchItem.range.end]
            rangeSource = 'pixelRange'
          }
          if (range) {
            console.log('✅ batchItem.range에서 찾음:', range)
          }
        }
      }
      
      if (!range || !Array.isArray(range) || range.length < 2) {
        console.log('❌ coordRange를 찾을 수 없거나 유효하지 않음:', range)
        return
      }
      
      console.log('브러시 범위 (원본):', range, '타입:', Array.isArray(range[0]) ? '2D' : '1D', '소스:', rangeSource)
      
      // source별로 X 범위를 안전하게 추출
      let xRange: number[] | null = null
      if (Array.isArray(range[0])) {
        if (rangeSource === 'coordRange') {
          // coordRange 2D: [[xStart, xEnd], [yStart, yEnd]]
          const xCoordRange = range[0]
          if (Array.isArray(xCoordRange) && xCoordRange.length >= 2) {
            xRange = [Number(xCoordRange[0]), Number(xCoordRange[1])]
            console.log('2D coordRange 감지, X 축 범위 추출:', xRange)
          }
        } else {
          // pixel range 2D: [[x1, y1], [x2, y2]]
          const p1 = range[0]
          const p2 = range[1]
          if (Array.isArray(p1) && p1.length > 0 && Array.isArray(p2) && p2.length > 0) {
            xRange = [Number(p1[0]), Number(p2[0])]
            console.log('2D pixel range 감지, X 좌표 추출:', xRange)
          }
        }
      } else {
        // 1D 배열: [x1, x2] 형태
        xRange = [Number(range[0]), Number(range[1])]
        console.log('1D 배열, X 범위:', xRange)
      }
      
      if (!xRange || xRange.length < 2 || !Number.isFinite(xRange[0]) || !Number.isFinite(xRange[1])) {
        console.log('❌ X 범위 추출 실패:', { range, rangeSource, xRange })
        return
      }
      
      // 역방향 드래그(오른쪽→왼쪽)도 허용
      const xStart = Math.min(xRange[0], xRange[1])
      const xEnd = Math.max(xRange[0], xRange[1])
      
      // rows, xAxis, xData가 클로저에서 접근 가능한지 확인
      if (!rows || !xAxis || !xData) {
        console.log('❌ rows, xAxis, 또는 xData가 없음:', { 
          hasRows: !!rows, 
          hasXAxis: !!xAxis, 
          hasXData: !!xData,
          rows: rows?.length,
          xAxis,
          xDataLength: xData?.length
        })
        return
      }
      
      const startIdx = Math.max(0, Math.floor(xStart))
      const endIdx = Math.min(xData.length - 1, Math.ceil(xEnd))
      console.log('인덱스 계산:', { 
        range, 
        rangeSource,
        xRange,
        xStart,
        xEnd,
        startIdx, 
        endIdx, 
        xDataLength: xData.length,
        rowsLength: rows.length,
        xAxis
      })
      
      if (startIdx >= endIdx) {
        console.log('❌ 시작 인덱스가 끝 인덱스보다 크거나 같음')
        return
      }
      
      // 값 추출
      let startVal: any = rows[startIdx]?.[xAxis]
      let endVal: any = rows[endIdx]?.[xAxis]
      console.log('값 추출:', { 
        startIdx, 
        endIdx, 
        startVal, 
        endVal,
        startRowExists: !!rows[startIdx],
        endRowExists: !!rows[endIdx],
        xAxis
      })
      
      if (startVal == null || endVal == null) {
        console.log('❌ startVal 또는 endVal이 null/undefined:', { startVal, endVal })
        return
      }
      
      if (startVal instanceof Date) startVal = startVal.toISOString()
      else if (typeof startVal !== 'string') startVal = startVal != null ? String(startVal) : ''
      if (endVal instanceof Date) endVal = endVal.toISOString()
      else if (typeof endVal !== 'string') endVal = endVal != null ? String(endVal) : ''
      
      console.log('변환된 값:', { startVal, endVal })
      
      // 브러시 크기를 다시 조절해도 사용자가 고른 메트릭은 유지한다
      const targetMetric = resolvePreferredCausalMetric(yAxes)
      if (!targetMetric) {
        console.log('❌ 사용할 메트릭을 찾을 수 없음:', { yAxes, analysisMetricOptions: analysisMetricOptions.value })
        return
      }
      const analysisType = inferAnalysisTypeFromRange(rows, targetMetric, startIdx, endIdx)
      
      if (analysisState.value?.loading) {
        console.log('⏳ 분석 로딩 중이라 브러시 변경 무시')
        return
      }

      if (analysisState.value) {
        analysisState.value = null
      }

      causalBrushSelection.value = {
        start: startVal,
        end: endVal,
        targetMetric: targetMetric,
        analysisType: analysisType
      }
      console.log('✅ 구간 선택 완료:', causalBrushSelection.value)
      console.log('저장된 causalBrushSelection:', causalBrushSelection.value)
      nextTick(() => {
        analysisConfigBarRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    })
  }

  // 리사이즈 핸들러 (중복 등록 방지)
  const resizeHandler = () => {
    chartInstance?.resize()
  }
  window.removeEventListener('resize', resizeHandler)
  window.addEventListener('resize', resizeHandler)
}

// 그래프 다시 렌더링 (initCytoscape 래퍼)
function renderGraph() {
  nextTick(() => initCytoscape())
}

// ========== 노드 추가 기능 ==========

function toggleAddNodeDropdown() {
  showAddNodeDropdown.value = !showAddNodeDropdown.value
}

// 클릭 외부 시 드롭다운 닫기
function closeAddNodeDropdown() {
  showAddNodeDropdown.value = false
}

// 캔버스 우클릭 핸들러 (브라우저 기본 메뉴 차단용 - 실제 로직은 Cytoscape cxttap에서 처리)
function onCanvasContextMenu(event: MouseEvent) {
  // 브라우저 기본 컨텍스트 메뉴만 차단 (Cytoscape cxttap 이벤트가 처리)
  event.preventDefault()
}

// 컨텍스트 메뉴 닫기
function closeContextMenu() {
  showContextMenu.value = false
}

// 새 노드 추가 (툴바 버튼) - 캔버스 중앙에 배치
function addNewNode(layerId: string) {
  showAddNodeDropdown.value = false
  
  // 캔버스 중앙 좌표 계산
  let position = { x: 300, y: 300 }
  if (cy) {
    const ext = cy.extent()
    position = {
      x: (ext.x1 + ext.x2) / 2 + (Math.random() - 0.5) * 100,
      y: (ext.y1 + ext.y2) / 2 + (Math.random() - 0.5) * 100
    }
  }
  
  addNewNodeAtPosition(layerId, position)
}

// 새 노드 추가 (우클릭) - 지정된 위치에 배치
function addNewNodeAtPosition(layerId: string, position: { x: number; y: number }) {
  showContextMenu.value = false
  showAddNodeDropdown.value = false
  
  // 상태 저장 (undo 가능하도록)
  saveState()
  
  // 고유 ID 생성
  const timestamp = Date.now()
  const layerPrefix = layerId.toLowerCase()
  const existingCount = nodes.value.filter(n => (n.layer || n.label) === layerId).length
  const nodeId = `${layerPrefix}_${existingCount + 1}_${timestamp}`
  
  // 레이어 정보 가져오기
  const layerInfo = layers.find(l => l.id === layerId)
  const layerName = layerInfo?.name || layerId
  
  // 새 노드 이름 생성
  const newNodeName = `새 ${layerName} ${existingCount + 1}`
  
  // 새 노드 생성
  const newNode: OntologyNode = {
    id: nodeId,
    name: newNodeName,
    label: layerId,
    layer: layerId,
    description: '',
    position: { x: position.x, y: position.y }
  }
  
  // 노드 배열에 추가
  nodes.value.push(newNode)
  
  // Cytoscape에 직접 노드 추가 (전체 재렌더링 방지)
  if (cy) {
    cy.add({
      data: {
        id: nodeId,
        label: newNodeName,
        layer: layerId,
        color: getLayerColor(layerId)
      },
      position: { x: position.x, y: position.y }
    })
    
    // 새 노드 선택
    selectNode(nodeId)
    
    // Edgehandles 재초기화 (새 노드도 연결 가능하도록)
    initEdgehandles()
  }
}

// ========== 우클릭 → 관계 생성 (2클릭 방식) ==========

function startRelationFromContextMenu() {
  showContextMenu.value = false
  if (!contextMenuNodeId.value) return

  pendingRelationSourceId.value = contextMenuNodeId.value

  const cyNode = cy?.$(`#${contextMenuNodeId.value}`)
  cyNode?.addClass('eh-source')
}

function cancelPendingRelation() {
  if (pendingRelationSourceId.value && cy) {
    cy.$(`#${pendingRelationSourceId.value}`).removeClass('eh-source')
  }
  pendingRelationSourceId.value = null
}

function completePendingRelation(targetNodeId: string) {
  const sourceId = pendingRelationSourceId.value
  if (!sourceId || sourceId === targetNodeId) {
    cancelPendingRelation()
    return
  }

  cancelPendingRelation()

  const relationId = `rel_${sourceId}_${targetNodeId}_CAUSES`
  newRelation.value = {
    relationId,
    sourceId,
    targetId: targetNodeId,
    type: 'CAUSES',
    description: ''
  }
  showNewRelationDialog.value = true
}

// ========== 노드 컨텍스트 메뉴 액션 ==========

function openFilterFromContextMenu() {
  showContextMenu.value = false
  if (!contextMenuNodeId.value) return
  
  const node = nodes.value.find(n => n.id === contextMenuNodeId.value)
  if (!node) return
  
  // 노드를 선택 상태로
  selectNode(node.id)
  
  // 필터 다이얼로그 열기
  filterTargetNode.value = node
  showFilterDialog.value = true
  
  // 필터 필드의 distinct 값 로드
  loadFilterDistinctValues(node)
}

function closeFilterDialog() {
  showFilterDialog.value = false
  filterTargetNode.value = null
  filterDistinctValues.value = {}
}

function applyAndCloseFilterDialog() {
  // 필터 적용 및 전파
  const targetNodeId = filterTargetNode.value?.id
  if (targetNodeId) {
    // cascading 필터 전파
    const effectiveFilters = getEffectiveFilters(targetNodeId)
    console.log('[Filter] 필터 전파 시작:', targetNodeId, effectiveFilters)
    propagateFiltersFromNode(targetNodeId, effectiveFilters)
    console.log('[Filter] 전파 완료. nodeFilters:', JSON.parse(JSON.stringify(nodeFilters.value)))
    
    // 시각화 업데이트
    updateFilteredNodeVisuals()
    console.log('[Filter] 시각화 업데이트 완료')
  }
  
  closeFilterDialog()
}

// 필터 필드의 DISTINCT 값을 데이터 소스에서 로드
async function loadFilterDistinctValues(node: OntologyNode) {
  if (!node.filterFields || node.filterFields.length === 0) return
  if (!node.dataSource) return
  
  // select, category, search 타입 필드의 컬럼명 수집
  const selectColumns = node.filterFields
    .filter(f => f.type === 'select' || f.type === 'category' || f.type === 'search')
    .map(f => f.column)
  
  if (selectColumns.length === 0) return
  
  filterDistinctLoading.value = true
  
  try {
    const columnsParam = selectColumns.join(',')
    const response = await fetch(
      `/api/gateway/ontology/ontology-nodes/${node.id}/filter-values?columns=${encodeURIComponent(columnsParam)}`
    )
    
    if (response.ok) {
      const result = await response.json()
      if (result.distinctValues) {
        filterDistinctValues.value = result.distinctValues
      }
    } else {
      console.warn('필터 DISTINCT 값 로드 실패:', response.status)
    }
  } catch (error) {
    console.warn('필터 DISTINCT 값 로드 오류:', error)
  } finally {
    filterDistinctLoading.value = false
  }
}

function openNodeRenameFromContextMenu() {
  showContextMenu.value = false
  if (!contextMenuNodeId.value) return
  
  // 노드 선택
  selectNode(contextMenuNodeId.value)
  
  // 이름 편집 모드 진입
  nextTick(() => startEditNodeName())
}

function deleteNodeFromContextMenu() {
  showContextMenu.value = false
  if (!contextMenuNodeId.value) return
  
  // 노드 선택
  selectNode(contextMenuNodeId.value)
  
  // 삭제 확인
  nextTick(() => confirmDeleteNode())
}

// ========== 엣지 컨텍스트 메뉴 액션 ==========

function openEdgePropertiesFromContextMenu() {
  showContextMenu.value = false
  if (!contextMenuEdgeId.value) return
  
  // 노드 선택 해제 (릴레이션 패널 표시를 위해)
  deselectNode()
  
  // 릴레이션 편집기 열기
  openRelationEditor(contextMenuEdgeId.value)
}

function deleteEdgeFromContextMenu() {
  showContextMenu.value = false
  if (!contextMenuEdgeId.value) return
  
  const edgeId = contextMenuEdgeId.value
  
  // 관계 정보 찾기
  const rel = relationships.value.find(r => r.id === edgeId)
  if (!rel) return
  
  const sourceName = getNodeName(rel.source)
  const targetName = getNodeName(rel.target)
  
  if (!confirm(`'${sourceName}' → '${targetName}' (${rel.type}) 관계를 삭제하시겠습니까?\n\n💡 삭제 후 Ctrl+Z로 실행 취소할 수 있습니다.`)) return
  
  saveState()
  
  relationships.value = relationships.value.filter(r => r.id !== edgeId)
  
  if (cy) {
    cy.$(`#${edgeId}`).remove()
  }
}

// ========== 노드 이름 편집 기능 ==========

function startEditNodeName() {
  if (!selectedNode.value) return
  editingNodeNameValue.value = selectedNode.value.name
  isEditingNodeName.value = true
  nextTick(() => {
    nodeNameInput.value?.focus()
    nodeNameInput.value?.select()
  })
}

function saveNodeName() {
  if (!selectedNode.value || !isEditingNodeName.value) return
  
  const newName = editingNodeNameValue.value.trim()
  if (!newName) {
    cancelEditNodeName()
    return
  }
  
  if (newName !== selectedNode.value.name) {
    // 상태 저장 (undo 가능하도록)
    saveState()
    
    // nodes 배열에서 해당 노드의 이름 업데이트
    const nodeIndex = nodes.value.findIndex(n => n.id === selectedNode.value!.id)
    if (nodeIndex !== -1) {
      nodes.value[nodeIndex] = {
        ...nodes.value[nodeIndex],
        name: newName
      }
    }
    
    // Cytoscape 노드 라벨 업데이트
    if (cy) {
      const cyNode = cy.$(`#${selectedNode.value.id}`)
      if (cyNode.length > 0) {
        cyNode.data('label', newName)
      }
    }
  }
  
  isEditingNodeName.value = false
}

function cancelEditNodeName() {
  isEditingNodeName.value = false
  editingNodeNameValue.value = ''
}

// ========== 레이어(스테레오타입) 변경 ==========

function toggleLayerSelector() {
  isLayerSelectorOpen.value = !isLayerSelectorOpen.value
}

function changeNodeLayer(newLayerId: string) {
  if (!selectedNode.value) return

  const currentLayer = selectedNode.value.layer || selectedNode.value.label
  if (currentLayer === newLayerId) {
    isLayerSelectorOpen.value = false
    return
  }

  // 상태 저장 (undo 가능하도록)
  saveState()

  // nodes 배열에서 해당 노드의 layer/label 업데이트
  const nodeIndex = nodes.value.findIndex(n => n.id === selectedNode.value!.id)
  if (nodeIndex !== -1) {
    nodes.value[nodeIndex] = {
      ...nodes.value[nodeIndex],
      layer: newLayerId,
      label: newLayerId
    }
    // selectedNode도 업데이트
    selectedNode.value = nodes.value[nodeIndex]
  }

  // Cytoscape 노드 스타일 업데이트
  if (cy) {
    const cyNode = cy.$(`#${selectedNode.value.id}`)
    if (cyNode.length > 0) {
      cyNode.data('layer', newLayerId)
      cyNode.data('color', getLayerColor(newLayerId))
    }
  }

  isLayerSelectorOpen.value = false
  console.info(`[Ontology] Node ${selectedNode.value.id} layer changed to ${newLayerId}`)
}

// 다른 곳 클릭 시 레이어 셀렉터 닫기
function closeLayerSelectorOnOutsideClick(e: MouseEvent) {
  if (isLayerSelectorOpen.value) {
    const wrapper = (e.target as HTMLElement).closest('.layer-selector-wrapper')
    if (!wrapper) {
      isLayerSelectorOpen.value = false
    }
  }
}

// ========== 노드 삭제 기능 ==========

function confirmDeleteNode() {
  if (!selectedNode.value) return
  
  const nodeName = selectedNode.value.name
  const relCount = getNodeRelations(selectedNode.value.id).length
  
  const message = relCount > 0
    ? `'${nodeName}' 노드를 삭제하시겠습니까?\n\n이 노드와 연결된 ${relCount}개의 관계도 함께 삭제됩니다.\n\n💡 삭제 후 Ctrl+Z로 실행 취소할 수 있습니다.`
    : `'${nodeName}' 노드를 삭제하시겠습니까?\n\n💡 삭제 후 Ctrl+Z로 실행 취소할 수 있습니다.`
  
  if (!confirm(message)) return
  
  deleteSelectedNode()
}

function deleteSelectedNode() {
  if (!selectedNode.value) return
  
  const nodeId = selectedNode.value.id
  
  // 상태 저장 (undo 가능하도록)
  saveState()
  
  // 관련 관계 삭제
  relationships.value = relationships.value.filter(
    r => r.source !== nodeId && r.target !== nodeId
  )
  
  // 노드 삭제
  nodes.value = nodes.value.filter(n => n.id !== nodeId)
  
  // Cytoscape에서 노드 제거 (연결된 엣지도 자동 제거됨)
  if (cy) {
    const cyNode = cy.$(`#${nodeId}`)
    if (cyNode.length > 0) {
      cy.remove(cyNode)
    }
  }
  
  // 선택 해제
  deselectNode()
}

// 문서 클릭 시 드롭다운/컨텍스트 메뉴 닫기
function onDocumentClick(event: MouseEvent) {
  // 드롭다운 외부 클릭 시 닫기
  const target = event.target as HTMLElement
  if (!target.closest('.add-node-dropdown')) {
    showAddNodeDropdown.value = false
  }
  // 컨텍스트 메뉴 외부 클릭 시 닫기
  if (!target.closest('.canvas-context-menu')) {
    showContextMenu.value = false
  }
}

// ========== Undo/Redo 기능 ==========

function saveState() {
  // 현재 상태를 undo 스택에 저장
  const currentState: HistoryState = {
    nodes: JSON.parse(JSON.stringify(nodes.value)),
    relationships: JSON.parse(JSON.stringify(relationships.value))
  }
  undoStack.value.push(currentState)
  
  // 최대 크기 초과 시 오래된 항목 제거
  if (undoStack.value.length > maxHistorySize) {
    undoStack.value.shift()
  }
  
  // 새 액션 시 redo 스택 초기화
  redoStack.value = []
}

function undo() {
  if (undoStack.value.length === 0) return
  
  // 현재 상태를 redo 스택에 저장
  const currentState: HistoryState = {
    nodes: JSON.parse(JSON.stringify(nodes.value)),
    relationships: JSON.parse(JSON.stringify(relationships.value))
  }
  redoStack.value.push(currentState)
  
  // 이전 상태 복원
  const prevState = undoStack.value.pop()!
  nodes.value = prevState.nodes
  relationships.value = prevState.relationships
  
  // 그래프 다시 렌더링
  renderGraph()
}

function redo() {
  if (redoStack.value.length === 0) return
  
  // 현재 상태를 undo 스택에 저장
  const currentState: HistoryState = {
    nodes: JSON.parse(JSON.stringify(nodes.value)),
    relationships: JSON.parse(JSON.stringify(relationships.value))
  }
  undoStack.value.push(currentState)
  
  // 다음 상태 복원
  const nextState = redoStack.value.pop()!
  nodes.value = nextState.nodes
  relationships.value = nextState.relationships
  
  // 그래프 다시 렌더링
  renderGraph()
}

const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

// ========== 릴레이션 속성 편집 기능 ==========

function getNodeLayer(nodeId: string): string {
  const node = nodes.value.find(n => n.id === nodeId)
  return node?.layer || node?.label || 'Resource'
}

function normalizeColumnNames(columns: any): string[] {
  if (!Array.isArray(columns)) return []
  return Array.from(
    new Set(
      columns
        .map((c: any) => typeof c === 'string' ? c : c?.name || c)
        .filter((c: any): c is string => typeof c === 'string' && c.trim().length > 0)
    )
  )
}

async function fetchNodeColumns(nodeId: string): Promise<FetchColumnsResult> {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) {
    return {
      status: 'error',
      columns: [],
      error: '노드 정보를 찾을 수 없습니다.'
    }
  }

  if (!node.dataSource) {
    return {
      status: 'no_datasource',
      columns: []
    }
  }

  // 이미 dataSourceSchema에 컬럼 정보가 있으면 사용
  const schemaColumns = normalizeColumnNames(node.dataSourceSchema?.columns)
  if (schemaColumns.length > 0) {
    return {
      status: 'ready',
      columns: schemaColumns
    }
  }

  try {
    const response = await fetch(`/api/gateway/ontology/ontology-nodes/${nodeId}/data?limit=1`)
    if (!response.ok) {
      return {
        status: 'error',
        columns: [],
        error: `데이터 소스 '${node.dataSource}'의 컬럼 정보를 조회하지 못했습니다.`
      }
    }

    const result = await response.json()
    const columns = normalizeColumnNames(result.columns)
    if (columns.length > 0) {
      return {
        status: 'ready',
        columns
      }
    }

    return {
      status: 'error',
      columns: [],
      error: `데이터 소스 '${node.dataSource}'에 사용할 수 있는 컬럼 정보가 없습니다.`
    }
  } catch (e) {
    console.warn('컬럼 정보 조회 실패:', e)
    return {
      status: 'error',
      columns: [],
      error: `데이터 소스 '${node.dataSource}'의 컬럼 메타데이터 조회에 실패했습니다.`
    }
  }
}

async function openRelationEditor(edgeId: string) {
  // relationships에서 해당 릴레이션 찾기
  const rel = relationships.value.find(r => r.id === edgeId)
  if (!rel) {
    // id가 복합키 형태일 수 있음
    const relFromEdge = relationships.value.find(r => {
      const compositeId = `${r.source}-${r.type}-${r.target}`
      return compositeId === edgeId
    })
    if (!relFromEdge) return
    editingRelation.value = relFromEdge
  } else {
    editingRelation.value = rel
  }
  
  // 노드 상세 패널과 선택 상태를 먼저 정리한 뒤 릴레이션 패널을 연다.
  deselectNode()
  
  // 폼 초기화
  editingRelationForm.value = {
    type: editingRelation.value!.type,
    description: editingRelation.value!.description || '',
    fromField: editingRelation.value!.fromField || '',
    toField: editingRelation.value!.toField || ''
  }

  showRelationEditor.value = true
  sourceColumnStatus.value = 'loading'
  targetColumnStatus.value = 'loading'
  sourceColumnError.value = ''
  targetColumnError.value = ''
  sourceNodeColumns.value = []
  targetNodeColumns.value = []

  // 소스/타겟 노드의 컬럼 정보 로드
  const [srcResult, tgtResult] = await Promise.all([
    fetchNodeColumns(editingRelation.value!.source),
    fetchNodeColumns(editingRelation.value!.target)
  ])
  sourceNodeColumns.value = srcResult.columns
  targetNodeColumns.value = tgtResult.columns
  sourceColumnStatus.value = srcResult.status
  targetColumnStatus.value = tgtResult.status
  sourceColumnError.value = srcResult.error || ''
  targetColumnError.value = tgtResult.error || ''

  if (!srcResult.columns.includes(editingRelationForm.value.fromField)) {
    editingRelationForm.value.fromField = ''
  }
  if (!tgtResult.columns.includes(editingRelationForm.value.toField)) {
    editingRelationForm.value.toField = ''
  }
}

function closeRelationEditor() {
  showRelationEditor.value = false
  editingRelation.value = null
  sourceNodeColumns.value = []
  targetNodeColumns.value = []
  sourceColumnStatus.value = 'no_datasource'
  targetColumnStatus.value = 'no_datasource'
  sourceColumnError.value = ''
  targetColumnError.value = ''
}

function saveRelationEditor() {
  if (!editingRelation.value) return
  
  const relIndex = relationships.value.findIndex(r => r.id === editingRelation.value!.id)
  if (relIndex !== -1) {
    const normalizedFromField = editingRelationForm.value.fromField.trim()
    const normalizedToField = editingRelationForm.value.toField.trim()

    if (normalizedFromField) {
      if (sourceColumnStatus.value !== 'ready') {
        alert(sourceColumnError.value || 'From 노드의 컬럼 정보를 확인할 수 없어 필드 매핑을 저장할 수 없습니다.')
        return
      }
      if (!sourceNodeColumns.value.includes(normalizedFromField)) {
        alert(`From 필드 '${normalizedFromField}'은(는) 현재 데이터 소스 컬럼에 없습니다.`)
        editingRelationForm.value.fromField = ''
        return
      }
    }

    if (normalizedToField) {
      if (targetColumnStatus.value !== 'ready') {
        alert(targetColumnError.value || 'To 노드의 컬럼 정보를 확인할 수 없어 필드 매핑을 저장할 수 없습니다.')
        return
      }
      if (!targetNodeColumns.value.includes(normalizedToField)) {
        alert(`To 필드 '${normalizedToField}'은(는) 현재 데이터 소스 컬럼에 없습니다.`)
        editingRelationForm.value.toField = ''
        return
      }
    }

    const nextRelation = {
      ...relationships.value[relIndex],
      type: editingRelationForm.value.type,
      description: editingRelationForm.value.description || undefined,
      fromField: normalizedFromField || undefined,
      toField: normalizedToField || undefined
    }

    const currentRelation = relationships.value[relIndex]
    const isUnchanged =
      currentRelation.type === nextRelation.type &&
      currentRelation.description === nextRelation.description &&
      currentRelation.fromField === nextRelation.fromField &&
      currentRelation.toField === nextRelation.toField

    if (isUnchanged) return

    // 실제 변경이 있을 때만 상태 저장 (undo 가능)
    saveState()

    relationships.value[relIndex] = nextRelation
    editingRelation.value = nextRelation
    
    // Cytoscape 엣지 라벨 업데이트
    if (cy) {
      const edge = cy.$(`#${editingRelation.value!.id}`)
      if (edge.length > 0) {
        edge.data('type', editingRelationForm.value.type)
        edge.data('label', editingRelationForm.value.type)
      }
    }
  }
}

function deleteRelationFromEditor() {
  if (!editingRelation.value) return
  
  const rel = editingRelation.value
  if (!confirm(`'${getNodeName(rel.source)}' → '${getNodeName(rel.target)}' 관계를 삭제하시겠습니까?`)) return
  
  saveState()
  
  relationships.value = relationships.value.filter(r => r.id !== rel.id)
  
  if (cy) {
    cy.$(`#${rel.id}`).remove()
  }
  
  closeRelationEditor()
}

// ========== 캐스케이딩 필터 (Drill-down) 기능 ==========

/**
 * 상위 노드에 필터가 걸리면, fromField/toField 매핑을 통해
 * 하위(target) 노드들에 자동으로 필터 조건을 전파합니다.
 * 
 * 예: Product 노드에서 product_id=123 필터 → BOM 노드에 product_id=123 필터 자동 적용
 */
function propagateFiltersFromNode(nodeId: string, filterValues: Record<string, any>, visited?: Set<string>) {
  // 순환 참조 방지
  const visitedSet = visited || new Set<string>()
  if (visitedSet.has(nodeId)) return
  visitedSet.add(nodeId)
  
  // nodeFilters에 현재 노드의 필터 저장
  nodeFilters.value[nodeId] = { ...filterValues }
  
  // 빈 필터면 전파 불필요
  const hasActiveValues = Object.values(filterValues).some(v => v !== '' && v !== null && v !== undefined)
  if (!hasActiveValues) return
  
  // ===== 방향 1: 이 노드가 TARGET인 FK 관계 (부모 → 자식 전파) =====
  // FK 관계: source(자식).fromField → target(부모).toField
  // 부모에 필터가 걸리면 → 자식의 fromField에 같은 값으로 필터 전파
  const incomingRels = relationships.value.filter(
    r => r.target === nodeId && r.fromField && r.toField && !visitedSet.has(r.source)
  )
  
  incomingRels.forEach(rel => {
    const toFieldValue = filterValues[rel.toField!]
    if (toFieldValue !== undefined && toFieldValue !== '' && toFieldValue !== null) {
      // source(자식) 노드에 fromField 기반 필터 전파
      const childFilter: Record<string, any> = {
        ...(nodeFilters.value[rel.source] || {}),
        [rel.fromField!]: toFieldValue
      }
      
      // 재귀적으로 하위 노드들에도 전파 (visited 전달)
      propagateFiltersFromNode(rel.source, childFilter, visitedSet)
    }
  })
  
  // ===== 방향 2: 이 노드가 SOURCE인 FK 관계 (자식 → 손자 전파) =====
  // 이 노드가 자식이면서 동시에 다른 테이블의 부모인 경우
  const outgoingRels = relationships.value.filter(
    r => r.source === nodeId && r.fromField && r.toField && !visitedSet.has(r.target)
  )
  
  outgoingRels.forEach(rel => {
    const fromFieldValue = filterValues[rel.fromField!]
    if (fromFieldValue !== undefined && fromFieldValue !== '' && fromFieldValue !== null) {
      const targetFilter: Record<string, any> = {
        ...(nodeFilters.value[rel.target] || {}),
        [rel.toField!]: fromFieldValue
      }
      propagateFiltersFromNode(rel.target, targetFilter, visitedSet)
    }
  })
}

/**
 * 노드에 대한 전체 필터 조건 조합 (사용자 직접 필터 + cascading 필터)
 * fetchNodeData 시 WHERE 조건으로 사용
 */
function getEffectiveFilters(nodeId: string): Record<string, any> {
  const cascadingFilters = nodeFilters.value[nodeId] || {}
  
  // activeFilters에서 이 노드에 해당하는 필터 추출
  const userFilters: Record<string, any> = {}
  Object.entries(activeFilters.value).forEach(([key, value]) => {
    if (key.startsWith(`${nodeId}.`) && value !== '' && value !== null && value !== undefined) {
      const field = key.substring(nodeId.length + 1)
      // .from, .to, .min, .max 접미사는 제외 (단일 필드 값만 사용)
      if (!field.includes('.')) {
        userFilters[field] = value
      }
    }
  })
  
  // cascading 필터와 사용자 필터 합치기 (사용자 필터 우선)
  return { ...cascadingFilters, ...userFilters }
}

/**
 * 특정 노드의 상위(parent) 노드에서 전파된 cascading 필터가 있는지 확인
 */
function getCascadingFiltersForNode(nodeId: string): Array<{ field: string; value: any; fromNode: string; fromField: string }> {
  const result: Array<{ field: string; value: any; fromNode: string; fromField: string }> = []
  
  // 방향 1: 이 노드가 SOURCE인 FK 관계 (이 노드 = 자식, target = 부모)
  // 부모에 필터가 걸렸으면 → 이 노드(자식)의 fromField에 cascading 적용
  const outgoingRels = relationships.value.filter(
    r => r.source === nodeId && r.fromField && r.toField
  )
  
  outgoingRels.forEach(rel => {
    const parentFilters = nodeFilters.value[rel.target]
    if (parentFilters && parentFilters[rel.toField!] !== undefined && parentFilters[rel.toField!] !== '') {
      result.push({
        field: rel.fromField!,
        value: parentFilters[rel.toField!],
        fromNode: rel.target,
        fromField: rel.toField!
      })
    }
  })
  
  // 방향 2: 이 노드가 TARGET인 관계에서 source 노드에 필터가 있는 경우
  const incomingRels = relationships.value.filter(
    r => r.target === nodeId && r.fromField && r.toField
  )
  
  incomingRels.forEach(rel => {
    const sourceFilters = nodeFilters.value[rel.source]
    if (sourceFilters && sourceFilters[rel.fromField!] !== undefined && sourceFilters[rel.fromField!] !== '') {
      result.push({
        field: rel.toField!,
        value: sourceFilters[rel.fromField!],
        fromNode: rel.source,
        fromField: rel.fromField!
      })
    }
  })
  
  return result
}

// ========== 필터 시각화 (Cytoscape 그래프에 하이라이팅) ==========

/**
 * 필터가 걸린 노드들을 그래프에서 시각적으로 하이라이팅
 * - 직접 필터가 걸린 노드: 'filtered-direct' 클래스
 * - cascading으로 영향받는 노드: 'filtered-cascade' 클래스
 * - 영향받는 엣지: 'filtered-edge' 클래스
 * - 필터 비관련 노드: 'filtered-dimmed' 클래스 (흐리게)
 */
function updateFilteredNodeVisuals() {
  if (!cy) return
  
  // 모든 필터 클래스 제거
  cy.elements().removeClass('filtered-direct filtered-cascade filtered-edge filtered-dimmed')
  
  // 필터가 걸린 노드 ID 수집
  const directFilteredNodes = new Set<string>()
  const cascadeFilteredNodes = new Set<string>()
  const filteredEdges = new Set<string>()
  
  // 1. 직접 필터가 걸린 노드 찾기
  Object.entries(activeFilters.value).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      const nodeId = key.split('.')[0]
      if (nodes.value.some(n => n.id === nodeId)) {
        directFilteredNodes.add(nodeId)
      }
    }
  })
  
  // 2. nodeFilters에서 cascading 필터가 설정된 노드 찾기
  // propagateFiltersFromNode이 이미 모든 하위 노드에 필터를 설정해놓았으므로
  // nodeFilters에 값이 있고 직접 필터가 아닌 노드 = cascade 노드
  Object.entries(nodeFilters.value).forEach(([nodeId, filters]) => {
    if (directFilteredNodes.has(nodeId)) return
    const hasValues = Object.values(filters).some(v => v !== '' && v !== null && v !== undefined)
    if (hasValues && nodes.value.some(n => n.id === nodeId)) {
      cascadeFilteredNodes.add(nodeId)
    }
  })
  
  // 3. 영향받는 엣지 찾기 (직접 + cascade 노드 사이의 엣지)
  const allFilteredNodes = new Set([...directFilteredNodes, ...cascadeFilteredNodes])
  relationships.value.forEach(rel => {
    if (rel.fromField && rel.toField) {
      // source 또는 target 중 하나라도 필터된 노드면 엣지 하이라이트
      if (allFilteredNodes.has(rel.source) && allFilteredNodes.has(rel.target)) {
        filteredEdges.add(rel.id)
      }
    }
  })
  
  // 4. 필터가 존재할 때만 시각화 적용
  const hasAnyFilter = directFilteredNodes.size > 0
  
  if (hasAnyFilter) {
    // 모든 노드를 흐리게
    cy.nodes().addClass('filtered-dimmed')
    cy.edges().addClass('filtered-dimmed')
    
    // 직접 필터 노드 하이라이트
    directFilteredNodes.forEach(nodeId => {
      const cyNode = cy!.$(`#${nodeId}`)
      cyNode.removeClass('filtered-dimmed')
      cyNode.addClass('filtered-direct')
    })
    
    // cascading 노드 하이라이트
    cascadeFilteredNodes.forEach(nodeId => {
      const cyNode = cy!.$(`#${nodeId}`)
      cyNode.removeClass('filtered-dimmed')
      cyNode.addClass('filtered-cascade')
    })
    
    // 영향받는 엣지 하이라이트
    filteredEdges.forEach(edgeId => {
      const cyEdge = cy!.$(`#${edgeId}`)
      cyEdge.removeClass('filtered-dimmed')
      cyEdge.addClass('filtered-edge')
    })
  }
}

/**
 * 특정 노드에 적용된 모든 필터 정보 반환 (직접 + cascading)
 * 상세 패널의 필터 칩 표시용
 */
function getNodeFilterChips(nodeId: string): Array<{ label: string; value: any; type: 'direct' | 'cascade'; fromNode?: string }> {
  const chips: Array<{ label: string; value: any; type: 'direct' | 'cascade'; fromNode?: string }> = []
  
  // 직접 필터
  Object.entries(activeFilters.value).forEach(([key, value]) => {
    if (key.startsWith(`${nodeId}.`) && value !== '' && value !== null && value !== undefined) {
      const field = key.substring(nodeId.length + 1)
      // .from, .to, .min, .max 접미사 처리
      if (!field.includes('.')) {
        chips.push({ label: field, value, type: 'direct' })
      }
    }
  })
  
  // cascading 필터
  const cascading = getCascadingFiltersForNode(nodeId)
  cascading.forEach(cf => {
    chips.push({
      label: cf.field,
      value: cf.value,
      type: 'cascade',
      fromNode: cf.fromNode
    })
  })
  
  return chips
}

// ========== 엣지 삭제 기능 ==========

function showDeleteEdgeConfirm(edgeData: { id: string; source: string; target: string; type: string }) {
  edgeToDelete.value = edgeData
  showEdgeDeleteDialog.value = true
}

function confirmDeleteEdge() {
  if (!edgeToDelete.value) return
  
  // 상태 저장 (undo 가능하도록)
  saveState()
  
  // 관계 삭제
  const edgeId = edgeToDelete.value.id
  relationships.value = relationships.value.filter(r => {
    const relId = `${r.source}-${r.type}-${r.target}`
    return relId !== edgeId
  })
  
  // Cytoscape에서 엣지 제거
  if (cy) {
    cy.$(`#${edgeId}`).remove()
  }
  
  // 다이얼로그 닫기
  showEdgeDeleteDialog.value = false
  edgeToDelete.value = null
}

function cancelDeleteEdge() {
  showEdgeDeleteDialog.value = false
  edgeToDelete.value = null
}

// 키보드 단축키 (Ctrl+Z, Ctrl+Y)
function handleKeyDown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    undo()
  } else if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
    event.preventDefault()
    redo()
  }
}

function handleWindowBlur() {
  resetEdgehandlesInteractionState({ removeTransientEdges: true })
}

function isKPIOrMeasure(node: { layer?: string; label?: string } | null): boolean {
  if (!node) return false
  const layer = node.layer || node.label || ''
  return layer === 'KPI' || layer === 'Measure'
}

function isProcessNode(node: { layer?: string; label?: string } | null): boolean {
  if (!node) return false
  const layer = node.layer || node.label || ''
  return layer === 'Process'
}

function getNodeName(nodeId: string): string {
  const node = nodes.value.find(n => n.id === nodeId)
  return node?.name || nodeId
}

function getNodeRelations(nodeId: string): OntologyRelationship[] {
  return relationships.value.filter(r => r.source === nodeId || r.target === nodeId)
}

function formatCellValue(value: any): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'number') {
    return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  }
  if (typeof value === 'string' && value.includes('T')) {
    try {
      const date = new Date(value)
      return date.toLocaleString('ko-KR', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return value
    }
  }
  return String(value)
}

// Measure용 ObjectType 생성
async function createMeasureObjectType() {
  if (!selectedNode.value) return
  
  const node = selectedNode.value
  
  if (!confirm(`'${node.name}'에 대한 ObjectType을 생성하시겠습니까?\n\n이렇게 하면 도메인 레이어에 새 ObjectType이 생성됩니다.`)) {
    return
  }
  
  nodeDataLoading.value = true
  
  try {
    const response = await fetch(`/api/gateway/ontology/ontology-nodes/${node.id}/create-objecttype`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        node_id: node.id,
        node_name: node.name,
        description: node.description,
        unit: node.unit
      })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'ObjectType 생성 실패')
    }
    
    const result = await response.json()
    
    // 노드 업데이트
    node.dataSource = result.objectTypeName
    
    // 성공 알림
    alert(`ObjectType '${result.objectTypeName}'이(가) 생성되었습니다.`)
    
    // 데이터 새로고침
    await fetchNodeData(node.id)
    
  } catch (error: any) {
    alert(`오류: ${error.message}`)
  } finally {
    nodeDataLoading.value = false
  }
}

// File handling
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function handleFileDrop(event: DragEvent) {
  isDraggingFile.value = false
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    const file = files[0]
    if (file.type === 'application/pdf') {
      uploadedFile.value = file
    } else {
      alert('PDF 파일만 업로드할 수 있습니다.')
    }
  }
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    uploadedFile.value = input.files[0]
  }
}

// Progress helpers
function addLog(message: string, type: string = 'info') {
  const time = new Date().toLocaleTimeString()
  generationLogs.value.push({ time, message, type })
  if (type === 'error' || type === 'warning') {
    logsExpanded.value = true
  }
  nextTick(() => {
    if (logListRef.value) {
      logListRef.value.scrollTop = logListRef.value.scrollHeight
    }
  })
}

function getStatusLabel(status?: string): string {
  const labels: Record<string, string> = {
    pending: '대기',
    in_progress: '진행 중',
    completed: '완료',
    failed: '실패'
  }
  return labels[status || 'pending'] || status || '대기'
}



function normalizeStepMessage(message?: string): string {
  return (message || '').replace(/^\[[^\]]+\]\s*/, '').trim()
}

function getStageDisplayMessage(stage: string): string {
  const stageMessage = normalizeStepMessage(pipelineProgress.value[stage]?.message)
  if (!stageMessage) return ''
  if (stage !== 'Unified') return stageMessage

  const unifiedDetail = pipelineProgress.value[stage]?.detail
  if (unifiedDetail?.substepLabel) {
    return unifiedDetail.substepLabel
  }

  return stageMessage.replace(/^청크 \d+\/\d+(?:\s*·\s*단계 \d+\/\d+)?(?:\s*·\s*)?/, '').trim()
}

function updateCurrentStepForPhase(phase: string, progress: number, message?: string) {
  const label = STAGE_LABELS[phase]?.label || phase
  if (progress >= 100) {
    currentStep.value = `${label} 완료`
  } else {
    currentStep.value = message || `${label} 처리 중`
  }
}

function resetProgress() {
  const isPdfInput = generateForm.value.inputType === 'pdf' || generateForm.value.inputType === 'url'
  const stages: string[] = isPdfInput
    ? ['Normalization', 'BPMN', 'Chunking', 'Sanitize', 'Unified', 'MergeRefine']
    : [...DEFAULT_PIPELINE_STAGES]
  activePipelineStages.value = stages
  const freshProgress: Record<string, PipelineProgressState> = {}
  for (const stage of stages) {
    freshProgress[stage] = { status: 'pending', progress: 0 }
  }
  pipelineProgress.value = freshProgress
  chunkProgress.value = {
    current: 0,
    total: 0,
    substepCurrent: 0,
    substepTotal: 0,
    completedSteps: 0,
    totalSteps: 0
  }
  sanitizeChunkProgress.value = { current: 0, total: 0 }
  layerResults.value = {}
  generationLogs.value = []
  currentStep.value = ''
  logsExpanded.value = false
  showSynonymSuggestionModal.value = false
  showSynonymSuggestionToast.value = false
  showSynonymAppliedToast.value = false
  synonymAppliedCount.value = 0
  synonymSuggestions.value = []
  generationCompleted.value = false
  generationSaveStatus.value = 'saving'
  generationSaveError.value = ''
  generationResult.value = { nodeCount: 0, relationshipCount: 0, layerBreakdown: {}, synonymSuggestionCount: 0 }
}

function cancelGeneration() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  generating.value = false
  currentStep.value = '생성 취소됨'
  addLog('사용자에 의해 취소됨', 'warning')
}

function onCloseGenerateDialog() {
  if (!generating.value) {
    generateError.value = ''
    generationCompleted.value = false
    showGenerateDialog.value = false
  }
}

// 스키마 기반 온톨로지 생성 완료 핸들러
interface NodeFilterField {
  column: string
  label: string
  type: string
  dataType: string
}

function handleSchemaBasedGenerated(generatedSchema: any) {
  console.log('📊 스키마 기반 온톨로지 생성 완료:', generatedSchema)
  
  if (generatedSchema && generatedSchema.nodes) {
    // 노드 변환 및 추가 (filterFields 포함)
    const newNodes: OntologyNode[] = generatedSchema.nodes.map((node: any) => ({
      id: node.id,
      name: node.name,
      label: node.label || node.layer || 'Resource',
      layer: node.layer,
      description: node.description || '',
      dataSource: node.dataSource || '',
      filterFields: node.filterFields || []
    }))
    
    // 관계 변환 및 추가
    const newRelationships: OntologyRelationship[] = (generatedSchema.relationships || []).map((rel: any) => ({
      id: rel.id,
      source: rel.source,
      target: rel.target,
      type: rel.type || 'RELATED_TO',
      description: rel.description || '',
      fromField: rel.fromField || rel.from_field || undefined,
      toField: rel.toField || rel.to_field || undefined
    }))
    
    // 새 노드/관계로 교체 (기존 것 덮어쓰기)
    nodes.value = newNodes
    relationships.value = newRelationships
    
    // Cytoscape 갱신
    nextTick(() => {
      if (cy) {
        renderGraph()
      }
    })
    
    addLog(`✅ 스키마 기반 온톨로지 생성 완료: ${newNodes.length}개 노드, ${newRelationships.length}개 관계`, 'success')
  }
  
  showGenerateDialog.value = false
}

// Cytoscape 스타일 생성 (다크/라이트 모드 지원)
function getCytoscapeStyles(): cytoscape.Stylesheet[] {
  const dark = isDarkMode.value
  const textColor = dark ? '#fff' : '#1e293b'
  const edgeLabelColor = dark ? '#94a3b8' : '#64748b'
  const defaultEdgeColor = dark ? '#64748b' : '#94a3b8'
  const selectedBorderColor = dark ? '#fff' : '#1e293b'
  
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        'label': 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '10px',
        'color': textColor,
        'text-outline-color': 'data(color)',
        'text-outline-width': 2,
        'width': 60,
        'height': 60,
        'border-width': 2,
        'border-color': dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)'
      }
    },
    {
      selector: 'node.selected',
      style: {
        'border-width': 4,
        'border-color': selectedBorderColor,
        'width': 70,
        'height': 70
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': defaultEdgeColor,
        'target-arrow-color': defaultEdgeColor,
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': '8px',
        'color': edgeLabelColor,
        'text-rotation': 'autorotate',
        'text-margin-y': -10,
        'text-background-color': dark ? '#1a1b1e' : '#fff',
        'text-background-opacity': 0.8,
        'text-background-padding': '2px'
      }
    },
    {
      selector: 'edge[type="CAUSES"]',
      style: {
        'line-color': '#ef4444',
        'target-arrow-color': '#ef4444'
      }
    },
    {
      selector: 'edge[type="MEASURED_AS"]',
      style: {
        'line-color': '#22c55e',
        'target-arrow-color': '#22c55e'
      }
    },
    {
      selector: 'edge[type="PRODUCES"]',
      style: {
        'line-color': '#3b82f6',
        'target-arrow-color': '#3b82f6'
      }
    },
    {
      selector: 'edge[type="INFLUENCES"]',
      style: {
        'line-color': '#f97316',
        'target-arrow-color': '#f97316'
      }
    },
    {
      selector: 'edge[type="EXECUTES"]',
      style: {
        'line-color': '#8b5cf6',
        'target-arrow-color': '#8b5cf6'
      }
    },
    {
      selector: 'edge[type="USED_WHEN"]',
      style: {
        'line-color': '#06b6d4',
        'target-arrow-color': '#06b6d4',
        'line-style': 'dashed'
      }
    },
    // 역전된 관계 타입 스타일
    {
      selector: 'edge[type="CAUSED_BY"]',
      style: {
        'line-color': '#ef4444',
        'target-arrow-color': '#ef4444'
      }
    },
    {
      selector: 'edge[type="MEASURES"]',
      style: {
        'line-color': '#22c55e',
        'target-arrow-color': '#22c55e'
      }
    },
    {
      selector: 'edge[type="PRODUCED_BY"]',
      style: {
        'line-color': '#3b82f6',
        'target-arrow-color': '#3b82f6'
      }
    },
    {
      selector: 'edge[type="INFLUENCED_BY"]',
      style: {
        'line-color': '#f97316',
        'target-arrow-color': '#f97316'
      }
    },
    {
      selector: 'edge[type="EXECUTED_BY"]',
      style: {
        'line-color': '#8b5cf6',
        'target-arrow-color': '#8b5cf6'
      }
    },
    {
      selector: 'edge[type="SUPPORTS"]',
      style: {
        'line-color': '#06b6d4',
        'target-arrow-color': '#06b6d4',
        'line-style': 'dashed'
      }
    },
    {
      selector: 'edge[type="FOLLOWS"]',
      style: {
        'line-color': '#64748b',
        'target-arrow-color': '#64748b'
      }
    },
    {
      selector: 'edge[type="TRIGGERED_BY"]',
      style: {
        'line-color': '#a855f7',
        'target-arrow-color': '#a855f7'
      }
    },
    {
      selector: 'edge[type="PRECEDES"]',
      style: {
        'line-color': '#64748b',
        'target-arrow-color': '#64748b'
      }
    },
    {
      selector: 'edge[type="TRIGGERS"]',
      style: {
        'line-color': '#a855f7',
        'target-arrow-color': '#a855f7'
      }
    },
    // KPI 간 영향 관계
    {
      selector: 'edge[type="EFFECTS"], edge[type="EFFECTED_BY"]',
      style: {
        'line-color': '#dc2626',
        'target-arrow-color': '#dc2626',
        'width': 3
      }
    },
    // 프로세스 흐름 (좌→우)
    {
      selector: 'edge[type="NEXT"]',
      style: {
        'line-color': '#16a34a',
        'target-arrow-color': '#16a34a',
        'width': 3,
        'curve-style': 'straight'
      }
    },
    // 추가 관계 타입
    {
      selector: 'edge[type="AFFECTS"], edge[type="AFFECTED_BY"]',
      style: {
        'line-color': '#f43f5e',
        'target-arrow-color': '#f43f5e'
      }
    },
    {
      selector: 'edge[type="IMPACTS"], edge[type="IMPACTED_BY"]',
      style: {
        'line-color': '#ec4899',
        'target-arrow-color': '#ec4899'
      }
    },
    {
      selector: 'edge[type="ENABLES"], edge[type="ENABLED_BY"]',
      style: {
        'line-color': '#14b8a6',
        'target-arrow-color': '#14b8a6'
      }
    },
    {
      selector: 'edge[type="CONTRIBUTES_TO"], edge[type="CONTRIBUTED_BY"]',
      style: {
        'line-color': '#84cc16',
        'target-arrow-color': '#84cc16'
      }
    },
    {
      selector: 'edge[type="USES"], edge[type="USED_BY"]',
      style: {
        'line-color': '#64748b',
        'target-arrow-color': '#64748b',
        'line-style': 'dashed'
      }
    },
    // Visual effects: alert (pulsing red glow)
    {
      selector: 'node.fx-alert',
      style: {
        'border-width': 5,
        'border-color': '#ef4444',
        'border-opacity': 1,
        'overlay-color': '#ef4444',
        'overlay-padding': 10,
        'overlay-opacity': 0.15,
      } as any
    },
    // Visual effects: badge (shows label above node)
    {
      selector: 'node.fx-badge',
      style: {
        'border-width': 3,
        'border-color': '#facc15',
        'border-opacity': 0.9,
      } as any
    },
    // Agent activity indicator - pulsing border for nodes with active agents
    {
      selector: 'node.agent-active',
      style: {
        'border-width': 4,
        'border-color': '#22d3ee',
        'border-opacity': 0.9,
        'overlay-color': '#22d3ee',
        'overlay-padding': 6,
        'overlay-opacity': 0.08,
      } as any
    },
    {
      selector: 'node.agent-running',
      style: {
        'border-width': 5,
        'border-color': '#6366f1',
        'border-opacity': 1,
        'overlay-color': '#6366f1',
        'overlay-padding': 8,
        'overlay-opacity': 0.12,
      } as any
    },
    // Edgehandles 스타일 - 테두리 호버 시 밝은 외곽 링
    {
      selector: '.eh-hover',
      style: {
        'border-width': 12,
        'border-color': 'rgba(255, 255, 255, 0.9)',
        'border-opacity': 1
      }
    },
    // 드래그 소스 노드 - 연결 시작점
    {
      selector: '.eh-source',
      style: {
        'border-width': 10,
        'border-color': '#00d9ff',
        'border-opacity': 1
      }
    },
    // 드래그 타겟 노드
    {
      selector: '.eh-target',
      style: {
        'border-width': 10,
        'border-color': '#10b981',
        'border-opacity': 1
      }
    },
    // 추정 대상 - 근처에 접근 시 강조 (스냅 효과)
    {
      selector: '.eh-presumptive-target',
      style: {
        'border-width': 14,
        'border-color': '#10b981',
        'border-opacity': 1
      }
    },
    // 미리보기 엣지
    {
      selector: '.eh-preview, .eh-ghost-edge',
      style: {
        'line-color': '#00d9ff',
        'target-arrow-color': '#00d9ff',
        'line-style': 'dashed',
        'opacity': 0.7
      }
    },
    {
      selector: 'node.causal-highlight',
      style: {
        'border-width': 4,
        'border-color': '#fbbf24',
        'border-opacity': 1,
        'opacity': 1
        // 배경색은 원래 색상 유지 (data(color) 사용)
      }
    },
    {
      selector: 'node.causal-faded',
      style: {
        'opacity': 0.25
      }
    },
    {
      selector: 'edge.causal-highlight',
      style: {
        'line-color': '#f59e0b',
        'target-arrow-color': '#f59e0b',
        'width': 4,
        'opacity': 1
      }
    },
    {
      selector: 'edge.causal-faded',
      style: {
        'opacity': 0.15
      }
    },
    // 필터 관련 스타일
    {
      selector: '.filtered-dimmed',
      style: {
        'opacity': 0.2
      }
    },
    {
      selector: '.filtered-direct',
      style: {
        'opacity': 1,
        'border-width': 6,
        'border-color': '#f59e0b',
        'border-opacity': 1,
        'overlay-color': '#f59e0b',
        'overlay-opacity': 0.15
      }
    },
    {
      selector: '.filtered-cascade',
      style: {
        'opacity': 1,
        'border-width': 4,
        'border-color': '#a78bfa',
        'border-opacity': 0.8,
        'border-style': 'dashed',
        'overlay-color': '#a78bfa',
        'overlay-opacity': 0.1
      }
    },
    {
      selector: '.filtered-edge',
      style: {
        'opacity': 1,
        'line-color': '#f59e0b',
        'target-arrow-color': '#f59e0b',
        'width': 3
      }
    },
    // 모델 오버레이 노드
    {
      selector: 'node.model-overlay',
      style: {
        'background-color': '#6366f1',
        'border-color': '#4f46e5',
        'border-width': 3,
        'shape': 'round-rectangle',
        'width': 'label',
        'height': 'label',
        'padding': '12px',
        'color': '#ffffff',
        'font-weight': 'bold' as any,
        'font-size': '11px',
        'text-valign': 'center' as any,
        'text-halign': 'center' as any,
        'label': 'data(label)',
        'text-wrap': 'wrap' as any,
        'text-max-width': '120px',
        'overlay-opacity': 0,
        'z-index': 100
      }
    },
    // 모델 엣지 (READS_FIELD)
    {
      selector: 'edge.model-overlay[type="READS_FIELD"]',
      style: {
        'line-color': '#f59e0b',
        'target-arrow-color': '#f59e0b',
        'width': 2,
        'line-style': 'dashed' as any,
        'curve-style': 'bezier' as any,
        'target-arrow-shape': 'triangle' as any,
        'opacity': 0.7,
        'z-index': 99
      }
    },
    // 모델 엣지 (PREDICTS_FIELD)
    {
      selector: 'edge.model-overlay[type="PREDICTS_FIELD"]',
      style: {
        'line-color': '#22c55e',
        'target-arrow-color': '#22c55e',
        'width': 2,
        'line-style': 'dashed' as any,
        'curve-style': 'bezier' as any,
        'target-arrow-shape': 'triangle' as any,
        'opacity': 0.7,
        'z-index': 99
      }
    }
  ]
}

function sanitizeRelationshipsForCanvas(
  rawRelationships: OntologyRelationship[],
  rawNodes: OntologyNode[]
): { relationships: OntologyRelationship[]; skipped: number; rekeyed: number } {
  const nodeIds = new Set(rawNodes.map(node => node.id).filter(Boolean))
  const usedRelationshipIds = new Set<string>()
  const sanitizedRelationships: OntologyRelationship[] = []
  let skipped = 0
  let rekeyed = 0

  rawRelationships.forEach((rawRel, index) => {
    if (!rawRel?.source || !rawRel?.target) {
      skipped += 1
      return
    }

    if (!nodeIds.has(rawRel.source) || !nodeIds.has(rawRel.target)) {
      skipped += 1
      return
    }

    const relType = rawRel.type || 'RELATED_TO'
    const baseId = (rawRel.id || `rel_${rawRel.source}_${rawRel.target}_${relType}`).trim() || `rel_${index + 1}`
    let uniqueId = baseId

    if (usedRelationshipIds.has(uniqueId)) {
      let suffix = 2
      while (usedRelationshipIds.has(`${baseId}__${suffix}`)) {
        suffix += 1
      }
      uniqueId = `${baseId}__${suffix}`
      rekeyed += 1
    }

    usedRelationshipIds.add(uniqueId)
    sanitizedRelationships.push({
      ...rawRel,
      id: uniqueId,
      type: relType
    })
  })

  return {
    relationships: sanitizedRelationships,
    skipped,
    rekeyed
  }
}

function destroyCytoscapeCanvas() {
  resetEdgehandlesInteractionState({ removeTransientEdges: true })

  detachEdgehandleCyEvents()
  edgehandlesInstance?.destroy()
  edgehandlesInstance = null
  if (!cy) return
  cy.destroy()
  cy = null
}

// Cytoscape
function initCytoscape(shouldRestoreSelection: boolean = false) {
  if (!cytoscapeContainer.value) {
    console.warn('Cytoscape container not found')
    return
  }
  
  // 컨테이너 크기 확인
  const rect = cytoscapeContainer.value.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) {
    console.warn('Cytoscape container has no dimensions, retrying...')
    setTimeout(() => initCytoscape(shouldRestoreSelection), 100)
    return
  }
  
  console.log('Initializing Cytoscape with', nodes.value.length, 'nodes and', relationships.value.length, 'relationships')
  
  destroyCytoscapeCanvas()

  // 스키마를 새로 로드한 직후에는 마우스 위치가 우연히 노드 테두리 위에 있어도
  // 연결 모드로 즉시 진입하지 않도록 잠시 보호 시간을 둔다.
  suspendEdgehandlesHover(shouldRestoreSelection ? 1200 : 250)
  
  const elements: cytoscape.ElementDefinition[] = []
  
  // 저장된 위치가 있는지 확인
  const hasPositions = nodes.value.some(node => node.position && node.position.x !== undefined)
  
  // 노드 추가
  nodes.value.forEach(node => {
    const layer = node.layer || node.label
    const nodeData: any = {
      data: {
        id: node.id,
        label: node.name,
        layer: layer,
        color: getLayerColor(layer)
      }
    }
    
    // 저장된 위치가 있으면 사용
    if (node.position && node.position.x !== undefined && node.position.y !== undefined) {
      nodeData.position = { x: node.position.x, y: node.position.y }
    }
    
    elements.push(nodeData)
  })
  
  // 레이어 계층 순서 (낮은 인덱스 = 상위 레이어)
  const layerHierarchy: Record<string, number> = {
    'KPI': 0,
    'Measure': 1,
    'Process': 2,
    'Driver': 3,
    'Resource': 4
  }
  
  // 관계 타입 역전 매핑 (하향 → 상향)
  // 모든 화살표가 아래에서 위로 향하도록
  const relationTypeInversion: Record<string, string> = {
    // 인과관계
    'CAUSES': 'CAUSED_BY',
    'CAUSED_BY': 'CAUSES',
    'AFFECTS': 'AFFECTED_BY',
    'AFFECTED_BY': 'AFFECTS',
    'EFFECTS': 'EFFECTED_BY',
    'EFFECTED_BY': 'EFFECTS',
    // 프로세스 흐름 (좌→우이므로 역전하지 않음)
    'NEXT': 'NEXT',  // NEXT는 방향 유지
    'PREV': 'PREV',
    // 측정관계
    'MEASURED_AS': 'MEASURES',
    'MEASURES': 'MEASURED_AS',
    // 생산관계
    'PRODUCES': 'PRODUCED_BY',
    'PRODUCED_BY': 'PRODUCES',
    'GENERATES': 'GENERATED_BY',
    'GENERATED_BY': 'GENERATES',
    // 영향관계
    'INFLUENCES': 'INFLUENCED_BY',
    'INFLUENCED_BY': 'INFLUENCES',
    'IMPACTS': 'IMPACTED_BY',
    'IMPACTED_BY': 'IMPACTS',
    // 실행관계
    'EXECUTES': 'EXECUTED_BY',
    'EXECUTED_BY': 'EXECUTES',
    'RUNS': 'RUN_BY',
    'RUN_BY': 'RUNS',
    // 지원/요구관계
    'USED_WHEN': 'SUPPORTS',
    'SUPPORTS': 'USED_WHEN',
    'NEEDS': 'PROVIDES',
    'PROVIDES': 'NEEDS',
    // 순서관계
    'PRECEDES': 'FOLLOWS',
    'FOLLOWS': 'PRECEDES',
    // 트리거관계
    'TRIGGERS': 'TRIGGERED_BY',
    'TRIGGERED_BY': 'TRIGGERS',
    // 포함관계
    'BELONGS_TO': 'HAS_PROCEDURE',
    'HAS_PROCEDURE': 'BELONGS_TO',
    'BELONGS_TO_PACKAGE': 'HAS_FILE',
    'LINKS_TO': 'LINKED_FROM',
    // 사용관계
    'USES': 'USED_BY',
    'USED_BY': 'USES',
    'UTILIZES': 'UTILIZED_BY',
    'UTILIZED_BY': 'UTILIZES',
    // 활성화관계
    'ENABLES': 'ENABLED_BY',
    'ENABLED_BY': 'ENABLES',
    // 기여관계
    'CONTRIBUTES_TO': 'CONTRIBUTED_BY',
    'CONTRIBUTED_BY': 'CONTRIBUTES_TO'
  }
  
  // 노드 ID → 레이어 매핑 생성
  const nodeLayerMap: Record<string, string> = {}
  nodes.value.forEach(node => {
    nodeLayerMap[node.id] = node.layer || node.label
  })
  
  // 엣지 추가 (모든 관계를 아래→위 방향으로 정규화)
  // 같은 레이어 내에서는 EFFECTS/AFFECTS 같은 관계를 기준으로 판단
  const upwardRelationTypes = new Set([
    'CAUSES', 'PRODUCES', 'INFLUENCES', 'EXECUTES', 'SUPPORTS',
    'TRIGGERS', 'ENABLES', 'CONTRIBUTES_TO', 'LEADS_TO', 'AFFECTS', 'EFFECTS'
  ])
  
  // 수평 흐름 관계 (좌→우, 역전하지 않음)
  const horizontalRelationTypes = new Set(['NEXT', 'PREV', 'PRECEDES', 'FOLLOWS'])
  
  relationships.value.forEach(rel => {
    const sourceLayer = rel.sourceLayer || nodeLayerMap[rel.source] || 'Process'
    const targetLayer = rel.targetLayer || nodeLayerMap[rel.target] || 'Process'
    
    const sourceRank = layerHierarchy[sourceLayer] ?? 2
    const targetRank = layerHierarchy[targetLayer] ?? 2
    
    let edgeSource = rel.source
    let edgeTarget = rel.target
    let edgeType = rel.type
    
    // 수평 흐름 관계는 역전하지 않음 (프로세스 좌→우 흐름)
    if (horizontalRelationTypes.has(rel.type)) {
      // PRECEDES/FOLLOWS는 NEXT로 통일
      if (rel.type === 'PRECEDES') {
        edgeType = 'NEXT'
      } else if (rel.type === 'FOLLOWS') {
        // FOLLOWS는 역전하여 NEXT로
        edgeSource = rel.target
        edgeTarget = rel.source
        edgeType = 'NEXT'
      }
    }
    // 상위 레이어 → 하위 레이어인 경우 방향 역전
    else if (sourceRank < targetRank) {
      edgeSource = rel.target
      edgeTarget = rel.source
      edgeType = relationTypeInversion[rel.type] || `REV_${rel.type}`
    }
    // 같은 레이어 내에서 하향 관계인 경우 역전 (MEASURED_AS, USED_WHEN 등)
    else if (sourceRank === targetRank) {
      // 상향 관계 타입이 아니면 역전
      if (!upwardRelationTypes.has(rel.type)) {
        edgeSource = rel.target
        edgeTarget = rel.source
        edgeType = relationTypeInversion[rel.type] || `REV_${rel.type}`
      }
    }
    
    elements.push({
      data: {
        id: rel.id,
        source: edgeSource,
        target: edgeTarget,
        type: edgeType,
        label: edgeType,
        weight: rel.weight || 0.5,
        sourceLayer,
        targetLayer
      }
    })
  })
  
  cy = cytoscape({
    container: cytoscapeContainer.value,
    elements,
    style: getCytoscapeStyles(),
    layout: { name: 'preset' }
  })
  
  // 이벤트 핸들러
  cy.on('tap', 'node', (evt) => {
    const nodeId = evt.target.id()
    resetEdgehandlesInteractionState()
    suspendEdgehandlesHover(150)

    if (pendingRelationSourceId.value) {
      completePendingRelation(nodeId)
      return
    }

    selectNode(nodeId)
  })
  
  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      if (pendingRelationSourceId.value) {
        cancelPendingRelation()
        return
      }
      if (showRelationEditor.value || editingRelation.value) {
        closeRelationEditor()
      }
      deselectNode()
    }
  })
  
  // 모델 노드 클릭 → 상세 정보 표시 (모델 오버레이)
  cy.on('tap', 'node.model-overlay', (evt) => {
    const modelCyId = evt.target.id() // "model-xxx"
    const modelId = modelCyId.replace('model-', '')
    const model = modelOverlayData.value.find(m => m.modelId === modelId)
    if (model) {
      const detail = `모델: ${model.name}\n상태: ${model.status}\n입력: ${model.inputs.map(i => i.field).join(', ')}\n출력: ${model.outputs.map(o => o.field).join(', ')}`
      if (confirm(`${detail}\n\n이 모델을 삭제하시겠습니까?`)) {
        deleteModelFromOverlay(modelId)
      }
    }
  })

  // 노드 우클릭 → 컨텍스트 메뉴 (필터/이름변경/삭제)
  cy.on('cxttap', 'node:not(.model-overlay)', (evt) => {
    const nodeId = evt.target.id()
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) return
    
    // 브라우저 기본 컨텍스트 메뉴 차단은 @contextmenu.prevent로 처리됨
    const container = cytoscapeContainer.value
    if (!container) return
    
    const graphPanel = container.parentElement
    const graphRect = graphPanel?.getBoundingClientRect() || container.getBoundingClientRect()
    
    // 노드의 렌더링 좌표를 스크린 좌표로 변환
    const renderedPos = evt.target.renderedPosition()
    const containerRect = container.getBoundingClientRect()
    
    contextMenuPos.value = {
      x: containerRect.left + renderedPos.x - graphRect.left,
      y: containerRect.top + renderedPos.y - graphRect.top
    }
    contextMenuMode.value = 'node'
    contextMenuNodeId.value = nodeId
    contextMenuNodeName.value = node.name
    showContextMenu.value = true
  })
  
  // 엣지 우클릭 → 속성 편집/삭제 컨텍스트 메뉴
  cy.on('cxttap', 'edge', (evt) => {
    const edge = evt.target
    const edgeId = edge.id()
    const edgeType = edge.data('type') || edge.data('label') || 'RELATION'
    const sourceName = getNodeName(edge.data('source'))
    const targetName = getNodeName(edge.data('target'))
    
    const container = cytoscapeContainer.value
    if (!container) return
    
    const graphPanel = container.parentElement
    const graphRect = graphPanel?.getBoundingClientRect() || container.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    
    // 엣지 중간점의 렌더링 좌표 (renderedMidpoint 사용)
    const midpoint = edge.renderedMidpoint ? edge.renderedMidpoint() : edge.midpoint()
    
    contextMenuPos.value = {
      x: containerRect.left + midpoint.x - graphRect.left,
      y: containerRect.top + midpoint.y - graphRect.top
    }
    contextMenuMode.value = 'edge'
    contextMenuEdgeId.value = edgeId
    contextMenuEdgeLabel.value = `${sourceName} → ${targetName}`
    showContextMenu.value = true
  })
  
  // 캔버스 빈 영역 우클릭 → 새 노드 추가 컨텍스트 메뉴
  cy.on('cxttap', (evt) => {
    if (evt.target === cy) {
      const container = cytoscapeContainer.value
      if (!container) return
      
      const graphPanel = container.parentElement
      const graphRect = graphPanel?.getBoundingClientRect() || container.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      
      const originalEvent = evt.originalEvent as MouseEvent
      
      contextMenuPos.value = {
        x: originalEvent.clientX - graphRect.left,
        y: originalEvent.clientY - graphRect.top
      }
      
      // Cytoscape 캔버스 좌표 (노드 배치용)
      const zoom = cy!.zoom()
      const pan = cy!.pan()
      contextMenuGraphPos.value = {
        x: (originalEvent.clientX - containerRect.left - pan.x) / zoom,
        y: (originalEvent.clientY - containerRect.top - pan.y) / zoom
      }
      
      contextMenuMode.value = 'canvas'
      showContextMenu.value = true
    }
  })
  
  // 노드 드래그 완료 시 위치 동기화
  cy.on('dragfree', 'node', (evt) => {
    const nodeId = evt.target.id()
    const pos = evt.target.position()
    
    // nodes.value에서 해당 노드의 position 업데이트
    const nodeIndex = nodes.value.findIndex(n => n.id === nodeId)
    if (nodeIndex !== -1) {
      nodes.value[nodeIndex] = {
        ...nodes.value[nodeIndex],
        position: { x: pos.x, y: pos.y }
      }
    }
  })
  
  // 엣지 더블클릭 - 릴레이션 속성 편집 다이얼로그
  cy.on('dblclick', 'edge', (evt) => {
    const edge = evt.target
    const edgeId = edge.id()
    openRelationEditor(edgeId)
  })
  
  // Edgehandles 초기화 - 관계 생성 모드에서 노드 테두리 드래그로 관계 생성
  initEdgehandles()
  
    // 저장된 위치가 있으면 레이아웃 적용하지 않음, 없으면 계층형 레이아웃 적용
  if (hasPositions) {
    // 저장된 위치 사용 - fit만 수행
    cy.fit(undefined, 50)
    console.log('Using saved node positions')
    
    // 저장된 노드 자동 선택: 그래프 그려진 뒤 오버레이(선택) 적용 (애니메이션 여유 후)
    if (shouldRestoreSelection && currentSchemaId.value) {
      setTimeout(() => {
        restoreSelectedNode()
      }, 600)
    }
  } else {
    // 위치가 없으면 레이아웃 적용
    const layout = applyLayout()
    console.log('Applying layout')
    
    // 레이아웃 완료 후 저장된 노드 자동 선택 (애니메이션 끝난 뒤 오버레이 적용)
    if (shouldRestoreSelection && currentSchemaId.value) {
      if (layout) {
        // 레이아웃 객체가 있으면 (cose, circle, grid) layoutstop = 애니메이션 종료 후
        layout.one('layoutstop', () => {
          setTimeout(() => restoreSelectedNode(), 100)
        })
      } else {
        // 계층형 레이아웃은 동기 실행 → 그래프 그려진 뒤 여유 시간 두고 선택
        setTimeout(() => {
          restoreSelectedNode()
        }, 600)
      }
    }
  }
}

// 저장된 노드 복원
function restoreSelectedNode() {
  if (!currentSchemaId.value) return
  
  const savedNodeId = getSelectedNodeIdForSchema(currentSchemaId.value)
  console.log('🔍 저장된 노드 확인:', { savedNodeId, currentSchemaId: currentSchemaId.value, nodesCount: nodes.value.length })
  
  if (savedNodeId && nodes.value.some(n => n.id === savedNodeId)) {
    // 저장된 노드가 현재 스키마에 존재하면 자동 선택
    console.log(`📌 저장된 노드 자동 선택: ${savedNodeId}`)
    selectNode(savedNodeId)
  } else {
    console.log('❌ 저장된 노드를 찾을 수 없음:', { savedNodeId, availableNodes: nodes.value.map(n => n.id).slice(0, 5) })
  }
}

// Edgehandles 초기화 - Shift + 노드 가장자리 드래그로 관계 생성
function initEdgehandles() {
  if (!cy) return
  
  detachEdgehandleCyEvents()

  // 기존 인스턴스 정리
  if (edgehandlesInstance) {
    edgehandlesInstance.destroy()
    edgehandlesInstance = null
  }
  
  edgehandlesInstance = cy.edgehandles({
    preview: true,
    hoverDelay: 0,
    handleNodes: 'node',
    handlePosition: () => 'middle top',
    handleInDrawMode: true,
    edgeType: () => 'flat',
    loopAllowed: () => false,
    nodeLoopOffset: -50,
    snap: true,
    snapThreshold: 80,
    snapFrequency: 10,
    noEdgeEventsInDraw: false,
    disableBrowserGestures: true,
    handleColor: '#00d9ff',
    handleOutlineColor: '#ffffff',
    handleOutlineWidth: 3,
    handleSize: 14,
    handleHitThreshold: 50,
    edgeParams: () => ({
      data: { type: 'CAUSES' }
    })
  })

  edgehandlesBoundCy = cy

  // 드래그 시작 시 - zoom 미세 조절로 렌더링 문제 회피
  edgehandlesStartHandler = () => {
    isDraggingHandle.value = true
    const currentZoom = cy?.zoom() || 1
    cy?.zoom(currentZoom * 1.001)
    setTimeout(() => {
      cy?.zoom(currentZoom)
    }, 50)
  }
  cy.on('ehstart', edgehandlesStartHandler)

  edgehandlesCompleteHandler = (evt: any, sourceNode: any, targetNode: any, addedEles: any) => {
    handleEdgehandlesComplete(evt, sourceNode, targetNode, addedEles)
  }
  cy.on('ehcomplete', edgehandlesCompleteHandler)
  
  // 드래그 종료 시 - 모든 상태 초기화
  edgehandlesStopHandler = () => {
    resetEdgehandlesInteractionState({
      removeTransientEdges: true
    })
  }
  cy.on('ehstop', edgehandlesStopHandler)
  cy.on('ehcancel', edgehandlesStopHandler)
  
  // 다른 노드 위에 올라갔을 때 (스냅 대상)
  edgehandlesShowHandler = (_evt: any, targetNode: any) => {
    cy?.nodes().removeClass('eh-presumptive-target')
    targetNode.addClass('eh-presumptive-target')
  }
  cy.on('ehshow', edgehandlesShowHandler)
  
  // 노드에서 벗어났을 때 (스냅 해제)
  edgehandlesHideHandler = (_evt: any, targetNode: any) => {
    targetNode.removeClass('eh-presumptive-target')
  }
  cy.on('ehhide', edgehandlesHideHandler)
  
  // 테두리 영역 판별 함수 (노드 반지름의 65% 이상이면 테두리 영역)
  const isOnBorder = (node: any, mousePos: { x: number, y: number }) => {
    const pos = node.position()
    const width = node.width()
    const radius = width / 2
    const distance = Math.sqrt(Math.pow(mousePos.x - pos.x, 2) + Math.pow(mousePos.y - pos.y, 2))
    const borderThreshold = radius * 0.65
    return distance >= borderThreshold
  }
  
  // 노드 위에서 마우스 이동 - 관계 생성 모드일 때만 가장자리 드래그로 연결 생성
  edgehandlesMousemoveHandler = (evt: any) => {
    if (isDraggingHandle.value) return
    
    const node = evt.target
    const nodeId = node.id()
    const mousePos = evt.position
    const hoverSuspended = Date.now() < edgehandlesHoverSuspendUntil
    const wantsConnectionMode = isRelationDrawModeEnabled.value && !hoverSuspended && !showNewRelationDialog.value && !loading.value && !isLoadingSchema.value

    if (!wantsConnectionMode) {
      if (hoveredNodeId.value) {
        resetEdgehandlesInteractionState()
      }
      return
    }
    
    if (isOnBorder(node, mousePos)) {
      // 테두리 영역 - 연결 모드 활성화
      if (hoveredNodeId.value !== nodeId) {
        // 이전 호버 정리
        if (hoveredNodeId.value) {
          const prevNode = cy?.getElementById(hoveredNodeId.value)
          prevNode?.removeClass('eh-hover')
          prevNode?.grabify()
        }
        
        hoveredNodeId.value = nodeId
        node.addClass('eh-hover')
        node.ungrabify()
        edgehandlesInstance?.enableDrawMode()
      }
    } else {
      // 중앙 영역 - 이동 모드
      if (hoveredNodeId.value === nodeId) {
        resetEdgehandlesInteractionState()
      }
    }
  }
  cy.on('mousemove', 'node', edgehandlesMousemoveHandler)
  
  // 노드 마우스 아웃 - 상태 정리
  edgehandlesMouseoutHandler = (evt: any) => {
    if (isDraggingHandle.value) return
    
    const node = evt.target
    const nodeId = node.id()
    
    if (hoveredNodeId.value === nodeId) {
      resetEdgehandlesInteractionState()
    }
  }
  cy.on('mouseout', 'node', edgehandlesMouseoutHandler)
  
  // 초기 상태: drawMode 비활성화 (노드 이동 가능)
  resetEdgehandlesInteractionState({ removeTransientEdges: true })
}

/**
 * 정교한 계층형 레이아웃
 * - KPI가 맨 위, Resource가 맨 아래
 * - 레이어 내에서도 의존성에 따라 레벨링 (영향받는 노드가 더 위로)
 * - Driver(외생변수)는 연결된 노드 근처에 배치
 * - 모든 화살표가 위로 향하도록 배치
 */
function applyHierarchicalLayout() {
  if (!cy) return null
  
  // 레이어 계층 정의 (낮은 값 = 상위)
  const layerRank: Record<string, number> = {
    'KPI': 0,
    'Measure': 1,
    'Process': 2,
    'Driver': 3,
    'Resource': 4
  }
  
  // 1. 노드 정보 수집
  const nodeInfoMap: Record<string, {
    id: string
    layer: string
    layerRank: number
    incomingEdges: string[]
    outgoingEdges: string[]
    depth: number
    connectedWeight: number  // 연결 가중치 (X 위치 결정용)
  }> = {}
  
  // 노드 초기화
  cy.nodes().forEach(node => {
    const layer = node.data('layer') as string
    nodeInfoMap[node.id()] = {
      id: node.id(),
      layer,
      layerRank: layerRank[layer] ?? 2,
      incomingEdges: [],
      outgoingEdges: [],
      depth: 0,
      connectedWeight: 0
    }
  })
  
  // 엣지 정보 수집
  cy.edges().forEach(edge => {
    const source = edge.data('source') as string
    const target = edge.data('target') as string
    
    if (nodeInfoMap[source]) {
      nodeInfoMap[source].outgoingEdges.push(target)
    }
    if (nodeInfoMap[target]) {
      nodeInfoMap[target].incomingEdges.push(source)
    }
  })
  
  // 2. 의존성 깊이 계산 (토폴로지컬 정렬 방식)
  function calculateDepth(nodeId: string, visited: Set<string>, currentDepth: number) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    
    const info = nodeInfoMap[nodeId]
    if (!info) return
    
    info.depth = Math.max(info.depth, currentDepth)
    
    info.incomingEdges.forEach(srcId => {
      const srcInfo = nodeInfoMap[srcId]
      if (srcInfo && srcInfo.layerRank === info.layerRank) {
        calculateDepth(srcId, visited, currentDepth + 1)
      }
    })
  }
  
  // 각 레이어별로 depth 계산
  ['KPI', 'Measure', 'Process', 'Driver', 'Resource'].forEach(layer => {
    const nodesInLayer = Object.values(nodeInfoMap).filter(n => n.layer === layer)
    const terminalNodes = nodesInLayer.filter(n => 
      !n.outgoingEdges.some(tId => nodeInfoMap[tId]?.layer === layer)
    )
    terminalNodes.forEach(node => {
      calculateDepth(node.id, new Set(), 0)
    })
  })
  
  // 3. 레이아웃 상수
  const LAYER_BASE_Y = 80
  const LAYER_SPACING = 180
  const DEPTH_SPACING = 80
  const NODE_X_SPACING = 160
  const PROCESS_X_SPACING = 180
  
  // 위치 저장
  const positions: Record<string, { x: number, y: number }> = {}
  
  // 4. 레이어별로 노드 그룹화 (Driver 포함)
  const layerNodes: Record<string, string[]> = {
    'KPI': [],
    'Measure': [],
    'Process': [],
    'Driver': [],
    'Resource': []
  }
  
  Object.values(nodeInfoMap).forEach(info => {
    if (layerNodes[info.layer]) {
      layerNodes[info.layer].push(info.id)
    }
  })
  
  // 5. 프로세스 노드 배치 (좌→우, NEXT 관계 기반)
  const processY = LAYER_BASE_Y + layerRank['Process'] * LAYER_SPACING
  const processNodes = layerNodes['Process']
  
  if (processNodes.length > 0) {
    const processOrder: string[] = []
    const processSet = new Set(processNodes)
    const visited = new Set<string>()
    
    // 시작 노드 찾기
    const startNodes = processNodes.filter(nodeId => {
      const info = nodeInfoMap[nodeId]
      return !info.incomingEdges.some(srcId => processSet.has(srcId))
    })
    
    function traverseProcess(nodeId: string) {
      if (visited.has(nodeId) || !processSet.has(nodeId)) return
      visited.add(nodeId)
      processOrder.push(nodeId)
      
      const info = nodeInfoMap[nodeId]
      info.outgoingEdges.forEach(targetId => {
        if (processSet.has(targetId)) {
          traverseProcess(targetId)
        }
      })
    }
    
    startNodes.forEach(startNode => traverseProcess(startNode))
    processNodes.forEach(nodeId => {
      if (!visited.has(nodeId)) processOrder.push(nodeId)
    })
    
    processOrder.forEach((nodeId, idx) => {
      positions[nodeId] = {
        x: 100 + idx * PROCESS_X_SPACING,
        y: processY
      }
    })
  }
  
  // 6. KPI, Measure 노드 배치 (depth 기반)
  const mainLayers = ['KPI', 'Measure']
  
  mainLayers.forEach(layer => {
    const nodes = layerNodes[layer]
    if (nodes.length === 0) return
    
    const baseY = LAYER_BASE_Y + layerRank[layer] * LAYER_SPACING
    
    // depth별로 그룹화
    const depthGroups: Record<number, string[]> = {}
    nodes.forEach(nodeId => {
      const info = nodeInfoMap[nodeId]
      if (!depthGroups[info.depth]) depthGroups[info.depth] = []
      depthGroups[info.depth].push(nodeId)
    })
    
    const sortedDepths = Object.keys(depthGroups).map(Number).sort((a, b) => a - b)
    
    sortedDepths.forEach((depth, depthIdx) => {
      const nodesAtDepth = depthGroups[depth]
      const y = baseY + depthIdx * DEPTH_SPACING
      
      nodesAtDepth.forEach((nodeId, idx) => {
        positions[nodeId] = {
          x: 100 + (idx + 1) * NODE_X_SPACING,
          y
        }
      })
    })
  })
  
  // 7. Resource 노드 배치
  const resourceNodes = layerNodes['Resource']
  if (resourceNodes.length > 0) {
    const baseY = LAYER_BASE_Y + layerRank['Resource'] * LAYER_SPACING
    
    resourceNodes.forEach((nodeId, idx) => {
      positions[nodeId] = {
        x: 100 + (idx + 1) * NODE_X_SPACING,
        y: baseY
      }
    })
  }
  
  // 8. Driver 노드 배치 - 연결된 노드 근처에 배치 (핵심 개선)
  const driverNodes = layerNodes['Driver']
  const driverY = LAYER_BASE_Y + layerRank['Driver'] * LAYER_SPACING
  
  if (driverNodes.length > 0) {
    // 각 Driver의 목표 X 위치 계산 (연결된 노드들의 평균 X)
    const driverTargetX: Record<string, number> = {}
    
    driverNodes.forEach(driverId => {
      const info = nodeInfoMap[driverId]
      const connectedXs: number[] = []
      
      // 나가는 연결(CAUSES, INFLUENCES 등)의 타겟 위치
      info.outgoingEdges.forEach(targetId => {
        if (positions[targetId]) {
          connectedXs.push(positions[targetId].x)
        }
      })
      
      // 들어오는 연결의 소스 위치
      info.incomingEdges.forEach(sourceId => {
        if (positions[sourceId]) {
          connectedXs.push(positions[sourceId].x)
        }
      })
      
      if (connectedXs.length > 0) {
        // 연결된 노드들의 평균 X 위치
        driverTargetX[driverId] = connectedXs.reduce((a, b) => a + b, 0) / connectedXs.length
      } else {
        // 연결 없으면 기본 위치
        driverTargetX[driverId] = 100 + Object.keys(driverTargetX).length * NODE_X_SPACING
      }
    })
    
    // X 위치로 정렬하여 겹침 방지
    const sortedDrivers = [...driverNodes].sort((a, b) => 
      (driverTargetX[a] ?? 0) - (driverTargetX[b] ?? 0)
    )
    
    // 겹침 방지하며 배치
    const minSpacing = NODE_X_SPACING * 0.8
    let lastX = -Infinity
    
    sortedDrivers.forEach((driverId) => {
      let targetX = driverTargetX[driverId]
      
      // 이전 노드와 겹치면 밀어내기
      if (targetX < lastX + minSpacing) {
        targetX = lastX + minSpacing
      }
      
      positions[driverId] = {
        x: targetX,
        y: driverY
      }
      
      lastX = targetX
    })
  }
  
  // 9. 2차 조정: 연결된 노드 쪽으로 미세 조정 (포스 기반)
  const iterations = 3
  for (let iter = 0; iter < iterations; iter++) {
    // Driver 노드들을 연결된 노드 쪽으로 당기기
    driverNodes.forEach(driverId => {
      const info = nodeInfoMap[driverId]
      if (!positions[driverId]) return
      
      let pullX = 0
      let pullCount = 0
      
      // 연결된 노드들의 X 위치로 당기기
      const connectedNodes = info.outgoingEdges.concat(info.incomingEdges)
      connectedNodes.forEach(connectedId => {
        if (positions[connectedId]) {
          pullX += (positions[connectedId].x - positions[driverId].x) * 0.1
          pullCount++
        }
      })
      
      if (pullCount > 0) {
        positions[driverId].x += pullX / pullCount
      }
    })
    
    // 겹침 재조정
    const sortedDrivers = driverNodes.slice().sort((a, b) => 
      (positions[a]?.x ?? 0) - (positions[b]?.x ?? 0)
    )
    
    const minSpacing = NODE_X_SPACING * 0.7
    for (let i = 1; i < sortedDrivers.length; i++) {
      const prev = sortedDrivers[i - 1]
      const curr = sortedDrivers[i]
      if (positions[curr] && positions[prev]) {
        if (positions[curr].x < positions[prev].x + minSpacing) {
          positions[curr].x = positions[prev].x + minSpacing
        }
      }
    }
  }
  
  // 10. 위치 적용
  cy.nodes().forEach(node => {
    const pos = positions[node.id()]
    if (pos) {
      node.position(pos)
    }
  })
  
  cy.fit(undefined, 50)
  
  // 계층형 레이아웃은 동기적으로 실행되므로 null 반환 (이벤트 없음)
  return null
}

function applyLayout() {
  if (!cy) return null
  
  let layoutOptions: cytoscape.LayoutOptions
  
  switch (currentLayout.value) {
    case 'hierarchical':
      return applyHierarchicalLayout()
      
    case 'cose':
      layoutOptions = {
        name: 'cose',
        animate: true,
        animationDuration: 500,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 100
      }
      break
      
    case 'circle':
      layoutOptions = {
        name: 'circle',
        animate: true,
        animationDuration: 500
      }
      break
      
    case 'grid':
      layoutOptions = {
        name: 'grid',
        animate: true,
        animationDuration: 500,
        rows: Math.ceil(Math.sqrt(nodes.value.length))
      }
      break
      
    default:
      layoutOptions = { name: 'cose' }
  }
  
  return cy.layout(layoutOptions).run()
}

function cycleLayout() {
  const layouts = ['hierarchical', 'cose', 'circle', 'grid']
  const currentIdx = layouts.indexOf(currentLayout.value)
  currentLayout.value = layouts[(currentIdx + 1) % layouts.length]
  applyLayout()
}

function fitGraph() {
  cy?.fit(undefined, 50)
}

function exportImage() {
  if (!cy) return
  const png = cy.png({ scale: 2, full: true })
  const link = document.createElement('a')
  link.href = png
  link.download = 'multi-layer-ontology.png'
  link.click()
}

// Data source auto-linking progress
const linkingProgress = ref<{
  completed: number
  total: number
  currentNode: string
  nodeStatuses: Record<string, { status: string; message: string }>
}>({
  completed: 0,
  total: 0,
  currentNode: '',
  nodeStatuses: {}
})

// Data source auto-linking with streaming
async function autoLinkDataSources() {
  if (nodes.value.length === 0) {
    alert('먼저 온톨로지를 생성하거나 로드하세요.')
    return
  }
  
  showDataSourceDialog.value = true
  linkingDataSources.value = true
  dataSourceMappings.value = {}
  
  // 진행 상황 초기화
  linkingProgress.value = {
    completed: 0,
    total: nodes.value.length,
    currentNode: '',
    nodeStatuses: {}
  }
  
  // 각 노드를 searching 상태로 초기화
  nodes.value.forEach(n => {
    linkingProgress.value.nodeStatuses[n.id] = {
      status: 'pending',
      message: '대기 중'
    }
  })
  
  try {
    // 노드 데이터 준비
    const nodeData = nodes.value.map(n => ({
      id: n.id,
      name: n.name,
      layer: n.layer || n.label,
      description: n.description || ''
    }))
    
    // 스트리밍 API 호출
    const response = await fetch('/api/gateway/ontology/auto-link-datasource/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes: nodeData })
    })
    
    if (!response.ok) {
      throw new Error('스트리밍 연결 실패')
    }
    
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    
    if (!reader) {
      throw new Error('스트리밍 리더 없음')
    }
    
    let buffer = ''
    
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      
      // SSE 이벤트 파싱
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6))
            
            if (event.type === 'progress') {
              // 진행 상황 업데이트
              linkingProgress.value.nodeStatuses[event.node_id] = {
                status: event.status,
                message: event.message
              }
              linkingProgress.value.completed = event.completed || linkingProgress.value.completed
              linkingProgress.value.currentNode = event.node_id
            } else if (event.type === 'result') {
              // 최종 결과
              dataSourceMappings.value = event.data.mappings || {}
            } else if (event.type === 'error') {
              alert(`오류: ${event.message}`)
            }
          } catch (e) {
            console.warn('SSE 파싱 오류:', e)
          }
        }
      }
    }
    
  } catch (err) {
    console.error('Auto-link error:', err)
    
    // 폴백: 일반 API 호출
    try {
      const nodeData = nodes.value.map(n => ({
        id: n.id,
        name: n.name,
        layer: n.layer || n.label,
        description: n.description || ''
      }))
      
      const response = await fetch('/api/gateway/ontology/auto-link-datasource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: nodeData })
      })
      
      if (response.ok) {
        const result = await response.json()
        dataSourceMappings.value = result.mappings || {}
      } else {
        const error = await response.json()
        alert(`데이터 소스 연결 실패: ${error.detail || '알 수 없는 오류'}`)
      }
    } catch (fallbackErr) {
      alert('데이터 소스 자동 연결 중 오류가 발생했습니다.')
    }
  } finally {
    linkingDataSources.value = false
  }
}

function toggleCandidateExpanded(nodeId: string, candidateIdx: number) {
  const key = `${nodeId}-${candidateIdx}`
  if (expandedCandidates.value.has(key)) {
    expandedCandidates.value.delete(key)
  } else {
    expandedCandidates.value.add(key)
  }
}

function formatSampleValue(value: any): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'number') {
    return value.toLocaleString('ko-KR')
  }
  if (typeof value === 'string' && value.length > 20) {
    return value.substring(0, 20) + '...'
  }
  return String(value)
}

async function confirmDataSourceMapping(nodeId: string, candidate: any) {
  try {
    const response = await fetch('/api/gateway/ontology/confirm-datasource', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId, candidate })
    })
    
    if (response.ok) {
      const result = await response.json()
      
      // 매핑 상태 업데이트
      if (dataSourceMappings.value[nodeId]) {
        dataSourceMappings.value[nodeId].status = 'confirmed'
        dataSourceMappings.value[nodeId].selected_candidate = candidate
      }
      
      // 노드 업데이트 (반응성을 위해 새 객체로 교체)
      const nodeIndex = nodes.value.findIndex(n => n.id === nodeId)
      if (nodeIndex !== -1) {
        const updatedNode = {
          ...nodes.value[nodeIndex],
          dataSource: candidate.table_name,
          dataSourceSchema: {
            columns: candidate.columns || [],
            sql: candidate.suggested_sql || '',
            row_count: typeof candidate.row_count === 'number' && candidate.row_count > 0 ? candidate.row_count : 0,
            datasource: candidate.datasource || '',
          }
        }
        // Vue 반응성을 위해 배열 교체
        nodes.value = [
          ...nodes.value.slice(0, nodeIndex),
          updatedNode,
          ...nodes.value.slice(nodeIndex + 1)
        ]
      }

      const candidateColumns = normalizeColumnNames(candidate.columns)
      const candidateColumnSet = new Set(candidateColumns)
      const clearedMappings: string[] = []
      let hasClearedMappings = false

      if (showRelationEditor.value && editingRelation.value) {
        const relationEditorError =
          candidateColumns.length > 0
            ? ''
            : `데이터 소스 '${candidate.table_name}'의 컬럼 정보를 조회하지 못했습니다.`

        if (editingRelation.value.source === nodeId) {
          sourceNodeColumns.value = candidateColumns
          sourceColumnStatus.value = candidateColumns.length > 0 ? 'ready' : 'error'
          sourceColumnError.value = relationEditorError
          if (!candidateColumnSet.has(editingRelationForm.value.fromField)) {
            editingRelationForm.value.fromField = ''
          }
        }

        if (editingRelation.value.target === nodeId) {
          targetNodeColumns.value = candidateColumns
          targetColumnStatus.value = candidateColumns.length > 0 ? 'ready' : 'error'
          targetColumnError.value = relationEditorError
          if (!candidateColumnSet.has(editingRelationForm.value.toField)) {
            editingRelationForm.value.toField = ''
          }
        }
      }

      relationships.value = relationships.value.map(rel => {
        if (rel.source !== nodeId && rel.target !== nodeId) {
          return rel
        }

        let nextRel = rel
        let relationChanged = false

        if (rel.source === nodeId && rel.fromField && !candidateColumnSet.has(rel.fromField)) {
          clearedMappings.push(`${getNodeName(rel.source)} → ${getNodeName(rel.target)}: From 필드 '${rel.fromField}' 삭제`)
          nextRel = { ...nextRel, fromField: undefined }
          relationChanged = true
        }

        if (rel.target === nodeId && rel.toField && !candidateColumnSet.has(rel.toField)) {
          clearedMappings.push(`${getNodeName(rel.source)} → ${getNodeName(rel.target)}: To 필드 '${rel.toField}' 삭제`)
          nextRel = { ...nextRel, toField: undefined }
          relationChanged = true
        }

        if (relationChanged && ((nextRel.fromField && !nextRel.toField) || (!nextRel.fromField && nextRel.toField))) {
          if (nextRel.fromField) {
            clearedMappings.push(`${getNodeName(nextRel.source)} → ${getNodeName(nextRel.target)}: 짝이 없는 From 필드 '${nextRel.fromField}' 삭제`)
          }
          if (nextRel.toField) {
            clearedMappings.push(`${getNodeName(nextRel.source)} → ${getNodeName(nextRel.target)}: 짝이 없는 To 필드 '${nextRel.toField}' 삭제`)
          }
          nextRel = {
            ...nextRel,
            fromField: undefined,
            toField: undefined
          }
        }

        if (relationChanged) {
          hasClearedMappings = true
        }

        return nextRel
      })
      
      // Cytoscape 노드 스타일 업데이트
      if (cy) {
        cy.$(`#${nodeId}`).addClass('has-datasource')
      }
      
      // 선택된 노드가 현재 노드면 상세 패널 강제 업데이트
      if (selectedNodeId.value === nodeId) {
        // 노드를 다시 선택하여 상세 패널 갱신
        const tempId = selectedNodeId.value
        selectedNodeId.value = null
        await nextTick()
        selectedNodeId.value = tempId
        
        // 데이터 탭이 활성화되어 있으면 데이터 자동 로드
        if (detailPanelTab.value === 'data') {
          await fetchNodeData(nodeId)
        }
      }

      if (hasClearedMappings) {
        alert(
          `데이터 소스 재설정으로 기존 필드 매핑 일부가 자동 삭제되었습니다.\n\n${clearedMappings.join('\n')}\n\n필요하면 릴레이션 속성 패널에서 다시 설정해주세요.`
        )
      }
      
      // 성공 메시지 (간단하게)
      // console.log('✅ 데이터 소스 연결 완료:', result.message || `노드에 '${candidate.table_name}' 연결됨`)
    } else {
      const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }))
      alert(`데이터 소스 확정 실패: ${error.detail || '알 수 없는 오류'}`)
    }
  } catch (err) {
    console.error('Confirm datasource error:', err)
    alert('데이터 소스 확정 중 오류가 발생했습니다.')
  }
}

function normalizeTableRef(tableName: string, datasource: string): string {
  const clean = String(tableName || '').replace(/["`]/g, '')
  const parts = clean.split('.').filter(Boolean)
  const ds = String(datasource || '').trim()
  if (!ds) return clean
  if (parts.length === 3 && parts[0].toLowerCase() === ds.toLowerCase()) {
    return `${parts[1]}.${parts[2]}`
  }
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
  }
  return clean
}

function toObjectRows(rows: any[], columns: any[]): any[] {
  if (!Array.isArray(rows) || rows.length === 0) return []
  if (Array.isArray(rows[0])) {
    return rows.map((row: any[]) => {
      const out: Record<string, any> = {}
      columns.forEach((c: any, i: number) => {
        out[String(c)] = row[i]
      })
      return out
    })
  }
  return rows
}

async function probeRowCounts(runId: number) {
  const PROBE_LIMIT = 11
  const CONCURRENCY = 2

  for (let i = 0; i < nodeSearchResults.value.length; i += CONCURRENCY) {
    if (runId !== nodeSearchProbeRunId.value) {
      return
    }

    const batch = nodeSearchResults.value.slice(i, i + CONCURRENCY)
    await Promise.allSettled(batch.map(async (candidate) => {
      if (runId !== nodeSearchProbeRunId.value) {
        return
      }

      try {
        const tableRef = normalizeTableRef(candidate.table_name, candidate.datasource || '')
        const sql = `SELECT * FROM ${tableRef} LIMIT ${PROBE_LIMIT}`
        const response = await fetch('/api/gateway/text2sql/direct-sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sql,
            datasource: candidate.datasource,
            max_sql_seconds: 15,
            format_with_ai: false
          })
        })

        if (!response.ok) {
          candidate.row_count = -1
          candidate.row_count_approx = false
          return
        }

        const result = await response.json()
        const rowsRaw = result.rows || result.data || []
        const columns = result.columns || []
        const hasMoreThanTen = rowsRaw.length >= PROBE_LIMIT
        candidate.row_count = hasMoreThanTen ? PROBE_LIMIT - 1 : rowsRaw.length
        candidate.row_count_approx = hasMoreThanTen
        candidate.columns = columns.length > 0 ? columns : candidate.columns
        candidate.sample_data = toObjectRows(rowsRaw.slice(0, 10), columns.length > 0 ? columns : candidate.columns)
      } catch (err) {
        candidate.row_count = -1
        candidate.row_count_approx = false
      }
    }))
  }
}

async function loadSampleData(candidate: any) {
  sampleDataLoading.value = true
  sampleData.value = []
  showSampleDataDialog.value = true
  
  try {
    // 후보의 sample_data가 이미 있으면 사용
    if (candidate.sample_data && candidate.sample_data.length > 0) {
      sampleData.value = candidate.sample_data
    } else if (candidate?.table_name && candidate?.datasource) {
      // 자연어 검색 결과 후보는 노드 미확정 상태일 수 있으므로 후보 자체로 직접 조회
      const tableRef = normalizeTableRef(candidate.table_name, candidate.datasource)
      const sql = `SELECT * FROM ${tableRef} LIMIT 10`
      const response = await fetch('/api/gateway/text2sql/direct-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql,
          datasource: candidate.datasource,
          max_sql_seconds: 30,
          format_with_ai: false
        })
      })
      if (response.ok) {
        const result = await response.json()
        const rowsRaw = result.rows || result.data || []
        const columns = result.columns || []
        sampleData.value = toObjectRows(rowsRaw, columns)
      }
    } else {
      // API 호출하여 샘플 데이터 가져오기
      const response = await fetch(`/api/gateway/ontology/node/${selectedMappingNodeId.value}/sample-data?limit=10`)
      if (response.ok) {
        const result = await response.json()
        const nested = result.data || {}
        const rowsRaw = nested.data || nested.rows || []
        const columns = nested.columns || []
        sampleData.value = toObjectRows(rowsRaw, columns)
      }
    }
  } catch (err) {
    console.error('Load sample data error:', err)
  } finally {
    sampleDataLoading.value = false
  }
}

async function confirmAllSelectedMappings() {
  const mappings = Object.entries(dataSourceMappings.value)
  const toConfirm = mappings.filter(([nodeId, mapping]) => 
    mapping.selected_candidate && mapping.status !== 'confirmed'
  )
  
  if (toConfirm.length === 0) {
    alert('확정할 후보가 없습니다.')
    return
  }
  
  if (!confirm(`${toConfirm.length}개 노드의 데이터 소스를 확정하시겠습니까?`)) {
    return
  }
  
  let successCount = 0
  let failCount = 0
  
  for (const [nodeId, mapping] of toConfirm) {
    try {
      await confirmDataSourceMapping(nodeId, mapping.selected_candidate)
      successCount++
    } catch (err) {
      console.error(`Failed to confirm mapping for ${nodeId}:`, err)
      failCount++
    }
  }
  
  if (successCount > 0) {
    // 선택된 노드가 있으면 상세 패널 업데이트
    if (selectedNodeId.value) {
      const tempId = selectedNodeId.value
      selectedNodeId.value = null
      await nextTick()
      selectedNodeId.value = tempId
    }
    
    alert(`✅ ${successCount}개 노드의 데이터 소스가 확정되었습니다.${failCount > 0 ? `\n❌ ${failCount}개 실패` : ''}`)
  } else {
    alert(`❌ 데이터 소스 확정에 실패했습니다.`)
  }
}

function getMappingStats() {
  const mappings = Object.values(dataSourceMappings.value)
  return {
    total: mappings.length,
    found: mappings.filter(m => m.status === 'found' || m.status === 'confirmed').length,
    notFound: mappings.filter(m => m.status === 'not_found').length,
    error: mappings.filter(m => m.status === 'error').length,
    confirmed: mappings.filter(m => m.status === 'confirmed').length
  }
}

// 개별 노드 데이터 소스 연결 다이얼로그 열기
function openNodeDataSourceDialog(nodeId: string) {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return
  
  currentNodeForDataSource.value = node
  showNodeDataSourceDialog.value = true
  nodeDataSourceTab.value = 'search'
  nodeSearchProbeRunId.value += 1
  nodeSearchQuery.value = ''
  nodeSearchResults.value = []
  selectedSearchResult.value = null
  selectedManualTable.value = null
  
  // 노드 정보 기반 검색어 자동 생성
  const layer = node.layer || node.label || ''
  const layerSearchTerms: Record<string, string> = {
    'KPI': 'KPI 지표 데이터',
    'Measure': '측정 데이터',
    'Process': '프로세스 로그',
    'Driver': '외부 변수 데이터',
    'Resource': '자원 현황'
  }
  
  const baseQuery = layerSearchTerms[layer] || '데이터'
  nodeSearchQuery.value = `${node.name} ${baseQuery}`
  
  // 데이터 소스 목록만 먼저 로드
  loadDatasources()
}

// 노드 데이터 소스 자연어 검색
async function searchNodeDataSource() {
  if (!currentNodeForDataSource.value || !nodeSearchQuery.value.trim()) return
  
  const runId = nodeSearchProbeRunId.value + 1
  nodeSearchProbeRunId.value = runId
  nodeSearchLoading.value = true
  nodeSearchStatus.value = '🔍 관련 테이블 검색 중...'
  nodeSearchResults.value = []
  selectedSearchResult.value = null
  
  try {
    if (!selectedDatasource.value && availableDatasources.value.length === 1) {
      selectedDatasource.value = availableDatasources.value[0]
    }

    if (!selectedDatasource.value) {
      nodeSearchStatus.value = '❌ 데이터소스를 선택해주세요'
      return
    }
    // Text2SQL /ask API 호출
    nodeSearchStatus.value = '🤖 AI가 SQL 쿼리 생성 중...'
    const response = await fetch('/api/gateway/text2sql/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: nodeSearchQuery.value,
        datasource: selectedDatasource.value,
        limit: 10
      })
    })
    
    if (response.ok) {
      nodeSearchStatus.value = '📊 검색 결과 처리 중...'
      const result = await response.json()
      
      // Text2SQL 응답에서 테이블 정보 추출
      const provenance = result.provenance || {}
      const usedTables = provenance.tables || []
      const tableData = result.table || {}
      const columns = tableData.columns || []
      
      if (usedTables.length > 0 || result.sql) {
        nodeSearchStatus.value = `✅ ${usedTables.length}개 테이블 발견`
        // 테이블 정보를 후보 형식으로 변환
        // usedTables는 이미 datasource.schema.table 형식일 수 있음
        const candidates: NodeSearchCandidate[] = usedTables.map((tableName: string, idx: number) => {
          // tableName이 이미 datasource.schema.table 형식인지 확인
          const parts = tableName.split('.')
          let fullTableName = tableName
          
          // 따옴표 처리: datasource.schema.table 형식이면 그대로 사용
          if (parts.length === 3) {
            // datasource.schema.table 형식
            fullTableName = `"${parts[0]}"."${parts[1]}"."${parts[2]}"`
          } else if (parts.length === 2) {
            // schema.table 형식
            fullTableName = `"${parts[0]}"."${parts[1]}"`
          } else {
            // table만
            fullTableName = `"${tableName}"`
          }
          
          return {
            table_name: tableName,  // 원본 (datasource.schema.table 또는 schema.table)
            datasource: selectedDatasource.value || '',
            full_table_name: fullTableName,  // SQL용 (따옴표 포함)
            columns: columns,
            sample_data: [],
            row_count: null,
            row_count_approx: false,
            relevance_score: 0.8 - (idx * 0.1),
            match_reason: `Text2SQL 검색: ${nodeSearchQuery.value}`,
            suggested_sql: result.sql || `SELECT * FROM ${fullTableName} LIMIT 100`
          }
        })
        
        nodeSearchResults.value = candidates
        nodeSearchStatus.value = '' // 성공 시 상태 메시지 제거
        void probeRowCounts(runId)
      } else {
        // 직접 SQL에서 테이블 추출 시도
        if (result.sql) {
          nodeSearchStatus.value = '📋 SQL에서 테이블 정보 추출 중...'
          const tableMatch = result.sql.match(/FROM\s+["`]?(\w+)["`]?/i)
          if (tableMatch) {
            const fallbackCandidates: NodeSearchCandidate[] = [{
              table_name: tableMatch[1],
              datasource: selectedDatasource.value || '',
              columns: columns,
              sample_data: [],
              row_count: null,
              row_count_approx: false,
              relevance_score: 0.7,
              match_reason: `SQL에서 추출: ${result.sql.substring(0, 50)}...`,
              suggested_sql: result.sql
            }]
            nodeSearchResults.value = fallbackCandidates
            void probeRowCounts(runId)
            nodeSearchStatus.value = '✅ 테이블 정보 추출 완료'
          } else {
            nodeSearchStatus.value = '⚠️ 테이블 정보를 찾을 수 없습니다'
          }
        } else {
          nodeSearchStatus.value = '⚠️ 검색 결과가 없습니다'
        }
      }
    } else {
      // HTTP 에러 응답 처리
      let errorMessage = '검색 실패'
      try {
        const errorData = await response.json()
        console.error('Text2SQL API 오류 응답:', errorData)
        
        // 에러 메시지 추출
        if (errorData.detail) {
          if (typeof errorData.detail === 'string') {
            errorMessage = errorData.detail
          } else if (errorData.detail.message) {
            errorMessage = errorData.detail.message
          } else if (errorData.detail.detail) {
            errorMessage = errorData.detail.detail
          } else {
            errorMessage = JSON.stringify(errorData.detail)
          }
        } else if (errorData.message) {
          errorMessage = errorData.message
        } else {
          errorMessage = `HTTP ${response.status}: ${JSON.stringify(errorData)}`
        }
      } catch (parseError) {
        const errorText = await response.text().catch(() => '')
        errorMessage = errorText || `HTTP ${response.status} ${response.statusText}`
      }
      
      console.error('검색 실패:', errorMessage)
      nodeSearchStatus.value = `❌ 검색 실패: ${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}`
      // 3초 후 상태 메시지 제거
      setTimeout(() => {
        if (nodeSearchStatus.value.includes('❌')) {
          nodeSearchStatus.value = ''
        }
      }, 5000)
      alert(`검색 실패: ${errorMessage}`)
    }
  } catch (error: any) {
    console.error('노드 데이터 소스 검색 오류:', error)
    const errorMessage = error?.message || error?.toString() || '알 수 없는 오류'
    nodeSearchStatus.value = `❌ 오류 발생: ${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}`
    setTimeout(() => {
      if (nodeSearchStatus.value.includes('❌')) {
        nodeSearchStatus.value = ''
      }
    }, 5000)
    alert(`검색 중 오류가 발생했습니다: ${errorMessage}`)
  } finally {
    nodeSearchLoading.value = false
    // 성공한 경우 상태 메시지는 이미 제거됨
    if (nodeSearchResults.value.length === 0 && !nodeSearchStatus.value) {
      nodeSearchStatus.value = ''
    }
  }
}

// 데이터 소스 목록만 로드 (초기 로드)
async function loadDatasources() {
  loadingTables.value = true
  availableDatasources.value = []
  availableSchemas.value = []
  availableTables.value = []
  selectedDatasource.value = ''
  selectedSchema.value = ''
  
  try {
    const response = await fetch('/api/gateway/text2sql/meta/datasources')
    
    if (response.ok) {
      const datasources = await response.json()
      availableDatasources.value = datasources
      // 단일 데이터소스 환경에서는 자연어 검색 첫 클릭 동작을 위해 자동 선택
      if (datasources.length === 1) {
        selectedDatasource.value = datasources[0]
        await loadSchemasForDatasource(selectedDatasource.value)
      }
    } else {
      const error = await response.json().catch(() => ({ detail: '데이터 소스 목록 조회 실패' }))
      console.error('데이터 소스 목록 조회 실패:', error)
    }
  } catch (error) {
    console.error('데이터 소스 목록 로드 오류:', error)
  } finally {
    loadingTables.value = false
  }
}

// 데이터 소스 선택 시 스키마 목록 로드
async function loadSchemasForDatasource(datasource: string) {
  if (!datasource) {
    availableSchemas.value = []
    availableTables.value = []
    return
  }
  
  // "온톨로지" 선택 시 ObjectType 목록 바로 로드
  if (datasource === '__ontology__') {
    await loadObjectTypes()
    return
  }
  
  loadingTables.value = true
  availableSchemas.value = []
  availableTables.value = []
  selectedSchema.value = ''
  
  try {
    const response = await fetch(`/api/gateway/text2sql/meta/datasources/${encodeURIComponent(datasource)}/schemas`)
    
    if (response.ok) {
      const schemas = await response.json()
      availableSchemas.value = schemas
    } else {
      const error = await response.json().catch(() => ({ detail: '스키마 목록 조회 실패' }))
      console.error('스키마 목록 조회 실패:', error)
    }
  } catch (error) {
    console.error('스키마 목록 로드 오류:', error)
  } finally {
    loadingTables.value = false
  }
}

// 스키마 선택 시 테이블 목록 로드
async function loadTablesForSchema(datasource: string, schema: string) {
  if (!datasource || !schema) {
    availableTables.value = []
    return
  }
  
  loadingTables.value = true
  availableTables.value = []
  
  try {
    const response = await fetch(`/api/gateway/text2sql/meta/datasources/${encodeURIComponent(datasource)}/schemas/${encodeURIComponent(schema)}/tables?limit=500`)
    
    if (response.ok) {
      const tables = await response.json()
      
      tables.forEach((t: any) => {
        const tableSchema = t.schema || 'public'
        const tableDatasource = t.datasource || ''
        
        // fullName 생성: datasource.schema.table 형식
        let fullName = ''
        if (tableDatasource) {
          fullName = `"${tableDatasource}"."${tableSchema}"."${t.name}"`
        } else if (tableSchema !== 'public') {
          fullName = `"${tableSchema}"."${t.name}"`
        } else {
          fullName = `"${t.name}"`
        }
        
        availableTables.value.push({
          name: t.name,
          schema: tableSchema,
          datasource: tableDatasource,
          fullName: fullName,
          columnCount: t.column_count || 0
        })
      })
    } else {
      const error = await response.json().catch(() => ({ detail: '테이블 목록 조회 실패' }))
      console.error('테이블 목록 조회 실패:', error)
    }
  } catch (error) {
    console.error('테이블 목록 로드 오류:', error)
  } finally {
    loadingTables.value = false
  }
}

// ObjectType 목록 로드 (온톨로지)
async function loadObjectTypes() {
  loadingTables.value = true
  availableSchemas.value = []  // 스키마 없음
  availableTables.value = []
  selectedSchema.value = ''
  
  try {
    if (!selectedDatasource.value) {
      return
    }
    const response = await fetch(`/api/gateway/text2sql/meta/objecttypes?datasource=${encodeURIComponent(selectedDatasource.value)}&limit=500`)
    
    if (response.ok) {
      const objectTypes = await response.json()
      
      objectTypes.forEach((ot: any) => {
        const schema = ot.schema || 'dw'
        // ObjectType의 경우 materialized_view 값을 데이터 소스로 사용
        const materializedView = ot.materialized_view || ot.name
        
        // fullName 생성: ObjectType은 스키마 없이 materializedView만 사용
        // materializedView만 (스키마 없음)
        const fullName = `"${materializedView}"`
        
        availableTables.value.push({
          name: ot.name,  // ObjectType 이름 (표시용)
          schema: schema,
          datasource: materializedView,  // Materialized View 이름을 데이터 소스로 사용
          fullName: fullName,
          columnCount: ot.column_count || 0,
          materializedView: materializedView  // Materialized View 이름 저장
        })
      })
    } else {
      const error = await response.json().catch(() => ({ detail: 'ObjectType 목록 조회 실패' }))
      console.error('ObjectType 목록 조회 실패:', error)
    }
  } catch (error) {
    console.error('ObjectType 목록 로드 오류:', error)
  } finally {
    loadingTables.value = false
  }
}

// 필터링된 테이블 목록 (검색어만 적용)
const filteredTables = computed(() => {
  let filtered = availableTables.value
  
  // 검색어 필터만 적용 (데이터 소스/스키마는 이미 서버에서 필터링됨)
  if (tableSearchQuery.value) {
    const query = tableSearchQuery.value.toLowerCase()
    filtered = filtered.filter(t => 
      t.name.toLowerCase().includes(query) || 
      t.fullName.toLowerCase().includes(query) ||
      (t.datasource && t.datasource.toLowerCase().includes(query)) ||
      (t.schema && t.schema.toLowerCase().includes(query))
    )
  }
  
  return filtered
})

// 데이터 소스 변경 핸들러
async function handleDatasourceChange() {
  selectedSchema.value = ''
  availableTables.value = []
  await loadSchemasForDatasource(selectedDatasource.value)
}

// 스키마 변경 핸들러
async function handleSchemaChange() {
  if (selectedDatasource.value && selectedDatasource.value !== '__ontology__' && selectedSchema.value) {
    await loadTablesForSchema(selectedDatasource.value, selectedSchema.value)
  }
}

// 검색 결과 미리보기
function previewSearchResult(result: any) {
  // 임시로 selectedMappingNodeId 설정 (loadSampleData가 이를 사용함)
  if (currentNodeForDataSource.value) {
    selectedMappingNodeId.value = currentNodeForDataSource.value.id
  }
  loadSampleData(result)
}

// 검색 결과 선택
function selectSearchResult(result: any) {
  selectedSearchResult.value = nodeSearchResults.value.indexOf(result)
}

// 노드 데이터 소스 확정
async function confirmNodeDataSource() {
  if (!currentNodeForDataSource.value) return
  
  let candidate: any = null
  
  if (nodeDataSourceTab.value === 'search' && selectedSearchResult.value !== null) {
    const searchResult = nodeSearchResults.value[selectedSearchResult.value]
    // searchResult의 table_name이 이미 datasource.schema.table 형식일 수 있음
    candidate = {
      ...searchResult,
      table_name: searchResult.table_name || searchResult.full_table_name?.replace(/"/g, ''),
      datasource: searchResult.datasource || (selectedDatasource.value !== '__ontology__' ? selectedDatasource.value : ''),
      suggested_sql: searchResult.suggested_sql || `SELECT * FROM ${searchResult.full_table_name || `"${searchResult.table_name}"`} LIMIT 100`
    }
  } else if (nodeDataSourceTab.value === 'manual' && selectedManualTable.value) {
    const table = availableTables.value.find(t => t.fullName === selectedManualTable.value)
    if (table) {
      // ObjectType의 경우 materializedView 값을 데이터 소스로 사용
      // 일반 테이블의 경우 fullName 사용
      let tableNameForDataSource = table.fullName.replace(/"/g, '')
      
      // ObjectType이고 materializedView가 있으면 그것을 사용 (스키마 없이)
      if (table.materializedView && selectedDatasource.value === '__ontology__') {
        // materializedView만 사용 (스키마 없음)
        tableNameForDataSource = table.materializedView
      }
      
      candidate = {
        table_name: tableNameForDataSource,
        datasource: selectedDatasource.value !== '__ontology__' ? selectedDatasource.value : '',
        columns: [],
        sample_data: [],
        row_count: 0,
        row_count_approx: false,
        relevance_score: 1.0,
        match_reason: selectedDatasource.value === '__ontology__' ? '온톨로지 (ObjectType) 선택' : '수동 선택',
        suggested_sql: `SELECT * FROM ${table.fullName} LIMIT 100`,
        materializedView: table.materializedView  // Materialized View 이름 저장
      }
      
      // 테이블 컬럼 정보 가져오기
      try {
        const schema = table.schema || 'public'
        if (selectedDatasource.value !== '__ontology__') {
          const colUrl = `/api/gateway/text2sql/meta/tables/${table.name}/columns?datasource=${encodeURIComponent(selectedDatasource.value)}&schema=${schema}`
          const colResponse = await fetch(colUrl)
          if (colResponse.ok) {
            const columns = await colResponse.json()
            candidate.columns = columns.map((c: any) => c.name)
            console.log(`✅ 컬럼 정보 조회 성공: ${candidate.columns.length}개 컬럼 (테이블: ${cleanTableName})`)
          } else {
            console.warn('컬럼 정보 조회 실패:', await colResponse.text())
          }
        }
      } catch (err) {
        console.warn('컬럼 정보 조회 오류:', err)
      }
    }
  }
  
  if (!candidate) {
    alert('데이터 소스를 선택해주세요.')
    return
  }
  
  // 데이터 소스 확정
  await confirmDataSourceMapping(currentNodeForDataSource.value.id, candidate)
  
  // 다이얼로그 닫기
  showNodeDataSourceDialog.value = false
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'confirmed': return '✅'
    case 'found': return '🔍'
    case 'not_found': return '❌'
    case 'error': return '⚠️'
    case 'searching': return '⏳'
    default: return '⏳'
  }
}

function getStatusText(status: string) {
  switch (status) {
    case 'confirmed': return '확정됨'
    case 'found': return '후보 발견'
    case 'not_found': return '미발견'
    case 'error': return '오류'
    case 'searching': return '검색 중'
    default: return '대기'
  }
}

// 관계 타입 옵션
const relationTypeOptions = [
  { value: 'CAUSES', label: '원인 (CAUSES)' },
  { value: 'EFFECTS', label: '영향 (EFFECTS)' },
  { value: 'MEASURED_AS', label: '측정됨 (MEASURED_AS)' },
  { value: 'PRODUCES', label: '생산 (PRODUCES)' },
  { value: 'INFLUENCES', label: '영향 (INFLUENCES)' },
  { value: 'EXECUTES', label: '실행 (EXECUTES)' },
  { value: 'USED_WHEN', label: '사용됨 (USED_WHEN)' },
  { value: 'USES', label: '사용 (USES)' },
  { value: 'NEXT', label: '다음 (NEXT)' },
  { value: 'TRIGGERS', label: '트리거 (TRIGGERS)' }
]

async function createRelation() {
  if (!newRelation.value.sourceId || !newRelation.value.targetId || !newRelation.value.relationId) return

  const relIndex = relationships.value.findIndex(r => r.id === newRelation.value.relationId)
  if (relIndex === -1) {
    showNewRelationDialog.value = false
    return
  }

  relationships.value[relIndex] = {
    ...relationships.value[relIndex],
    type: newRelation.value.type,
    description: newRelation.value.description || undefined
  }
  resetEdgehandlesInteractionState({ removeTransientEdges: true })
  upsertRelationEdgeInCy(relationships.value[relIndex])
  
  // 다이얼로그 닫기
  showNewRelationDialog.value = false
  newRelation.value = {
    relationId: '',
    sourceId: '',
    targetId: '',
    type: 'CAUSES',
    description: ''
  }
}

function cancelRelation() {
  if (newRelation.value.relationId) {
    relationships.value = relationships.value.filter(r => r.id !== newRelation.value.relationId)
    removeRelationEdgeFromCy(newRelation.value.relationId)
  }

  showNewRelationDialog.value = false
  resetEdgehandlesInteractionState({ removeTransientEdges: true })
  newRelation.value = {
    relationId: '',
    sourceId: '',
    targetId: '',
    type: 'CAUSES',
    description: ''
  }
  
  // edgehandles가 자동 생성한 임시 엣지 제거
  if (tempEdgeFromEdgehandles) {
    tempEdgeFromEdgehandles.remove()
    tempEdgeFromEdgehandles = null
  }
}

// 노드 삭제
async function deleteNode(nodeId: string) {
  if (!confirm(`노드 '${getNodeName(nodeId)}'를 삭제하시겠습니까?`)) return
  
  // 로컬 상태에서 제거
  nodes.value = nodes.value.filter(n => n.id !== nodeId)
  relationships.value = relationships.value.filter(
    r => r.source !== nodeId && r.target !== nodeId
  )
  
  // Cytoscape에서 제거
  if (cy) {
    cy.$(`#${nodeId}`).remove()
  }
  
  // 선택된 노드가 삭제되는 노드면 선택 해제
  if (selectedNodeId.value === nodeId) {
    deselectNode()
  }
}

// 관계 삭제
async function deleteRelation(relId: string) {
  if (!confirm('이 관계를 삭제하시겠습니까?')) return
  
  // 로컬 상태에서 제거
  relationships.value = relationships.value.filter(r => r.id !== relId)
  
  // Cytoscape에서 제거
  if (cy) {
    cy.$(`#${relId}`).remove()
  }
}

// API calls
async function generateOntology() {
  generating.value = true
  resetProgress()
  abortController = new AbortController()
  generateError.value = ''
  
  addLog('온톨로지 생성 시작...', 'info')
  currentStep.value = '문서 준비 중'
  
  try {
    // Prepare request body
    let requestBody: Record<string, any> = {
      inputType: generateForm.value.inputType === 'url' ? 'pdf' : generateForm.value.inputType,
      glossary_ids: useAllGlossaries.value ? undefined : generateForm.value.selectedGlossaryIds
    }
    
    if (generateForm.value.inputType === 'text') {
      requestBody.text = generateForm.value.text
    } else if (generateForm.value.inputType === 'url') {
      requestBody.pdfUrl = generateForm.value.pdfUrl
    } else if (generateForm.value.inputType === 'pdf' && uploadedFile.value) {
      // Convert file to base64
      addLog('PDF 파일 인코딩 중...', 'info')
      const base64 = await fileToBase64(uploadedFile.value)
      requestBody.pdfContent = base64
    }
    
    // Use streaming endpoint
    currentStep.value = '에이전트 실행 중'
    const response = await fetch('/api/gateway/ontology/generate-multi-layer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    })
    
    if (!response.ok) {
      let errMessage = `HTTP ${response.status}`
      try {
        const errBody = await response.json()
        const detail = errBody.detail ?? errBody.message ?? errBody.error?.message
        if (detail) errMessage = typeof detail === 'string' ? detail : JSON.stringify(detail)
      } catch (_) {
        const text = await response.text()
        if (text) errMessage = text.slice(0, 500)
      }
      throw new Error(errMessage)
    }
    
    // Process streaming response
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')
    
    const decoder = new TextDecoder()
    let buffer = ''
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          handleStreamEvent(event)
        } catch (e) {
          console.warn('Failed to parse stream event:', line)
        }
      }
    }
    
    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer)
        handleStreamEvent(event)
      } catch (e) {
        console.warn('Failed to parse final event:', buffer)
      }
    }
    
  } catch (error: any) {
    if (error.name === 'AbortError') {
      addLog('생성이 취소되었습니다.', 'warning')
    } else {
      const msg = error?.message || '온톨로지 생성 중 오류가 발생했습니다.'
      console.error('온톨로지 생성 오류:', error)
      addLog(`오류: ${msg}`, 'error')
      generateError.value = msg
      // alert를 먼저 띄워 화면 전환 후에도 사용자가 메시지를 놓치지 않도록 함
      alert('온톨로지 생성 오류\n\n' + msg)
    }
  } finally {
    generating.value = false
    abortController = null
  }
}

function handleStreamEvent(event: any) {
  switch (event.event) {
    case 'start':
      addLog('Multi-Layer 스키마 생성 시작', 'info')
      currentStep.value = '파이프라인 시작'
      break
      
    case 'layer_progress':
      {
      const phaseName: string = event.layer
      const progressDetail: PipelineProgressDetail | undefined =
        event.detail && typeof event.detail === 'object' ? event.detail as PipelineProgressDetail : undefined
      
      // BPMN 이벤트가 처음 오면 동적으로 파이프라인에 추가
      if (phaseName === 'BPMN' && !pipelineProgress.value['BPMN']) {
        activePipelineStages.value = ['Normalization', 'BPMN', 'Chunking', 'Sanitize', 'Unified', 'MergeRefine']
        pipelineProgress.value['BPMN'] = { status: 'pending', progress: 0 }
      }
      
      // Merge와 Refinement를 하나의 "병합 & 정제" 단계로 통합
      const uiPhase = (phaseName === 'Merge' || phaseName === 'Refinement') ? 'MergeRefine' : phaseName
      
      const prevProgress = pipelineProgress.value[uiPhase]?.progress || 0
      const incomingProgress = Math.max(0, Math.min(100, event.progress || 0))
      
      // MergeRefine 특수 처리: Merge 100% → 50%, Refinement 100% → 100%
      if (phaseName === 'Merge') {
        const mergeProgress = incomingProgress >= 100 ? 50 : Math.round(incomingProgress * 0.5)
        pipelineProgress.value['MergeRefine'] = {
          status: incomingProgress >= 100 ? 'in_progress' : 'in_progress',
          progress: Math.max(prevProgress, mergeProgress),
          message: event.message,
          detail: progressDetail
        }
      } else if (phaseName === 'Refinement') {
        const refineProgress = incomingProgress >= 100 ? 100 : 50 + Math.round(incomingProgress * 0.5)
        pipelineProgress.value['MergeRefine'] = {
          status: incomingProgress >= 100 ? 'completed' : 'in_progress',
          progress: Math.max(prevProgress, refineProgress),
          message: event.message,
          detail: progressDetail
        }
      } else {
        pipelineProgress.value[uiPhase] = {
          status: incomingProgress >= 100 ? 'completed' : 'in_progress',
          progress: Math.max(prevProgress, incomingProgress),
          message: event.message,
          detail: progressDetail
        }
      }
      
      // Sanitize 청크 진행률 파싱
      if (phaseName === 'Sanitize') {
        const sanitizeMatch = event.message?.match(/청크 (\d+)\/(\d+)/)
        if (sanitizeMatch) {
          sanitizeChunkProgress.value = { current: parseInt(sanitizeMatch[1]), total: parseInt(sanitizeMatch[2]) }
        }
      }
      
      // "청크 N/M 처리 완료" 패턴에서 진행률 파싱
      if (phaseName === 'Unified') {
        if (progressDetail) {
          chunkProgress.value = {
            current: Number(progressDetail.chunkCurrent || 0),
            total: Number(progressDetail.chunkTotal || 0),
            substepCurrent: Number(progressDetail.substepCurrent || 0),
            substepTotal: Number(progressDetail.substepTotal || 0),
            completedSteps: Number(progressDetail.completedSteps || 0),
            totalSteps: Number(progressDetail.totalSteps || 0)
          }
        } else {
          const nextChunkProgress = { ...chunkProgress.value }
          const chunkMatch = event.message?.match(/청크 (\d+)\/(\d+)/)
          if (chunkMatch) {
            nextChunkProgress.current = parseInt(chunkMatch[1])
            nextChunkProgress.total = parseInt(chunkMatch[2])
          }
          const substepMatch = event.message?.match(/단계 (\d+)\/(\d+)/)
          if (substepMatch) {
            nextChunkProgress.substepCurrent = parseInt(substepMatch[1])
            nextChunkProgress.substepTotal = parseInt(substepMatch[2])
          }
          chunkProgress.value = nextChunkProgress
        }
      }
      
      updateCurrentStepForPhase(uiPhase, pipelineProgress.value[uiPhase]?.progress || 0, event.message)
      addLog(
        `[${phaseName}] ${event.message}`,
        (pipelineProgress.value[uiPhase]?.status === 'completed') ? 'success' : 'info'
      )
      }
      break
      
    case 'layer_complete':
      {
      layerResults.value[event.layer] = {
        nodeCount: event.nodeCount,
        relationCount: event.relationCount || 0
      }
      addLog(`[${event.layer}] ${event.nodeCount}개 노드 추출 완료`, 'success')
      }
      break
      
    case 'complete':
      // 미완료 파이프라인 단계를 모두 completed로 마킹
      activePipelineStages.value.forEach(stage => {
        if (pipelineProgress.value[stage]?.status !== 'completed') {
          pipelineProgress.value[stage] = { status: 'completed', progress: 100, message: '완료' }
        }
      })
      currentStep.value = '완료'
      if (event.data?.success && event.data?.schema) {
        nodes.value = event.data.schema.nodes || []
        const sanitizedFromGeneration = sanitizeRelationshipsForCanvas(
          event.data.schema.relationships || [],
          nodes.value
        )
        relationships.value = sanitizedFromGeneration.relationships
        if (sanitizedFromGeneration.skipped > 0 || sanitizedFromGeneration.rekeyed > 0) {
          addLog(
            `관계 정제 적용: 잘못된 관계 ${sanitizedFromGeneration.skipped}개 제외, 중복 ID ${sanitizedFromGeneration.rekeyed}개 보정`,
            'warning'
          )
        }
        
        // 스키마 ID가 있으면 저장
        if (event.data.schema.id) {
          currentSchemaId.value = event.data.schema.id
        }
        
        // 자동으로 이름 생성 (이름이 없거나 기본값인 경우)
        if (!event.data.schema.name || event.data.schema.name.startsWith('온톨로지_') || event.data.schema.name === 'Multi-Layer Ontology') {
          addLog('온톨로지 이름 자동 생성 중...', 'info')
          const autoName = generateOntologyName(nodes.value)
          schemaName.value = autoName
          addLog(`이름 생성 완료: ${autoName}`, 'success')
        } else {
          schemaName.value = event.data.schema.name
        }

        if (Array.isArray(event.data.synonymSuggestions) && event.data.synonymSuggestions.length > 0) {
          synonymSuggestions.value = event.data.synonymSuggestions.map((suggestion: any) => ({
            termId: suggestion.termId ?? suggestion.term_id ?? '',
            termName: suggestion.termName ?? suggestion.term_name ?? '',
            glossaryId: suggestion.glossaryId ?? suggestion.glossary_id ?? '',
            glossaryName: suggestion.glossaryName ?? suggestion.glossary_name ?? '',
            suggestedSynonym: suggestion.suggestedSynonym ?? suggestion.suggested_synonym ?? '',
            similarity: Number(suggestion.similarity ?? 0),
            sourceNodeName: suggestion.sourceNodeName ?? suggestion.source_node_name ?? '',
            sourceLayer: suggestion.sourceLayer ?? suggestion.source_layer ?? '',
            accepted: true
          }))
          addLog(`동의어 제안 ${synonymSuggestions.value.length}건을 수집했습니다.`, 'info')
        } else {
          synonymSuggestions.value = []
        }
        
        addLog(`온톨로지 생성 완료 - 총 ${nodes.value.length}개 노드`, 'success')

        const layerBreakdown: Record<string, number> = {}
        nodes.value.forEach(node => {
          const layer = node.layer || node.label || 'Unknown'
          layerBreakdown[layer] = (layerBreakdown[layer] || 0) + 1
        })
        generationResult.value = {
          nodeCount: nodes.value.length,
          relationshipCount: relationships.value.length,
          layerBreakdown,
          synonymSuggestionCount: synonymSuggestions.value.length,
        }

        generationSaveStatus.value = 'saving'
        generationSaveError.value = ''
        generationCompleted.value = true

        addLog('Neo4j에 저장 중...', 'info')
        saveToNeo4jSilent().then(() => {
          generationSaveStatus.value = 'saved'
          addLog('Neo4j에 저장 완료', 'success')
        }).catch(err => {
          generationSaveStatus.value = 'failed'
          generationSaveError.value = err.message || '저장 실패'
          addLog(`저장 실패: ${err.message}`, 'error')
        })

        nextTick(() => {
          initCytoscape()
        })
      } else {
        const errMsg = event.data?.error || '알 수 없는 오류'
        addLog(`생성 실패: ${errMsg}`, 'error')
        generateError.value = errMsg
      }
      break
      
    case 'error':
      // 현재 in_progress인 단계를 failed로 마킹
      activePipelineStages.value.forEach(stage => {
        if (pipelineProgress.value[stage]?.status === 'in_progress') {
          pipelineProgress.value[stage] = {
            ...pipelineProgress.value[stage],
            status: 'failed',
            message: event.message || '오류 발생'
          }
        }
      })
      currentStep.value = '오류 발생'
      addLog(`오류: ${event.message}`, 'error')
      generateError.value = event.message || '온톨로지 생성 중 오류가 발생했습니다.'
      break
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 저장된 스키마 목록 (드롭다운)
const showOntologyListDropdown = ref(false)
const savedSchemas = ref<Array<{id: string; name: string; domain?: string; nodeCount: number; updatedAt?: string; hasSchemaJson?: boolean}>>([])
const loadingSchemalist = ref(false)
/** 삭제 확인 대기 중인 온톨로지 (이름을 명확히 확인 후 삭제) */
const schemaToDelete = ref<{ id: string; name: string } | null>(null)

// localStorage 키
const RECENT_SCHEMAS_KEY = 'robo-analyzer-recent-schemas'
const SELECTED_NODES_KEY = 'robo-analyzer-selected-nodes'
const MAX_SELECTED_NODES = 100 // 최대 저장 개수

// 선택된 노드 정보 타입
interface SelectedNodeInfo {
  schemaId: string
  nodeId: string
  timestamp: number
}

// 최근 열어본 스키마 ID 목록 가져오기
function getRecentSchemaIds(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SCHEMAS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// 최근 열어본 스키마 ID 목록 저장
function saveRecentSchemaId(schemaId: string) {
  try {
    const recent = getRecentSchemaIds()
    // 이미 있으면 제거하고 맨 앞에 추가
    const filtered = recent.filter(id => id !== schemaId)
    const updated = [schemaId, ...filtered].slice(0, 50) // 최대 50개만 유지
    localStorage.setItem(RECENT_SCHEMAS_KEY, JSON.stringify(updated))
  } catch (error) {
    console.warn('최근 스키마 저장 실패:', error)
  }
}

function removeRecentSchemaId(schemaId: string) {
  try {
    const updated = getRecentSchemaIds().filter(id => id !== schemaId)
    localStorage.setItem(RECENT_SCHEMAS_KEY, JSON.stringify(updated))
  } catch (error) {
    console.warn('최근 스키마 제거 실패:', error)
  }
}

// 선택된 노드 목록 가져오기 (FIFO 큐)
function getSelectedNodes(): SelectedNodeInfo[] {
  try {
    const stored = localStorage.getItem(SELECTED_NODES_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// 선택된 노드 저장 (FIFO 큐 방식)
function saveSelectedNode(schemaId: string, nodeId: string) {
  try {
    const selectedNodes = getSelectedNodes()
    
    // 같은 스키마의 같은 노드가 이미 있으면 제거 (중복 방지)
    const filtered = selectedNodes.filter(
      n => !(n.schemaId === schemaId && n.nodeId === nodeId)
    )
    
    // 새로운 노드 정보 추가 (맨 앞에)
    const newNode: SelectedNodeInfo = {
      schemaId,
      nodeId,
      timestamp: Date.now()
    }
    
    const updated = [newNode, ...filtered].slice(0, MAX_SELECTED_NODES) // 최대 개수 제한
    localStorage.setItem(SELECTED_NODES_KEY, JSON.stringify(updated))
  } catch (error) {
    console.warn('선택된 노드 저장 실패:', error)
  }
}

// 선택된 노드 제거
function removeSelectedNode(schemaId: string, nodeId: string) {
  try {
    const selectedNodes = getSelectedNodes()
    const filtered = selectedNodes.filter(
      n => !(n.schemaId === schemaId && n.nodeId === nodeId)
    )
    localStorage.setItem(SELECTED_NODES_KEY, JSON.stringify(filtered))
  } catch (error) {
    console.warn('선택된 노드 제거 실패:', error)
  }
}

// 현재 스키마의 선택된 노드 ID 가져오기
function getSelectedNodeIdForSchema(schemaId: string): string | null {
  try {
    const selectedNodes = getSelectedNodes()
    // 해당 스키마의 가장 최근 선택된 노드 찾기
    const nodeInfo = selectedNodes.find(n => n.schemaId === schemaId)
    return nodeInfo ? nodeInfo.nodeId : null
  } catch {
    return null
  }
}

// 스키마 이름 편집
const editingSchemaId = ref<string | null>(null)
const editingSchemaName = ref('')
const schemaNameInput = ref<HTMLInputElement[]>([])

function startEditSchemaName(schemaId: string, currentName: string) {
  editingSchemaId.value = schemaId
  editingSchemaName.value = currentName
  nextTick(() => {
    const input = schemaNameInput.value?.[0]
    if (input) {
      input.focus()
      input.select()
    }
  })
}

async function saveSchemaName(schemaId: string) {
  if (!editingSchemaName.value.trim()) {
    cancelEditSchemaName()
    return
  }
  
  const newName = editingSchemaName.value.trim()
  const schema = savedSchemas.value.find(s => s.id === schemaId)
  if (!schema || schema.name === newName) {
    editingSchemaId.value = null
    return
  }
  
  try {
    const response = await fetch(`/api/gateway/ontology/schemas/${schemaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    })
    
    if (response.ok) {
      const result = await response.json()
      console.log('[saveSchemaName] 업데이트 성공:', result)
      
      // 로컬 상태 업데이트
      schema.name = newName
      schema.updatedAt = new Date().toISOString()
      
      // 현재 로드된 스키마의 이름도 업데이트
      if (currentSchemaId.value === schemaId) {
        schemaName.value = newName
      }
      
      // 성공 메시지 (선택적)
      // console.log(`✅ 스키마 이름이 '${newName}'으로 변경되었습니다.`)
    } else {
      const error = await response.json().catch(() => ({ detail: '이름 변경 실패' }))
      console.error('[saveSchemaName] 업데이트 실패:', error)
      alert(`이름 변경 실패: ${error.detail || '알 수 없는 오류'}`)
    }
  } catch (error) {
    console.error('스키마 이름 변경 오류:', error)
    alert('이름 변경 중 오류가 발생했습니다.')
  } finally {
    editingSchemaId.value = null
  }
}

function cancelEditSchemaName() {
  editingSchemaId.value = null
  editingSchemaName.value = ''
}

function toggleOntologyListDropdown() {
  showOntologyListDropdown.value = !showOntologyListDropdown.value
  if (showOntologyListDropdown.value && savedSchemas.value.length === 0) {
    loadOntologyList()
  }
}

function requestDeleteSchema(schema: { id: string; name: string }) {
  schemaToDelete.value = { id: schema.id, name: schema.name }
}

async function confirmDeleteSchema() {
  if (!schemaToDelete.value) return
  const { id, name } = schemaToDelete.value
  try {
    const response = await fetch(`/api/gateway/ontology/schemas/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      alert(`삭제 실패: ${err.detail || response.status}`)
      return
    }
    removeRecentSchemaId(id)
    if (currentSchemaId.value === id) {
      currentSchemaId.value = null
      schemaName.value = ''
      nodes.value = []
      relationships.value = []
      selectedNodeId.value = null
      nodeDataResult.value = null
      detailPanelTab.value = 'info'
      showModelOverlay.value = false
      modelOverlayData.value = []
      isWhatIfPanelOpen.value = false
      causalBrushSelection.value = null
      analysisState.value = null
      clearCausalHighlight()
      closeRelationEditor()
      closeContextMenu()
      destroyCytoscapeCanvas()
      try {
        const selectedNodes = getSelectedNodes().filter(n => n.schemaId !== id)
        localStorage.setItem(SELECTED_NODES_KEY, JSON.stringify(selectedNodes))
      } catch (_) {}
    }
    schemaToDelete.value = null
    showOntologyListDropdown.value = true
    await loadOntologyList({ autoLoadRecent: false })
    alert(`온톨로지 「${name}」이(가) 삭제되었습니다.`)
  } catch (e: any) {
    const msg = e?.message || String(e)
    if (msg === 'Failed to fetch' || msg.includes('fetch')) {
      alert(
        '삭제 요청 연결에 실패했습니다.\n\n' +
        '• API 게이트웨이(포트 9000)와 도메인 레이어(포트 8002)가 실행 중인지 확인해 주세요.\n' +
        '• 개발 시에는 프론트를 실행한 터미널과 동일한 환경에서 백엔드를 띄워야 합니다.'
      )
    } else {
      alert(`삭제 중 오류: ${msg}`)
    }
  }
}

async function loadOntologyList(options: { autoLoadRecent?: boolean } = {}) {
  const { autoLoadRecent = true } = options
  loadingSchemalist.value = true
  
  try {
    const response = await fetch('/api/gateway/ontology/schemas')
    if (response.ok) {
      const result = await response.json()
      // API 응답: {"schemas": [...], "activeSchemaId": "..."}
      const schemas = result.schemas || []
      
      // schemaJson이 없는 스키마 필터링 및 경고
      const validSchemas = schemas.filter((s: any) => {
        if (!s.hasSchemaJson) {
          console.warn(`⚠️ 스키마 '${s.name}' (ID: ${s.id})는 schemaJson이 없어 로드할 수 없습니다.`)
          return false
        }
        return true
      })
      
      if (schemas.length > validSchemas.length) {
        const invalidCount = schemas.length - validSchemas.length
        console.warn(`⚠️ ${invalidCount}개의 스키마가 schemaJson이 없어 제외되었습니다.`)
      }
      
      savedSchemas.value = validSchemas.map((s: any) => ({
        id: s.id,
        name: s.name,
        domain: s.domain,
        nodeCount: s.nodeCount || 0,
        updatedAt: s.updatedAt,
        hasSchemaJson: s.hasSchemaJson !== false  // 명시적으로 설정
      }))
      
      // 최근 열어본 순서로 정렬
      const recentIds = getRecentSchemaIds()
      savedSchemas.value.sort((a, b) => {
        const aIndex = recentIds.indexOf(a.id)
        const bIndex = recentIds.indexOf(b.id)
        
        // 둘 다 최근 목록에 있으면 최근 순서대로
        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex
        }
        // 하나만 있으면 그것이 앞으로
        if (aIndex !== -1) return -1
        if (bIndex !== -1) return 1
        // 둘 다 없으면 updatedAt 기준 (최신순)
        if (a.updatedAt && b.updatedAt) {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        }
        return 0
      })
      
      console.log(`✅ 유효한 스키마 ${validSchemas.length}개 로드됨 (최근 열어본 순서로 정렬)`)
      
      // 최근 스키마 자동 로드 (화면 진입 시)
      if (autoLoadRecent && recentIds.length > 0 && validSchemas.length > 0) {
        // 최근 스키마 ID 중 유효한 스키마 찾기
        const recentSchemaId = recentIds.find(id => 
          validSchemas.some(s => s.id === id)
        )
        
        if (recentSchemaId && !currentSchemaId.value) {
          // 현재 스키마가 없고 최근 스키마가 있으면 자동으로 로드
          console.log(`📂 최근 접속한 온톨로지 자동 로드: ${recentSchemaId}`)
          await loadSchema(recentSchemaId)
        }
      }
    } else {
      const errorText = await response.text()
      console.error('스키마 목록 조회 실패:', errorText)
      savedSchemas.value = []
    }
  } catch (error) {
    console.error('Neo4j 스키마 목록 조회 오류:', error)
    savedSchemas.value = []
  } finally {
    loadingSchemalist.value = false
  }
}

async function loadSchema(schemaId: string) {
  loading.value = true
  loadingMessage.value = 'Neo4j에서 온톨로지 로딩 중...'
  showOntologyListDropdown.value = false
  
  // 최근 열어본 목록에 추가
  saveRecentSchemaId(schemaId)
  
  try {
    // 스키마 활성화
    const activateResponse = await fetch(`/api/gateway/ontology/schemas/${schemaId}/activate`, {
      method: 'POST'
    })
    
    if (!activateResponse.ok) {
      const errorText = await activateResponse.text().catch(() => '')
      let errorDetail = ''
      try {
        const errorJson = JSON.parse(errorText)
        errorDetail = errorJson.detail || errorJson.message || errorText
      } catch {
        errorDetail = errorText || `HTTP ${activateResponse.status} ${activateResponse.statusText}`
      }
      console.error('스키마 활성화 실패:', errorDetail)
      throw new Error(`스키마 활성화 실패 (${activateResponse.status}): ${errorDetail}`)
    }
    
    // 스키마 상세 조회
    const schemaResponse = await fetch(`/api/gateway/ontology/schemas/${schemaId}`)
    
    if (!schemaResponse.ok) {
      const errorText = await schemaResponse.text().catch(() => '')
      let errorDetail = ''
      try {
        const errorJson = JSON.parse(errorText)
        errorDetail = errorJson.detail || errorJson.message || errorText
      } catch {
        errorDetail = errorText || `HTTP ${schemaResponse.status} ${schemaResponse.statusText}`
      }
      console.error('스키마 조회 실패:', errorDetail)
      throw new Error(`스키마 조회 실패 (${schemaResponse.status}): ${errorDetail}`)
    }
    
    const schema = await schemaResponse.json()
    
    if (!schema) {
      throw new Error('스키마 데이터가 비어있습니다.')
    }
    
    // 스키마 ID와 이름 저장
    currentSchemaId.value = schema.id
    schemaName.value = schema.name || ''
    
    // 스키마 로드 중 플래그 (watch가 initCytoscape 덮어쓰기 방지)
    isLoadingSchema.value = true
    
    // 노드와 관계 로드
    nodes.value = schema.nodes || []
    const sanitizedFromSchema = sanitizeRelationshipsForCanvas(schema.relationships || [], nodes.value)
    relationships.value = sanitizedFromSchema.relationships
    if (sanitizedFromSchema.skipped > 0 || sanitizedFromSchema.rekeyed > 0) {
      console.warn('스키마 관계 정제 적용:', {
        schemaId,
        skipped: sanitizedFromSchema.skipped,
        rekeyed: sanitizedFromSchema.rekeyed
      })
      addLog(
        `관계 정제 적용: 잘못된 관계 ${sanitizedFromSchema.skipped}개 제외, 중복 ID ${sanitizedFromSchema.rekeyed}개 보정`,
        'warning'
      )
    }
    
    console.log(`스키마 로드 완료: ${schema.name} (${nodes.value.length}개 노드, ${relationships.value.length}개 관계)`)
    
    // Undo 스택 초기화
    undoStack.value = []
    redoStack.value = []
    
    // 로딩 완료 (v-else로 인해 이 시점에 그래프 컨테이너가 렌더링됨)
    loading.value = false
    
    // 그래프 렌더링 (DOM이 렌더링된 후)
    if (nodes.value.length > 0) {
      await nextTick()
      // 약간의 딜레이 후 그래프 초기화 → 그려지는 애니메이션 후에 선택 복원됨
      setTimeout(() => {
        initCytoscape(true)
        // 복원 로직이 600ms/ layoutstop 후에 돌므로 그 뒤에 플래그 해제
        setTimeout(() => {
          isLoadingSchema.value = false
        }, 800)
      }, 150)
    } else {
      isLoadingSchema.value = false
      console.warn('스키마에 노드가 없습니다.')
    }
    return // finally에서 loading.value = false 하지 않도록
    
  } catch (error: any) {
    console.error('스키마 로드 오류:', error)
    const errorMessage = error.message || '알 수 없는 오류'
    alert(`스키마 로드에 실패했습니다.\n\n${errorMessage}`)
  } finally {
    loading.value = false
    isLoadingSchema.value = false
  }
}

async function saveToNeo4jSilent(): Promise<void> {
  const nodesWithPositions = nodes.value.map(node => {
    const cyNode = cy?.getElementById(node.id)
    if (cyNode && cyNode.length > 0) {
      const pos = cyNode.position()
      return { ...node, position: { x: pos.x, y: pos.y } }
    }
    return node
  })

  const schema: OntologySchema = {
    id: currentSchemaId.value || undefined,
    name: schemaName.value || `온톨로지_${new Date().toISOString().slice(0, 10)}`,
    domain: 'multi-layer',
    description: '다층 온톨로지 스키마',
    nodes: nodesWithPositions,
    relationships: relationships.value
  }

  const response = await fetch('/api/gateway/ontology/schema', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schema)
  })

  if (response.ok) {
    const result = await response.json()
    currentSchemaId.value = result.id
  } else {
    const errorText = await response.text()
    throw new Error(errorText)
  }
}

async function saveToNeo4j() {
  if (nodes.value.length === 0) {
    alert('저장할 온톨로지가 없습니다.')
    return
  }

  if (showNewRelationDialog.value) {
    alert('열려 있는 관계 생성 다이얼로그를 먼저 완료하거나 취소해주세요.')
    return
  }

  resetEdgehandlesInteractionState({ removeTransientEdges: true })

  loading.value = true
  loadingMessage.value = 'Neo4j에 온톨로지 저장 중...'

  try {
    await saveToNeo4jSilent()
    alert('온톨로지가 Neo4j에 저장되었습니다.')
  } catch (error) {
    console.error('Neo4j 저장 오류:', error)
    alert('저장에 실패했습니다: ' + (error as Error).message)
  } finally {
    loading.value = false
  }
}

// 현재 스키마 정보
const currentSchemaId = ref<string | null>(null)
const schemaName = ref('')

// What-if 분석 패널 상태
const isWhatIfPanelOpen = ref(false)

// What-if에 전달할 필터 (nodeFilters 스냅샷)
const whatifFilters = ref<Record<string, Record<string, any>>>({})

function openWhatIfFromContextMenu() {
  showContextMenu.value = false
  whatifFilters.value = JSON.parse(JSON.stringify(nodeFilters.value || {}))
  isWhatIfPanelOpen.value = true
}

// ── Behavior 탭 (노드 상세 패널) ──
const behaviorLoading = ref(false)
const nodeBehaviors = ref<Array<{
  modelId: string; name: string; description: string; status: string;
  role: 'input' | 'output';  // 이 노드가 입력인지 출력인지
  metrics: string;
  inputs: Array<{ sourceId: string; field: string }>;
  outputs: Array<{ targetId: string; field: string }>;
}>>([])

async function loadNodeBehaviors(nodeId: string) {
  if (!currentSchemaId.value) return
  behaviorLoading.value = true
  nodeBehaviors.value = []
  try {
    const resp = await fetch(`/api/gateway/domain-whatif/models/${currentSchemaId.value}`)
    if (!resp.ok) return
    const data = await resp.json()
    const allModels = data.models || []

    // 이 노드와 연결된 모델 필터 + 역할(input/output) 판별
    for (const m of allModels) {
      const isInput = (m.inputs || []).some((i: any) => i.sourceId === nodeId)
      const isOutput = (m.outputs || []).some((o: any) => o.targetId === nodeId)
      if (isInput || isOutput) {
        nodeBehaviors.value.push({
          modelId: m.modelId,
          name: m.name || m.modelId,
          description: m.description || '',
          status: m.status || 'pending',
          role: isOutput ? 'output' : 'input',
          metrics: m.metrics || '{}',
          inputs: (m.inputs || []).map((i: any) => ({ sourceId: i.sourceId, field: i.field })),
          outputs: (m.outputs || []).map((o: any) => ({ targetId: o.targetId, field: o.field })),
        })
      }
    }
  } catch (e) {
    console.warn('Behavior 로드 실패:', e)
  } finally {
    behaviorLoading.value = false
  }
}

async function deleteBehaviorModel(modelId: string) {
  if (!currentSchemaId.value || !confirm('이 모델을 삭제하시겠습니까?')) return
  try {
    await fetch(`/api/gateway/domain-whatif/models/${currentSchemaId.value}/${modelId}`, { method: 'DELETE' })
    nodeBehaviors.value = nodeBehaviors.value.filter(b => b.modelId !== modelId)
  } catch (e) { console.warn('모델 삭제 실패:', e) }
}

// ── 모델 오버레이 표시 (캔버스용 — 유지하되 버튼 제거됨) ──
const showModelOverlay = ref(false)
const modelOverlayData = ref<Array<{
  modelId: string; name: string; status: string;
  inputs: Array<{ sourceId: string; field: string }>;
  outputs: Array<{ targetId: string; field: string }>;
}>>([])

async function toggleModelOverlay() {
  showModelOverlay.value = !showModelOverlay.value
  if (showModelOverlay.value && currentSchemaId.value) {
    try {
      const resp = await fetch(`/api/gateway/domain-whatif/models/${currentSchemaId.value}`)
      if (resp.ok) {
        const data = await resp.json()
        modelOverlayData.value = (data.models || []).map((m: any) => ({
          modelId: m.modelId, name: m.name, status: m.status,
          inputs: (m.inputs || []).map((i: any) => ({ sourceId: i.sourceId, field: i.field })),
          outputs: (m.outputs || []).map((o: any) => ({ targetId: o.targetId, field: o.field })),
        }))
        addModelNodesToCytoscape()
      }
    } catch (e) { console.warn('모델 로드 실패:', e) }
  } else {
    removeModelNodesFromCytoscape()
  }
}

function addModelNodesToCytoscape() {
  if (!cy) return
  // 기존 모델 노드/엣지 제거
  cy.elements('.model-overlay').remove()

  for (const model of modelOverlayData.value) {
    // 모델 노드 추가
    const inputPositions = model.inputs.map(inp => {
      const n = cy!.getElementById(inp.sourceId)
      return n.length > 0 ? n.position() : null
    }).filter(Boolean)
    const outputPositions = model.outputs.map(out => {
      const n = cy!.getElementById(out.targetId)
      return n.length > 0 ? n.position() : null
    }).filter(Boolean)

    // 모델 위치: 입력과 출력의 중간
    const allPos = [...inputPositions, ...outputPositions] as Array<{ x: number; y: number }>
    const avgX = allPos.length > 0 ? allPos.reduce((s, p) => s + p.x, 0) / allPos.length : 400
    const avgY = allPos.length > 0 ? allPos.reduce((s, p) => s + p.y, 0) / allPos.length + 60 : 400

    cy.add({
      group: 'nodes',
      data: { id: `model-${model.modelId}`, label: model.name, layer: 'Model', color: '#6366f1', isModel: true, modelStatus: model.status },
      position: { x: avgX, y: avgY },
      classes: 'model-overlay',
    })

    // 입력 엣지 (OntologyType → Model)
    for (const inp of model.inputs) {
      if (cy.getElementById(inp.sourceId).length > 0) {
        cy.add({
          group: 'edges',
          data: { id: `me-${inp.sourceId}-${model.modelId}`, source: inp.sourceId, target: `model-${model.modelId}`, label: 'READS', type: 'READS_FIELD' },
          classes: 'model-overlay',
        })
      }
    }

    // 출력 엣지 (Model → OntologyType)
    for (const out of model.outputs) {
      if (cy.getElementById(out.targetId).length > 0) {
        cy.add({
          group: 'edges',
          data: { id: `me-${model.modelId}-${out.targetId}`, source: `model-${model.modelId}`, target: out.targetId, label: 'PREDICTS', type: 'PREDICTS_FIELD' },
          classes: 'model-overlay',
        })
      }
    }
  }
}

function removeModelNodesFromCytoscape() {
  if (!cy) return
  cy.elements('.model-overlay').remove()
}

async function deleteModelFromOverlay(modelId: string) {
  if (!currentSchemaId.value) return
  if (!confirm('이 모델을 삭제하시겠습니까?')) return
  try {
    await fetch(`/api/gateway/domain-whatif/models/${currentSchemaId.value}/${modelId}`, { method: 'DELETE' })
    modelOverlayData.value = modelOverlayData.value.filter(m => m.modelId !== modelId)
    if (cy) {
      cy.getElementById(`model-${modelId}`).remove()
    }
  } catch (e) { console.warn('모델 삭제 실패:', e) }
}
const whatifPanelHeight = ref(350) // 기본 높이 (px)
let isResizingWhatIf = false
let resizeStartY = 0
let resizeStartHeight = 0

function startResizeWhatIf(e: MouseEvent) {
  isResizingWhatIf = true
  resizeStartY = e.clientY
  resizeStartHeight = whatifPanelHeight.value
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onResizeWhatIf)
  document.addEventListener('mouseup', stopResizeWhatIf)
}

function onResizeWhatIf(e: MouseEvent) {
  if (!isResizingWhatIf) return
  const delta = resizeStartY - e.clientY // 위로 드래그 = 패널 커짐
  const newHeight = Math.max(150, Math.min(window.innerHeight * 0.75, resizeStartHeight + delta))
  whatifPanelHeight.value = newHeight
}

function stopResizeWhatIf() {
  isResizingWhatIf = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onResizeWhatIf)
  document.removeEventListener('mouseup', stopResizeWhatIf)
}

// 온톨로지 이름 자동 생성 함수
function generateOntologyName(nodes: OntologyNode[]): string {
  if (nodes.length === 0) {
    return `온톨로지_${new Date().toISOString().slice(0, 10)}`
  }
  
  // 레이어별 노드 수 집계
  const layerCounts: Record<string, number> = {}
  const nodeNames: string[] = []
  
  nodes.forEach(node => {
    const layer = node.layer || node.label || 'Unknown'
    layerCounts[layer] = (layerCounts[layer] || 0) + 1
    if (node.name) {
      nodeNames.push(node.name)
    }
  })
  
  // 주요 레이어 찾기 (노드가 가장 많은 레이어)
  const mainLayer = Object.entries(layerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  
  // 주요 노드 이름들 추출 (상위 3개)
  const topNodes = nodeNames.slice(0, 3).join('_')
  
  // 레이어와 노드 수 기반 이름 생성
  if (mainLayer && topNodes) {
    const layerName = mainLayer === 'KPI' ? 'KPI' : 
                     mainLayer === 'Measure' ? '측정' :
                     mainLayer === 'Process' ? '프로세스' :
                     mainLayer === 'Driver' ? '드라이버' :
                     mainLayer === 'Resource' ? '자원' : mainLayer
    return `${layerName}_${topNodes}_온톨로지`
  }
  
  // 기본값: 노드 수와 날짜
  return `온톨로지_${nodes.length}노드_${new Date().toISOString().slice(5, 10).replace('-', '')}`
}

// 테마 변경 감지 및 Cytoscape 스타일 업데이트
function updateCytoscapeTheme() {
  isDarkMode.value = document.documentElement.getAttribute('data-theme') !== 'light'
  if (cy) {
    cy.style(getCytoscapeStyles())
  }
}

// ============================================================================
// Agent Activity Monitoring + Visual Effects
// ============================================================================
import { nodeAgentSchedulerApi, nodeVisualEffectsApi } from '@/services/api'
import type { NodeAgentState, NodeAgentLog, NodeVisualEffects } from '@/services/api'

const agentStates = ref<Map<string, NodeAgentState>>(new Map())
let agentPollInterval: ReturnType<typeof setInterval> | null = null

// Agent log streaming state
const agentLogStream = ref<NodeAgentLog[]>([])
const agentLogEventSource = ref<EventSource | null>(null)
const showAgentMonitor = ref(false)
const agentFeedbackText = ref('')

async function pollAgentStates() {
  try {
    const states = await nodeAgentSchedulerApi.listAgents()
    const newMap = new Map<string, NodeAgentState>()
    for (const s of states) {
      newMap.set(s.node_type_name, s)
    }
    agentStates.value = newMap

    // Update Cytoscape node classes
    if (cy) {
      cy.nodes().forEach((node: any) => {
        const label = node.data('label')
        const agentState = newMap.get(label)
        node.removeClass('agent-active agent-running')
        if (agentState) {
          if (agentState.status === 'running') {
            node.addClass('agent-running')
          } else if (agentState.status === 'idle' || agentState.status === 'paused') {
            node.addClass('agent-active')
          }
        }
      })
    }
  } catch {
    // Scheduler might not be running; silently ignore
  }
}

function startAgentLogStream(nodeType: string) {
  stopAgentLogStream()
  agentLogStream.value = []
  try {
    const es = nodeAgentSchedulerApi.createLogStream(nodeType)
    es.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data)
        agentLogStream.value.push(log)
        if (agentLogStream.value.length > 100) {
          agentLogStream.value = agentLogStream.value.slice(-100)
        }
      } catch { /* ignore parse errors */ }
    }
    es.onerror = () => {
      // Connection lost, will auto-retry
    }
    agentLogEventSource.value = es
  } catch { /* scheduler not available */ }
}

function stopAgentLogStream() {
  if (agentLogEventSource.value) {
    agentLogEventSource.value.close()
    agentLogEventSource.value = null
  }
}

async function controlAgent(nodeType: string, action: 'stop' | 'pause' | 'resume') {
  try {
    await nodeAgentSchedulerApi.control(nodeType, action)
    await pollAgentStates()
  } catch (e: any) {
    console.error('Agent control error:', e)
  }
}

async function submitAgentFeedback(nodeType: string) {
  if (!agentFeedbackText.value.trim()) return
  try {
    await nodeAgentSchedulerApi.submitFeedback(nodeType, agentFeedbackText.value.trim())
    agentFeedbackText.value = ''
  } catch (e: any) {
    console.error('Feedback submit error:', e)
  }
}

function getAgentStateForNode(nodeName: string): NodeAgentState | undefined {
  return agentStates.value.get(nodeName)
}

// ------- Visual Effects -------
const nodeVisualFx = ref<Record<string, NodeVisualEffects>>({})

async function pollVisualEffects() {
  try {
    const result = await nodeVisualEffectsApi.getAll()
    nodeVisualFx.value = result.effects || {}
    applyVisualEffectsToCytoscape()
  } catch {
    // Silently ignore
  }
}

function applyVisualEffectsToCytoscape() {
  if (!cy) return

  cy.nodes().forEach((node: any) => {
    const label = node.data('label')
    const fx = nodeVisualFx.value[label]

    // Clear previous agent effects
    node.removeClass('fx-alert fx-badge')
    node.removeData('badgeText')
    node.removeData('badgeColor')

    if (!fx) return

    // Color override
    if (fx.color) {
      node.style('background-color', fx.color)
    }

    // Alert effect (pulsing border)
    if (fx.alert) {
      node.addClass('fx-alert')
    }

    // Badge — prepend to label
    if (fx.badge) {
      node.addClass('fx-badge')
      const originalLabel = node.data('originalLabel') || node.data('label')
      if (!node.data('originalLabel')) {
        node.data('originalLabel', originalLabel)
      }
      node.data('label', `${fx.badge} ${originalLabel}`)
    } else if (node.data('originalLabel')) {
      node.data('label', node.data('originalLabel'))
      node.removeData('originalLabel')
    }

    // Opacity
    if (fx.opacity !== undefined && fx.opacity !== null) {
      node.style('opacity', fx.opacity)
    }
  })
}

// Lifecycle
onMounted(async () => {
  // 키보드 단축키 등록 (Ctrl+Z, Ctrl+Y)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('blur', handleWindowBlur)
  
  // 테마 변경 감지
  themeObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'data-theme') {
        updateCytoscapeTheme()
      }
    })
  })
  themeObserver.observe(document.documentElement, { attributes: true })
  
  // 드롭다운 외부 클릭 시 닫기
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (showOntologyListDropdown.value && !target.closest('.ontology-list-dropdown')) {
      showOntologyListDropdown.value = false
    }
  })
  
  // 노드 추가 드롭다운 및 컨텍스트 메뉴 외부 클릭 시 닫기
  document.addEventListener('click', onDocumentClick)

  // 레이어 셀렉터 외부 클릭 시 닫기
  document.addEventListener('click', closeLayerSelectorOnOutsideClick)
  
  // 온톨로지 목록 로드 및 최근 온톨로지 자동 열기
  await loadOntologyList()
  
  if (nodes.value.length > 0) {
    initCytoscape()
  }

  // Start agent activity + visual effects polling (every 10s / 5s)
  pollAgentStates()
  pollVisualEffects()
  agentPollInterval = setInterval(() => {
    pollAgentStates()
    pollVisualEffects()
  }, 5000)
})

onUnmounted(() => {
  // 키보드 단축키 해제
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('blur', handleWindowBlur)
  
  // 클릭 이벤트 해제
  document.removeEventListener('click', onDocumentClick)
  
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
  if (cy) {
    detachEdgehandleCyEvents()
    edgehandlesInstance?.destroy()
    edgehandlesInstance = null
    cy.destroy()
    cy = null
  }
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
  isChartReady.value = false
  // Stop agent polling
  if (agentPollInterval) {
    clearInterval(agentPollInterval)
    agentPollInterval = null
  }
  stopAgentLogStream()
})

// nodeDataResult 변경 시 차트 렌더링
watch(nodeDataResult, async (newVal) => {
  if (newVal && newVal.chartRecommendation?.type !== 'table' && newVal.rows?.length > 0) {
    await nextTick()
    // DOM이 준비될 때까지 대기
    setTimeout(() => {
      renderChart()
    }, 150)
  }
}, { deep: true })

// chartContainerRef가 설정될 때 차트 렌더링
watch(chartContainerRef, async (newVal) => {
  if (newVal && nodeDataResult.value && nodeDataResult.value.chartRecommendation?.type !== 'table') {
    await nextTick()
    setTimeout(() => {
      renderChart()
    }, 100)
  }
})

watch([nodes, relationships], () => {
  // 스키마 로드 중에는 loadSchema에서 initCytoscape(true)를 호출하므로 여기서 덮어쓰지 않음
  if (isLoadingSchema.value) return
  if (nodes.value.length === 0) {
    closeContextMenu()
    closeRelationEditor()
    clearCausalHighlight()
    destroyCytoscapeCanvas()
    return
  }
  nextTick(() => initCytoscape())
})

</script>

<style scoped>
.multi-layer-ontology-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* 스키마 에디터와 동일한 배경 그라데이션 */
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
}

.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  /* 스키마 에디터와 통일된 배경 (glassmorphism 제거) */
  background: rgba(30, 30, 40, 0.4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.viewer-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
}

/* 필터 바 스타일 */
.filter-bar {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(147, 51, 234, 0.08));
  border-bottom: 1px solid rgba(59, 130, 246, 0.25);
  padding: 12px 24px;
}

.filter-bar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-icon { font-size: 1rem; }

.filter-title {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.95rem;
}

.clear-all-filters-btn {
  margin-left: auto;
  padding: 4px 12px;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 6px;
  color: #fca5a5;
  font-size: 0.75rem;
  cursor: pointer;
}

.filter-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
}

.filter-field label {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
}

.filter-field input,
.filter-field select {
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.8rem;
}

.filter-field input:focus,
.filter-field select:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.6);
}

.date-range-filter,
.range-filter {
  display: flex;
  align-items: center;
  gap: 6px;
}

.date-range-filter span,
.range-filter span {
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.8rem;
}

.date-range-filter input,
.range-filter input {
  flex: 1;
  min-width: 90px;
}

.no-filter-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
}

.no-filter-fields .hint {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
}

/* 생성 모드 탭 */
.generation-mode-tabs {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid var(--color-border);
}

.mode-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.mode-tab:hover {
  background: rgba(255, 255, 255, 0.05);
}

.mode-tab.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.schema-generation-content {
  padding: 0;
  max-height: 60vh;
  overflow-y: auto;
}

.header-actions {
  display: flex;
  gap: 8px;
  position: relative;
}

/* 온톨로지 목록 드롭다운 */
.ontology-list-dropdown {
  position: relative;
}

.ontology-list-dropdown .action-btn {
  position: relative;
}

.dropdown-arrow {
  margin-left: 4px;
  font-size: 0.75rem;
  opacity: 0.7;
  transition: transform 0.2s ease;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 320px;
  max-width: 400px;
  max-height: 500px;
  background: rgba(20, 20, 30, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  overflow: hidden;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.7);
}

.dropdown-empty {
  text-align: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.5);
}

.dropdown-list {
  max-height: 500px;
  overflow-y: auto;
  padding: 8px;
}

.dropdown-item {
  padding: 12px 16px;
  margin-bottom: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dropdown-item:hover:not(.editing) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(99, 102, 241, 0.4);
  transform: translateX(4px);
}

.dropdown-item.active {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.5);
}

.dropdown-item.schema-invalid {
  opacity: 0.6;
  border-color: rgba(239, 68, 68, 0.3);
  cursor: not-allowed;
}

.dropdown-item.schema-invalid:hover {
  background: rgba(255, 255, 255, 0.04);
  transform: none;
}

.dropdown-item.editing {
  border-color: rgba(99, 102, 241, 0.5);
  background: rgba(99, 102, 241, 0.1);
}

.dropdown-item-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.dropdown-item-name {
  flex: 1;
  font-size: 0.9375rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  cursor: pointer;
}

.dropdown-item-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}

.delete-schema-btn {
  margin-left: auto;
  padding: 2px 6px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-size: 0.875rem;
  border-radius: 4px;
}

.delete-schema-btn:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.15);
}

.node-count-small {
  color: rgba(255, 255, 255, 0.7);
}

.updated-at-small {
  color: rgba(255, 255, 255, 0.5);
}

.edit-name-btn-small {
  padding: 2px 6px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  border-radius: 4px;
  font-size: 0.75rem;
  transition: all 0.2s ease;
  opacity: 0;
}

.dropdown-item:hover .edit-name-btn-small {
  opacity: 1;
}

.edit-name-btn-small:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(99, 179, 237, 0.4);
}

.action-btn.primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

.action-btn.primary:hover {
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
  transform: translateY(-1px);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none !important;
}

.loading-overlay {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--color-text-light);
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.viewer-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;  /* flexbox 자식 스크롤 허용 */
  width: 100%;    /* 전체 너비 사용 */
}

/* 왼쪽 패널 - 오른쪽 영역과 동일한 배경으로 통일 */
.layer-panel {
  width: 280px;
  min-width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  /* 오른쪽 graph-panel과 동일한 배경 */
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
  /* backdrop-filter 제거하여 오른쪽과 동일한 불투명도 유지 */
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.2);
  transition: width 0.3s ease, min-width 0.3s ease;
}

.layer-panel.layer-panel-collapsed {
  width: 44px;
  min-width: 44px;
  overflow: hidden;
}

.layer-panel-header {
  margin: 0;
  padding: 16px 20px;
  font-size: 0.9375rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  /* graph-toolbar와 동일한 배경으로 통일 */
  background: rgba(30, 30, 40, 0.4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  white-space: nowrap;
}

.layer-panel-collapsed .layer-panel-header {
  padding: 16px 0;
  justify-content: center;
}

.layer-panel-toggle-btn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  line-height: 1;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.layer-panel-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.95);
  border-color: rgba(255, 255, 255, 0.3);
}

.layer-panel h3 {
  margin: 0;
  padding: 16px 20px;
  font-size: 0.9375rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  /* graph-toolbar와 동일한 배경으로 통일 */
  background: rgba(30, 30, 40, 0.4);
}

.layer-list {
  padding: 12px;
  /* graph-panel과 동일한 배경 유지 (투명하여 그라데이션이 보이도록) */
  background: transparent;
}

.layer-item {
  margin-bottom: 6px;
  border-radius: 10px;
  overflow: hidden;
  /* 오른쪽 패널 요소들과 유사한 배경 */
  background: rgba(30, 30, 40, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.layer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  border-left: 4px solid;
  transition: all 0.2s ease;
}

.layer-header:hover {
  background: rgba(255, 255, 255, 0.06);
}

.layer-icon {
  font-size: 1rem;
}

.layer-name {
  flex: 1;
  font-weight: 500;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.95);
}

.layer-count {
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
}

.collapse-icon {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.5);
}

.layer-nodes {
  padding: 4px 14px 10px;
}

.node-item {
  padding: 8px 12px;
  margin: 3px 0;
  border-radius: 8px;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  transition: all 0.2s ease;
  background: rgba(255, 255, 255, 0.02);
}

.node-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 1);
}

.node-item.selected {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

/* 중앙 그래프 패널 */
.graph-panel {
  flex: 1;
  min-width: 0;  /* flex 자식이 축소될 수 있도록 허용 */
  display: flex;
  flex-direction: column;
  position: relative;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
}

/* 플로팅 미니 툴바 (좌하단) */
.graph-floating-toolbar {
  position: absolute;
  bottom: 56px;
  left: 16px;
  z-index: 20;
  display: flex;
  gap: 6px;
}

.floating-tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(30, 30, 45, 0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: all 0.2s ease;
}

.floating-tool-btn:hover:not(:disabled) {
  background: rgba(34, 211, 238, 0.12);
  border-color: rgba(34, 211, 238, 0.4);
  transform: scale(1.08);
}

.floating-tool-btn.active {
  background: #06b6d4;
  border-color: #06b6d4;
  box-shadow: 0 4px 20px rgba(6, 182, 212, 0.45);
}

.floating-tool-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.floating-tool-icon {
  font-size: 1.1rem;
}

/* 소스 선택 후 타겟 대기 배너 (상단 중앙) */
.relation-pending-banner {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border: 1px solid rgba(34, 211, 238, 0.35);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 8px 24px rgba(8, 47, 73, 0.35);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  white-space: nowrap;
  animation: slideDownBanner 0.2s ease;
}

@keyframes slideDownBanner {
  from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.relation-pending-badge {
  font-size: 0.8rem;
  font-weight: 700;
  color: #67e8f9;
}

.relation-pending-text {
  font-size: 0.82rem;
  color: rgba(226, 232, 240, 0.92);
}

.relation-pending-text strong {
  color: #67e8f9;
}

.relation-pending-cancel {
  padding: 4px 10px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.relation-pending-cancel:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
}

.graph-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  /* 왼쪽/오른쪽 패널과 통일된 배경 */
  background: rgba(30, 30, 40, 0.4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.tool-btn {
  padding: 6px 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(99, 179, 237, 0.5);
  color: #63b3ed;
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.15);
  margin: 0 8px;
}

.layout-select {
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  font-size: 0.8125rem;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
}

/* 헤더에 배치된 레이아웃 드롭다운 */
.header-layout-select {
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  font-size: 0.8125rem;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: all 0.2s ease;
  height: 36px;
}

.header-layout-select:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

/* ========== 노드 추가 드롭다운 ========== */
.add-node-dropdown {
  position: relative;
  display: inline-block;
}

.add-node-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(34, 197, 94, 0.1) !important;
  border-color: rgba(34, 197, 94, 0.3) !important;
  color: #22c55e !important;
}

.add-node-btn:hover {
  background: rgba(34, 197, 94, 0.2) !important;
  border-color: rgba(34, 197, 94, 0.5) !important;
}

.dropdown-arrow-small {
  font-size: 0.65rem;
  margin-left: 2px;
}

.add-node-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: rgba(30, 30, 45, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  z-index: 1000;
  min-width: 160px;
  padding: 6px 0;
  animation: fadeIn 0.15s ease;
}

.add-node-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s ease;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.85rem;
}

.add-node-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.add-node-icon {
  font-size: 1rem;
}

.add-node-label {
  flex: 1;
}

.add-node-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

/* ========== 캔버스 우클릭 컨텍스트 메뉴 ========== */
.canvas-context-menu {
  position: absolute;
  z-index: 1000;
  background: rgba(25, 25, 40, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(16px);
  min-width: 180px;
  padding: 6px 0;
  animation: contextMenuFadeIn 0.12s ease;
}

@keyframes contextMenuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.context-menu-header {
  padding: 8px 16px 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 4px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.85rem;
}

.context-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.context-menu-item:first-of-type {
  border-radius: 0;
}

.context-menu-item:last-child {
  border-radius: 0 0 12px 12px;
}

.context-menu-icon {
  font-size: 1rem;
  width: 20px;
  text-align: center;
}

.context-menu-label {
  flex: 1;
  font-weight: 500;
}

.context-menu-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.context-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 12px;
}

.context-menu-danger {
  color: #f87171 !important;
}

.context-menu-danger:hover {
  background: rgba(239, 68, 68, 0.15) !important;
}

/* ========== 필터 다이얼로그 ========== */
.filter-dialog {
  background: rgba(25, 25, 40, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
  width: 560px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  animation: dialogFadeIn 0.2s ease;
}

@keyframes dialogFadeIn {
  from { opacity: 0; transform: scale(0.95) translateY(-10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.filter-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.filter-dialog-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.05rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
}

.filter-dialog-icon {
  font-size: 1.2rem;
}

.filter-dialog-actions-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-dialog-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.filter-dialog-close:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
}

.filter-dialog-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.filter-dialog-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-field-row label {
  font-size: 0.8rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-field-row input[type="date"],
.filter-field-row input[type="number"],
.filter-field-row input[type="text"],
.filter-field-row select {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.2s ease;
}

.filter-field-row input:focus,
.filter-field-row select:focus {
  border-color: rgba(99, 179, 237, 0.5);
  box-shadow: 0 0 0 2px rgba(99, 179, 237, 0.1);
}

.filter-field-row .date-range-filter,
.filter-field-row .range-filter {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-field-row .date-range-filter input,
.filter-field-row .range-filter input {
  flex: 1;
  min-width: 0;
}

.filter-field-row .date-range-filter span,
.filter-field-row .range-filter span {
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.85rem;
}

.filter-dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.filter-apply-btn {
  padding: 8px 24px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-apply-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.select-filter-wrapper,
.search-filter-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.select-filter-wrapper .select-filter,
.search-filter-wrapper .search-filter {
  width: 100%;
}

.filter-loading-hint {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.35);
  font-style: italic;
}

.filter-count-hint {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.3);
  text-align: right;
}

/* ========== 필터 칩 (상세 패널) ========== */
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  line-height: 1.4;
  max-width: 100%;
}

.filter-chip.direct {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #fbbf24;
}

.filter-chip.cascade {
  background: rgba(167, 139, 250, 0.12);
  border: 1px solid rgba(167, 139, 250, 0.25);
  color: #c4b5fd;
}

.chip-label {
  font-weight: 600;
}

.chip-equals {
  color: rgba(255, 255, 255, 0.3);
}

.chip-value {
  font-family: var(--font-mono, monospace);
  font-size: 0.7rem;
}

.chip-source {
  font-size: 0.65rem;
  color: rgba(167, 139, 250, 0.6);
  margin-left: 2px;
}

/* ========== 릴레이션 속성 편집 다이얼로그 ========== */
/* 릴레이션 편집 다이얼로그 (레거시 - 우측 패널로 이동) */
.relation-editor-dialog {
  background: rgba(25, 25, 40, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
  width: 600px;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  animation: dialogFadeIn 0.2s ease;
}

.relation-editor-dialog .dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ========== 릴레이션 우측 패널 ========== */
.relation-preview-panel {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.rel-endpoint {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.rel-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.rel-name {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rel-arrow-panel {
  color: rgba(255, 255, 255, 0.3);
  font-size: 1.1rem;
  font-weight: bold;
  flex-shrink: 0;
}

.relation-panel-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ========== 상세 패널 내 폼 요소 공통 스타일 ========== */
.detail-panel .form-select,
.detail-panel .form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.875rem;
  font-family: inherit;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
}

.detail-panel .form-select {
  cursor: pointer;
  color-scheme: dark;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}

.detail-panel .form-select option {
  background: #1e1e2e;
  color: #e2e8f0;
  padding: 8px 12px;
}

.detail-panel .form-select option:checked {
  background: #334155;
  color: #f8fafc;
}

.detail-panel .form-select:focus,
.detail-panel .form-input:focus {
  outline: none;
  border-color: rgba(99, 102, 241, 0.6);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

.detail-panel .form-select:hover,
.detail-panel .form-input:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.detail-panel .form-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.dialog-footer-right {
  display: flex;
  gap: 10px;
}

.field-mapping-section {
  margin-top: 20px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

.field-mapping-section h4 {
  margin: 0 0 6px 0;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.9);
}

.field-mapping-hint {
  margin: 0 0 16px 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.5;
}

.field-mapping-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.field-mapping-col {
  flex: 1;
  min-width: 0;
}

.field-mapping-col label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
}

.field-node-hint {
  font-weight: 400;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.7rem;
}

.field-mapping-arrow {
  padding-top: 28px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 1.2rem;
  font-weight: bold;
  flex-shrink: 0;
}

.field-status {
  width: 100%;
  box-sizing: border-box;
  border-radius: 10px;
  font-size: 0.8rem;
  line-height: 1.5;
}

.field-status.loading {
  color: rgba(255, 255, 255, 0.55);
}

.field-status.no-datasource {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
}

.field-status.error {
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.link-datasource-btn-sm {
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid rgba(96, 165, 250, 0.35);
  background: rgba(59, 130, 246, 0.14);
  color: #93c5fd;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.18s ease;
  flex-shrink: 0;
}

.link-datasource-btn-sm:hover {
  background: rgba(59, 130, 246, 0.22);
  border-color: rgba(96, 165, 250, 0.5);
}

/* ========== Cascading 필터 정보 ========== */
.cascading-filters-info {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: rgba(167, 139, 250, 0.08);
  border: 1px solid rgba(167, 139, 250, 0.2);
  border-radius: 10px;
}

.cascading-filters-info h5 {
  margin: 0 0 10px 0;
  font-size: 0.8rem;
  color: #a78bfa;
  font-weight: 600;
}

.cascading-filter-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 0.8rem;
  flex-wrap: wrap;
}

.cf-from {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.75rem;
}

.cf-arrow {
  color: rgba(255, 255, 255, 0.3);
}

.cf-field {
  color: #a78bfa;
  font-weight: 500;
}

.cf-equals {
  color: rgba(255, 255, 255, 0.3);
}

.cf-value {
  padding: 2px 8px;
  background: rgba(167, 139, 250, 0.15);
  border-radius: 4px;
  color: #c4b5fd;
  font-size: 0.75rem;
}

.cytoscape-container {
  flex: 1;
  min-height: 400px;
  /* graph-panel과 동일한 배경 (투명하게 하여 그라데이션이 보이도록) */
  background: transparent;
}

.graph-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 20px;
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  /* Glassmorphism 효과 */
  background: rgba(30, 30, 40, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.9);
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.legend-divider {
  color: var(--color-border);
}

.edge-legend {
  display: flex;
  align-items: center;
  gap: 4px;
}

.edge-line {
  width: 20px;
  height: 2px;
  display: inline-block;
}

.edge-line.causes { background: #ef4444; }
.edge-line.measured { background: #22c55e; }
.edge-line.produces { background: #3b82f6; }

/* 오른쪽 상세 패널 - Glassmorphism 효과 */
.detail-panel {
  position: relative;
  min-width: 280px;
  max-width: 800px;
  flex-shrink: 0;
  height: 100%;
  overflow: hidden;
  z-index: 10;
  display: flex;
  flex-direction: column;
  /* Glassmorphism 효과 - 투명도 낮춰서 뒤가 비치도록 */
  background: rgba(20, 20, 30, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.4);
  transition: width 0.1s ease;
}

/* 리사이즈 핸들 */
.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: ew-resize;
  z-index: 20;
  background: transparent;
  transition: background 0.2s ease;
}

.resize-handle:hover {
  background: rgba(99, 102, 241, 0.5);
}

.resize-handle:active {
  background: rgba(99, 102, 241, 0.8);
}

.detail-panel h3 {
  margin: 0;
  padding: 14px 20px;
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  /* Glassmorphism 효과 - 더 투명하게 */
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 2;
  letter-spacing: -0.01em;
}

/* 상세 패널 탭 */
.detail-tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0 16px;
  /* Glassmorphism 효과 - 더 투명하게 */
  background: rgba(255, 255, 255, 0.01);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  flex-shrink: 0;
  z-index: 1;
}

.detail-tabs .tab-btn {
  flex: 1;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  font-size: 0.9375rem;
  font-weight: 600;
  transition: all 0.2s ease;
  border-bottom: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  letter-spacing: -0.01em;
}

.detail-tabs .tab-btn:hover:not(:disabled) {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.detail-tabs .tab-btn.active {
  color: #fff;
  background: rgba(99, 102, 241, 0.45);
  border-bottom-color: #6366f1;
  font-weight: 700;
}

.detail-tabs .tab-btn:disabled {
  opacity: 0.5;
  color: rgba(255, 255, 255, 0.5);
  cursor: not-allowed;
}

.data-indicator {
  color: #22c55e;
  font-size: 8px;
}

.detail-content {
  padding: 16px 20px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* BPMN 탭 - 다이어그램 영역을 최대한 활용 */
.detail-content.bpmn-tab {
  padding: 0;
  display: block;
  overflow-y: auto;
  overflow-x: hidden;
}

.bpmn-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #888;
  text-align: center;
  gap: 8px;
}

.bpmn-hint {
  font-size: 0.8rem;
  color: #aaa;
}

/* 데이터 탭 스타일 */
.detail-content.data-tab {
  padding: 16px;
}

.data-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.loading-spinner.small {
  width: 24px;
  height: 24px;
}

.no-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 12px;
  text-align: center;
}

.no-data span {
  font-size: 2rem;
}

.no-data p {
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

.action-btn.small {
  padding: 8px 16px;
  font-size: 0.75rem;
}

.action-btn.small.secondary {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.action-btn.small.secondary:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.no-data-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.data-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.data-source-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  /* Glassmorphism 효과 - 더 투명하게 */
  background: rgba(30, 30, 40, 0.3);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 0.8125rem;
}

.source-label {
  color: rgba(255, 255, 255, 0.6);
}

.data-source-info code {
  flex: 1;
  color: #a78bfa;
  background: rgba(167, 139, 250, 0.1);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
}

.row-count {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.75rem;
}

.biz-day-badge {
  font-size: 0.6875rem;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.12);
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.business-day-filter-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  background: rgba(30, 30, 40, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    white-space: nowrap;
    
    input[type="checkbox"] {
      display: none;
    }
    
    .toggle-switch {
      position: relative;
      width: 36px;
      height: 20px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      transition: background 0.2s ease;
      flex-shrink: 0;
      
      &::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 50%;
        transition: all 0.2s ease;
      }
    }
    
    input:checked + .toggle-switch {
      background: rgba(34, 197, 94, 0.5);
      
      &::after {
        left: 18px;
        background: #22c55e;
      }
    }
    
    .toggle-text {
      font-size: 0.8125rem;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.8);
    }
  }
  
  .toggle-desc {
    font-size: 0.6875rem;
    color: rgba(255, 255, 255, 0.35);
    flex: 1;
  }
}

.datasource-badge {
  background: rgba(167, 139, 250, 0.15) !important;
  color: #a78bfa !important;
  padding: 6px 10px !important;
  border-radius: 6px !important;
  font-size: 0.8125rem !important;
}

.datasource-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.datasource-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
}

.datasource-meta {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}

.reset-datasource-btn {
  padding: 6px 12px;
  font-size: 0.75rem;
  background: rgba(251, 146, 60, 0.15);
  color: #fb923c;
  border: 1px solid rgba(251, 146, 60, 0.3);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  font-weight: 500;
}

.reset-datasource-btn:hover {
  background: rgba(251, 146, 60, 0.25);
  border-color: rgba(251, 146, 60, 0.5);
  transform: translateY(-1px);
}

.no-datasource {
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
  margin-right: 8px;
}

.link-datasource-btn {
  padding: 6px 12px;
  font-size: 0.75rem;
  background: rgba(99, 102, 241, 0.2);
  color: #a78bfa;
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.link-datasource-btn:hover {
  background: rgba(99, 102, 241, 0.3);
  border-color: rgba(99, 102, 241, 0.5);
}

.action-btn.success {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  border: none;
  box-shadow: 0 4px 15px rgba(34, 197, 94, 0.3);
}

.action-btn.success:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(34, 197, 94, 0.4);
  transform: translateY(-1px);
}

.action-btn.success:disabled {
  background: var(--color-bg-tertiary);
  color: var(--color-text-light);
  opacity: 0.5;
}

/* 차트 섹션 */
.chart-section {
  background: rgba(30, 30, 40, 0.4);
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.chart-header {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(30, 30, 40, 0.3);
}

.chart-header h5 {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.chart-shell {
  position: relative;
}

.chart-container {
  width: 100%;
  height: 200px;
  padding: 8px;
}

.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.875rem;
}

.chart-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.analysis-config-bar {
  margin: 0;
  padding: 10px 12px;
  background: rgba(6, 182, 212, 0.06);
  border-top: 1px solid rgba(6, 182, 212, 0.2);
  border-bottom: 1px solid rgba(6, 182, 212, 0.2);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.config-hint {
  font-size: 0.75rem;
  font-weight: 600;
  color: #67e8f9;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.config-label {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.65);
  font-weight: 500;
}

.config-value {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.92);
  font-weight: 600;
}

.config-metric-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.config-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.config-metric-select,
.result-metric-select {
  min-width: 180px;
  max-width: 240px;
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid rgba(6, 182, 212, 0.3);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.75rem;
}

.config-metric-highlight {
  animation: analysisMetricPulse 1.8s ease-in-out infinite;
}

.trend-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.trend-btn {
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid rgba(6, 182, 212, 0.18);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.trend-btn.active {
  background: rgba(6, 182, 212, 0.14);
  border-color: rgba(6, 182, 212, 0.35);
  color: #67e8f9;
}

.config-analyze-btn,
.reanalyze-btn,
.reconfigure-btn,
.goto-data-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.config-analyze-btn,
.reanalyze-btn {
  border: none;
  background: #06b6d4;
  color: #fff;
}

.config-analyze-btn:hover:not(:disabled),
.reanalyze-btn:hover:not(:disabled) {
  background: #0891b2;
}

.config-analyze-btn:disabled,
.reanalyze-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.reconfigure-btn,
.goto-data-btn {
  border: 1px solid rgba(6, 182, 212, 0.25);
  background: transparent;
  color: #67e8f9;
}

.reconfigure-btn:hover,
.goto-data-btn:hover {
  background: rgba(6, 182, 212, 0.08);
}

.btn-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.analysis-result-header {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: rgba(6, 182, 212, 0.06);
  border: 1px solid rgba(6, 182, 212, 0.16);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.result-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.75rem;
}

.result-metric {
  font-weight: 700;
  color: #67e8f9;
}

.result-range {
  color: rgba(255, 255, 255, 0.7);
}

.result-type {
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
}

.result-reanalyze {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.analysis-empty {
  padding: 40px 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.68);
  font-size: 0.8125rem;
  line-height: 1.6;
}

@keyframes analysisMetricPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.18); }
  50% { box-shadow: 0 0 0 4px rgba(6, 182, 212, 0.1); }
}

/* 데이터 테이블 섹션 */
.data-table-section {
  background: rgba(30, 30, 40, 0.4);
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(30, 30, 40, 0.3);
}

.table-header h5 {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.column-count {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.5);
}

.data-table-wrapper {
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.data-table th,
.data-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  white-space: nowrap;
}

.data-table th {
  background: rgba(255, 255, 255, 0.08) !important;
  color: rgba(255, 255, 255, 0.95) !important;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}

.data-table td {
  color: rgba(255, 255, 255, 0.85) !important;
}

.data-table tr:hover td {
  background: rgba(255, 255, 255, 0.03);
}

.col-type {
  margin-left: 4px;
  font-size: 0.625rem;
  opacity: 0.6;
}

.col-type.time {
  color: #22c55e;
}

.col-type.numeric {
  color: #3b82f6;
}

.table-footer {
  padding: 10px 16px;
  text-align: center;
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.4);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

/* ========== 노드 상세 헤더 + 삭제 버튼 ========== */
.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.detail-header h3 {
  margin: 0;
}

.delete-node-btn {
  padding: 5px 12px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.delete-node-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  color: #ef4444;
}

/* ========== 노드 이름 인라인 편집 ========== */
.editable-name-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editable-node-name {
  cursor: pointer;
  flex: 1;
  min-width: 0;
}

.editable-node-name:hover {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 2px 6px;
  margin: -2px -6px;
}

.edit-name-btn {
  flex-shrink: 0;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
  line-height: 1;
}

.edit-name-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(99, 179, 237, 0.4);
  color: #63b3ed;
}

.node-name-edit-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid rgba(99, 179, 237, 0.5);
  border-radius: 8px;
  background: rgba(30, 30, 50, 0.8);
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.9375rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s ease;
  min-width: 0;
}

.node-name-edit-input:focus {
  border-color: #63b3ed;
  box-shadow: 0 0 0 3px rgba(99, 179, 237, 0.15);
}

.detail-row {
  margin-bottom: 20px;
}

.detail-row label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 500;
}

.detail-row span, .detail-row code {
  display: block;
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.92);
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  line-height: 1.7;
  max-width: 100%;
}

.detail-row code {
  padding: 10px 14px;
  /* Glassmorphism 효과 */
  background: rgba(30, 30, 40, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  white-space: pre-wrap;
}

.layer-badge {
  display: inline-block;
  padding: 6px 16px;
  border-radius: 20px;
  color: white;
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.layer-badge-clickable {
  cursor: pointer;
  transition: filter 0.15s, box-shadow 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  user-select: none;
}

.layer-badge-clickable:hover {
  filter: brightness(1.15);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.layer-badge-arrow {
  font-size: 0.7rem;
  opacity: 0.7;
}

.layer-selector-wrapper {
  display: inline-block;
}

.layer-selector-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 1000;
  min-width: 180px;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  animation: layerDropdownFadeIn 0.15s ease-out;
}

@keyframes layerDropdownFadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.layer-selector-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.85rem;
  font-weight: 500;
  transition: background 0.12s;
}

.layer-selector-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.layer-selector-item.active {
  background: rgba(255, 255, 255, 0.12);
  color: white;
  font-weight: 600;
}

.layer-selector-icon {
  font-size: 1rem;
  width: 20px;
  text-align: center;
}

.layer-selector-name {
  flex: 1;
}

.layer-selector-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.related-section {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.related-section h4 {
  margin: 0 0 16px 0;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 600;
}

.related-section h4 {
  margin: 0 0 12px;
  font-size: 0.8125rem;
  color: var(--color-text);
}

.relation-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.relation-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  /* Glassmorphism 효과 */
  background: rgba(30, 30, 40, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  font-size: 0.8125rem;
  transition: border-color 0.2s ease;
}

.relation-item:hover {
  border-color: rgba(99, 179, 237, 0.3);
}

.rel-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.rel-field-mapping {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  padding-left: 4px;
}

.rel-field {
  color: #a78bfa;
  font-family: var(--font-mono, monospace);
  font-size: 0.7rem;
}

.rel-field-arrow {
  color: rgba(255, 255, 255, 0.3);
  font-size: 0.65rem;
}

.rel-source, .rel-target {
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
  word-break: break-word;
  max-width: 120px;
}

.rel-type {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.6875rem;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

.rel-type.causes { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.rel-type.measured_as { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
.rel-type.produces { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
.rel-type.influences { background: rgba(249, 115, 22, 0.2); color: #fb923c; }
.rel-type.executes { background: rgba(139, 92, 246, 0.2); color: #a78bfa; }
.rel-type.effects { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.rel-type.used_when { background: rgba(6, 182, 212, 0.2); color: #22d3ee; }
.rel-type.next { background: rgba(34, 197, 94, 0.2); color: #4ade80; }

/* 다이얼로그 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.causal-brush-popup {
  background: var(--color-bg-elevated, #1e1e2e);
  border-radius: 12px;
  padding: 20px;
  min-width: 320px;
  box-shadow: var(--shadow-lg);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.causal-brush-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.causal-brush-header h4 {
  margin: 0;
  font-size: 1rem;
}

.causal-brush-header .close-btn.small {
  padding: 4px 8px;
  font-size: 0.875rem;
}

.causal-brush-text {
  margin: 0 0 8px 0;
  font-size: 0.9rem;
  color: var(--color-text);
}

.causal-brush-range {
  margin: 0 0 16px 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.causal-brush-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.causal-brush-actions .action-btn.primary {
  background: var(--color-accent, #228be6);
  color: #fff;
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.875rem;
}

.causal-brush-actions .action-btn.primary:hover {
  filter: brightness(1.1);
}

.causal-brush-actions .action-btn.secondary {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.875rem;
}

.generate-dialog {
  width: 650px;
  max-height: 85vh;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  transition: width 0.3s ease;
}

.generate-dialog.dialog-expanded {
  width: 750px;
  max-height: 90vh;
}

/* 온톨로지 삭제 확인 다이얼로그 */
.delete-confirm-dialog {
  width: 420px;
  padding: 24px;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.delete-confirm-dialog h3 {
  margin: 0 0 16px;
  font-size: 1.125rem;
  color: var(--color-text);
}

.delete-confirm-message {
  margin: 0 0 8px;
  font-size: 0.9375rem;
  color: var(--color-text);
  line-height: 1.5;
}

.delete-confirm-dialog .delete-schema-name {
  display: block;
  margin-top: 8px;
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-error, #dc2626);
  font-size: 1rem;
  word-break: break-word;
}

.delete-confirm-warning {
  margin: 0 0 20px;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.delete-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.delete-confirm-btn {
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-error, #dc2626);
  color: white;
  font-size: 0.875rem;
  cursor: pointer;
}

.delete-confirm-btn:hover {
  opacity: 0.9;
}

/* Input type tabs */
.input-type-tabs {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tab-btn:hover {
  background: var(--color-bg-hover);
}

.tab-btn.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

/* File drop zone */
.file-drop-zone {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all var(--transition-fast);
  background: var(--color-bg-tertiary);
}

.file-drop-zone:hover,
.file-drop-zone.drag-over {
  border-color: var(--color-accent);
  background: rgba(34, 139, 230, 0.1);
}

.drop-zone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.drop-icon {
  font-size: 2rem;
}

.drop-zone-content p {
  color: var(--color-text);
  margin: 0;
}

.drop-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.file-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.file-icon {
  font-size: 1.5rem;
}

.file-name {
  flex: 1;
  font-weight: 500;
  color: var(--color-text-bright);
}

.file-size {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.remove-file-btn {
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--color-error);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.remove-file-btn:hover {
  background: rgba(239, 68, 68, 0.1);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.dialog-header h3 {
  margin: 0;
  font-size: 1rem;
  color: var(--color-text-bright);
}

.close-btn {
  padding: 4px 8px;
  border: none;
  background: none;
  font-size: 1.25rem;
  color: var(--color-text-light);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-error);
}

.dialog-content {
  padding: 20px;
  overflow-y: auto;
}

.generate-error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: var(--radius-md);
  color: var(--color-error, #dc2626);
  font-size: 0.875rem;
}

.generate-error-banner .error-icon {
  flex-shrink: 0;
}

.generate-error-banner .error-text {
  flex: 1;
  word-break: break-word;
}

.generate-error-banner .error-dismiss {
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 0.8125rem;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.5);
  border-radius: var(--radius-sm);
  color: inherit;
  cursor: pointer;
}

.generate-error-banner .error-dismiss:hover {
  background: rgba(239, 68, 68, 0.3);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text);
}

.form-group input[type="text"],
.form-group input[type="url"],
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  transition: all var(--transition-fast);
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15);
}

.form-group textarea {
  resize: vertical;
  font-family: inherit;
}

.form-group textarea::placeholder,
.form-group input::placeholder {
  color: var(--color-text-muted);
}

.glossary-selector {
  margin-bottom: 0;
}

.glossary-help {
  margin: 0 0 10px;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.glossary-toggle {
  margin-bottom: 10px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 400;
  cursor: pointer;
}

.glossary-checklist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
}

.glossary-loading,
.glossary-empty,
.glossary-validation-hint {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.glossary-validation-hint {
  margin: 4px 0 0;
  color: var(--color-error, #dc2626);
}

.glossary-check-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-tertiary);
  cursor: pointer;
}

.glossary-check-name {
  color: var(--color-text);
  font-weight: 500;
}

.glossary-check-count {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.checkbox-group {
  display: flex;
  gap: 16px;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: normal;
  cursor: pointer;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
}

.cancel-btn {
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.cancel-btn:hover {
  background: var(--color-bg-hover);
}

.generate-btn {
  padding: 8px 20px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: white;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.generate-btn:hover {
  background: var(--color-accent-hover);
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.generation-complete-view {
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.complete-icon-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.complete-icon {
  font-size: 2rem;
}

.complete-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.complete-summary {
  display: flex;
  gap: 32px;
}

.summary-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-accent);
}

.stat-label {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.complete-layer-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.layer-tag {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.complete-save-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.save-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.save-check {
  color: #16a34a;
}

.save-fail {
  color: var(--color-error, #dc2626);
}

.complete-synonym-section {
  width: 100%;
  padding: 16px;
  border-radius: var(--radius-md);
  background: rgba(34, 139, 230, 0.08);
  border: 1px solid rgba(34, 139, 230, 0.25);
  text-align: center;
}

.complete-synonym-section.no-suggestions {
  background: var(--color-bg-secondary);
  border-color: var(--color-border);
}

.synonym-info-text {
  margin: 0 0 12px;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--color-text);
}

.no-suggestions .synonym-info-text {
  margin-bottom: 0;
  color: var(--color-text-muted);
}

.synonym-review-btn {
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: white;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.synonym-review-btn:hover {
  background: var(--color-accent-hover);
}

.complete-actions {
  display: flex;
  gap: 12px;
}

.complete-close-btn {
  padding: 10px 28px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.complete-close-btn:hover {
  background: var(--color-bg-hover);
}

.synonym-toast-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 16px;
  border: 1px solid rgba(34, 139, 230, 0.35);
  border-radius: var(--radius-md);
  background: rgba(34, 139, 230, 0.12);
}

.synonym-applied-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 16px;
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: var(--radius-md);
  background: rgba(16, 185, 129, 0.12);
}

.toast-message {
  flex: 1;
  font-size: 0.875rem;
  color: var(--color-text);
}

.toast-action,
.toast-dismiss {
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  cursor: pointer;
  font-size: 0.8125rem;
}

.toast-action {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.toast-dismiss {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

/* 오류 전용 화면 (폼으로 돌아가지 않고 고정 표시) */
.error-result-view {
  padding: 32px 24px;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: var(--radius-md);
  margin: 20px;
}

.error-result-view .error-result-icon {
  font-size: 3rem;
  margin-bottom: 12px;
}

.error-result-view .error-result-title {
  margin: 0 0 12px;
  font-size: 1.125rem;
  color: var(--color-error, #dc2626);
}

.error-result-view .error-result-message {
  margin: 0 0 24px;
  font-size: 0.9375rem;
  color: var(--color-text);
  line-height: 1.5;
  word-break: break-word;
  max-width: 100%;
}

.error-result-view .error-result-actions {
  display: flex;
  gap: 12px;
}

.error-result-view .retry-btn {
  padding: 10px 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-size: 0.875rem;
  cursor: pointer;
}

.error-result-view .retry-btn:hover {
  background: var(--color-bg-hover);
}

.error-result-view .close-error-btn {
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-error, #dc2626);
  color: white;
  font-size: 0.875rem;
  cursor: pointer;
}

.error-result-view .close-error-btn:hover {
  opacity: 0.9;
}

/* Progress viewer */
.progress-viewer {
  flex: 1;
  min-height: 0;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.progress-header {
  flex-shrink: 0;
  margin-bottom: 14px;
}

.progress-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.progress-header h4 {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--color-text-bright);
  flex-shrink: 0;
}

.progress-step-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-summary-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-track {
  height: 6px;
  background: var(--color-bg-hover);
  border-radius: 3px;
  overflow: hidden;
}

.summary-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--color-accent), var(--color-success));
  transition: width 0.4s ease;
}

.summary-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
}

.summary-percent {
  font-weight: 700;
  font-size: 0.8125rem;
  color: var(--color-accent);
  min-width: 32px;
}

.summary-detail {
  color: var(--color-text-muted);
}

/* Compact layer progress rows — CSS Grid for perfect alignment */
.layer-progress-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.layer-progress-row {
  display: grid;
  grid-template-columns: 22px 90px 1fr 58px minmax(0, 160px);
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-border);
  background: var(--color-bg-tertiary);
  transition: all 0.3s ease;
}

.layer-progress-row.in_progress {
  border-left-color: var(--color-accent);
  background: rgba(34, 139, 230, 0.06);
}

.layer-progress-row.completed {
  border-left-color: var(--color-success);
  opacity: 0.8;
}

.layer-progress-row.failed {
  border-left-color: var(--color-error);
  background: rgba(250, 82, 82, 0.06);
}

.layer-results-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 10px;
  margin-top: 2px;
}

.layer-result-tag {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.lp-icon {
  font-size: 0.875rem;
  text-align: center;
  line-height: 1;
}

.lp-name {
  font-weight: 600;
  font-size: 0.8125rem;
  color: var(--color-text-bright);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lp-bar-wrap {
  min-width: 0;
}

.lp-bar-track {
  height: 5px;
  background: var(--color-bg-hover);
  border-radius: 2.5px;
  overflow: hidden;
}

.lp-bar-fill {
  height: 100%;
  border-radius: 2.5px;
  transition: width 0.3s ease;
}

.lp-badge {
  padding: 2px 0;
  border-radius: 10px;
  font-size: 0.6875rem;
  text-align: center;
  white-space: nowrap;
}

.lp-badge.pending { background: var(--color-bg-hover); color: var(--color-text-muted); }
.lp-badge.in_progress { background: rgba(34, 139, 230, 0.15); color: var(--color-accent); }
.lp-badge.completed { background: rgba(64, 192, 87, 0.15); color: var(--color-success); }
.lp-badge.failed { background: rgba(250, 82, 82, 0.15); color: var(--color-error); }

.lp-detail {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Collapsible generation logs */
.generation-logs {
  flex-shrink: 0;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  margin-top: auto;
  padding-top: 0;
}

.logs-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
}

.logs-toggle:hover {
  background: var(--color-bg-hover);
}

.logs-toggle-icon {
  font-size: 0.5625rem;
  color: var(--color-text-muted);
}

.logs-toggle-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-muted);
}

.logs-count {
  font-size: 0.6875rem;
  color: var(--color-text-light);
  margin-left: auto;
  background: var(--color-bg-tertiary);
  padding: 1px 8px;
  border-radius: 8px;
}

.generation-logs.expanded .logs-toggle {
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;
}

.generation-logs .log-list {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  max-height: min(22vh, 160px);
  overflow-y: auto;
  padding: 6px 12px 8px;
}

.log-item {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}

.log-time {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.log-message {
  color: var(--color-text-light);
}

.log-item.success .log-message { color: var(--color-success); }
.log-item.error .log-message { color: var(--color-error); }
.log-item.warning .log-message { color: var(--color-warning); }

/* Data Source Dialog */
.datasource-dialog {
  width: 800px;
  max-width: 95vw;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.datasource-dialog .dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.datasource-dialog .dialog-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.datasource-dialog .dialog-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
  min-width: 0;  /* flex 자식이 축소 가능하도록 */
  width: 100%;
}

.datasource-dialog .dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.linking-status {
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 20px;
}

.progress-container {
  background: var(--color-bg-secondary);
  padding: 16px;
  border-radius: var(--radius-md);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.progress-text {
  font-weight: 500;
  color: var(--color-text-bright);
}

.progress-count {
  font-size: 0.875rem;
  color: var(--color-text-light);
}

.progress-bar-wrapper {
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #22c55e);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.node-progress-list {
  max-height: 350px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;  /* flex 컨테이너가 축소 가능하도록 */
  min-height: 0;  /* flex 자식이 축소 가능하도록 */
}

.node-progress-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-border);
  transition: all 0.2s ease;
  min-width: 0;  /* flex 자식이 축소 가능하도록 */
  min-height: 48px;  /* 최소 높이 보장 */
  width: 100%;
  box-sizing: border-box;
}

.node-progress-item.searching {
  border-left-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

.node-progress-item.found {
  border-left-color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
}

.node-progress-item.not_found {
  border-left-color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.node-progress-item.error {
  border-left-color: #f97316;
  background: rgba(249, 115, 22, 0.1);
}

.node-status-icon {
  font-size: 1rem;
  width: 24px;
  min-width: 24px;
  text-align: center;
  flex-shrink: 0;  /* 아이콘이 축소되지 않도록 */
}

.searching-icon {
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.node-progress-item .node-name {
  flex: 1;
  min-width: 0;  /* 텍스트 오버플로우 허용 */
  font-weight: 500;
  color: var(--color-text-bright);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-layer-badge {
  font-size: 0.625rem;
  padding: 2px 6px;
  border-radius: 3px;
  color: white;
  text-transform: uppercase;
  flex-shrink: 0;  /* 배지가 축소되지 않도록 */
  white-space: nowrap;
}

.node-status-text {
  font-size: 0.75rem;
  color: var(--color-text-light);
  min-width: 100px;
  max-width: 150px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.mapping-stats {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
}

.stat-item {
  flex: 1;
  text-align: center;
  padding: 12px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.stat-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--color-text-light);
}

.stat-item.found .stat-value { color: #22c55e; }
.stat-item.confirmed .stat-value { color: #3b82f6; }
.stat-item.not-found .stat-value { color: #ef4444; }
.stat-item.error .stat-value { color: #f97316; }

.mapping-list {
  max-height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  min-width: 0;  /* flex 컨테이너가 축소 가능하도록 */
  min-height: 0;  /* flex 자식이 축소 가능하도록 */
}

.mapping-item {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 56px;  /* 최소 높이 보장 */
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.mapping-item:hover {
  border-color: var(--color-primary);
}

.mapping-item.selected {
  border-color: var(--color-primary);
  background: var(--color-bg-tertiary);
}

.mapping-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  min-width: 0;  /* flex 자식이 축소 가능하도록 */
  min-height: 56px;  /* 최소 높이 보장 */
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;  /* 헤더가 축소되지 않도록 */
}

.mapping-status {
  font-size: 1rem;
  flex-shrink: 0;  /* 아이콘이 축소되지 않도록 */
  width: 24px;
  text-align: center;
}

.mapping-name {
  flex: 1;
  min-width: 0;  /* 텍스트 오버플로우 허용 */
  font-weight: 500;
  color: var(--color-text-bright);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mapping-layer {
  font-size: 0.75rem;
  padding: 2px 8px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  flex-shrink: 0;  /* 배지가 축소되지 않도록 */
  white-space: nowrap;
}

.mapping-details {
  padding: 16px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg);
  flex: 1;
  min-height: 0;  /* flex 자식이 축소 가능하도록 */
  box-sizing: border-box;
}

.search-query {
  font-size: 0.8125rem;
  margin-bottom: 12px;
}

.search-query .label {
  color: var(--color-text-light);
}

.search-query .value {
  color: var(--color-text);
  font-style: italic;
}

.candidates-list h5 {
  margin: 0 0 12px;
  font-size: 0.875rem;
  color: var(--color-text-bright);
}

.candidate-item {
  display: flex;
  flex-direction: column;
  padding: 0;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  transition: all 0.2s ease;
  overflow: hidden;
  min-height: 60px;  /* 최소 높이 보장 */
  box-sizing: border-box;
}

.candidate-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  cursor: pointer;
  min-width: 0;
  min-height: 60px;  /* 최소 높이 보장 */
  box-sizing: border-box;
  flex-shrink: 0;  /* 헤더가 축소되지 않도록 */
}

.candidate-header:hover {
  background: var(--color-bg-tertiary);
}

/* candidate-header에 hover 적용됨 */

.candidate-item.selected {
  border-color: var(--color-primary);
  background: rgba(59, 130, 246, 0.1);
}

.candidate-item.confirmed {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
}

.candidate-info {
  flex: 1;
  min-width: 0;  /* 텍스트 오버플로우 허용 */
}

.candidate-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: var(--color-text-bright);
}

.table-icon {
  font-size: 1rem;
}

.relevance-badge {
  font-size: 0.6875rem;
  padding: 2px 6px;
  background: var(--color-primary);
  color: white;
  border-radius: 10px;
}

.candidate-meta {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--color-text-light);
}

.candidate-reason {
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--color-text-light);
  font-style: italic;
}

.expand-icon {
  font-size: 0.75rem;
  color: var(--color-text-light);
  margin-right: 4px;
  transition: transform 0.2s;
}

.candidate-item.expanded .expand-icon {
  transform: rotate(90deg);
}

.confirmed-tag {
  font-size: 0.6875rem;
  padding: 2px 6px;
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  border-radius: 4px;
  margin-left: 8px;
}

.candidate-details {
  padding: 16px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.candidate-columns h6,
.candidate-sql h6,
.candidate-sample h6 {
  margin: 0 0 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.columns-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.column-badge {
  font-size: 0.75rem;
  padding: 4px 8px;
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border-radius: 4px;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.candidate-sql {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  padding: 12px;
}

.sql-code {
  display: block;
  font-family: 'Courier New', monospace;
  font-size: 0.75rem;
  color: #a78bfa;
  background: rgba(0, 0, 0, 0.3);
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.candidate-sample {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  padding: 12px;
}

.sample-table-wrapper {
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
}

.sample-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.sample-table th,
.sample-table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  white-space: nowrap;
}

.sample-table th {
  background: rgba(0, 0, 0, 0.2);
  color: var(--color-text-bright);
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}

.sample-table td {
  color: var(--color-text-light);
}

.sample-table tr:hover td {
  background: rgba(255, 255, 255, 0.05);
}

.candidate-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.preview-btn, .confirm-btn {
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.8125rem;
  transition: all 0.2s ease;
}

.preview-btn {
  background: var(--color-bg-tertiary);
  color: var(--color-text);
}

.preview-btn:hover {
  background: var(--color-bg);
}

.confirm-btn {
  background: var(--color-primary);
  color: white;
}

.confirm-btn:hover {
  opacity: 0.9;
}

.confirmed-badge {
  color: #22c55e;
  font-size: 0.8125rem;
}

.no-candidates {
  text-align: center;
  padding: 20px;
  color: var(--color-text-light);
}

.no-candidates .hint {
  font-size: 0.8125rem;
  margin-top: 8px;
}

/* 개별 노드 데이터 소스 연결 다이얼로그 - 글자 가독성 확보 */
.node-datasource-dialog {
  width: 900px;
  max-width: 95vw;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-elevated, #1e1e2e);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.node-datasource-dialog .dialog-header h3 {
  color: var(--color-text-bright, rgba(255, 255, 255, 0.95)) !important;
}

.node-datasource-dialog .dialog-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
  min-width: 0;
  width: 100%;
  color: var(--color-text-bright, rgba(255, 255, 255, 0.9));
}

.node-info-section {
  padding: 16px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
}

.node-info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 0.875rem;
}

.node-info-item:last-child {
  margin-bottom: 0;
}

.node-info-item .label {
  color: var(--color-text-light, rgba(255, 255, 255, 0.7));
  font-weight: 500;
}

.node-info-item span:not(.label) {
  color: var(--color-text-bright, rgba(255, 255, 255, 0.95));
}

.datasource-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--color-border);
}

.datasource-tabs .tab-btn {
  padding: 12px 20px;
  border: none;
  background: transparent;
  color: var(--color-text-light, rgba(255, 255, 255, 0.75));
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
}

.datasource-tabs .tab-btn:hover {
  color: var(--color-text-bright);
  background: var(--color-bg-tertiary);
}

.datasource-tabs .tab-btn.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.search-input-section {
  margin-bottom: 20px;
}

.search-input-section label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-bright);
}

.search-input-wrapper {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: stretch;
}

.search-datasource-select {
  width: 180px;
  min-width: 140px;
  padding: 10px 12px;
  background: var(--color-bg-secondary, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-bright);
  font-size: 0.8125rem;
  cursor: pointer;
  flex-shrink: 0;
}

.search-datasource-select:focus {
  outline: none;
  border-color: var(--color-primary);
}

.search-datasource-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-bright);
  font-size: 0.875rem;
  min-width: 0;
}

.search-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.search-btn {
  padding: 10px 20px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.search-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-hint {
  margin-top: 8px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
}

/* 검색 진행 상황 표시 */
.search-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 14px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 8px;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.9);
  animation: fadeIn 0.3s ease-in;
}

.search-status span {
  flex: 1;
}

.search-spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.search-hint {
  font-size: 0.75rem;
  color: var(--color-text-light);
  font-style: italic;
}

.search-results {
  margin-top: 20px;
}

.search-results h4 {
  margin: 0 0 12px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 400px;
  overflow-y: auto;
}

.result-item {
  padding: 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.result-item:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-tertiary);
}

.result-item.selected {
  border-color: var(--color-primary);
  background: rgba(99, 102, 241, 0.1);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.result-header strong {
  flex: 1;
  color: var(--color-text-bright);
}

.relevance-badge {
  font-size: 0.75rem;
  padding: 2px 8px;
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  border-radius: 4px;
}

.result-meta {
  display: flex;
  gap: 12px;
  font-size: 0.75rem;
  color: var(--color-text-light);
  margin-bottom: 6px;
}

.result-reason {
  font-size: 0.75rem;
  color: var(--color-text-light);
  font-style: italic;
  margin-bottom: 10px;
}

.result-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.preview-btn,
.select-btn {
  padding: 6px 12px;
  font-size: 0.75rem;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.preview-btn {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.preview-btn:hover {
  background: rgba(59, 130, 246, 0.3);
}

.select-btn {
  background: var(--color-primary);
  color: white;
}

.select-btn:hover {
  opacity: 0.9;
}

.no-results {
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-light);
}

/* 테이블 선택 탭 */
.manual-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.table-selector-section label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-bright, rgba(255, 255, 255, 0.95));
}

.table-selector-wrapper {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.datasource-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.datasource-selector label {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-text-light, rgba(255, 255, 255, 0.8));
  white-space: nowrap;
}

.datasource-selector select {
  padding: 8px 12px;
  background: var(--color-bg-secondary, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  border-radius: var(--radius-sm);
  color: var(--color-text-bright, rgba(255, 255, 255, 0.95));
  font-size: 0.8125rem;
  min-width: 120px;
}

.schema-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.schema-selector label {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-text-light, rgba(255, 255, 255, 0.8));
  white-space: nowrap;
}

.schema-selector select {
  padding: 8px 12px;
  background: var(--color-bg-secondary, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  border-radius: var(--radius-sm);
  color: var(--color-text-bright, rgba(255, 255, 255, 0.95));
  font-size: 0.8125rem;
  min-width: 120px;
}

.schema-selector select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.table-search {
  flex: 1;
}

.table-search input {
  width: 100%;
  padding: 8px 12px;
  background: var(--color-bg-secondary, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  border-radius: var(--radius-sm);
  color: var(--color-text-bright, rgba(255, 255, 255, 0.95));
  font-size: 0.8125rem;
}

.table-list-container {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
}

.loading-tables {
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--color-text-light, rgba(255, 255, 255, 0.8));
}

.table-list {
  padding: 8px;
}

.table-item {
  padding: 12px;
  margin-bottom: 6px;
  background: var(--color-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--color-text-bright, rgba(255, 255, 255, 0.95));
}

.table-item:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-tertiary);
}

.table-item.selected {
  border-color: var(--color-primary);
  background: rgba(99, 102, 241, 0.15);
  border-width: 2px;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}

.table-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.table-header strong {
  flex: 1;
  color: var(--color-text-bright, rgba(255, 255, 255, 0.95));
  font-weight: 600;
}

.schema-badge {
  background: rgba(99, 102, 241, 0.15);
  color: #a78bfa;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.datasource-badge-small {
  background: rgba(251, 146, 60, 0.15);
  color: #fb923c;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.schema-badge {
  font-size: 0.6875rem;
  padding: 2px 6px;
  background: rgba(99, 102, 241, 0.2);
  color: #a78bfa;
  border-radius: 4px;
}

.selected-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: var(--color-primary);
  color: white;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: bold;
  margin-left: auto;
}

.table-meta {
  font-size: 0.75rem;
  color: var(--color-text-light, rgba(255, 255, 255, 0.75));
}

.no-tables {
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-light, rgba(255, 255, 255, 0.75));
}

.no-tables p {
  color: inherit;
}

/* Sample Data Dialog */
.sample-data-dialog {
  width: 900px;
  max-width: 95vw;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sample-data-table {
  overflow: auto;
  max-height: 400px;
}

.sample-data-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.sample-data-table th,
.sample-data-table td {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
}

.sample-data-table th {
  background: var(--color-bg-tertiary);
  font-weight: 500;
  color: var(--color-text-bright);
  position: sticky;
  top: 0;
}

.sample-data-table td {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

.sample-data-table tr:hover td {
  background: var(--color-bg-tertiary);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 12px;
}

.no-data {
  text-align: center;
  padding: 40px;
  color: var(--color-text-light);
}

/* Primary action button */
.action-btn.primary {
  background: var(--color-primary);
  color: white;
}

.action-btn.primary:hover:not(:disabled) {
  opacity: 0.9;
}

.action-btn.primary:disabled {
  background: var(--color-bg-tertiary);
  color: var(--color-text-light);
}

/* New Relation Dialog */
.new-relation-dialog {
  width: 460px;
  max-width: 95vw;
  background: var(--color-bg-elevated, #1e1e2e);
  border-radius: var(--radius-lg, 12px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.new-relation-dialog .dialog-header {
  padding: 18px 24px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.new-relation-dialog .dialog-header h3 {
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.new-relation-dialog .dialog-body {
  padding: 24px;
}

.new-relation-dialog .dialog-footer {
  padding: 16px 24px;
  background: rgba(0, 0, 0, 0.15);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.relation-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 24px;
}

.node-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  border: 2px solid var(--color-border);
  transition: border-color 0.2s ease;
}

.node-preview.source {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.06);
}

.node-preview.target {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.06);
}

.node-icon {
  font-size: 1.25rem;
}

.node-preview.source .node-icon {
  color: #22c55e;
}

.node-preview.target .node-icon {
  color: #3b82f6;
}

.node-preview .node-name {
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--color-text-bright);
}

.relation-arrow {
  font-size: 1.5rem;
  color: var(--color-text-muted, var(--color-text-light));
  opacity: 0.6;
}

.new-relation-dialog .form-group {
  margin-bottom: 18px;
}

.new-relation-dialog .form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-bright);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.new-relation-dialog .form-select,
.new-relation-dialog .form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text);
  font-size: 0.875rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.new-relation-dialog .form-select {
  color-scheme: dark;
}

.new-relation-dialog .form-select option {
  background: #1e1e2e;
  color: #e2e8f0;
  padding: 8px 12px;
}

.new-relation-dialog .form-select option:checked {
  background: #334155;
  color: #f8fafc;
}

.new-relation-dialog .form-select:focus,
.new-relation-dialog .form-input:focus {
  outline: none;
  border-color: var(--color-accent, var(--color-primary));
  box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15);
}

.new-relation-dialog .form-input::placeholder {
  color: var(--color-text-muted, rgba(255, 255, 255, 0.3));
}

.new-relation-dialog .confirm-btn {
  padding: 10px 22px;
  background: #22c55e;
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.new-relation-dialog .confirm-btn:hover {
  background: #16a34a;
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
}

/* 엣지 삭제 다이얼로그 */
.edge-delete-dialog {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  width: 420px;
  max-width: 90vw;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

.edge-delete-dialog .dialog-body {
  padding: 24px;
}

.delete-warning {
  margin: 0 0 16px 0;
  font-size: 0.9375rem;
  color: var(--color-text);
}

.edge-info {
  background: var(--color-bg-tertiary);
  padding: 16px;
  border-radius: var(--radius-md);
  margin-bottom: 16px;
}

.edge-detail {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.node-label {
  padding: 6px 12px;
  background: var(--color-accent);
  color: white;
  border-radius: var(--radius-sm);
  font-weight: 500;
  font-size: 0.875rem;
}

.edge-arrow {
  color: var(--color-text-muted);
  font-size: 1.25rem;
}

.edge-type-label {
  padding: 4px 10px;
  background: var(--color-bg-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--color-text);
}

.undo-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  text-align: center;
}

.delete-btn {
  padding: 10px 20px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.delete-btn:hover {
  background: #dc2626;
}

/* 스키마 목록 다이얼로그 */
.schema-list-dialog {
  background: rgba(20, 20, 30, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  width: 500px;
  max-width: 90vw;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.schema-list-dialog .dialog-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.loading-schemas {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: rgba(255, 255, 255, 0.7);
}

.loading-spinner.small {
  width: 24px;
  height: 24px;
  border-width: 2px;
}

.no-schemas {
  text-align: center;
  padding: 40px;
  color: rgba(255, 255, 255, 0.5);
}

.schema-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.schema-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.schema-item:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(99, 179, 237, 0.4);
  transform: translateX(4px);
}

.schema-item.schema-invalid {
  opacity: 0.6;
  border-color: rgba(239, 68, 68, 0.3);
  cursor: not-allowed;
}

.schema-item.schema-invalid:hover {
  background: rgba(255, 255, 255, 0.04);
  transform: none;
}

.schema-warning {
  color: #f59e0b;
  font-size: 1rem;
  margin-left: 8px;
}

.schema-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  position: relative;
}

.schema-name {
  font-size: 1rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s ease;
}

.schema-name:hover {
  background: rgba(255, 255, 255, 0.1);
}

.schema-name-input {
  font-size: 1rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  background: rgba(99, 102, 241, 0.2);
  border: 2px solid rgba(99, 102, 241, 0.5);
  border-radius: 6px;
  padding: 4px 8px;
  width: 100%;
  max-width: 300px;
  outline: none;
}

.schema-item.editing {
  border-color: rgba(99, 102, 241, 0.5);
  background: rgba(99, 102, 241, 0.1);
}

.edit-name-btn {
  margin-left: 8px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  border-radius: 4px;
  font-size: 0.875rem;
  transition: all 0.2s ease;
  opacity: 0;
}

.schema-item:hover .edit-name-btn {
  opacity: 1;
}

.edit-name-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.schema-domain {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
}

.schema-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.node-count {
  padding: 4px 10px;
  background: rgba(99, 179, 237, 0.2);
  border-radius: 12px;
  font-size: 0.75rem;
  color: #63b3ed;
  font-weight: 500;
}

.updated-at {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.4);
}

/* Cytoscape edgehandles 스타일은 getCytoscapeStyles()에서 정의 */

/* ============================================
   라이트 모드 스타일
   ============================================ */
.light-mode {
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%) !important;
}

.light-mode .viewer-header {
  background: rgba(255, 255, 255, 0.85) !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
}

.light-mode .viewer-header h2 {
  color: #1e293b !important;
}

/* 라이트 모드 필터 바 */
.light-mode .filter-bar {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.06), rgba(147, 51, 234, 0.04)) !important;
  border-bottom: 1px solid rgba(59, 130, 246, 0.15) !important;
}

.light-mode .filter-title {
  color: #1e293b !important;
}

.light-mode .filter-field label {
  color: #64748b !important;
}

.light-mode .filter-field input,
.light-mode .filter-field select {
  background: rgba(255, 255, 255, 0.9) !important;
  border: 1px solid rgba(0, 0, 0, 0.15) !important;
  color: #1e293b !important;
}

.light-mode .no-filter-fields {
  background: rgba(0, 0, 0, 0.05) !important;
  color: #64748b !important;
}

.light-mode .no-filter-fields .hint {
  color: #94a3b8 !important;
}

.light-mode .action-btn {
  background: rgba(255, 255, 255, 0.9) !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  color: #334155 !important;
}

.light-mode .action-btn:hover {
  background: rgba(255, 255, 255, 1) !important;
  border-color: #667eea !important;
}

.light-mode .action-btn.primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  color: white !important;
}

.light-mode .action-btn.small.secondary {
  background: rgba(0, 0, 0, 0.05) !important;
  border: 1px solid rgba(0, 0, 0, 0.15) !important;
  color: #475569 !important;
}

.light-mode .action-btn.small.secondary:hover {
  background: rgba(0, 0, 0, 0.08) !important;
  border-color: rgba(0, 0, 0, 0.2) !important;
}

/* 레이어별 노드 패널 - 흰색 계열로 통일 */
.light-mode .layer-panel {
  background: #ffffff !important;
  border-right: 1px solid #e2e8f0 !important;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.04) !important;
}

.light-mode .layer-panel h3,
.light-mode .layer-panel-header {
  color: #0f172a !important;
  border-bottom: 1px solid #e2e8f0 !important;
  background: #f8fafc !important;
}

.light-mode .layer-panel-toggle-btn {
  border-color: #cbd5e1 !important;
  color: #475569 !important;
}

.light-mode .layer-panel-toggle-btn:hover {
  background: #e2e8f0 !important;
  color: #0f172a !important;
  border-color: #94a3b8 !important;
}

.light-mode .layer-list {
  background: #ffffff !important;
}

.light-mode .layer-item {
  background: #f8fafc !important;
  border: 1px solid #e2e8f0 !important;
}

.light-mode .layer-header {
  color: #0f172a !important;
}

.light-mode .layer-header .layer-name {
  color: #0f172a !important;
}

.light-mode .layer-header .layer-icon {
  opacity: 0.9;
}

.light-mode .layer-header:hover {
  background: #f1f5f9 !important;
}

.light-mode .collapse-icon {
  color: #64748b !important;
}

.light-mode .layer-count {
  background: #e2e8f0 !important;
  color: #475569 !important;
}

.light-mode .layer-nodes {
  background: transparent !important;
}

.light-mode .node-item {
  color: #334155 !important;
  background: #ffffff !important;
  border: 1px solid transparent !important;
}

.light-mode .node-item .node-name {
  color: #334155 !important;
}

.light-mode .node-item:hover {
  background: #f1f5f9 !important;
  color: #0f172a !important;
  border-color: #e2e8f0 !important;
}

.light-mode .node-item.selected {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  color: white !important;
}

.light-mode .node-item.selected .node-name {
  color: white !important;
}

.light-mode .graph-panel {
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 50%, #f8fafc 100%) !important;
}

.light-mode .graph-floating-toolbar .floating-tool-btn {
  background: rgba(255, 255, 255, 0.92) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
}

.light-mode .graph-floating-toolbar .floating-tool-btn:hover:not(:disabled) {
  background: rgba(8, 145, 178, 0.08) !important;
  border-color: rgba(8, 145, 178, 0.3) !important;
}

.light-mode .graph-floating-toolbar .floating-tool-btn.active {
  background: #0891b2 !important;
  border-color: #0891b2 !important;
  box-shadow: 0 4px 16px rgba(8, 145, 178, 0.3) !important;
}

.light-mode .relation-pending-banner {
  background: rgba(255, 255, 255, 0.95) !important;
  border-color: rgba(8, 145, 178, 0.2) !important;
  box-shadow: 0 8px 20px rgba(148, 163, 184, 0.18) !important;
}

.light-mode .relation-pending-badge {
  color: #0f766e !important;
}

.light-mode .relation-pending-text {
  color: #334155 !important;
}

.light-mode .relation-pending-text strong {
  color: #0f766e !important;
}

.light-mode .relation-pending-cancel {
  background: rgba(239, 68, 68, 0.06) !important;
  border-color: rgba(239, 68, 68, 0.2) !important;
  color: #dc2626 !important;
}

.light-mode .graph-toolbar {
  background: rgba(255, 255, 255, 0.8) !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
}

.light-mode .tool-btn {
  background: rgba(255, 255, 255, 0.9) !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  color: #334155 !important;
}

.light-mode .tool-btn:hover:not(:disabled) {
  background: white !important;
  border-color: #667eea !important;
}

.light-mode .layout-select,
.light-mode .header-layout-select {
  background: rgba(255, 255, 255, 0.9) !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  color: #334155 !important;
}

.light-mode .header-layout-select:hover {
  background: #ffffff !important;
  border-color: rgba(0, 0, 0, 0.2) !important;
}

.light-mode .graph-legend {
  background: rgba(255, 255, 255, 0.9) !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
}

.light-mode .add-node-btn {
  background: rgba(34, 197, 94, 0.08) !important;
  border-color: rgba(34, 197, 94, 0.25) !important;
  color: #16a34a !important;
}

.light-mode .add-node-btn:hover {
  background: rgba(34, 197, 94, 0.15) !important;
}

.light-mode .add-node-menu {
  background: rgba(255, 255, 255, 0.98) !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
}

.light-mode .add-node-menu-item {
  color: #334155 !important;
}

.light-mode .add-node-menu-item:hover {
  background: rgba(0, 0, 0, 0.04) !important;
}

.light-mode .canvas-context-menu {
  background: rgba(255, 255, 255, 0.98) !important;
  border: 1px solid rgba(0, 0, 0, 0.12) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15) !important;
}

.light-mode .context-menu-header {
  color: rgba(0, 0, 0, 0.4) !important;
  border-bottom-color: rgba(0, 0, 0, 0.06) !important;
}

.light-mode .context-menu-item {
  color: #334155 !important;
}

.light-mode .context-menu-item:hover {
  background: rgba(0, 0, 0, 0.04) !important;
}

.light-mode .context-menu-divider {
  background: rgba(0, 0, 0, 0.06) !important;
}

.light-mode .context-menu-danger {
  color: #dc2626 !important;
}

.light-mode .context-menu-danger:hover {
  background: rgba(239, 68, 68, 0.06) !important;
}

.light-mode .filter-dialog {
  background: rgba(255, 255, 255, 0.98) !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15) !important;
}

.light-mode .filter-dialog-header {
  border-bottom-color: rgba(0, 0, 0, 0.06) !important;
}

.light-mode .filter-dialog-title {
  color: #0f172a !important;
}

.light-mode .filter-dialog-close {
  background: rgba(0, 0, 0, 0.04) !important;
  color: #94a3b8 !important;
}

.light-mode .filter-dialog-close:hover {
  background: rgba(0, 0, 0, 0.08) !important;
  color: #475569 !important;
}

.light-mode .filter-field-row label {
  color: #64748b !important;
}

.light-mode .filter-field-row input,
.light-mode .filter-field-row select {
  background: white !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1e293b !important;
}

.light-mode .filter-field-row input:focus,
.light-mode .filter-field-row select:focus {
  border-color: #667eea !important;
}

.light-mode .filter-dialog-footer {
  border-top-color: rgba(0, 0, 0, 0.06) !important;
}

.light-mode .filter-loading-hint {
  color: #94a3b8 !important;
}

.light-mode .filter-count-hint {
  color: #94a3b8 !important;
}

.light-mode .filter-chip.direct {
  background: rgba(245, 158, 11, 0.08) !important;
  border-color: rgba(245, 158, 11, 0.2) !important;
  color: #d97706 !important;
}

.light-mode .filter-chip.cascade {
  background: rgba(139, 92, 246, 0.06) !important;
  border-color: rgba(139, 92, 246, 0.15) !important;
  color: #7c3aed !important;
}

.light-mode .chip-equals {
  color: #cbd5e1 !important;
}

.light-mode .chip-source {
  color: rgba(139, 92, 246, 0.5) !important;
}

.light-mode .relation-editor-dialog {
  background: rgba(255, 255, 255, 0.98) !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15) !important;
}

.light-mode .relation-preview-panel {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}

.light-mode .rel-name {
  color: #1e293b !important;
}

.light-mode .rel-arrow-panel {
  color: #cbd5e1 !important;
}

.light-mode .field-mapping-section {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}

.light-mode .field-mapping-section h4 {
  color: #334155 !important;
}

.light-mode .field-mapping-hint {
  color: #94a3b8 !important;
}

.light-mode .field-mapping-col label {
  color: #475569 !important;
}

.light-mode .field-node-hint {
  color: #94a3b8 !important;
}

.light-mode .field-status.loading {
  color: #64748b !important;
}

.light-mode .field-status.no-datasource {
  background: rgba(15, 23, 42, 0.02) !important;
  border-color: rgba(15, 23, 42, 0.12) !important;
  color: #475569 !important;
}

.light-mode .field-status.error {
  background: rgba(239, 68, 68, 0.06) !important;
  border-color: rgba(239, 68, 68, 0.18) !important;
  color: #dc2626 !important;
}

.light-mode .link-datasource-btn-sm {
  background: rgba(59, 130, 246, 0.08) !important;
  border-color: rgba(59, 130, 246, 0.22) !important;
  color: #2563eb !important;
}

.light-mode .link-datasource-btn-sm:hover {
  background: rgba(59, 130, 246, 0.14) !important;
  border-color: rgba(59, 130, 246, 0.3) !important;
}

.light-mode .field-mapping-arrow {
  color: #cbd5e1 !important;
}

.light-mode .cascading-filters-info {
  background: rgba(139, 92, 246, 0.04) !important;
  border-color: rgba(139, 92, 246, 0.15) !important;
}

.light-mode .cascading-filters-info h5 {
  color: #7c3aed !important;
}

.light-mode .cf-from {
  color: #94a3b8 !important;
}

.light-mode .cf-field {
  color: #7c3aed !important;
}

.light-mode .cf-value {
  background: rgba(139, 92, 246, 0.08) !important;
  color: #6d28d9 !important;
}

.light-mode .legend-item {
  color: #475569 !important;
}

.light-mode .detail-panel {
  background: rgba(255, 255, 255, 0.95) !important;
  border-left: 1px solid rgba(0, 0, 0, 0.08) !important;
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.1) !important;
}

.light-mode .detail-panel .form-select,
.light-mode .detail-panel .form-input {
  border-color: rgba(0, 0, 0, 0.15) !important;
  background: rgba(0, 0, 0, 0.02) !important;
  color: #1e293b !important;
}

.light-mode .detail-panel .form-select {
  color-scheme: light !important;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(0,0,0,0.4)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") !important;
  background-repeat: no-repeat !important;
  background-position: right 12px center !important;
}

.light-mode .detail-panel .form-select option {
  background: #ffffff !important;
  color: #1e293b !important;
}

.light-mode .detail-panel .form-select option:checked {
  background: #e2e8f0 !important;
  color: #0f172a !important;
}

.light-mode .detail-panel .form-select:focus,
.light-mode .detail-panel .form-input:focus {
  border-color: #4f46e5 !important;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12) !important;
}

.light-mode .detail-panel .form-select:hover,
.light-mode .detail-panel .form-input:hover {
  border-color: rgba(0, 0, 0, 0.25) !important;
}

.light-mode .detail-panel .form-input::placeholder {
  color: #94a3b8 !important;
}

.light-mode .detail-panel h3 {
  color: #0f172a !important;
  background: rgba(255, 255, 255, 0.98) !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
  font-weight: 700 !important;
}

.light-mode .detail-tabs {
  background: rgba(248, 250, 252, 0.9) !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
}

.light-mode .detail-tabs .tab-btn {
  color: #334155 !important;
  font-weight: 600 !important;
}

.light-mode .detail-tabs .tab-btn:hover:not(:disabled) {
  color: #0f172a !important;
  background: rgba(0, 0, 0, 0.04) !important;
}

.light-mode .detail-tabs .tab-btn.active {
  color: #fff !important;
  background: #4f46e5 !important;
  border-bottom-color: #4f46e5 !important;
  font-weight: 700 !important;
}

.light-mode .detail-tabs .tab-btn:disabled {
  color: #94a3b8 !important;
}

.light-mode .detail-content {
  color: #334155 !important;
}

/* 분석 탭 내부(원인 분석 패널) 글자 가독성 - 라이트 모드 */
.light-mode .analysis-tab :deep(.causal-analysis-panel),
.light-mode .analysis-tab :deep(.error-content),
.light-mode .analysis-tab :deep(.error-message),
.light-mode .analysis-tab :deep(.error-data-info),
.light-mode .analysis-tab :deep(.interpolation-info),
.light-mode .analysis-tab :deep(.node-status-info) {
  color: #1e293b !important;
}
.light-mode .analysis-tab :deep(.error-message) {
  color: #0f172a !important;
  background: rgba(0, 0, 0, 0.06) !important;
}
.light-mode .analysis-tab :deep(.error-data-info p),
.light-mode .analysis-tab :deep(.interpolation-info p),
.light-mode .analysis-tab :deep(.node-status-info p) {
  color: #334155 !important;
}
.light-mode .analysis-tab :deep(.error-data-info ul),
.light-mode .analysis-tab :deep(.interpolation-info ul),
.light-mode .analysis-tab :deep(.node-name),
.light-mode .analysis-tab :deep(.reason-text),
.light-mode .analysis-tab :deep(.node-status-details) {
  color: #475569 !important;
}
.light-mode .analysis-tab :deep(.report-content),
.light-mode .analysis-tab :deep(.report-md-h2),
.light-mode .analysis-tab :deep(.report-md-h3) {
  color: #1e293b !important;
}

.light-mode .data-loading {
  color: #64748b !important;
}

.light-mode .no-data p {
  color: #64748b !important;
}

.light-mode .data-source-info {
  background: rgba(0, 0, 0, 0.03) !important;
}

.light-mode .source-label {
  color: #64748b !important;
}

.light-mode .data-source-info code {
  color: #6366f1 !important;
  background: rgba(99, 102, 241, 0.1) !important;
}

.light-mode .row-count {
  color: #94a3b8 !important;
}

.light-mode .biz-day-badge {
  color: #16a34a !important;
  background: rgba(22, 163, 74, 0.1) !important;
}

.light-mode .business-day-filter-toggle {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  
  .toggle-label {
    .toggle-switch {
      background: rgba(0, 0, 0, 0.12) !important;
      
      &::after {
        background: rgba(0, 0, 0, 0.3) !important;
      }
    }
    
    input:checked + .toggle-switch {
      background: rgba(34, 197, 94, 0.4) !important;
      
      &::after {
        background: #16a34a !important;
      }
    }
    
    .toggle-text {
      color: #334155 !important;
    }
  }
  
  .toggle-desc {
    color: #94a3b8 !important;
  }
}

.light-mode .chart-section,
.light-mode .data-table-section {
  background: rgba(0, 0, 0, 0.02) !important;
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
}

.light-mode .chart-header,
.light-mode .table-header {
  border-bottom-color: rgba(0, 0, 0, 0.06) !important;
}

.light-mode .chart-loading {
  color: rgba(0, 0, 0, 0.6) !important;
}

.light-mode .analysis-config-bar {
  background: rgba(6, 182, 212, 0.04) !important;
  border-top-color: rgba(6, 182, 212, 0.14) !important;
  border-bottom-color: rgba(6, 182, 212, 0.14) !important;
}

.light-mode .config-hint {
  color: #0891b2 !important;
}

.light-mode .config-label {
  color: #64748b !important;
}

.light-mode .config-value {
  color: #1e293b !important;
}

.light-mode .config-metric-select,
.light-mode .result-metric-select {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(6, 182, 212, 0.2) !important;
  color: #1e293b !important;
}

.light-mode .trend-btn {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  color: #64748b !important;
}

.light-mode .trend-btn.active {
  background: rgba(6, 182, 212, 0.12) !important;
  border-color: rgba(6, 182, 212, 0.2) !important;
  color: #0891b2 !important;
}

.light-mode .analysis-result-header {
  background: rgba(6, 182, 212, 0.03) !important;
  border-color: rgba(6, 182, 212, 0.14) !important;
}

.light-mode .result-range {
  color: #64748b !important;
}

.light-mode .result-type,
.light-mode .analysis-empty {
  color: #475569 !important;
}

.light-mode .chart-header h5,
.light-mode .table-header h5 {
  color: #1e293b !important;
}

.light-mode .column-count {
  color: #94a3b8 !important;
}

.light-mode .data-table th {
  background: rgba(0, 0, 0, 0.05) !important;
  color: #0f172a !important;
  border-bottom-color: rgba(0, 0, 0, 0.12) !important;
  font-weight: 600 !important;
}

.light-mode .data-table td {
  color: #1e293b !important;
  border-bottom-color: rgba(0, 0, 0, 0.08) !important;
}

.light-mode .data-table tr:hover td {
  background: rgba(0, 0, 0, 0.02) !important;
}

.light-mode .table-footer {
  color: #94a3b8 !important;
  border-top-color: rgba(0, 0, 0, 0.05) !important;
}

.light-mode .datasource-badge {
  background: rgba(99, 102, 241, 0.1) !important;
  color: #6366f1 !important;
}

.light-mode .datasource-meta {
  color: #94a3b8 !important;
}

.light-mode .no-datasource {
  color: #94a3b8 !important;
}

.light-mode .link-datasource-btn {
  background: rgba(99, 102, 241, 0.1) !important;
  color: #6366f1 !important;
  border-color: rgba(99, 102, 241, 0.2) !important;
}

.light-mode .link-datasource-btn:hover {
  background: rgba(99, 102, 241, 0.15) !important;
  border-color: rgba(99, 102, 241, 0.3) !important;
}

.light-mode .action-btn.success {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%) !important;
  color: white !important;
}

.light-mode .detail-row label {
  color: #64748b !important;
}

.light-mode .detail-row span,
.light-mode .detail-row code {
  color: #1e293b !important;
}

.light-mode .detail-row code {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

.light-mode .delete-node-btn {
  border-color: rgba(239, 68, 68, 0.2) !important;
  background: rgba(239, 68, 68, 0.06) !important;
  color: #dc2626 !important;
}

.light-mode .delete-node-btn:hover {
  background: rgba(239, 68, 68, 0.12) !important;
  border-color: rgba(239, 68, 68, 0.4) !important;
}

.light-mode .editable-node-name:hover {
  background: rgba(0, 0, 0, 0.03) !important;
}

.light-mode .edit-name-btn {
  border-color: rgba(0, 0, 0, 0.08) !important;
  background: rgba(0, 0, 0, 0.03) !important;
  color: #94a3b8 !important;
}

.light-mode .edit-name-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  border-color: #667eea !important;
  color: #667eea !important;
}

.light-mode .node-name-edit-input {
  background: white !important;
  border-color: #667eea !important;
  color: #1e293b !important;
}

.light-mode .node-name-edit-input:focus {
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15) !important;
}

.light-mode .related-section h4 {
  color: #334155 !important;
}

.light-mode .relation-item {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

.light-mode .relation-item:hover {
  border-color: rgba(102, 126, 234, 0.3) !important;
}

.light-mode .rel-field {
  color: #7c3aed !important;
}

.light-mode .rel-field-arrow {
  color: #cbd5e1 !important;
}

.light-mode .rel-source,
.light-mode .rel-target {
  color: #1e293b !important;
}

.light-mode .rel-type.causes { background: rgba(239, 68, 68, 0.15) !important; color: #dc2626 !important; }
.light-mode .rel-type.measured_as { background: rgba(34, 197, 94, 0.15) !important; color: #16a34a !important; }
.light-mode .rel-type.produces { background: rgba(59, 130, 246, 0.15) !important; color: #2563eb !important; }
.light-mode .rel-type.influences { background: rgba(249, 115, 22, 0.15) !important; color: #ea580c !important; }
.light-mode .rel-type.executes { background: rgba(139, 92, 246, 0.15) !important; color: #7c3aed !important; }
.light-mode .rel-type.effects { background: rgba(239, 68, 68, 0.15) !important; color: #dc2626 !important; }
.light-mode .rel-type.used_when { background: rgba(6, 182, 212, 0.15) !important; color: #0891b2 !important; }
.light-mode .rel-type.next { background: rgba(34, 197, 94, 0.15) !important; color: #16a34a !important; }

.light-mode .layer-badge {
  /* 레이어 색상은 인라인 스타일로 지정되므로 배경색 유지 */
  color: white !important;
}

.light-mode .layer-selector-dropdown {
  background: #ffffff !important;
  border: 1px solid rgba(0, 0, 0, 0.12) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
}

.light-mode .layer-selector-item {
  color: #334155 !important;
}

.light-mode .layer-selector-item:hover {
  background: rgba(0, 0, 0, 0.05) !important;
}

.light-mode .layer-selector-item.active {
  background: rgba(0, 0, 0, 0.08) !important;
  color: #1e293b !important;
}

.light-mode .related-section h4 {
  color: #475569 !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
}

.light-mode .related-item {
  background: rgba(0, 0, 0, 0.03) !important;
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
  color: #334155 !important;
}

.light-mode .related-item:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  border-color: rgba(99, 102, 241, 0.3) !important;
}

.light-mode .dialog-overlay {
  background: rgba(0, 0, 0, 0.4) !important;
}

.light-mode .generate-dialog,
.light-mode .datasource-dialog,
.light-mode .node-datasource-dialog,
.light-mode .schema-list-dialog,
.light-mode .edge-delete-dialog,
.light-mode .edit-relation-dialog,
.light-mode .new-relation-dialog {
  background: rgba(255, 255, 255, 0.98) !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
}

.light-mode .new-relation-dialog {
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05) !important;
}

.light-mode .new-relation-dialog .dialog-header {
  background: rgba(0, 0, 0, 0.03) !important;
  border-bottom-color: rgba(0, 0, 0, 0.08) !important;
}

.light-mode .new-relation-dialog .dialog-footer {
  background: rgba(0, 0, 0, 0.03) !important;
  border-top-color: rgba(0, 0, 0, 0.08) !important;
}

.light-mode .relation-preview {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

.light-mode .node-preview.source {
  background: rgba(34, 197, 94, 0.05) !important;
}

.light-mode .node-preview.target {
  background: rgba(59, 130, 246, 0.05) !important;
}

.light-mode .new-relation-dialog .form-select,
.light-mode .new-relation-dialog .form-input {
  border-color: rgba(0, 0, 0, 0.15) !important;
  background: rgba(0, 0, 0, 0.02) !important;
}

.light-mode .new-relation-dialog .form-select {
  color-scheme: light !important;
}

.light-mode .new-relation-dialog .form-select option {
  background: #ffffff !important;
  color: #1e293b !important;
}

.light-mode .new-relation-dialog .form-select option:checked {
  background: #e2e8f0 !important;
  color: #0f172a !important;
}

.light-mode .new-relation-dialog .form-select:focus,
.light-mode .new-relation-dialog .form-input:focus {
  border-color: var(--color-accent) !important;
}

.light-mode .node-info-section {
  background: rgba(0, 0, 0, 0.02) !important;
}

.light-mode .node-info-item .label {
  color: #64748b !important;
}

.light-mode .datasource-tabs {
  border-bottom-color: rgba(0, 0, 0, 0.08) !important;
}

.light-mode .datasource-tabs .tab-btn {
  color: #64748b !important;
}

.light-mode .datasource-tabs .tab-btn:hover {
  color: #1e293b !important;
  background: rgba(0, 0, 0, 0.03) !important;
}

.light-mode .datasource-tabs .tab-btn.active {
  color: #6366f1 !important;
  border-bottom-color: #6366f1 !important;
}

.light-mode .search-input {
  background: rgba(255, 255, 255, 0.9) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1e293b !important;
}

.light-mode .search-input:focus {
  border-color: #6366f1 !important;
}

.light-mode .search-hint {
  color: #94a3b8 !important;
}

.light-mode .result-item {
  background: rgba(255, 255, 255, 0.9) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

.light-mode .result-item:hover {
  border-color: rgba(99, 102, 241, 0.3) !important;
  background: rgba(0, 0, 0, 0.02) !important;
}

.light-mode .result-item.selected {
  border-color: #6366f1 !important;
  background: rgba(99, 102, 241, 0.05) !important;
}

.light-mode .result-header strong {
  color: #1e293b !important;
}

.light-mode .result-meta {
  color: #94a3b8 !important;
}

.light-mode .result-reason {
  color: #94a3b8 !important;
}

.light-mode .table-selector-wrapper select,
.light-mode .table-search input {
  background: rgba(255, 255, 255, 0.9) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1e293b !important;
}

.light-mode .table-list-container {
  background: rgba(255, 255, 255, 0.9) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

.light-mode .table-item {
  background: rgba(255, 255, 255, 0.95) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}

.light-mode .table-item:hover {
  border-color: rgba(99, 102, 241, 0.3) !important;
  background: rgba(0, 0, 0, 0.02) !important;
}

.light-mode .table-item.selected {
  border-color: #6366f1 !important;
  background: rgba(99, 102, 241, 0.1) !important;
  border-width: 2px !important;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15) !important;
}

.light-mode .table-header strong {
  color: #1e293b !important;
}

.light-mode .table-meta {
  color: #94a3b8 !important;
}

.light-mode .dialog-header {
  background: rgba(248, 250, 252, 0.95) !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
}

.light-mode .dialog-header h3 {
  color: #1e293b !important;
}

.light-mode .dialog-body {
  color: #334155 !important;
}

.light-mode .schema-item {
  background: rgba(0, 0, 0, 0.02) !important;
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
}

.light-mode .schema-item:hover {
  background: rgba(99, 102, 241, 0.05) !important;
  border-color: rgba(99, 102, 241, 0.3) !important;
}

.light-mode .schema-name {
  color: #1e293b !important;
}

.light-mode .schema-domain {
  color: #64748b !important;
}

.light-mode .loading-overlay {
  color: #475569 !important;
}

.light-mode .close-btn {
  color: #64748b !important;
}

.light-mode .close-btn:hover {
  color: #1e293b !important;
  background: rgba(0, 0, 0, 0.05) !important;
}

/* 데이터 소스 연결 다이얼로그 - 라이트 모드 (글자 가독성) */
.light-mode .node-datasource-dialog {
  background: #ffffff !important;
}

.light-mode .node-datasource-dialog .dialog-header h3 {
  color: #1e293b !important;
}

.light-mode .node-datasource-dialog .dialog-body {
  color: #334155 !important;
}

.light-mode .node-info-item .label {
  color: #64748b !important;
}

.light-mode .node-info-item span:not(.label) {
  color: #1e293b !important;
}

.light-mode .datasource-tabs .tab-btn {
  color: #64748b !important;
}

.light-mode .datasource-tabs .tab-btn:hover {
  color: #1e293b !important;
}

.light-mode .datasource-tabs .tab-btn.active {
  color: #6366f1 !important;
}

.light-mode .table-selector-section label,
.light-mode .search-input-section label {
  color: #1e293b !important;
}

.light-mode .datasource-selector label,
.light-mode .schema-selector label {
  color: #475569 !important;
}

.light-mode .datasource-selector select,
.light-mode .schema-selector select,
.light-mode .table-search input,
.light-mode .search-datasource-select {
  background: #f8fafc !important;
  border-color: #e2e8f0 !important;
  color: #1e293b !important;
}

.light-mode .table-list-container {
  background: #f8fafc !important;
  border-color: #e2e8f0 !important;
}

.light-mode .table-item {
  background: #ffffff !important;
  border-color: #e2e8f0 !important;
  color: #1e293b !important;
}

.light-mode .table-item:hover {
  background: #f1f5f9 !important;
  border-color: #6366f1 !important;
}

.light-mode .table-header strong {
  color: #1e293b !important;
}

.light-mode .table-meta {
  color: #64748b !important;
}

.light-mode .loading-tables {
  color: #64748b !important;
}

.light-mode .no-tables {
  color: #64748b !important;
}

.light-mode .schema-badge {
  background: rgba(99, 102, 241, 0.12) !important;
  color: #4f46e5 !important;
}

.light-mode .datasource-badge-small {
  background: rgba(251, 146, 60, 0.15) !important;
  color: #c2410c !important;
}

.light-mode .node-info-section {
  background: #f8fafc !important;
}

.light-mode .stats-summary {
  background: rgba(248, 250, 252, 0.9) !important;
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
}

.light-mode .stat-item {
  background: rgba(255, 255, 255, 0.9) !important;
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
}

.light-mode .stat-value {
  color: #1e293b !important;
}

.light-mode .stat-label {
  color: #64748b !important;
}

.light-mode .progress-section {
  background: rgba(248, 250, 252, 0.8) !important;
}

.light-mode .progress-section h4,
.light-mode .results-section h4 {
  color: #1e293b !important;
}

.light-mode .progress-bar {
  background: rgba(0, 0, 0, 0.08) !important;
}

.light-mode .node-progress-item {
  background: rgba(255, 255, 255, 0.9) !important;
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
}

.light-mode .node-progress-item .node-name {
  color: #1e293b !important;
}

.light-mode .node-progress-item .node-layer {
  color: #64748b !important;
}

.light-mode .node-progress-item.searching {
  background: rgba(245, 158, 11, 0.08) !important;
  border-left: 3px solid #f59e0b !important;
}

.light-mode .node-progress-item.found {
  background: rgba(34, 197, 94, 0.08) !important;
  border-left: 3px solid #22c55e !important;
}

.light-mode .node-progress-item.not_found {
  background: rgba(239, 68, 68, 0.08) !important;
  border-left: 3px solid #ef4444 !important;
}

.light-mode .node-progress-item.error {
  background: rgba(249, 115, 22, 0.08) !important;
  border-left: 3px solid #f97316 !important;
}

.light-mode .mapping-item {
  background: rgba(255, 255, 255, 0.95) !important;
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
}

.light-mode .mapping-item:hover {
  border-color: rgba(99, 102, 241, 0.4) !important;
}

.light-mode .mapping-item.selected {
  background: rgba(99, 102, 241, 0.05) !important;
  border-color: #6366f1 !important;
}

.light-mode .mapping-header {
  border-bottom-color: rgba(0, 0, 0, 0.06) !important;
}

.light-mode .mapping-node-name {
  color: #1e293b !important;
}

.light-mode .mapping-node-layer {
  color: white !important;
}

.light-mode .mapping-candidates {
  background: rgba(248, 250, 252, 0.5) !important;
}

.light-mode .candidate-item {
  background: rgba(255, 255, 255, 0.9) !important;
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
}

.light-mode .candidate-item:hover {
  border-color: rgba(99, 102, 241, 0.3) !important;
}

.light-mode .candidate-item.selected {
  border-color: #22c55e !important;
  background: rgba(34, 197, 94, 0.05) !important;
}

.light-mode .candidate-header:hover {
  background: rgba(0, 0, 0, 0.03) !important;
}

.light-mode .candidate-details {
  background: rgba(0, 0, 0, 0.02) !important;
  border-top-color: rgba(0, 0, 0, 0.08) !important;
}

.light-mode .candidate-columns h6,
.light-mode .candidate-sql h6,
.light-mode .candidate-sample h6 {
  color: #1e293b !important;
}

.light-mode .column-badge {
  background: rgba(59, 130, 246, 0.1) !important;
  color: #2563eb !important;
  border-color: rgba(59, 130, 246, 0.2) !important;
}

.light-mode .candidate-sql {
  background: rgba(0, 0, 0, 0.03) !important;
}

.light-mode .sql-code {
  color: #6366f1 !important;
  background: rgba(0, 0, 0, 0.05) !important;
}

.light-mode .candidate-sample {
  background: rgba(0, 0, 0, 0.02) !important;
}

.light-mode .sample-table th {
  background: rgba(0, 0, 0, 0.05) !important;
  color: #1e293b !important;
  border-bottom-color: rgba(0, 0, 0, 0.1) !important;
}

.light-mode .sample-table td {
  color: #334155 !important;
  border-bottom-color: rgba(0, 0, 0, 0.05) !important;
}

.light-mode .sample-table tr:hover td {
  background: rgba(0, 0, 0, 0.02) !important;
}

.light-mode .confirmed-tag {
  background: rgba(34, 197, 94, 0.15) !important;
  color: #16a34a !important;
}

.light-mode .candidate-table {
  color: #334155 !important;
}

.light-mode .candidate-column {
  color: #1e293b !important;
}

.light-mode .candidate-score {
  color: #64748b !important;
}

.light-mode .preview-btn {
  color: #6366f1 !important;
}

.light-mode .preview-btn:hover {
  background: rgba(99, 102, 241, 0.1) !important;
}

/* 온톨로지 생성 다이얼로그 - 모드 탭 라이트 모드 */
.light-mode .generation-mode-tabs {
  background: rgba(0, 0, 0, 0.04) !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
}

.light-mode .mode-tab {
  color: #475569 !important;
  border-color: #cbd5e1 !important;
}

.light-mode .mode-tab:hover {
  background: rgba(0, 0, 0, 0.05) !important;
  color: #1e293b !important;
}

.light-mode .mode-tab.active {
  background: #2563eb !important;
  border-color: #2563eb !important;
  color: white !important;
}

/* 온톨로지 생성 다이얼로그 - 다이얼로그 푸터 라이트 모드 */
.light-mode .dialog-footer {
  background: #f8fafc !important;
  border-top: 1px solid rgba(0, 0, 0, 0.08) !important;
}

.light-mode .cancel-btn {
  color: #475569 !important;
  border-color: #cbd5e1 !important;
  background: #ffffff !important;
}

.light-mode .cancel-btn:hover {
  background: #f1f5f9 !important;
}

/* SchemaBasedGenerator 자식 컴포넌트 라이트 모드 */
.light-mode :deep(.schema-based-generator) {
  color: #1e293b !important;
}

.light-mode :deep(.schema-based-generator .step-section h4) {
  color: #1e293b !important;
}

.light-mode :deep(.schema-based-generator .back-btn) {
  color: #475569 !important;
  border-color: #cbd5e1 !important;
}

.light-mode :deep(.schema-based-generator .back-btn:hover) {
  background: #f1f5f9 !important;
  color: #1e293b !important;
}

.light-mode :deep(.schema-based-generator .datasource-item),
.light-mode :deep(.schema-based-generator .schema-item) {
  background: #ffffff !important;
  border-color: #e2e8f0 !important;
}

.light-mode :deep(.schema-based-generator .datasource-item:hover),
.light-mode :deep(.schema-based-generator .schema-item:hover) {
  background: #f1f5f9 !important;
  border-color: #2563eb !important;
}

.light-mode :deep(.schema-based-generator .ds-name),
.light-mode :deep(.schema-based-generator .schema-name) {
  color: #1e293b !important;
}

.light-mode :deep(.schema-based-generator .ds-type),
.light-mode :deep(.schema-based-generator .table-count) {
  color: #64748b !important;
}

.light-mode :deep(.schema-based-generator .selected-info) {
  background: #f1f5f9 !important;
  border: 1px solid #e2e8f0 !important;
}

.light-mode :deep(.schema-based-generator .info-separator) {
  color: #64748b !important;
}

.light-mode :deep(.schema-based-generator .form-group label) {
  color: #475569 !important;
}

.light-mode :deep(.schema-based-generator .form-input),
.light-mode :deep(.schema-based-generator .form-textarea) {
  background: #ffffff !important;
  border-color: #cbd5e1 !important;
  color: #0f172a !important;
}

.light-mode :deep(.schema-based-generator .form-input:focus),
.light-mode :deep(.schema-based-generator .form-textarea:focus) {
  border-color: #2563eb !important;
}

.light-mode :deep(.schema-based-generator .form-input::placeholder),
.light-mode :deep(.schema-based-generator .form-textarea::placeholder) {
  color: #94a3b8 !important;
}

.light-mode :deep(.schema-based-generator .checkbox-group label) {
  color: #334155 !important;
}

.light-mode :deep(.schema-based-generator .error-message) {
  background: rgba(239, 68, 68, 0.08) !important;
  border-color: rgba(239, 68, 68, 0.2) !important;
  color: #dc2626 !important;
}

.light-mode :deep(.schema-based-generator .success-message) {
  background: rgba(34, 197, 94, 0.08) !important;
  border-color: rgba(34, 197, 94, 0.2) !important;
  color: #059669 !important;
}

.light-mode :deep(.schema-based-generator .cancel-btn) {
  color: #475569 !important;
  border-color: #cbd5e1 !important;
}

.light-mode :deep(.schema-based-generator .generate-btn) {
  background: #2563eb !important;
}

.light-mode :deep(.schema-based-generator .generate-btn:hover:not(:disabled)) {
  background: #1d4ed8 !important;
}

.light-mode :deep(.schema-based-generator .loading-state) {
  color: #64748b !important;
}

/* What-if 분석 버튼 */
/* Behavior 탭 스타일 */
.behavior-tab { padding: 0 !important; overflow: hidden; flex: 1; display: flex; flex-direction: column; min-height: 0; }
.behavior-section-header {
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-bright, #e2e8f0);
  background: var(--color-bg-tertiary, rgba(0,0,0,0.15));
  border-bottom: 1px solid var(--color-border, rgba(255,255,255,0.08));
  position: sticky;
  top: 0;
  z-index: 1;
}
.behavior-section-divider {
  height: 1px;
  background: var(--color-border, rgba(255,255,255,0.08));
  margin: 8px 0;
}

/* Agent Monitor styles */
.agent-monitor-status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--color-text-muted);
}
.agent-status-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  &.status-idle { background: rgba(99, 102, 241, 0.15); color: #6366f1; }
  &.status-running { background: rgba(34, 197, 94, 0.15); color: #22c55e; animation: agent-pulse 1.5s infinite; }
  &.status-paused { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
  &.status-stopped { background: rgba(107, 114, 128, 0.15); color: #6b7280; }
  &.status-failed { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
  &.status-completed { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
}
@keyframes agent-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.behavior-empty {
  text-align: center; padding: 24px 0; color: rgba(255,255,255,0.4);
  p { margin: 4px 0; font-size: 0.85rem; }
  .behavior-hint { font-size: 0.75rem; color: rgba(255,255,255,0.25); }
}
.behavior-list { display: flex; flex-direction: column; gap: 8px; }
.behavior-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; padding: 10px 14px; position: relative;
  &.output { border-left: 3px solid #22c55e; }
  &.input { border-left: 3px solid #f59e0b; }
}
.behavior-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.role-badge {
  font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 6px;
  &.output { background: rgba(34,197,94,0.15); color: #22c55e; }
  &.input { background: rgba(245,158,11,0.15); color: #f59e0b; }
}
.behavior-status {
  font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; font-weight: 600;
  &.trained, &[class*="trained"] { background: rgba(34,197,94,0.15); color: #22c55e; }
  &.pending, &[class*="pending"] { background: rgba(100,100,100,0.2); color: #94a3b8; }
  &.disabled, &[class*="disabled"] { background: rgba(239,68,68,0.15); color: #ef4444; }
  &.training, &[class*="training"] { background: rgba(99,102,241,0.15); color: #a5b4fc; }
}
.behavior-name { font-weight: 700; font-size: 0.9rem; color: rgba(255,255,255,0.95); }
.behavior-desc { font-size: 0.75rem; color: rgba(255,255,255,0.5); margin-top: 2px; }
.behavior-io { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.io-group { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.io-label { font-size: 0.65rem; color: rgba(255,255,255,0.4); font-weight: 600; min-width: 30px; }
.io-tag { font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; font-weight: 600;
  &.input-tag { background: rgba(245,158,11,0.1); color: #f59e0b; }
  &.output-tag { background: rgba(34,197,94,0.1); color: #22c55e; }
}
.behavior-metrics { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
.metric-tag { font-size: 0.6rem; padding: 1px 6px; border-radius: 4px; background: rgba(99,102,241,0.1); color: #a5b4fc; font-family: monospace; }
.behavior-delete-btn {
  position: absolute; top: 8px; right: 8px; background: none; border: none;
  cursor: pointer; font-size: 0.8rem; opacity: 0.3;
  &:hover { opacity: 1; }
}

.whatif-toggle-btn {
  background: rgba(99, 102, 241, 0.15) !important;
  border-color: rgba(99, 102, 241, 0.4) !important;
  color: #a5b4fc !important;
}

.whatif-toggle-btn:hover {
  background: rgba(99, 102, 241, 0.3) !important;
  border-color: rgba(99, 102, 241, 0.7) !important;
}

.whatif-toggle-btn.active {
  background: #6366f1 !important;
  color: #fff !important;
  border-color: #6366f1 !important;
}

/* What-if 드래그 세퍼레이터 */
.whatif-separator {
  flex-shrink: 0;
  height: 6px;
  background: linear-gradient(90deg, transparent 30%, #6366f1 50%, transparent 70%);
  cursor: row-resize;
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.whatif-separator:hover,
.whatif-separator:active {
  background: #6366f1;
}

.separator-handle {
  width: 40px;
  height: 3px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 2px;
}

.whatif-separator:hover .separator-handle {
  background: rgba(255, 255, 255, 0.8);
}

/* What-if 패널 컨테이너 */
.whatif-panel-container {
  flex-shrink: 0;
  overflow: hidden;
}
</style>
