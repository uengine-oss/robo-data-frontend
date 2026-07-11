import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true })
const page = await b.newPage()
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(1500)
  const r = await page.evaluate(async () => {
    const res = await fetch('/api/gateway/robo/schema/tables?limit=3')
    const j = await res.json()
    return { ok: res.ok, keys: j[0] ? Object.keys(j[0]) : null, sample: j.slice(0,3).map(t => ({name:t.name, logical_name:t.logical_name})) }
  })
  console.log(JSON.stringify(r, null, 1))
} catch(e){ console.log('FATAL', e.message) } finally { await b.close() }
