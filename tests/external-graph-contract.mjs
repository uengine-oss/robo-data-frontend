import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '..')

function evaluateCommonJs(source, fileName) {
  const output = ts.transpileModule(source, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', output)(module, module.exports)
  return module.exports
}

function analyzerContracts() {
  const fileName = path.join(root, 'src/features/code-analysis/analyzer.ts')
  const source = fs.readFileSync(fileName, 'utf8')
  const ast = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const names = new Set([
    'PHASES', 'STEP_TO_PHASE', 'ORDERED_LEAVES_FRAMEWORK', 'ORDERED_LEAVES_DBMS',
    'STEP_SUBLABEL', 'LABEL_KIND_KO', 'KIND_EMOJI',
    'nextRunningLeaf', 'runningPhaseIndex', 'resolveNodeName',
  ])
  const declarations = []
  for (const statement of ast.statements) {
    if (ts.isVariableStatement(statement)) {
      const selected = statement.declarationList.declarations.some(
        declaration => ts.isIdentifier(declaration.name) && names.has(declaration.name.text),
      )
      if (selected) declarations.push(statement.getText(ast))
    } else if (ts.isFunctionDeclaration(statement) && statement.name && names.has(statement.name.text)) {
      declarations.push(statement.getText(ast))
    }
  }
  assert.equal(declarations.length, names.size, 'all Analyzer contract declarations must remain discoverable')
  const exports = [...names].join(', ')
  return evaluateCommonJs(
    `const extractSubLabel = (labels) => labels[0] || ''\n${declarations.join('\n')}\nmodule.exports = { ${exports} }`,
    fileName,
  )
}

const visibilityPath = path.join(root, 'src/shared/utils/graphVisibility.ts')
const visibility = evaluateCommonJs(fs.readFileSync(visibilityPath, 'utf8'), visibilityPath)
const analyzer = analyzerContracts()

assert.deepEqual([...analyzer.PHASES], [
  'DDL 파싱', 'AST 적재', '외부 파일 적재', '프로젝트 스캔',
  '관계 연결', '분석 컨텍스트 구성', '코드 분석', '후처리',
])
assert.equal(analyzer.ORDERED_LEAVES_FRAMEWORK.length, 18)
assert.equal(analyzer.ORDERED_LEAVES_DBMS.length, 17)
assert.equal(analyzer.nextRunningLeaf(new Set(['parse_ddl_step', 'load_external_step']), 'framework'), 'load_ast_step')
assert.equal(analyzer.STEP_TO_PHASE.load_external_step, 2)
assert.equal(analyzer.STEP_TO_PHASE.scan_external_step, 3)
assert.equal(analyzer.STEP_TO_PHASE.link_external_step, 4)
assert.equal(analyzer.STEP_SUBLABEL.load_external_step, '외부 파일 읽는 중')
assert.equal(analyzer.STEP_SUBLABEL.link_external_step, '외부 파일 연결하는 중')

// spec 078 — 외부 청크는 name(첫 key)으로 표시된다.
assert.equal(analyzer.resolveNodeName({ name: 'getOrderDetail' }, ['EXTERNAL_CHUNK'], 'opaque:1'), 'getOrderDetail')
assert.equal(analyzer.resolveNodeName({}, [], 'opaque:3'), 'opaque:3')
for (const label of ['PROJECT_FILE', 'EXTERNAL_CHUNK']) {
  const kind = analyzer.LABEL_KIND_KO[label]
  assert.ok(kind, `${label} needs a display kind`)
  assert.ok(analyzer.KIND_EMOJI[kind], `${label} needs an icon`)
}
// 폐기된 075 라벨은 표시 사전에 남아 있으면 안 된다.
for (const removed of [
  'SQL_STATEMENT', 'CONFIG_SECTION', 'ARTIFACT_CHUNK', 'CHUNK',
  'DOCUMENT', 'DOC_SECTION', 'DOC_CHUNK', 'UNRESOLVED_REF', 'CANDIDATE_LINK',
]) {
  assert.equal(analyzer.LABEL_KIND_KO[removed], undefined, `${removed} must be removed`)
}

// 외부 노드는 기본 숨김, showHidden으로만 노출.
for (const label of ['PROJECT_FILE', 'EXTERNAL_CHUNK']) {
  assert.equal(visibility.isNodeHidden({ id: label, labels: [label], properties: {} }), true, label)
}
// REFER_TO/HAS_CHUNK는 타입 숨김이 아니다 — endpoint(외부 노드) 가시성으로 걸러진다.
// 따라서 Catalog의 TABLE-target REFER_TO 표시가 깨지지 않는다.
for (const type of ['REFER_TO', 'HAS_CHUNK', 'READS', 'WRITES']) {
  assert.equal(visibility.isLinkHidden(type), false, type)
}

console.log('[OK] external graph frontend contract')
