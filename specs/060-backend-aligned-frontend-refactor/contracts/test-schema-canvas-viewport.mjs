import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const viewport = await vite.ssrLoadModule(
    '/src/workflows/schema-modeling/model/schemaCanvasViewport.ts',
  )

  assert.deepEqual(
    viewport.projectSchemaCanvasFitPadding({
      canvasWidth: 1200,
      canvasHeight: 800,
      basePadding: 0.2,
    }),
    {
      top: '66px',
      right: '100px',
      bottom: '66px',
      left: '100px',
    },
  )

  assert.deepEqual(
    viewport.projectSchemaCanvasFitPadding({
      canvasWidth: 1200,
      canvasHeight: 800,
      basePadding: 0.2,
      topOcclusion: 44,
      rightOcclusion: 230,
      bottomOcclusion: 64,
      overlayGap: 12,
    }),
    {
      top: '66px',
      right: '242px',
      bottom: '76px',
      left: '100px',
    },
  )

  const expanded = viewport.projectSchemaCanvasFitPadding({
    canvasWidth: 1200,
    canvasHeight: 800,
    basePadding: 0.2,
    rightOcclusion: 230,
  })
  const collapsed = viewport.projectSchemaCanvasFitPadding({
    canvasWidth: 1200,
    canvasHeight: 800,
    basePadding: 0.2,
    rightOcclusion: 140,
  })
  assert.equal(expanded.right, '242px')
  assert.equal(collapsed.right, '152px')

  assert.deepEqual(
    viewport.projectSchemaCanvasFitPadding({
      canvasWidth: 200,
      canvasHeight: 160,
      basePadding: 0.3,
      rightOcclusion: 500,
      bottomOcclusion: Number.POSITIVE_INFINITY,
      topOcclusion: -10,
    }),
    {
      top: '18px',
      right: '77px',
      bottom: '18px',
      left: '23px',
    },
  )

  assert.deepEqual(
    viewport.projectSchemaCanvasFitPadding({
      canvasWidth: Number.NaN,
      canvasHeight: -1,
      basePadding: Number.POSITIVE_INFINITY,
      rightOcclusion: 100,
    }),
    {
      top: '0px',
      right: '0px',
      bottom: '0px',
      left: '0px',
    },
  )

  console.log('PASS schema canvas overlay-safe viewport contract')
} finally {
  await vite.close()
}
