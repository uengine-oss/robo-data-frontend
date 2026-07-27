import type cytoscape from 'cytoscape'

interface RelationshipStyleDefinition {
  selector: string
  color: string
  width?: number
  lineStyle?: 'dashed'
  curveStyle?: 'straight'
}

const RELATIONSHIP_STYLES: readonly RelationshipStyleDefinition[] = [
  { selector: 'edge[type="CAUSES"]', color: '#ef4444' },
  { selector: 'edge[type="MEASURED_AS"]', color: '#22c55e' },
  { selector: 'edge[type="PRODUCES"]', color: '#3b82f6' },
  { selector: 'edge[type="INFLUENCES"]', color: '#f97316' },
  { selector: 'edge[type="EXECUTES"]', color: '#8b5cf6' },
  { selector: 'edge[type="USED_WHEN"]', color: '#06b6d4', lineStyle: 'dashed' },
  { selector: 'edge[type="CAUSED_BY"]', color: '#ef4444' },
  { selector: 'edge[type="MEASURES"]', color: '#22c55e' },
  { selector: 'edge[type="PRODUCED_BY"]', color: '#3b82f6' },
  { selector: 'edge[type="INFLUENCED_BY"]', color: '#f97316' },
  { selector: 'edge[type="EXECUTED_BY"]', color: '#8b5cf6' },
  { selector: 'edge[type="SUPPORTS"]', color: '#06b6d4', lineStyle: 'dashed' },
  { selector: 'edge[type="FOLLOWS"]', color: '#64748b' },
  { selector: 'edge[type="TRIGGERED_BY"]', color: '#a855f7' },
  { selector: 'edge[type="PRECEDES"]', color: '#64748b' },
  { selector: 'edge[type="TRIGGERS"]', color: '#a855f7' },
  {
    selector: 'edge[type="EFFECTS"], edge[type="EFFECTED_BY"]',
    color: '#dc2626',
    width: 3,
  },
  {
    selector: 'edge[type="NEXT"]',
    color: '#16a34a',
    width: 3,
    curveStyle: 'straight',
  },
  {
    selector: 'edge[type="AFFECTS"], edge[type="AFFECTED_BY"]',
    color: '#f43f5e',
  },
  {
    selector: 'edge[type="IMPACTS"], edge[type="IMPACTED_BY"]',
    color: '#ec4899',
  },
  {
    selector: 'edge[type="ENABLES"], edge[type="ENABLED_BY"]',
    color: '#14b8a6',
  },
  {
    selector: 'edge[type="CONTRIBUTES_TO"], edge[type="CONTRIBUTED_BY"]',
    color: '#84cc16',
  },
  {
    selector: 'edge[type="USES"], edge[type="USED_BY"]',
    color: '#64748b',
    lineStyle: 'dashed',
  },
]

function createRelationshipStyle(
  definition: RelationshipStyleDefinition,
): cytoscape.StylesheetStyle {
  const style: cytoscape.Css.Edge = {
    'line-color': definition.color,
    'target-arrow-color': definition.color,
  }

  if (definition.width !== undefined) {
    style.width = definition.width
  }
  if (definition.lineStyle !== undefined) {
    style['line-style'] = definition.lineStyle
  }
  if (definition.curveStyle !== undefined) {
    style['curve-style'] = definition.curveStyle
  }

  return {
    selector: definition.selector,
    style,
  }
}

export function createOntologyCanvasStyles(
  dark: boolean,
): cytoscape.StylesheetStyle[] {
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
        'border-color': dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)',
      },
    },
    {
      selector: 'node.selected',
      style: {
        'border-width': 4,
        'border-color': selectedBorderColor,
        'width': 70,
        'height': 70,
      },
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
        'text-background-padding': '2px',
      },
    },
    ...RELATIONSHIP_STYLES.map(createRelationshipStyle),
    {
      selector: 'node.fx-alert',
      style: {
        'border-width': 5,
        'border-color': '#ef4444',
        'border-opacity': 1,
        'overlay-color': '#ef4444',
        'overlay-padding': 10,
        'overlay-opacity': 0.15,
      },
    },
    {
      selector: 'node.fx-badge',
      style: {
        'border-width': 3,
        'border-color': '#facc15',
        'border-opacity': 0.9,
      },
    },
    {
      selector: 'node.agent-active',
      style: {
        'border-width': 4,
        'border-color': '#22d3ee',
        'border-opacity': 0.9,
        'overlay-color': '#22d3ee',
        'overlay-padding': 6,
        'overlay-opacity': 0.08,
      },
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
      },
    },
    {
      selector: '.eh-hover',
      style: {
        'border-width': 12,
        'border-color': 'rgba(255, 255, 255, 0.9)',
        'border-opacity': 1,
      },
    },
    {
      selector: '.eh-source',
      style: {
        'border-width': 10,
        'border-color': '#00d9ff',
        'border-opacity': 1,
      },
    },
    {
      selector: '.eh-target',
      style: {
        'border-width': 10,
        'border-color': '#10b981',
        'border-opacity': 1,
      },
    },
    {
      selector: '.eh-presumptive-target',
      style: {
        'border-width': 14,
        'border-color': '#10b981',
        'border-opacity': 1,
      },
    },
    {
      selector: '.eh-preview, .eh-ghost-edge',
      style: {
        'line-color': '#00d9ff',
        'target-arrow-color': '#00d9ff',
        'line-style': 'dashed',
        'opacity': 0.7,
      },
    },
    {
      selector: 'node.causal-highlight',
      style: {
        'border-width': 4,
        'border-color': '#fbbf24',
        'border-opacity': 1,
        'opacity': 1,
      },
    },
    {
      selector: 'node.causal-faded',
      style: {
        'opacity': 0.25,
      },
    },
    {
      selector: 'edge.causal-highlight',
      style: {
        'line-color': '#f59e0b',
        'target-arrow-color': '#f59e0b',
        'width': 4,
        'opacity': 1,
      },
    },
    {
      selector: 'edge.causal-faded',
      style: {
        'opacity': 0.15,
      },
    },
    {
      selector: '.filtered-dimmed',
      style: {
        'opacity': 0.2,
      },
    },
    {
      selector: '.filtered-direct',
      style: {
        'opacity': 1,
        'border-width': 6,
        'border-color': '#f59e0b',
        'border-opacity': 1,
        'overlay-color': '#f59e0b',
        'overlay-opacity': 0.15,
      },
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
        'overlay-opacity': 0.1,
      },
    },
    {
      selector: '.filtered-edge',
      style: {
        'opacity': 1,
        'line-color': '#f59e0b',
        'target-arrow-color': '#f59e0b',
        'width': 3,
      },
    },
  ]
}
