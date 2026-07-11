import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true })
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } })
await p.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
await p.waitForTimeout(2500)
// 모든 nav 버튼 구조 덤프
const navs = await p.$$eval('button', els => els
  .filter(e => /nav|sidebar|side|tab|menu/i.test(e.className) || e.closest('nav,aside'))
  .map(e => ({
    title: e.getAttribute('title') || e.getAttribute('aria-label') || (e.innerText || '').trim().slice(0, 20),
    cls: e.className,
    visible: !!(e.offsetParent !== null),
    rectx: Math.round(e.getBoundingClientRect().x),
  }))
  .filter(e => e.title)
)
console.log(JSON.stringify(navs, null, 1))
await b.close()
