/**
 * 059 계약 테스트 — 테이블 주인 판정(`computeTableOwners`).
 *
 * 실행: node specs/059-cohesion-coupling-view/contracts/test-area-graph.mjs
 * 순수 모듈이라 단일 파일 트랜스파일로 돈다(Vue·Pinia 없이).
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const ROOT = process.cwd()
const ts = createRequire(`${ROOT}/package.json`)('typescript')
const src = await readFile(`${ROOT}/src/features/code-analysis/areaGraph.ts`, 'utf8')
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const { computeTableOwners, UNASSIGNED_AREA } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
)

const ROUTINE = new Set(['FUNCTION', 'METHOD', 'PROCEDURE', 'TRIGGER'])
const n = (id, ...labels) => ({ id, labels, properties: { name: id } })
const l = (type, source, target) => ({ id: `${type}:${source}->${target}`, source, target, properties: {} , type })

function owners(nodes, links, areaMap) {
  return computeTableOwners({
    nodes, links, routineLabels: ROUTINE, tableLabel: 'TABLE',
    areaOfRoutine: id => areaMap[id] ?? null,
  })
}

// N1 — 쓰기가 가장 많은 영역이 주인이다.
{
  const o = owners(
    [n('fnA', 'FUNCTION'), n('fnB', 'FUNCTION'), n('t', 'TABLE')],
    [l('WRITES', 'fnA', 't'), l('WRITES', 'fnA', 't'), l('WRITES', 'fnB', 't')],
    { fnA: 'areaA', fnB: 'areaB' },
  )
  assert.equal(o.get('t').ownerArea, 'areaA', 'N1 쓰기 최다가 주인')
}

// N2 — 읽기가 아무리 많아도 쓰기를 이기지 못한다.
{
  const links = [l('WRITES', 'fnA', 't')]
  for (let i = 0; i < 9; i++) links.push({ ...l('READS', 'fnB', 't'), id: `r${i}` })
  const o = owners([n('fnA', 'FUNCTION'), n('fnB', 'FUNCTION'), n('t', 'TABLE')], links,
    { fnA: 'areaA', fnB: 'areaB' })
  assert.equal(o.get('t').ownerArea, 'areaA', 'N2 쓰기 1 > 읽기 9')
}

// N3 — 쓰기가 같으면 읽기가 많은 쪽이 주인.
{
  const o = owners(
    [n('fnA', 'FUNCTION'), n('fnB', 'FUNCTION'), n('t', 'TABLE')],
    [l('WRITES', 'fnA', 't'), l('WRITES', 'fnB', 't'), { ...l('READS', 'fnB', 't'), id: 'r1' }],
    { fnA: 'areaA', fnB: 'areaB' },
  )
  assert.equal(o.get('t').ownerArea, 'areaB', 'N3 쓰기 동률 → 읽기 많은 쪽')
}

// N4 — 완전 동률이면 주인을 정하지 않는다(임의 배정 금지).
{
  const o = owners(
    [n('fnA', 'FUNCTION'), n('fnB', 'FUNCTION'), n('t', 'TABLE')],
    [l('READS', 'fnA', 't'), l('READS', 'fnB', 't')],
    { fnA: 'areaA', fnB: 'areaB' },
  )
  assert.equal(o.get('t').ownerArea, null, 'N4 완전 동률 → 주인 없음')
}

// N5 — 아무도 안 건드리는 테이블은 결과에 없다(화면에도 안 나온다).
{
  const o = owners([n('t', 'TABLE')], [], {})
  assert.equal(o.has('t'), false, 'N5 미사용 테이블 제외')
}

// N6 — DBMS: 중첩 구문에서 나온 R/W 도 소유 루틴으로 거슬러 집계된다.
{
  const o = owners(
    [n('proc', 'PROCEDURE'), n('sel', 'SELECT'), n('ins', 'INSERT'), n('t', 'TABLE')],
    [l('PARENT_OF', 'proc', 'sel'), l('PARENT_OF', 'sel', 'ins'),
     l('WRITES', 'ins', 't'), l('READS', 'sel', 't')],
    { proc: 'areaDb' },
  )
  assert.equal(o.get('t').ownerArea, 'areaDb', 'N6 구문 → 소유 루틴 해소')
}

// N7 — 영역을 해소하지 못한 접근은 집계하지 않는다(없는 소유권을 만들지 않는다).
{
  const o = owners(
    [n('fnA', 'FUNCTION'), n('t', 'TABLE')],
    [l('WRITES', 'fnA', 't')],
    {},   // 영역 미해소
  )
  assert.equal(o.has('t'), false, 'N7 영역 미해소 → 집계 제외')
}

// N8 — 같은 입력이면 항상 같은 결과(결정론).
{
  const nodes = [n('fnA', 'FUNCTION'), n('fnB', 'FUNCTION'), n('t', 'TABLE')]
  const links = [l('WRITES', 'fnA', 't'), l('READS', 'fnB', 't')]
  const a = owners(nodes, links, { fnA: 'x', fnB: 'y' })
  const b = owners(nodes, links, { fnA: 'x', fnB: 'y' })
  assert.deepEqual([...a.keys()], [...b.keys()], 'N8 결정론')
  assert.equal(a.get('t').ownerArea, b.get('t').ownerArea)
}

// N9 — 집계 수치를 그대로 보고한다(화면이 근거를 보여줄 수 있어야 한다).
{
  const o = owners(
    [n('fnA', 'FUNCTION'), n('fnB', 'FUNCTION'), n('t', 'TABLE')],
    [l('WRITES', 'fnA', 't'), { ...l('READS', 'fnB', 't'), id: 'r1' }],
    { fnA: 'areaA', fnB: 'areaB' },
  )
  assert.deepEqual(o.get('t').writeCounts, { areaA: 1 }, 'N9 쓰기 집계 보고')
  assert.deepEqual(o.get('t').readCounts, { areaB: 1 }, 'N9 읽기 집계 보고')
}

// N10 — TABLE 이 아닌 대상으로 가는 R/W 는 무시한다.
{
  const o = owners(
    [n('fnA', 'FUNCTION'), n('x', 'COLUMN')],
    [l('WRITES', 'fnA', 'x')],
    { fnA: 'areaA' },
  )
  assert.equal(o.size, 0, 'N10 TABLE 아닌 대상 무시')
}

// N11 — UNASSIGNED_AREA 상수가 공개돼 소비처가 같은 값을 쓴다.
assert.equal(typeof UNASSIGNED_AREA, 'string')

console.log('059 table-owner contract: N1~N11 통과')
