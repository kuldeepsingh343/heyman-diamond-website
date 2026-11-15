import test from 'node:test'
import assert from 'node:assert/strict'
import {
  handleUploadInventory,
  handleGetCatalog,
  getInventoryItemBySku,
  resetMemoryInventory,
} from '../server/services/inventory.mjs'

const admin = {
  user: { id: 'admin-overwrite-test', email: 'director@heymandiamond.com' },
  role: 'super_admin',
  permissions: { can_manage_inventory: true },
}

test('Inventory Upload — Overwrite all categories deletes old inventory and shows only uploaded diamonds', async (t) => {
  t.after(() => resetMemoryInventory())

  // 1. Initial state: upload initial inventory with Round Melee and Fancy diamonds
  const initialCsv = [
    'SKU,Category,Shape,Carat,Color,Clarity,Cut,Price,Wholesale Price',
    'RND-MELEE-101,Round Melee Diamonds,Round,0.08,G,VS1,Excellent,120,80',
    'FNC-OVAL-201,Loose Fancy Diamonds,Oval,1.20,F,VVS2,Ideal,2800,2100',
  ].join('\n')

  async function* gen1() { yield Buffer.from(JSON.stringify({ fileContent: initialCsv, mode: 'overwrite', defaultCategory: 'all' })) }
  const req1 = gen1()
  req1.headers = { 'content-type': 'application/json' }
  let sc1 = null; let b1 = ''
  await handleUploadInventory(req1, { writeHead(c) { sc1 = c }, end(d) { b1 = d || '' } }, admin)
  assert.equal(sc1, 200)

  assert.ok(getInventoryItemBySku('RND-MELEE-101'), 'RND-MELEE-101 should exist')
  assert.ok(getInventoryItemBySku('FNC-OVAL-201'), 'FNC-OVAL-201 should exist')

  // 2. Overwrite upload across all categories with a spreadsheet that omits Round Melee
  // (e.g., currently out of stock on Round Melees)
  const newSpreadsheet = [
    'SKU,Category,Shape,Carat,Color,Clarity,Cut,Price,Wholesale Price',
    'FNC-EMR-301,Loose Fancy Diamonds,Emerald,2.15,E,VS1,Excellent,4900,3800',
  ].join('\n')

  async function* gen2() { yield Buffer.from(JSON.stringify({ fileContent: newSpreadsheet, mode: 'overwrite', defaultCategory: 'all' })) }
  const req2 = gen2()
  req2.headers = { 'content-type': 'application/json' }
  let sc2 = null; let b2 = ''
  await handleUploadInventory(req2, { writeHead(c) { sc2 = c }, end(d) { b2 = d || '' } }, admin)
  assert.equal(sc2, 200)
  const json2 = JSON.parse(b2)
  assert.equal(json2.success, true)
  assert.equal(json2.importedCount, 1)

  // 3. Confirm old diamonds are deleted
  assert.equal(getInventoryItemBySku('RND-MELEE-101'), null, 'Omitted Round Melee diamond must be deleted')
  assert.equal(getInventoryItemBySku('FNC-OVAL-201'), null, 'Old Fancy diamond must be deleted')

  // 4. Confirm newly uploaded diamond exists
  const activeStone = getInventoryItemBySku('FNC-EMR-301')
  assert.ok(activeStone, 'Newly uploaded stone must exist')
  assert.equal(activeStone.category, 'Loose Fancy Diamonds')

  // 5. Query catalog for Round Melee: must return 0 items
  const meleeUrl = new URL('http://localhost:3000/api/inventory?category=Round%20Melee%20Diamonds')
  let catCode = null; let catBody = ''
  await handleGetCatalog({}, { writeHead(c) { catCode = c }, end(d) { catBody = d || '' } }, meleeUrl, null)
  assert.equal(catCode, 200)
  const meleeCatalog = JSON.parse(catBody)
  assert.equal(meleeCatalog.items.length, 0, 'Round Melee category must be empty since none were uploaded')
})
