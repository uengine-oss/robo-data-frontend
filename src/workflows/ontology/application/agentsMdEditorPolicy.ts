import type {
  AgentContextResponse,
  AgentsMdResponse,
} from '@/domains/ontology'
import type { ProcessGptProcess } from '@/domains/agent-scheduler'

export interface AgentsMdDocument {
  hasAgent: boolean
  content: string
  originalContent: string
  enabled: boolean
  originalEnabled: boolean
}

export interface AgentsMdSaveSnapshot {
  nodeTypeName: string
  content: string
  enabled: boolean
}

export interface AgentsMdRewriteSnapshot extends AgentsMdSaveSnapshot {
  prompt: string
}

export interface ProcessGptMethod {
  name: string
  processId: string
  processName: string
  description: string
}

export interface ProcessGptBehaviorSnapshot {
  nodeTypeName: string
  process: ProcessGptProcess
  behaviorName: string
  triggerCondition: string
  body: {
    name: string
    description: string
    behaviorType: 'processGPT'
    config: {
      processId: string
      processName: string
      triggerCondition: string
    }
    inputFields: []
    outputField: ''
  }
}

export function emptyAgentsMdDocument(): AgentsMdDocument {
  return {
    hasAgent: false,
    content: '',
    originalContent: '',
    enabled: false,
    originalEnabled: false,
  }
}

export function loadedAgentsMdDocument(
  response: AgentsMdResponse | null,
): AgentsMdDocument {
  if (!response) return emptyAgentsMdDocument()
  return {
    hasAgent: true,
    content: response.content,
    originalContent: response.content,
    enabled: response.enabled,
    originalEnabled: response.enabled,
  }
}

export function isAgentsMdContentDirty(document: AgentsMdDocument): boolean {
  return document.content !== document.originalContent
}

export function isAgentsMdEnabledDirty(document: AgentsMdDocument): boolean {
  return document.enabled !== document.originalEnabled
}

export function isAgentsMdDirty(document: AgentsMdDocument): boolean {
  return isAgentsMdContentDirty(document) || isAgentsMdEnabledDirty(document)
}

export function createAgentsMdSaveSnapshot(
  nodeTypeName: string,
  document: AgentsMdDocument,
): AgentsMdSaveSnapshot {
  return {
    nodeTypeName,
    content: document.content,
    enabled: document.enabled,
  }
}

export function createAgentsMdRewriteSnapshot(
  nodeTypeName: string,
  document: AgentsMdDocument,
  prompt: string,
): AgentsMdRewriteSnapshot {
  return {
    ...createAgentsMdSaveSnapshot(nodeTypeName, document),
    prompt: prompt.trim(),
  }
}

export function commitAgentsMdSave(
  document: AgentsMdDocument,
  snapshot: AgentsMdSaveSnapshot,
): AgentsMdDocument {
  return {
    ...document,
    originalContent: snapshot.content,
    originalEnabled: snapshot.enabled,
  }
}

export function projectProcessGptMethods(
  context: AgentContextResponse | null,
): ProcessGptMethod[] {
  if (!context) return []
  return context.methods
    .filter(method => method.behaviorType === 'processGPT')
    .map(method => ({
      name: `process.${method.name}`,
      processId: method.name,
      processName: method.name,
      description: method.description,
    }))
}

export function createProcessGptBehaviorSnapshot(
  nodeTypeName: string,
  process: ProcessGptProcess,
  triggerCondition: string,
): ProcessGptBehaviorSnapshot {
  const normalizedCondition = triggerCondition.trim()
  const behaviorName = process.name.replace(/\s+/g, '_').toLowerCase()
  return {
    nodeTypeName,
    process: { ...process },
    behaviorName,
    triggerCondition: normalizedCondition,
    body: {
      name: behaviorName,
      description: `ProcessGPT: ${process.name}${normalizedCondition ? ` — 조건: ${normalizedCondition}` : ''}`,
      behaviorType: 'processGPT',
      config: {
        processId: process.id,
        processName: process.name,
        triggerCondition: normalizedCondition,
      },
      inputFields: [],
      outputField: '',
    },
  }
}

export function appendProcessGptReference(
  content: string,
  snapshot: ProcessGptBehaviorSnapshot,
): string {
  if (!snapshot.triggerCondition) return content
  const mention = `@method:process.${snapshot.behaviorName}`
  return `${content}\n- ${snapshot.triggerCondition} → ${mention} 호출`
}

export function computeChangedLineIndexes(
  oldText: string,
  newText: string,
): Set<number> {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const changed = new Set<number>()
  const length = Math.max(oldLines.length, newLines.length)
  for (let index = 0; index < length; index += 1) {
    if (oldLines[index] !== newLines[index]) changed.add(index)
  }
  return changed
}
