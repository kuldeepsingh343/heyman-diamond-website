import test from 'node:test'
import assert from 'node:assert/strict'

process.env.FLOMIZ_API_KEY = 'test_flomiz_key'

import {
  handleDeleteAdminDiamond,
  handleRestoreAdminDiamond,
  handleGetAdminDiamonds,
  handleGetCatalog,
  handleUploadInventory,
  getInventoryItemBySku,
} from '../server/services/inventory.mjs'

function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(code, headers) {
      res.statusCode = code
      res.headers = { ...res.headers, ...headers }
    },
    end(data) {
      res.body = data || ''
    },
    get json() {
      try {
        return JSON.parse(res.body)
      } catch {
        return null
      }
    },
  }
  return res
}

function createMockReq(headers = {}, body = null) {
  async function* generator() {
    if (body !== null) {
      yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    }
  }
  const req = generator()
  req.headers = { ...headers }
  req.socket = { remoteAddress: '127.0.0.1' }
  return req
}

const authorizedAdmin = {
  user: { id: 'admin-soft-del-1', email: 'admin@heymandiamond.com' },
  permissions: { can_manage_inventory: true },
}

const unauthorizedAdmin = {
  user: { id: 'sales-manager-1', email: 'sales@heymandiamond.com' },
  permissions: { can_manage_inventory: false },
}

test('Soft Delete — Authorization and Validation Boundaries', async () => {
  // 1. Rejects unauthenticated request with 401
  const res1 = createMockRes()
  await handleDeleteAdminDiamond(createMockReq(), res1, null, 'HMD-LG-1002')
  assert.strictEqual(res1.statusCode, 401)

  // 2. Rejects staff without can_manage_inventory with 403
  const res2 = createMockRes()
  await handleDeleteAdminDiamond(createMockReq(), res2, unauthorizedAdmin, 'HMD-LG-1002')
  assert.strictEqual(res2.statusCode, 403)

  // 3. Rejects invalid ID regex
  const res3 = createMockRes()
  await handleDeleteAdminDiamond(createMockReq(), res3, authorizedAdmin, 'HMD-LG-1002; DROP TABLE')
  assert.strictEqual(res3.statusCode, 400)

  // 4. Rejects non-existent diamond with 404
  const res4 = createMockRes()
  await handleDeleteAdminDiamond(createMockReq(), res4, authorizedAdmin, 'NON-EXISTENT-SKU-999')
  assert.strictEqual(res4.statusCode, 404)
})

test('Soft Delete — Deletion hides stone from public storefront and cannot be resurrected', async () => {
  const targetSku = 'HMD-LG-1002'

  // Confirm item is initially active in memory
  const initialItem = getInventoryItemBySku(targetSku)
  assert.ok(initialItem, 'Initial item should exist in inventory')

  // Perform soft delete
  const delRes = createMockRes()
  await handleDeleteAdminDiamond(createMockReq(), delRes, authorizedAdmin, targetSku)
  assert.strictEqual(delRes.statusCode, 200)

  const deletedItem = getInventoryItemBySku(targetSku)
  assert.ok(deletedItem.deletedAt || deletedItem.deleted_at, 'Item must have deletedAt set')

  // Storefront catalog must NOT include the soft-deleted stone
  const catUrl = new URL('http://localhost:3000/api/catalog?perPage=50')
  const catRes = createMockRes()
  await handleGetCatalog(createMockReq(), catRes, catUrl, null)
  assert.strictEqual(catRes.statusCode, 200)
  const foundInCatalog = catRes.json.items.find(i => i.sku === targetSku)
  assert.strictEqual(foundInCatalog, undefined, 'Soft-deleted diamond must never appear in public storefront')

  // Excel / CSV upload must NOT resurrect the soft-deleted stone
  const uploadCsv = `SKU,Category,Shape,Carat,Color,Clarity,Price (USD),Wholesale Price (USD)\n${targetSku},Certified Diamonds,Oval,2.05,F,VS1,2650,1950`
  const uploadReq = createMockReq({}, { content: uploadCsv, defaultCategory: 'all' })
  const uploadRes = createMockRes()
  await handleUploadInventory(uploadReq, uploadRes, authorizedAdmin)

  // Upload should report that the deleted stone was skipped
  assert.strictEqual(uploadRes.statusCode, 400)
  assert.ok(uploadRes.json.skippedDeletedCount >= 1 || (uploadRes.json.skipped && uploadRes.json.skipped.some(s => s.sku === targetSku)))

  // Confirm the item remains deleted
  const stillDeleted = getInventoryItemBySku(targetSku)
  assert.ok(stillDeleted.deletedAt || stillDeleted.deleted_at, 'Resurrection via upload must be blocked')
})

test('Soft Delete — Admin listing and Restoration', async () => {
  const targetSku = 'HMD-LG-1002'

  // Admin query with status=deleted returns the deleted diamond
  const delUrl = new URL('http://localhost:3000/api/admin/diamonds?status=deleted')
  const delListRes = createMockRes()
  await handleGetAdminDiamonds(createMockReq(), delListRes, authorizedAdmin, delUrl)
  assert.strictEqual(delListRes.statusCode, 200)
  assert.ok(delListRes.json.items.some(i => i.sku === targetSku), 'Admin deleted status filter must list soft-deleted stones')

  // Restore the diamond
  const restoreRes = createMockRes()
  await handleRestoreAdminDiamond(createMockReq(), restoreRes, authorizedAdmin, targetSku)
  assert.strictEqual(restoreRes.statusCode, 200)

  const restoredItem = getInventoryItemBySku(targetSku)
  assert.strictEqual(restoredItem.deletedAt, null, 'deletedAt must be cleared upon restore')
  assert.strictEqual(restoredItem.deleted_at, null)
})
