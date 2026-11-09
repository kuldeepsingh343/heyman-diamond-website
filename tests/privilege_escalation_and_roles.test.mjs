import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://live-test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'mock-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'

import {
  requireAdmin,
  getDefaultPermissions,
  resolvePermissions,
  handleSignup,
  handleSignin,
  handleGetProfile,
} from '../server/services/auth.mjs'

import {
  handleGetStaffUsers,
  handleCreateStaffUser,
  handleUpdateStaffUser,
  handleDeleteStaffUser,
  handleGetDealerApplications,
} from '../server/services/admin.mjs'

import {
  handleUploadInventory,
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

// ── Test 1: @heymandiamond.com signup does NOT grant admin access ──
test('Privilege Escalation — Signup with @heymandiamond.com creates normal customer only', async () => {
  const req = createMockReq({}, {
    fullName: 'Amy Salesperson',
    email: 'amy@heymandiamond.com',
    password: 'Password123!',
    phone: '+1-312-555-0199',
    address: '5 South Wabash Ave, Chicago IL',
    gender: 'female',
    accountType: 'customer',
  })
  const res = createMockRes()

  const origFetch = globalThis.fetch
  let capturedSignupPayload = null
  let capturedProfilePatch = null
  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url)
    if (urlStr.includes('/auth/v1/admin/users')) {
      return { ok: true, status: 200, json: async () => ({ users: [] }) }
    }
    if (urlStr.includes('/auth/v1/signup')) {
      capturedSignupPayload = JSON.parse(options.body || '{}')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: 'amy-user-id',
            email: 'amy@heymandiamond.com',
            user_metadata: capturedSignupPayload.data,
          },
        }),
      }
    }
    if (urlStr.includes('/rest/v1/profiles')) {
      if (options.body) {
        capturedProfilePatch = JSON.parse(options.body)
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ id: 'amy-user-id' }]),
      }
    }
    if (urlStr.includes('/rest/v1/')) {
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify([{ id: 'amy-user-id' }]),
      }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }

  try {
    await handleSignup(req, res)
    assert.equal(res.statusCode, 201)
    assert.equal(capturedSignupPayload?.data?.account_type, 'customer')
    assert.equal(capturedProfilePatch?.account_type, 'customer')
    assert.equal(capturedProfilePatch?.dealer_status, 'not_applied')
    // Verify that Amy is NOT granted admin access
    const AmyCheck = await requireAdmin(createMockReq({ authorization: 'Bearer amy-token' }))
    assert.equal(AmyCheck, null, 'Customer with @heymandiamond.com domain must NOT get admin privileges')
  } finally {
    globalThis.fetch = origFetch
  }
})

// ── Test 2: Signup cannot inject elevated account_type or dealer_status via user_metadata ──
test('Privilege Escalation — Client cannot inject account_type=admin or dealer_status=approved via signup metadata', async () => {
  const req = createMockReq({}, {
    fullName: 'Attacker Bob',
    email: 'attacker@example.com',
    password: 'Password123!',
    phone: '+1-312-555-0100',
    address: '100 Main St',
    gender: 'male',
    accountType: 'admin', // Attack payload
    dealer_status: 'approved', // Attack payload
    role: 'super_admin', // Attack payload
  })
  const res = createMockRes()

  let capturedSignupPayload = null
  let capturedProfilePatch = null
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url)
    if (urlStr.includes('/auth/v1/admin/users')) {
      return { ok: true, status: 200, json: async () => ({ users: [] }) }
    }
    if (urlStr.includes('/auth/v1/signup')) {
      capturedSignupPayload = JSON.parse(options.body || '{}')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: 'attacker-id',
            email: 'attacker@example.com',
            user_metadata: capturedSignupPayload.data,
          },
        }),
      }
    }
    if (urlStr.includes('/rest/v1/profiles')) {
      if (options.body) {
        capturedProfilePatch = JSON.parse(options.body)
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ id: 'attacker-id' }]),
      }
    }
    if (urlStr.includes('/rest/v1/')) {
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify([{ id: 'attacker-id' }]),
      }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }

  try {
    await handleSignup(req, res)
    assert.equal(capturedSignupPayload?.data?.account_type, 'customer', 'Server must sanitize account_type to customer')
    assert.equal(capturedProfilePatch?.account_type, 'customer', 'Database profile account_type must be customer')
    assert.equal(capturedProfilePatch?.dealer_status, 'not_applied', 'Server must never allow dealer_status=approved at signup')
    assert.equal(capturedSignupPayload?.data?.role, undefined, 'role field must not be accepted from client signup')
  } finally {
    globalThis.fetch = origFetch
  }
})

// ── Test 3: Unconfirmed email user present in admin_users is denied admin access ──
test('Privilege Escalation — Unconfirmed email user is strictly denied admin access', async () => {
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const urlStr = String(url)
    if (urlStr.includes('/auth/v1/user')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'unconfirmed-admin-id',
          email: 'admin.unconfirmed@heymandiamond.com',
          email_confirmed_at: null, // UNCONFIRMED!
        }),
      }
    }
    if (urlStr.includes('/rest/v1/admin_users')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{
          user_id: 'unconfirmed-admin-id',
          role: 'admin',
          is_active: true,
        }]),
      }
    }
    return { ok: true, status: 200, text: async () => '[]' }
  }

  try {
    const req = createMockReq({ authorization: 'Bearer unconfirmed-token' })
    const adminCheck = await requireAdmin(req)
    assert.equal(adminCheck, null, 'requireAdmin must return null for unconfirmed user even if present in admin_users')
  } finally {
    globalThis.fetch = origFetch
  }
})

// ── Test 4: Role 'sales_manager' CAN access KYC, but CANNOT access users, inventory upload, promotions, reviews ──
test('Role Isolation — sales_manager permissions boundary', async () => {
  const perms = getDefaultPermissions('sales_manager')
  assert.equal(perms.can_review_kyc, true, 'sales_manager CAN review KYC')
  assert.equal(perms.can_manage_orders, true, 'sales_manager CAN manage orders')
  assert.equal(perms.can_manage_inventory, false, 'sales_manager CANNOT manage inventory')
  assert.equal(perms.can_manage_promotions, false, 'sales_manager CANNOT manage promotions')
  assert.equal(perms.can_manage_reviews, false, 'sales_manager CANNOT manage reviews')
  assert.equal(perms.can_manage_users, false, 'sales_manager CANNOT manage users')

  const salesManager = {
    user: { id: 'sales-1', email: 'sales@heymandiamond.com' },
    role: 'sales_manager',
    isSuperAdmin: false,
    permissions: perms,
  }

  // CANNOT access user management
  const usersRes = createMockRes()
  await handleGetStaffUsers(createMockReq(), usersRes, salesManager)
  assert.equal(usersRes.statusCode, 403, 'sales_manager must NOT access staff users list')
})

// ── Test 5: Role 'operations_manager' CAN access inventory and reviews, but CANNOT access users, promotions, KYC ──
test('Role Isolation — operations_manager permissions boundary', async () => {
  const perms = getDefaultPermissions('operations_manager')
  assert.equal(perms.can_manage_inventory, true, 'operations_manager CAN manage inventory')
  assert.equal(perms.can_manage_reviews, true, 'operations_manager CAN manage reviews')
  assert.equal(perms.can_manage_orders, true, 'operations_manager CAN manage orders')
  assert.equal(perms.can_review_kyc, false, 'operations_manager CANNOT review KYC')
  assert.equal(perms.can_manage_promotions, false, 'operations_manager CANNOT manage promotions')
  assert.equal(perms.can_manage_users, false, 'operations_manager CANNOT manage users')

  const opsManager = {
    user: { id: 'ops-1', email: 'ops@heymandiamond.com' },
    role: 'operations_manager',
    isSuperAdmin: false,
    permissions: perms,
  }

  const usersRes = createMockRes()
  await handleGetStaffUsers(createMockReq(), usersRes, opsManager)
  assert.equal(usersRes.statusCode, 403, 'operations_manager must NOT access staff users list')
})

// ── Test 6: Role 'admin' CAN access normal admin endpoints, but CANNOT access /api/admin/users ──
test('Role Isolation — admin role CANNOT access /api/admin/users', async () => {
  const adminStaff = {
    user: { id: 'admin-1', email: 'admin@heymandiamond.com' },
    role: 'admin',
    isSuperAdmin: false,
    permissions: getDefaultPermissions('admin'),
  }

  const getRes = createMockRes()
  await handleGetStaffUsers(createMockReq(), getRes, adminStaff)
  assert.equal(getRes.statusCode, 403, 'Regular admin must NOT list users')

  const postRes = createMockRes()
  await handleCreateStaffUser(createMockReq({}, { fullName: 'Test', email: 't@example.com' }), postRes, adminStaff)
  assert.equal(postRes.statusCode, 403, 'Regular admin must NOT invite users')

  const patchRes = createMockRes()
  await handleUpdateStaffUser(createMockReq({}, {}), patchRes, adminStaff, 'target-id')
  assert.equal(patchRes.statusCode, 403, 'Regular admin must NOT edit users')

  const deleteRes = createMockRes()
  await handleDeleteStaffUser(createMockReq(), deleteRes, adminStaff, 'target-id')
  assert.equal(deleteRes.statusCode, 403, 'Regular admin must NOT deactivate users')
})

// ── Test 7: Only super_admin can call /api/admin/users ──
test('Role Isolation — super_admin can call /api/admin/users', async () => {
  const superAdmin = {
    user: { id: 'super-1', email: 'super@heymandiamond.com' },
    role: 'super_admin',
    isSuperAdmin: true,
    permissions: getDefaultPermissions('super_admin'),
  }

  const getRes = createMockRes()
  await handleGetStaffUsers(createMockReq(), getRes, superAdmin)
  assert.equal(getRes.statusCode, 200, 'super_admin must be allowed to list users')
  assert.ok(Array.isArray(getRes.json?.users || getRes.json?.staff))
})

// ── Test 8: super_admin cannot demote or deactivate themselves, and cannot create super_admin via API ──
test('Role Protection — super_admin cannot self-demote, self-deactivate, or grant super_admin via API', async () => {
  const superAdmin = {
    user: { id: 'super-primary', email: 'super.primary@heymandiamond.com' },
    role: 'super_admin',
    isSuperAdmin: true,
    permissions: getDefaultPermissions('super_admin'),
  }

  // 1. Cannot self-deactivate
  const selfDeactivateRes = createMockRes()
  await handleDeleteStaffUser(createMockReq(), selfDeactivateRes, superAdmin, 'super-primary')
  assert.equal(selfDeactivateRes.statusCode, 400, 'Self-deactivation must be rejected with 400')
  assert.ok(selfDeactivateRes.json?.error?.includes('own account'))

  // 2. Cannot self-demote
  const selfDemoteRes = createMockRes()
  await handleUpdateStaffUser(createMockReq({}, { role: 'admin' }), selfDemoteRes, superAdmin, 'super-primary')
  assert.equal(selfDemoteRes.statusCode, 400, 'Self-demotion must be rejected with 400')
  assert.ok(selfDemoteRes.json?.error?.includes('own role'))

  // 3. Cannot grant super_admin role via create API
  const createSuperRes = createMockRes()
  await handleCreateStaffUser(createMockReq({}, {
    fullName: 'New Super Admin',
    email: 'newsuper@heymandiamond.com',
    role: 'super_admin',
  }), createSuperRes, superAdmin)
  assert.equal(createSuperRes.statusCode, 400, 'Granting super_admin via API must be rejected with 400')
  assert.ok(createSuperRes.json?.error?.toLowerCase().includes('super'))

  // 4. Cannot elevate someone to super_admin via update API
  const updateToSuperRes = createMockRes()
  await handleUpdateStaffUser(createMockReq({}, { role: 'super_admin' }), updateToSuperRes, superAdmin, 'some-staff-id')
  assert.equal(updateToSuperRes.statusCode, 400, 'Promoting to super_admin via API must be rejected with 400')
  assert.ok(updateToSuperRes.json?.error?.toLowerCase().includes('super'))
})

// ── Test 9: Deactivating an admin user immediately blocks them from admin APIs ──
test('Access Revocation — Deactivated admin row is immediately rejected by requireAdmin', async () => {
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const urlStr = String(url)
    if (urlStr.includes('/auth/v1/user')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'deactivated-admin-id',
          email: 'fired.admin@heymandiamond.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
        }),
      }
    }
    if (urlStr.includes('/rest/v1/admin_users')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{
          user_id: 'deactivated-admin-id',
          role: 'admin',
          is_active: false, // Deactivated!
        }]),
      }
    }
    return { ok: true, status: 200, text: async () => '[]' }
  }

  try {
    const req = createMockReq({ authorization: 'Bearer deactivated-token' })
    const adminCheck = await requireAdmin(req)
    assert.equal(adminCheck, null, 'Deactivated admin must be rejected by requireAdmin')
  } finally {
    globalThis.fetch = origFetch
  }
})

// ── Test 10: Inventory upload rejects unauthenticated and non-admin users ──
test('Route Security — Inventory upload rejects unauthorized access', async () => {
  const res = createMockRes()
  const unauthReq = createMockReq()
  await handleUploadInventory(unauthReq, res, null)
  assert.equal(res.statusCode, 401, 'Unauthenticated upload must be rejected with 401')
})
