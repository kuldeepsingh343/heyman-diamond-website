#!/usr/bin/env node

/**
 * Heyman Diamond LLC — Live Customer & Dealer Authentication Validation Suite
 *
 * Operational Live Verification Tool (Iteration 2 Architecture)
 *
 * Requirements Verified:
 *  1. Live API Health Check (GET /api/health)
 *  2. Synthetic Customer Registration Flow (POST /api/auth/signup - accountType: 'customer')
 *  3. Synthetic Dealer Registration Flow (POST /api/auth/signup - accountType: 'dealer', companyName)
 *  4. Live PostgREST & GoTrue Role/Permissions Verification
 *     - public.profiles (account_type, dealer_status, full_name, phone)
 *     - public.dealer_applications (status, registered_business_name, primary_contact, primary_email)
 *  5. Live Rate-Limit Resistance Test (multiple sequential confirmation resends, asserting >3 resends without HTTP 429)
 *  6. Live Sign-In & Authentication Verification
 *     - Pre-confirmation login rejection check (HTTP 400)
 *     - Programmatic GoTrue email confirmation
 *     - Confirmed customer sign-in (accessToken issuance, profile role matching)
 *     - Dealer admin approval & approved dealer sign-in
 *  7. Zero-Pollution Teardown Routine
 *     - Strict ON DELETE RESTRICT adherence (dealer_applications -> quote_requests -> auth.users)
 *     - Post-teardown verification of 0 residual records in profiles, dealer_applications, and auth.users
 */

import { strict as assert } from 'node:assert'

// ── Environment & Prerequisite Checks ──────────────────────────────────────────
const TARGET_URL = (process.env.LIVE_SITE_URL || process.env.APP_URL || process.env.TARGET_URL || 'https://hey-man-diamond-test.onrender.com').replace(/\/$/, '')
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qdjqdbuozbgghasmeksw.supabase.co').replace(/\/$/, '')
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Critical safety check: production domain is strictly off-limits for live testing
if (/heymandiamond(llc)?\.com/i.test(TARGET_URL)) {
  console.error('\n❌ SAFETY CHECK FAILED:')
  console.error(`TARGET_URL (${TARGET_URL}) targets production domain, which is strictly prohibited.`)
  console.error('Validation must target the test deployment (https://hey-man-diamond-test.onrender.com) or local server.\n')
  process.exit(1)
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌ FATAL CONFIGURATION ERROR:')
  console.error('SUPABASE_SERVICE_ROLE_KEY is required to run live authentication validation.')
  console.error('This operational tool verifies PostgREST RBAC rows and executes zero-pollution teardown.')
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=your-service-role-key node scripts/validate_live_auth.mjs\n')
  process.exit(1)
}

const timestamp = Date.now()
const runId = Math.random().toString(36).substring(2, 8)

const customerPayload = {
  accountType: 'customer',
  fullName: `[QA Live] Synthetic Customer ${runId}`,
  address: '123 Fifth Avenue, Suite 500, New York, NY 10001',
  phone: '+1 555-010-0001',
  gender: 'prefer_not_to_say',
  email: `synthetic_qa_cust_${timestamp}_${runId}@heymandiamond-qa.test`,
  password: 'QaLivePass2026!Cust',
  companyName: '',
}

const dealerPayload = {
  accountType: 'dealer',
  fullName: `[QA Live] Synthetic Dealer ${runId}`,
  companyName: `QA Wholesale Gemological Corp ${runId}`,
  address: '456 Diamond Street, Floor 17, Chicago, IL 60603',
  phone: '+1 555-010-0002',
  gender: 'prefer_not_to_say',
  email: `synthetic_qa_dealer_${timestamp}_${runId}@heymandiamond-qa.test`,
  password: 'QaLivePass2026!Deal',
}

// Track IDs of users created during execution to guarantee zero-pollution teardown
const createdUsers = new Map() // email -> { id, accountType }

function log(phase, message, status = 'INFO') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'WARN' ? '⚠️' : 'ℹ️'
  console.log(`${icon} [${new Date().toISOString()}] [${phase}] ${message}`)
}

async function runStep(name, fn) {
  console.log(`\n─── STEP: ${name} ──────────────────────────────────`)
  try {
    const result = await fn()
    log(name, 'Completed successfully', 'PASS')
    return { ok: true, result }
  } catch (err) {
    log(name, `Failed: ${err.message}`, 'FAIL')
    return { ok: false, error: err }
  }
}

// ── STEP 1: Live API Health Check ─────────────────────────────────────────────
async function stepHealthCheck() {
  log('HealthCheck', `Probing live health endpoint at ${TARGET_URL}/api/health ...`)
  const res = await fetch(`${TARGET_URL}/api/health`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(res.status, 200, `Health endpoint returned unexpected status HTTP ${res.status}`)
  const contentType = res.headers.get('content-type') || ''
  assert.ok(contentType.includes('application/json'), `Expected JSON content-type but received '${contentType}'`)

  const body = await res.json()
  assert.equal(body.status, 'ok', `Expected health body status 'ok', received: ${JSON.stringify(body)}`)
  assert.equal(body.databaseConfigured, true, 'Health check reported databaseConfigured: false')
  log('HealthCheck', `Target healthy. Database configured: ${body.databaseConfigured}`, 'PASS')
  return body
}

// ── STEP 2: Synthetic Customer Registration ───────────────────────────────────
async function stepCustomerSignup() {
  log('CustomerSignup', `Registering synthetic customer: ${customerPayload.email}`)
  const res = await fetch(`${TARGET_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(customerPayload),
    signal: AbortSignal.timeout(20000),
  })
  const body = await res.json().catch(() => ({}))
  assert.equal(res.status, 201, `Customer signup failed with HTTP ${res.status}: ${JSON.stringify(body)}`)
  assert.equal(body.submitted, true, `Expected submitted: true, got ${JSON.stringify(body)}`)
  assert.equal(body.accountType, 'customer', `Expected accountType 'customer', got '${body.accountType}'`)
  assert.equal(body.emailConfirmationRequired, true, 'Expected emailConfirmationRequired to be true')
  log('CustomerSignup', `Customer registered. Confirmation required: ${body.emailConfirmationRequired}`, 'PASS')
  return body
}

// ── STEP 3: Synthetic Dealer Registration ─────────────────────────────────────
async function stepDealerSignup() {
  log('DealerSignup', `Registering synthetic dealer: ${dealerPayload.email} (${dealerPayload.companyName})`)
  const res = await fetch(`${TARGET_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(dealerPayload),
    signal: AbortSignal.timeout(20000),
  })
  const body = await res.json().catch(() => ({}))
  assert.equal(res.status, 201, `Dealer signup failed with HTTP ${res.status}: ${JSON.stringify(body)}`)
  assert.equal(body.submitted, true, `Expected submitted: true, got ${JSON.stringify(body)}`)
  assert.equal(body.accountType, 'dealer', `Expected accountType 'dealer', got '${body.accountType}'`)
  assert.equal(body.emailConfirmationRequired, true, 'Expected emailConfirmationRequired to be true')
  log('DealerSignup', `Dealer registered. Message: "${body.message}"`, 'PASS')
  return body
}

// ── STEP 4: Live Role & Schema Verification via PostgREST / GoTrue ────────────
async function stepRoleVerification() {
  log('RoleVerification', 'Querying GoTrue and PostgREST with Service Role Key...')
  const authHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: 'application/json',
  }

  // 1. Locate auth users in GoTrue
  const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(15000),
  })
  assert.ok(usersRes.ok, `Failed to query auth.users: HTTP ${usersRes.status}`)
  const usersData = await usersRes.json()
  const users = usersData.users || []

  const custUser = users.find(u => u.email === customerPayload.email)
  assert.ok(custUser, `Synthetic customer auth user ${customerPayload.email} was not found in GoTrue admin/users`)
  createdUsers.set(customerPayload.email, { id: custUser.id, accountType: 'customer' })
  log('RoleVerification', `Found customer auth user UUID: ${custUser.id}`, 'PASS')

  const dealUser = users.find(u => u.email === dealerPayload.email)
  assert.ok(dealUser, `Synthetic dealer auth user ${dealerPayload.email} was not found in GoTrue admin/users`)
  createdUsers.set(dealerPayload.email, { id: dealUser.id, accountType: 'dealer' })
  log('RoleVerification', `Found dealer auth user UUID: ${dealUser.id}`, 'PASS')

  // 2. Query public.profiles for Customer
  const custProfRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${custUser.id}&select=*`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(custProfRes.status, 200, `Query public.profiles for customer failed: HTTP ${custProfRes.status}`)
  const custProfiles = await custProfRes.json()
  assert.equal(custProfiles.length, 1, `Expected exactly 1 profile row for customer, got ${custProfiles.length}`)
  const custProf = custProfiles[0]
  assert.equal(custProf.account_type, 'customer', `Expected account_type 'customer', got '${custProf.account_type}'`)
  assert.equal(custProf.dealer_status, 'not_applied', `Expected dealer_status 'not_applied', got '${custProf.dealer_status}'`)
  assert.equal(custProf.full_name, customerPayload.fullName, `Profile full_name mismatch: '${custProf.full_name}'`)
  assert.equal(custProf.phone, customerPayload.phone, `Profile phone mismatch: '${custProf.phone}'`)
  log('RoleVerification', `Customer profile verified: account_type='${custProf.account_type}', dealer_status='${custProf.dealer_status}'`, 'PASS')

  // 3. Query public.profiles for Dealer
  const dealProfRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${dealUser.id}&select=*`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(dealProfRes.status, 200, `Query public.profiles for dealer failed: HTTP ${dealProfRes.status}`)
  const dealProfiles = await dealProfRes.json()
  assert.equal(dealProfiles.length, 1, `Expected exactly 1 profile row for dealer, got ${dealProfiles.length}`)
  const dealProf = dealProfiles[0]
  assert.equal(dealProf.account_type, 'dealer', `Expected account_type 'dealer', got '${dealProf.account_type}'`)
  assert.equal(dealProf.dealer_status, 'pending_review', `Expected dealer_status 'pending_review', got '${dealProf.dealer_status}'`)
  assert.equal(dealProf.full_name, dealerPayload.fullName, `Profile full_name mismatch: '${dealProf.full_name}'`)
  assert.equal(dealProf.phone, dealerPayload.phone, `Profile phone mismatch: '${dealProf.phone}'`)
  log('RoleVerification', `Dealer profile verified: account_type='${dealProf.account_type}', dealer_status='${dealProf.dealer_status}'`, 'PASS')

  // 4. Query public.dealer_applications for Dealer
  const dealAppRes = await fetch(`${SUPABASE_URL}/rest/v1/dealer_applications?user_id=eq.${dealUser.id}&select=*`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(dealAppRes.status, 200, `Query dealer_applications failed: HTTP ${dealAppRes.status}`)
  const dealApps = await dealAppRes.json()
  assert.equal(dealApps.length, 1, `Expected exactly 1 dealer application row, got ${dealApps.length}`)
  const dealApp = dealApps[0]
  assert.equal(dealApp.status, 'pending_review', `Expected application status 'pending_review', got '${dealApp.status}'`)
  assert.equal(dealApp.registered_business_name, dealerPayload.companyName, `Business name mismatch: '${dealApp.registered_business_name}'`)
  assert.equal(dealApp.primary_contact, dealerPayload.fullName, `Primary contact mismatch: '${dealApp.primary_contact}'`)
  assert.equal(dealApp.primary_email, dealerPayload.email, `Primary email mismatch: '${dealApp.primary_email}'`)
  log('RoleVerification', `Dealer application verified: status='${dealApp.status}', company='${dealApp.registered_business_name}'`, 'PASS')

  return { customerId: custUser.id, dealerId: dealUser.id, dealerAppId: dealApp.id }
}

// ── STEP 5: Live Rate-Limit Resistance Test (Mailjet Custom SMTP) ─────────────
async function stepRateLimitTest() {
  log('RateLimitTest', 'Testing confirmation resend resilience (testing beyond default 3-emails/hour restriction)...')
  const attempts = 4
  let successCount = 0
  let rateLimitCount = 0
  const responses = []

  for (let i = 1; i <= attempts; i++) {
    log('RateLimitTest', `Sending confirmation resend attempt ${i}/${attempts} for ${customerPayload.email}...`)
    const res = await fetch(`${TARGET_URL}/api/auth/resend-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: customerPayload.email }),
      signal: AbortSignal.timeout(15000),
    })
    const body = await res.json().catch(() => ({}))
    responses.push({ attempt: i, status: res.status, body })

    if (res.status === 200 && body.sent) {
      successCount++
      log('RateLimitTest', `Attempt ${i}: Accepted by server (HTTP 200, sent: true)`)
    } else if (res.status === 429) {
      rateLimitCount++
      log('RateLimitTest', `Attempt ${i}: Rate limited (HTTP 429: ${body.error || 'rate limit'})`, 'WARN')
    } else {
      log('RateLimitTest', `Attempt ${i}: Unexpected response HTTP ${res.status}: ${JSON.stringify(body)}`, 'WARN')
    }

    if (i < attempts) {
      await new Promise(r => setTimeout(r, 600))
    }
  }

  // Strict Assertions for rate limit removal:
  assert.equal(rateLimitCount, 0, `Custom SMTP rate limit violation! Received HTTP 429 on ${rateLimitCount} attempt(s). Responses: ${JSON.stringify(responses)}`)
  assert.ok(successCount >= 4, `Expected at least 4 successful confirmation resends (proving >3 limit lifted), but only ${successCount} succeeded.`)

  log('RateLimitTest', `Rate-limit resilience verified: ${successCount}/${attempts} accepted, 0 rate-limit (429) errors.`, 'PASS')
  return { attempts, successCount, rateLimitCount }
}

// ── STEP 6: Live Sign-In & Authentication Flow Validation ─────────────────────
async function stepSignInValidation(context) {
  log('SignInValidation', 'Testing live sign-in flows and authentication gating...')
  const authHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
  const custId = context.customerId || createdUsers.get(customerPayload.email)?.id
  const dealId = context.dealerId || createdUsers.get(dealerPayload.email)?.id

  assert.ok(custId, 'Missing customer UUID for sign-in validation')
  assert.ok(dealId, 'Missing dealer UUID for sign-in validation')

  // 1. Verify unconfirmed user cannot sign in
  log('SignInValidation', 'Testing pre-confirmation login rejection...')
  const preConfirmRes = await fetch(`${TARGET_URL}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: customerPayload.email, password: customerPayload.password }),
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(preConfirmRes.status, 400, `Expected HTTP 400 for unconfirmed user login, got HTTP ${preConfirmRes.status}`)
  log('SignInValidation', 'Pre-confirmation login correctly rejected with HTTP 400', 'PASS')

  // 2. Programmatically confirm customer email via GoTrue Admin API
  log('SignInValidation', `Confirming customer email for user ${custId} via GoTrue Admin API...`)
  const confirmCustRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${custId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ email_confirm: true }),
    signal: AbortSignal.timeout(15000),
  })
  assert.ok(confirmCustRes.ok, `Failed to confirm customer email: HTTP ${confirmCustRes.status}`)
  log('SignInValidation', 'Customer email confirmed successfully', 'PASS')

  // 3. Authenticate confirmed customer
  log('SignInValidation', 'Signing in confirmed customer...')
  const custLoginRes = await fetch(`${TARGET_URL}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: customerPayload.email, password: customerPayload.password }),
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(custLoginRes.status, 200, `Customer signin failed: HTTP ${custLoginRes.status}`)
  const custLoginData = await custLoginRes.json()
  assert.ok(typeof custLoginData.accessToken === 'string' && custLoginData.accessToken.length > 20, 'Missing or invalid accessToken')
  assert.ok(typeof custLoginData.refreshToken === 'string', 'Missing refreshToken')
  assert.equal(custLoginData.user?.email, customerPayload.email, 'Customer email in session mismatch')
  assert.equal(custLoginData.user?.account_type, 'customer', `Expected account_type 'customer', got '${custLoginData.user?.account_type}'`)
  assert.equal(custLoginData.user?.dealer_status, 'not_applied', `Expected dealer_status 'not_applied', got '${custLoginData.user?.dealer_status}'`)
  log('SignInValidation', 'Confirmed customer signed in successfully with valid session and profile roles', 'PASS')

  // 4. Simulate KYC Admin Approval and confirm dealer email
  log('SignInValidation', `Simulating KYC admin approval and confirming dealer ${dealId}...`)
  const approveAppRes = await fetch(`${SUPABASE_URL}/rest/v1/dealer_applications?user_id=eq.${dealId}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ status: 'approved' }),
    signal: AbortSignal.timeout(15000),
  })
  assert.ok(approveAppRes.ok, `Failed to approve dealer application: HTTP ${approveAppRes.status}`)

  const approveProfRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${dealId}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ dealer_status: 'approved' }),
    signal: AbortSignal.timeout(15000),
  })
  assert.ok(approveProfRes.ok, `Failed to approve dealer profile: HTTP ${approveProfRes.status}`)

  const confirmDealRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${dealId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ email_confirm: true }),
    signal: AbortSignal.timeout(15000),
  })
  assert.ok(confirmDealRes.ok, `Failed to confirm dealer email: HTTP ${confirmDealRes.status}`)
  log('SignInValidation', 'Dealer approved and email confirmed', 'PASS')

  // 5. Authenticate approved dealer
  log('SignInValidation', 'Signing in approved dealer...')
  const dealLoginRes = await fetch(`${TARGET_URL}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: dealerPayload.email, password: dealerPayload.password }),
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(dealLoginRes.status, 200, `Dealer signin failed: HTTP ${dealLoginRes.status}`)
  const dealLoginData = await dealLoginRes.json()
  assert.ok(typeof dealLoginData.accessToken === 'string' && dealLoginData.accessToken.length > 20, 'Missing dealer accessToken')
  assert.equal(dealLoginData.user?.account_type, 'dealer', `Expected account_type 'dealer', got '${dealLoginData.user?.account_type}'`)
  assert.equal(dealLoginData.user?.dealer_status, 'approved', `Expected dealer_status 'approved', got '${dealLoginData.user?.dealer_status}'`)
  log('SignInValidation', 'Approved dealer signed in successfully with elevated dealer status', 'PASS')

  return { customerLogin: true, dealerLogin: true }
}

// ── STEP 7: Zero-Pollution Teardown Routine ────────────────────────────────────
async function stepTeardown() {
  log('Teardown', 'Initiating zero-pollution cleanup of synthetic test accounts...')
  const authHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  }

  // Fallback: If createdUsers map was empty (e.g. failure before step 4), query GoTrue for our test emails
  if (createdUsers.size === 0) {
    const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: authHeaders })
    if (listRes.ok) {
      const data = await listRes.json()
      for (const user of data.users || []) {
        if (user.email === customerPayload.email || user.email === dealerPayload.email) {
          createdUsers.set(user.email, { id: user.id })
        }
      }
    }
  }

  const uids = Array.from(createdUsers.values()).map(u => u.id)
  log('Teardown', `Purging ${uids.length} test user(s) with ON DELETE RESTRICT cascade ordering...`)

  let cleanedUsersCount = 0
  for (const uid of uids) {
    // 1. Delete child records in dealer_applications (enforcing ON DELETE RESTRICT)
    const delAppRes = await fetch(`${SUPABASE_URL}/rest/v1/dealer_applications?user_id=eq.${uid}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    assert.ok(delAppRes.ok, `Failed to delete child rows in dealer_applications for user ${uid}`)

    // 2. Delete child records in quote_requests
    const delQuoteRes = await fetch(`${SUPABASE_URL}/rest/v1/quote_requests?user_id=eq.${uid}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    assert.ok(delQuoteRes.ok, `Failed to delete child rows in quote_requests for user ${uid}`)

    // 3. Delete parent auth user (Postgres cascades to public.profiles)
    const delUserRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    assert.ok(delUserRes.ok, `Failed to delete auth user ${uid}: HTTP ${delUserRes.status}`)
    cleanedUsersCount++
    log('Teardown', `Successfully purged user ${uid} and associated records`, 'PASS')
  }

  // 4. Strict Verification of Zero Residual Records
  log('Teardown', 'Verifying zero residual test records in database...')
  if (uids.length > 0) {
    const uidList = uids.join(',')

    // Check profiles
    const profCheck = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=in.(${uidList})&select=id`, { headers: authHeaders })
    const profRows = profCheck.ok ? await profCheck.json() : []
    assert.equal(profRows.length, 0, `Lingering records in public.profiles: ${JSON.stringify(profRows)}`)

    // Check dealer_applications
    const appCheck = await fetch(`${SUPABASE_URL}/rest/v1/dealer_applications?user_id=in.(${uidList})&select=id`, { headers: authHeaders })
    const appRows = appCheck.ok ? await appCheck.json() : []
    assert.equal(appRows.length, 0, `Lingering records in public.dealer_applications: ${JSON.stringify(appRows)}`)

    // Check auth.users
    const userCheck = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: authHeaders })
    const userData = userCheck.ok ? await userCheck.json() : { users: [] }
    const lingeringAuth = (userData.users || []).filter(u => uids.includes(u.id))
    assert.equal(lingeringAuth.length, 0, `Lingering records in auth.users: ${JSON.stringify(lingeringAuth)}`)
  }

  log('Teardown', `Zero-pollution teardown verified. All ${cleanedUsersCount} synthetic test account(s) purged cleanly.`, 'PASS')
  return { cleanedCount: cleanedUsersCount, residualRecords: 0 }
}

// ── Main Orchestration ────────────────────────────────────────────────────────
async function main() {
  console.log('=================================================================')
  console.log(' HEYMAN DIAMOND LLC — LIVE AUTHENTICATION VALIDATION PROTOCOL')
  console.log('=================================================================')
  console.log(`Target URL:     ${TARGET_URL}`)
  console.log(`Supabase URL:   ${SUPABASE_URL}`)
  console.log(`Service Key:    ${SUPABASE_SERVICE_ROLE_KEY ? '[CONFIGURED ✅]' : '[MISSING ❌]'}`)
  console.log(`Run Timestamp:  ${new Date().toISOString()}`)
  console.log(`Run ID:         ${runId}`)
  console.log('=================================================================\n')

  const summary = {
    healthCheck: false,
    customerSignup: false,
    dealerSignup: false,
    roleVerification: false,
    rateLimitTest: false,
    signInValidation: false,
    teardown: false,
  }

  let roleContext = {}

  try {
    const s1 = await runStep('1. Live API Health Check', stepHealthCheck)
    summary.healthCheck = s1.ok
    if (!s1.ok) throw s1.error

    const s2 = await runStep('2. Synthetic Customer Registration Flow', stepCustomerSignup)
    summary.customerSignup = s2.ok
    if (!s2.ok) throw s2.error

    const s3 = await runStep('3. Synthetic Dealer Registration Flow', stepDealerSignup)
    summary.dealerSignup = s3.ok
    if (!s3.ok) throw s3.error

    const s4 = await runStep('4. PostgREST Role & Application Verification', stepRoleVerification)
    summary.roleVerification = s4.ok
    if (!s4.ok) throw s4.error
    roleContext = s4.result

    const s5 = await runStep('5. Mailjet Rate-Limit Resistance Test', stepRateLimitTest)
    summary.rateLimitTest = s5.ok
    if (!s5.ok) throw s5.error

    const s6 = await runStep('6. Live Sign-In & Authentication Validation', () => stepSignInValidation(roleContext))
    summary.signInValidation = s6.ok
    if (!s6.ok) throw s6.error
  } finally {
    const s7 = await runStep('7. Zero-Pollution Teardown Routine', stepTeardown)
    summary.teardown = s7.ok
  }

  console.log('\n=================================================================')
  console.log(' VALIDATION RESULTS SUMMARY')
  console.log('=================================================================')
  console.log(`1. API Health Check:               ${summary.healthCheck ? 'PASSED ✅' : 'FAILED ❌'}`)
  console.log(`2. Customer Registration Flow:     ${summary.customerSignup ? 'PASSED ✅' : 'FAILED ❌'}`)
  console.log(`3. Dealer Registration Flow:       ${summary.dealerSignup ? 'PASSED ✅' : 'FAILED ❌'}`)
  console.log(`4. Role & Schema Verification:     ${summary.roleVerification ? 'PASSED ✅' : 'FAILED ❌'}`)
  console.log(`5. Rate-Limit Resistance Test:     ${summary.rateLimitTest ? 'PASSED ✅' : 'FAILED ❌'}`)
  console.log(`6. Live Sign-In Validation:        ${summary.signInValidation ? 'PASSED ✅' : 'FAILED ❌'}`)
  console.log(`7. Zero-Pollution Teardown:        ${summary.teardown ? 'PASSED ✅' : 'FAILED ❌'}`)
  console.log('=================================================================\n')

  const allPassed = Object.values(summary).every(Boolean)
  if (!allPassed) {
    process.exitCode = 1
  }
}

main().catch(err => {
  console.error('\nFatal execution error in validation suite:', err)
  process.exit(1)
})
