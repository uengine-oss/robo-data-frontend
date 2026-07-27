import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function styleFor(styles, selector) {
  const projection = styles.find(style => style.selector === selector)
  assert.ok(projection, `missing Cytoscape selector: ${selector}`)
  return projection.style
}

try {
  const canvasStyles = await vite.ssrLoadModule(
    '/src/workflows/ontology/model/ontologyCanvasStyles.ts',
  )

  const dark = canvasStyles.createOntologyCanvasStyles(true)
  const light = canvasStyles.createOntologyCanvasStyles(false)

  assert.equal(dark.length, 43)
  assert.deepEqual(
    dark.map(style => style.selector),
    light.map(style => style.selector),
  )
  assert.deepEqual(
    dark.slice(3, 26).map(style => style.selector),
    [
      'edge[type="CAUSES"]',
      'edge[type="MEASURED_AS"]',
      'edge[type="PRODUCES"]',
      'edge[type="INFLUENCES"]',
      'edge[type="EXECUTES"]',
      'edge[type="USED_WHEN"]',
      'edge[type="CAUSED_BY"]',
      'edge[type="MEASURES"]',
      'edge[type="PRODUCED_BY"]',
      'edge[type="INFLUENCED_BY"]',
      'edge[type="EXECUTED_BY"]',
      'edge[type="SUPPORTS"]',
      'edge[type="FOLLOWS"]',
      'edge[type="TRIGGERED_BY"]',
      'edge[type="PRECEDES"]',
      'edge[type="TRIGGERS"]',
      'edge[type="EFFECTS"], edge[type="EFFECTED_BY"]',
      'edge[type="NEXT"]',
      'edge[type="AFFECTS"], edge[type="AFFECTED_BY"]',
      'edge[type="IMPACTS"], edge[type="IMPACTED_BY"]',
      'edge[type="ENABLES"], edge[type="ENABLED_BY"]',
      'edge[type="CONTRIBUTES_TO"], edge[type="CONTRIBUTED_BY"]',
      'edge[type="USES"], edge[type="USED_BY"]',
    ],
  )

  assert.deepEqual(
    {
      color: styleFor(dark, 'node').color,
      border: styleFor(dark, 'node')['border-color'],
      selected: styleFor(dark, 'node.selected')['border-color'],
      edge: styleFor(dark, 'edge')['line-color'],
      edgeLabel: styleFor(dark, 'edge').color,
      edgeLabelBackground: styleFor(dark, 'edge')['text-background-color'],
    },
    {
      color: '#fff',
      border: 'rgba(255,255,255,0.3)',
      selected: '#fff',
      edge: '#64748b',
      edgeLabel: '#94a3b8',
      edgeLabelBackground: '#1a1b1e',
    },
  )
  assert.deepEqual(
    {
      color: styleFor(light, 'node').color,
      border: styleFor(light, 'node')['border-color'],
      selected: styleFor(light, 'node.selected')['border-color'],
      edge: styleFor(light, 'edge')['line-color'],
      edgeLabel: styleFor(light, 'edge').color,
      edgeLabelBackground: styleFor(light, 'edge')['text-background-color'],
    },
    {
      color: '#1e293b',
      border: 'rgba(0,0,0,0.1)',
      selected: '#1e293b',
      edge: '#94a3b8',
      edgeLabel: '#64748b',
      edgeLabelBackground: '#fff',
    },
  )

  assert.deepEqual(styleFor(dark, 'edge[type="USED_WHEN"]'), {
    'line-color': '#06b6d4',
    'target-arrow-color': '#06b6d4',
    'line-style': 'dashed',
  })
  assert.deepEqual(styleFor(dark, 'edge[type="NEXT"]'), {
    'line-color': '#16a34a',
    'target-arrow-color': '#16a34a',
    width: 3,
    'curve-style': 'straight',
  })
  assert.deepEqual(styleFor(dark, 'node.agent-running'), {
    'border-width': 5,
    'border-color': '#6366f1',
    'border-opacity': 1,
    'overlay-color': '#6366f1',
    'overlay-padding': 8,
    'overlay-opacity': 0.12,
  })
  assert.deepEqual(styleFor(dark, '.eh-preview, .eh-ghost-edge'), {
    'line-color': '#00d9ff',
    'target-arrow-color': '#00d9ff',
    'line-style': 'dashed',
    opacity: 0.7,
  })
  assert.deepEqual(styleFor(dark, 'edge.causal-highlight'), {
    'line-color': '#f59e0b',
    'target-arrow-color': '#f59e0b',
    width: 4,
    opacity: 1,
  })
  assert.deepEqual(styleFor(dark, '.filtered-cascade'), {
    opacity: 1,
    'border-width': 4,
    'border-color': '#a78bfa',
    'border-opacity': 0.8,
    'border-style': 'dashed',
    'overlay-color': '#a78bfa',
    'overlay-opacity': 0.1,
  })

  dark[0].style.color = '#000'
  styleFor(dark, 'edge[type="CAUSES"]')['line-color'] = '#000'
  const nextDark = canvasStyles.createOntologyCanvasStyles(true)
  assert.equal(styleFor(nextDark, 'node').color, '#fff')
  assert.equal(
    styleFor(nextDark, 'edge[type="CAUSES"]')['line-color'],
    '#ef4444',
  )

  console.log('PASS ontology canvas styles contract')
} finally {
  await vite.close()
}
