import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://mock-supabase.test'
process.env.SUPABASE_ANON_KEY = 'mock_anon_key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_key'

import {
  handleSignup,
  handleGetProfile,
} from '../server/services/auth.mjs'

import {
  handleGetDealerApplications,
  handleUpdateDealerApplication,
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

const authorizedKycAdmin = {
  user: { id: '00000000-0000-0000-0000-000000000001', email: 'admin@heymandiamond.com' },
  permissions: { can_review_kyc: true },
}

const unauthorizedKycStaff = {
  user: { id: '00000000-0000-0000-0000-000000000002', email: 'sales@heymandiamond.com' },
  permissions: { can_review_kyc: false },
}

test('Dealer Workflow — Signup requires company name for wholesale dealers', async () => {
  const reqWithoutCompany = createMockReq({}, {
    accountType: 'dealer',
    fullName: 'Jane Dealer',
    companyName: '', // Missing company name
    email: 'jane@dealerjewelers.com',
    phone: '212-555-0100',
    address: '123 Diamond Way, New York, NY',
    gender: 'female',
    password: 'Password123!',
  })
  const res1 = createMockRes()
  await handleSignup(reqWithoutCompany, res1)
  assert.strictEqual(res1.statusCode, 400)
  assert.match(res1.json.error, /complete all required fields/i)
})

test('Dealer Workflow — Valid dealer signup creates application and sets pending_review', async () => {
  const origFetch = globalThis.fetch
  let capturedSignupBody = null
  let capturedProfilePatch = null
  let capturedDealerApp = null

  const targetUserId = '11111111-1111-1111-1111-111111111111'

  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url)
    if (urlStr.includes('/auth/v1/admin/users')) {
      return { ok: true, status: 200, json: async () => ({ users: [] }) }
    }
    if (urlStr.includes('/auth/v1/signup')) {
      capturedSignupBody = JSON.parse(options.body || '{}')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: targetUserId,
            email: 'wholesale@prestigejewels.com',
            user_metadata: capturedSignupBody.data,
          },
          session: null,
        }),
      }
    }
    if (urlStr.includes('/rest/v1/profiles')) {
      if (options.body) capturedProfilePatch = JSON.parse(options.body)
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: targetUserId }]) }
    }
    if (urlStr.includes('/rest/v1/dealer_applications')) {
      if (options.body) capturedDealerApp = JSON.parse(options.body)
      return { ok: true, status: 201, text: async () => JSON.stringify([{ id: '22222222-2222-2222-2222-222222222222' }]) }
    }
    return { ok: true, status: 200, text: async () => JSON.stringify([]) }
  }

  try {
    const req = createMockReq({}, {
      accountType: 'dealer',
      fullName: 'David Sterling',
      companyName: 'Sterling Diamond Co.',
      email: 'wholesale@prestigejewels.com',
      phone: '212-555-0199',
      address: '580 5th Avenue, Suite 400, New York, NY 10036',
      gender: 'male',
      password: 'StrongPassword123!',
    })
    const res = createMockRes()
    await handleSignup(req, res)

    assert.strictEqual(res.statusCode, 201)
    assert.strictEqual(res.json.submitted, true)
    assert.strictEqual(res.json.accountType, 'dealer')

    // Profile must be initialized as dealer with pending_review status
    assert.strictEqual(capturedProfilePatch?.account_type, 'dealer')
    assert.strictEqual(capturedProfilePatch?.dealer_status, 'pending_review')

    // Dealer application record must be posted with full company details
    assert.ok(capturedDealerApp, 'Dealer application must be created')
    assert.strictEqual(capturedDealerApp.registered_business_name, 'Sterling Diamond Co.')
    assert.strictEqual(capturedDealerApp.primary_contact, 'David Sterling')
    assert.strictEqual(capturedDealerApp.primary_email, 'wholesale@prestigejewels.com')
    assert.strictEqual(capturedDealerApp.business_phone, '212-555-0199')
    assert.strictEqual(capturedDealerApp.status, 'pending_review')
  } finally {
    globalThis.fetch = origFetch
  }
})

test('Dealer Workflow — Admin queue access control and listing', async () => {
  // 1. Unauthenticated request rejected
  const unauthRes = createMockRes()
  await handleGetDealerApplications(createMockReq(), unauthRes, null)
  assert.strictEqual(unauthRes.statusCode, 403)

  // 2. Staff without can_review_kyc rejected
  const staffRes = createMockRes()
  await handleGetDealerApplications(createMockReq(), staffRes, unauthorizedKycStaff)
  assert.strictEqual(staffRes.statusCode, 403)

  // 3. Authorized admin can list applications
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const urlStr = String(url)
    if (urlStr.includes('/rest/v1/dealer_applications')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([
          {
            id: 'app-uuid-101',
            user_id: 'user-uuid-101',
            status: 'pending_review',
            registered_business_name: 'Sterling Diamond Co.',
            primary_contact: 'David Sterling',
            primary_email: 'wholesale@prestigejewels.com',
            business_phone: '212-555-0199',
            business_address: { address: '580 5th Ave, NY' },
            submitted_at: '2026-11-10T12:00:00Z',
          },
        ]),
      }
    }
    return { ok: true, status: 200, text: async () => JSON.stringify([]) }
  }

  try {
    const authRes = createMockRes()
    await handleGetDealerApplications(createMockReq(), authRes, authorizedKycAdmin)
    assert.strictEqual(authRes.statusCode, 200)
    assert.strictEqual(authRes.json.items.length, 1)
    const app = authRes.json.items[0]
    assert.strictEqual(app.registered_business_name, 'Sterling Diamond Co.')
    assert.strictEqual(app.business_phone, '212-555-0199')
    assert.strictEqual(app.status, 'pending_review')
  } finally {
    globalThis.fetch = origFetch
  }
})

test('Dealer Workflow — Admin approval updates application, profile status, and audit log', async () => {
  const origFetch = globalThis.fetch
  let patchedAppBody = null
  let patchedProfileBody = null
  let postedAuditLog = null

  const appId = '33333333-3333-3333-3333-333333333333'
  const applicantUserId = '44444444-4444-4444-4444-444444444444'

  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url)
    // 1. Fetch current application
    if (urlStr.includes(`/rest/v1/dealer_applications?id=eq.${appId}`)) {
      if (options.method === 'PATCH') {
        patchedAppBody = JSON.parse(options.body || '{}')
        return { ok: true, status: 200, text: async () => JSON.stringify([{}]) }
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ id: appId, user_id: applicantUserId, status: 'pending_review' }]),
      }
    }
    // 2. Patch user profile
    if (urlStr.includes(`/rest/v1/profiles?id=eq.${applicantUserId}`)) {
      patchedProfileBody = JSON.parse(options.body || '{}')
      return { ok: true, status: 200, text: async () => JSON.stringify([{}]) }
    }
    // 3. Post audit log
    if (urlStr.includes('/rest/v1/audit_log')) {
      postedAuditLog = JSON.parse(options.body || '{}')
      return { ok: true, status: 201, text: async () => JSON.stringify([{}]) }
    }
    return { ok: true, status: 200, text: async () => JSON.stringify([]) }
  }

  try {
    // 1. Validate invalid status rejection
    const invalidStatusRes = createMockRes()
    await handleUpdateDealerApplication(
      createMockReq({}, { status: 'unauthorized_super_status' }),
      invalidStatusRes,
      authorizedKycAdmin,
      appId
    )
    assert.strictEqual(invalidStatusRes.statusCode, 400)

    // 2. Approve dealer application
    const approveRes = createMockRes()
    await handleUpdateDealerApplication(
      createMockReq({}, { status: 'approved' }),
      approveRes,
      authorizedKycAdmin,
      appId
    )
    assert.strictEqual(approveRes.statusCode, 200)
    assert.strictEqual(approveRes.json.updated, true)
    assert.strictEqual(approveRes.json.status, 'approved')

    // Verify application status and reviewer user ID
    assert.strictEqual(patchedAppBody?.status, 'approved')
    assert.strictEqual(patchedAppBody?.reviewer_user_id, authorizedKycAdmin.user.id)
    assert.ok(patchedAppBody?.reviewed_at)

    // Verify profile dealer_status and account_type updated
    assert.strictEqual(patchedProfileBody?.dealer_status, 'approved')
    assert.strictEqual(patchedProfileBody?.account_type, 'dealer')

    // Verify audit log
    assert.strictEqual(postedAuditLog?.action, 'dealer_application_status_changed')
    assert.strictEqual(postedAuditLog?.actor_user_id, authorizedKycAdmin.user.id)
    assert.strictEqual(postedAuditLog?.entity_id, appId)
    assert.strictEqual(postedAuditLog?.metadata?.status, 'approved')
  } finally {
    globalThis.fetch = origFetch
  }
})

test('Dealer Workflow — Rejected and Reset states handle cleanly', async () => {
  const origFetch = globalThis.fetch
  let patchedAppBody = null
  let patchedProfileBody = null

  const appId = '55555555-5555-5555-5555-555555555555'
  const applicantUserId = '66666666-6666-6666-6666-666666666666'

  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url)
    if (urlStr.includes(`/rest/v1/dealer_applications?id=eq.${appId}`)) {
      if (options.method === 'PATCH') {
        patchedAppBody = JSON.parse(options.body || '{}')
        return { ok: true, status: 200, text: async () => JSON.stringify([{}]) }
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ id: appId, user_id: applicantUserId, status: 'approved' }]),
      }
    }
    if (urlStr.includes(`/rest/v1/profiles?id=eq.${applicantUserId}`)) {
      patchedProfileBody = JSON.parse(options.body || '{}')
      return { ok: true, status: 200, text: async () => JSON.stringify([{}]) }
    }
    if (urlStr.includes('/rest/v1/audit_log')) {
      return { ok: true, status: 201, text: async () => JSON.stringify([{}]) }
    }
    return { ok: true, status: 200, text: async () => JSON.stringify([]) }
  }

  try {
    const rejectRes = createMockRes()
    await handleUpdateDealerApplication(
      createMockReq({}, { status: 'rejected' }),
      rejectRes,
      authorizedKycAdmin,
      appId
    )
    assert.strictEqual(rejectRes.statusCode, 200)
    assert.strictEqual(patchedAppBody?.status, 'rejected')
    assert.strictEqual(patchedProfileBody?.dealer_status, 'rejected')

    // Resetting back to pending_review
    const resetRes = createMockRes()
    await handleUpdateDealerApplication(
      createMockReq({}, { status: 'pending_review' }),
      resetRes,
      authorizedKycAdmin,
      appId
    )
    assert.strictEqual(resetRes.statusCode, 200)
    assert.strictEqual(patchedAppBody?.status, 'pending_review')
    assert.strictEqual(patchedProfileBody?.dealer_status, 'pending_review')
  } finally {
    globalThis.fetch = origFetch
  }
})
