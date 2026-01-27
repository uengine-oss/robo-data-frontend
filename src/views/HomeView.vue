<script setup lang="ts">
import UploadTab from '@/components/upload/UploadTab.vue'
import GraphTab from '@/components/graph/GraphTab.vue'
import LineageTab from '@/components/lineage/LineageTab.vue'
import GlossaryTab from '@/components/glossary/GlossaryTab.vue'
import Text2SqlTab from '@/components/text2sql/Text2SqlTab.vue'
import LangChainTab from '@/components/langchain-text2sql/LangChainTab.vue'
import { OlapTab } from '@/components/olap'
import { DataQuality, IncidentManager, AlertsPage, EventDetection, WatchAgent } from '@/components/observability'
import { OntologyTab } from '@/components/ontology'
import ObjectTypeModeler from '@/components/domain/ObjectTypeModeler.vue'
import MultiLayerOntologyViewer from '@/components/domain/MultiLayerOntologyViewer.vue'
import ObjectExplorerTab from '@/components/object-explorer/ObjectExplorerTab.vue'
import DataSourcesTab from '@/components/datasources/DataSourcesTab.vue'
import AlarmToast from '@/components/common/AlarmToast.vue'
import { WhatIfSimulator } from '@/components/whatif'
import { SecurityGuardTab } from '@/components/security'
import { useSessionStore } from '@/stores/session'
import { storeToRefs } from 'pinia'

const sessionStore = useSessionStore()
const { activeTab } = storeToRefs(sessionStore)
</script>

<template>
  <div class="home-view">
    <!-- 현재 활성 탭에 따라 컴포넌트 표시 -->
    <UploadTab v-if="activeTab === 'upload'" />
    <DataSourcesTab v-else-if="activeTab === 'datasources'" />
    <GraphTab v-else-if="activeTab === 'graph'" />
    <LineageTab v-else-if="activeTab === 'lineage'" />
    <GlossaryTab v-else-if="activeTab === 'glossary'" />
    <OlapTab v-else-if="activeTab === 'olap'" />
    <Text2SqlTab v-else-if="activeTab === 'text2sql'" />
    <Text2SqlTab v-else-if="activeTab === 'domain-text2sql'" :domain-layer-mode="true" />
    <LangChainTab v-else-if="activeTab === 'langchain'" />
    
    <!-- Observability 탭들 -->
    <DataQuality v-else-if="activeTab === 'data-quality'" />
    <IncidentManager v-else-if="activeTab === 'incident-manager'" />
    <AlertsPage v-else-if="activeTab === 'alerts'" />
    <EventDetection v-else-if="activeTab === 'event-detection'" />
    <WatchAgent v-else-if="activeTab === 'watch-agent'" />
    
    <!-- 도메인 레이어 뷰어 -->
    <ObjectTypeModeler v-else-if="activeTab === 'schema-modeling'" />
    <MultiLayerOntologyViewer v-else-if="activeTab === 'multi-layer-ontology'" />
    <ObjectExplorerTab v-else-if="activeTab === 'object-explorer'" />
    <OntologyTab v-else-if="activeTab === 'ontology'" />
    
    <!-- What-If 시뮬레이터 -->
    <WhatIfSimulator v-else-if="activeTab === 'whatif'" />
    
    <!-- Security Guard -->
    <SecurityGuardTab v-else-if="activeTab === 'security-guard'" />
    
    <!-- 실시간 알람 토스트 (항상 표시) -->
    <AlarmToast />
  </div>
</template>

<style lang="scss" scoped>
.home-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
  border-radius: var(--radius-lg) 0 0 0;
  box-shadow: -1px 0 0 var(--color-border);
}
</style>
