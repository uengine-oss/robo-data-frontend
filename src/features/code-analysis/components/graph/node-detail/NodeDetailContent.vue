<script setup lang="ts">
/**
 * NodeDetailContent.vue
 * 노드 디테일 라우팅 디스패처 — 라벨/sub-label 보고 적절한 카드 컴포넌트 마운트.
 */

import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import { pickTemplate } from './templateRouter'

import ModuleCard from './ModuleCard.vue'
import FileCard from './FileCard.vue'
import DatatypeCard from './DatatypeCard.vue'
import FunctionCard from './FunctionCard.vue'
import SqlStatementCard from './SqlStatementCard.vue'
import TableCard from './TableCard.vue'
import ColumnCard from './ColumnCard.vue'
import VariableCard from './VariableCard.vue'
import PackageCard from './PackageCard.vue'
import NonCodeCard from './NonCodeCard.vue'
import AttachedCard from './AttachedCard.vue'
import FallbackCard from './FallbackCard.vue'

interface Props {
  node: GraphNode
}
const props = defineProps<Props>()

const template = computed(() => pickTemplate(props.node))
</script>

<template>
  <ModuleCard       v-if="template === 'module'"       :node="node" />
  <FileCard         v-else-if="template === 'file'"    :node="node" />
  <DatatypeCard     v-else-if="template === 'datatype'" :node="node" />
  <FunctionCard     v-else-if="template === 'function'" :node="node" />
  <SqlStatementCard v-else-if="template === 'sqlStatement'" :node="node" />
  <TableCard        v-else-if="template === 'table'"   :node="node" />
  <ColumnCard       v-else-if="template === 'column'"  :node="node" />
  <VariableCard     v-else-if="template === 'variable'" :node="node" />
  <PackageCard      v-else-if="template === 'package'" :node="node" />
  <NonCodeCard      v-else-if="template === 'nonCode'" :node="node" />
  <AttachedCard     v-else-if="template === 'attached'" :node="node" />
  <FallbackCard     v-else                              :node="node" />
</template>
