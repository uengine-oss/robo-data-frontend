import assert from 'node:assert/strict'
import {
  buildUploadTreeFromUploadedFiles,
  collectFileNodes,
  findUploadFile,
} from '../../../src/domains/parser/application/uploadFiles.ts'
import { getAllDataSourceTypes } from '../../../src/domains/data-fabric/catalog/connectors.ts'

const sourceTree = buildUploadTreeFromUploadedFiles([
  { fileName: 'src/orders/load_orders.sql', fileContent: 'select 1' },
  { fileName: 'src/archive/load_orders_old.sql', fileContent: 'select 2' },
  { fileName: 'src/users/UserService.java', fileContent: 'class UserService {}' },
])
const ddlTree = buildUploadTreeFromUploadedFiles([
  { fileName: 'ddl/orders.sql', fileContent: 'create table orders(id int)' },
])

assert.deepEqual(
  collectFileNodes(sourceTree).map((node) => node.relPath),
  [
    'src/archive/load_orders_old.sql',
    'src/orders/load_orders.sql',
    'src/users/UserService.java',
  ],
)

assert.equal(
  findUploadFile([sourceTree, ddlTree], {
    fileDirectory: 'src/orders',
    fileName: 'load_orders.sql',
    procedureName: 'ignored',
  })?.relPath,
  'src/orders/load_orders.sql',
  'directory + file name must take precedence',
)
assert.equal(
  findUploadFile([sourceTree, ddlTree], { fileName: 'orders.sql' })?.relPath,
  'ddl/orders.sql',
  'exact base file name must cross both upload roots',
)
assert.equal(
  findUploadFile([sourceTree], { procedureName: 'load_orders' })?.relPath,
  'src/orders/load_orders.sql',
  'an exact extension-less procedure name must resolve',
)
assert.equal(
  findUploadFile([sourceTree], { procedureName: 'orders' }),
  null,
  'partial procedure-name inference must not select the wrong file',
)
assert.equal(
  findUploadFile([sourceTree], { fileDirectory: 'missing', fileName: 'missing.sql' }),
  null,
  'missing metadata must remain not found',
)

const connectorTypes = getAllDataSourceTypes()
assert(connectorTypes.length > 4, 'the Data Fabric catalog must expose the full connector set')
assert(connectorTypes.some((type) => type.type === 'postgres'))
assert(connectorTypes.some((type) => type.type === 'mysql'))
assert(connectorTypes.some((type) => type.type === 'neo4j'))
assert(connectorTypes.some((type) => type.type === 'mongodb'))

console.log('Upload workflow contract: deterministic file lookup + Data Fabric connector catalog passed')
