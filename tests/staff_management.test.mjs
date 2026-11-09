import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://mock.supabase.co'
process.env.SUPABASE_ANON_KEY = 'mock-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'

import {
  handleGetStaffUsers,
  handleCreateStaffUser,
  handleUpdateStaffUser,
  handleDeleteStaffUser,
} from '../server/services/admin.mjs'

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

const superAdmin = {
  user: { id: 'staff-superadmin-1', email: 'superadmin.test@internal.test' },
  role: 'super_admin',
  isSuperAdmin: true,
  permissions: {
    can_manage_inventory: true,
    can_manage_orders: true,
    can_review_kyc: true,
    can_manage_reviews: true,
    can_manage_promotions: true,
    can_manage_users: true,
    can_manage_team: true,
    role_title: 'Super Administrator',
  },
}

const regularAdmin = {
  user: { id: 'sales-manager-1', email: 'sales@example.com' },
  role: 'sales_manager',
  isSuperAdmin: false,
  permissions: {
    can_manage_orders: true,
    can_manage_users: false,
    can_manage_team: false,
    role_title: 'Sales Manager',
  },
}

test('Staff Management — Only Super Admin can view staff accounts', async () => {
  const deniedRes = createMockRes()
  await handleGetStaffUsers(createMockReq(), deniedRes, regularAdmin)
  assert.equal(deniedRes.statusCode, 403, 'Regular admin must be denied')

  const allowedRes = createMockRes()
  await handleGetStaffUsers(createMockReq(), allowedRes, superAdmin)
  assert.equal(allowedRes.statusCode, 200, 'Super admin must be allowed')
  assert.ok(Array.isArray(allowedRes.json?.staff), 'Must return staff array')
  assert.ok(allowedRes.json?.staff.some(s => s.id === 'staff-superadmin-1' || s.email === 'superadmin.test@internal.test'))
})

test('Staff Management — Super Admin can create accounts for sales managers and operational staff with granular permissions', async () => {
  // Invalid inputs
  const invalidRes = createMockRes()
  await handleCreateStaffUser(createMockReq({}, { fullName: 'A', email: 'invalid', password: '123' }), invalidRes, superAdmin)
  assert.equal(invalidRes.statusCode, 400)

  // Valid Sales Manager
  const salesEmail = `sales.manager.${Date.now()}@heymandiamond.com`
  const createRes = createMockRes()
  await handleCreateStaffUser(createMockReq({}, {
    fullName: 'Rajesh Sharma',
    email: salesEmail,
    password: 'SecureSalesPassword2026!',
    roleTitle: 'Sales & Dealer Relations Manager',
    permissions: {
      can_manage_orders: true,
      can_review_kyc: true,
      can_manage_inventory: true,
      can_manage_reviews: false,
      can_manage_promotions: false,
      can_manage_team: false,
    },
  }), createRes, superAdmin)

  assert.equal(createRes.statusCode, 201)
  assert.equal(createRes.json?.success, true)
  assert.equal(createRes.json?.staff?.email, salesEmail)
  assert.equal(createRes.json?.staff?.role_title, 'Sales & Dealer Relations Manager')
  assert.equal(createRes.json?.staff?.permissions?.can_manage_orders, true)
  assert.equal(createRes.json?.staff?.permissions?.can_manage_reviews, false)
  assert.equal(createRes.json?.staff?.permissions?.can_manage_team, false)

  // Duplicate email rejection
  const dupRes = createMockRes()
  await handleCreateStaffUser(createMockReq({}, {
    fullName: 'Duplicate Tester',
    email: salesEmail,
    password: 'Password123!',
  }), dupRes, superAdmin)
  assert.equal(dupRes.statusCode, 409)
})

test('Staff Management — Super Admin can update permissions and revoke staff accounts', async () => {
  // Create staff to edit
  const email = `ops.${Date.now()}@heymandiamond.com`
  const createRes = createMockRes()
  await handleCreateStaffUser(createMockReq({}, {
    fullName: 'Operations Agent',
    email,
    password: 'Password123!',
    roleTitle: 'Inventory Clerk',
    permissions: {
      can_manage_inventory: true,
    },
  }), createRes, superAdmin)
  const staffId = createRes.json?.staff?.id
  assert.ok(staffId)

  // Injection parameter check
  const injectRes = createMockRes()
  await handleUpdateStaffUser(createMockReq({}, {}), injectRes, superAdmin, 'bad-id&drop=1')
  assert.equal(injectRes.statusCode, 400)

  // Update permissions to grant reviews and promotions
  const updateRes = createMockRes()
  await handleUpdateStaffUser(createMockReq({}, {
    roleTitle: 'Senior Operations Manager',
    permissions: {
      can_manage_inventory: true,
      can_manage_reviews: true,
      can_manage_promotions: true,
    },
  }), updateRes, superAdmin, staffId)
  assert.equal(updateRes.statusCode, 200)
  assert.equal(updateRes.json?.staff?.role_title, 'Senior Operations Manager')
  assert.equal(updateRes.json?.staff?.permissions?.can_manage_promotions, true)

  // Revoke account
  const deleteRes = createMockRes()
  await handleDeleteStaffUser(createMockReq(), deleteRes, superAdmin, staffId)
  assert.equal(deleteRes.statusCode, 200)
  assert.equal(deleteRes.json?.deleted, true)

  // Cannot delete primary super admin
  const selfDelRes = createMockRes()
  await handleDeleteStaffUser(createMockReq(), selfDelRes, superAdmin, 'staff-superadmin-1')
  assert.equal(selfDelRes.statusCode, 400)
})

