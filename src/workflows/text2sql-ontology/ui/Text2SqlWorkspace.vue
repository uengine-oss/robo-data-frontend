<script setup lang="ts">
import { ref } from 'vue'
import {
  Text2SqlTab,
  type SqlResultInstanceExport,
} from '@/domains/text2sql'
import SqlResultInstanceDialog from './SqlResultInstanceDialog.vue'

interface LinkedObjectType {
  name: string
  columns: Array<{ name: string; type: string }>
  description?: string
}

const props = withDefaults(defineProps<{
  embedded?: boolean
  initialQuery?: string
  autoExecute?: boolean
  domainLayerMode?: boolean
  linkedObjectTypes?: LinkedObjectType[]
}>(), {
  embedded: false,
  initialQuery: '',
  autoExecute: false,
  domainLayerMode: false,
  linkedObjectTypes: () => [],
})

const instanceExport = ref<SqlResultInstanceExport | null>(null)
</script>

<template>
  <Text2SqlTab
    v-bind="props"
    @request-instance-export="instanceExport = $event"
  />
  <SqlResultInstanceDialog
    :source="instanceExport"
    @close="instanceExport = null"
  />
</template>
