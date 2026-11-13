import {
  getSupabaseUrl,
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  supabaseReady,
  db,
  json,
  bodyJson,
  getAuthRedirectUrl,
  getClientIp,
} from './shared.mjs'
import { getMemoryStaffUser, memoryStaffUsers } from './admin.mjs'

export async function findAuthUserByEmail(email) {
  if (!supabaseReady()) throw new Error('Database API is not configured')
  const response = await fetch(`${getSupabaseUrl()}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: getSupabaseServiceRoleKey(), Authorization: `Bearer ${getSupabaseServiceRoleKey()}` },
  })
  if (!response.ok) throw new Error(`Unable to check account status (${response.status})`)
  const data = await response.json()
  return (data.users || []).find(user => String(user.email || '').toLowerCase() === email) || null
}

export async function authenticatedUser(req) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null

  if (getSupabaseUrl() && getSupabaseAnonKey()) {
    try {
      const response = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
        headers: { apikey: getSupabaseAnonKey(), Authorization: `Bearer ${token}` },
      })
      if (response.ok) return await response.json()
    } catch (err) {
      console.warn('Authentication token verification network error:', err.message)
    }
  }

  // Cryptographic signature verification is strictly required. Unverified JWTs are rejected.
  return null
}

// ── Rate Limiting & Brute Force Defense ─────────────────────────────────────
const loginAttempts = new Map()
const signupAttempts = new Map()
const passwordResetAttempts = new Map()
const resendAttempts = new Map()

const MAX_LOGIN_ATTEMPTS = 5
const MAX_SIGNUP_ATTEMPTS = 10
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes lockout
const WINDOW_DURATION_MS = 15 * 60 * 1000

function checkRateLimit(store, key, maxAttempts, lockMs) {
  const now = Date.now()
  const record = store.get(key)
  if (!record) return { allowed: true }

  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingSec = Math.ceil((record.lockedUntil - now) / 1000)
    return {
      allowed: false,
      retryAfter: remainingSec,
      error: `Too many attempts. Access is temporarily locked. Please try again in ${Math.ceil(remainingSec / 60)} minutes.`,
    }
  }

  if (now - record.firstAttempt > WINDOW_DURATION_MS) {
    store.delete(key)
    return { allowed: true }
  }

  if (record.count >= maxAttempts) {
    record.lockedUntil = now + lockMs
    const remainingSec = Math.ceil(lockMs / 1000)
    return {
      allowed: false,
      retryAfter: remainingSec,
      error: `Too many failed attempts. Access is temporarily locked. Please try again in ${Math.ceil(remainingSec / 60)} minutes.`,
    }
  }

  return { allowed: true }
}

function recordAttempt(store, key, lockMs, maxAttempts) {
  const now = Date.now()
  const record = store.get(key)
  if (!record || now - record.firstAttempt > WINDOW_DURATION_MS) {
    store.set(key, { count: 1, firstAttempt: now, lockedUntil: null })
  } else {
    record.count += 1
    if (record.count >= maxAttempts) {
      record.lockedUntil = now + lockMs
    }
  }
}

function resetAttempts(store, key) {
  store.delete(key)
}

// ── Role & Permissions Architecture ─────────────────────────────────────────
export const ROLE_TITLES = {
  super_admin: 'Super Administrator',
  admin: 'Administrator',
  sales_manager: 'Sales Manager',
  operations_manager: 'Operations Manager',
}

export function getDefaultPermissions(role) {
  switch (role) {
    case 'super_admin':
      return {
        can_manage_inventory: true,
        can_manage_orders: true,
        can_review_kyc: true,
        can_manage_promotions: true,
        can_manage_reviews: true,
        can_delete_reviews: true,
        can_manage_users: true,
        can_manage_team: true,
      }
    case 'admin':
      return {
        can_manage_inventory: true,
        can_manage_orders: true,
        can_review_kyc: true,
        can_manage_promotions: true,
        can_manage_reviews: true,
        can_delete_reviews: true,
        can_manage_users: false,
        can_manage_team: false,
      }
    case 'sales_manager':
      return {
        can_manage_inventory: false,
        can_manage_orders: true,
        can_review_kyc: true,
        can_manage_promotions: false,
        can_manage_reviews: false,
        can_delete_reviews: false,
        can_manage_users: false,
        can_manage_team: false,
      }
    case 'operations_manager':
    default:
      return {
        can_manage_inventory: true,
        can_manage_orders: true,
        can_review_kyc: false,
        can_manage_promotions: false,
        can_manage_reviews: true,
        can_delete_reviews: false,
        can_manage_users: false,
        can_manage_team: false,
      }
  }
}

export function resolvePermissions(adminRow) {
  if (!adminRow) return null
  const role = ['super_admin', 'admin', 'sales_manager', 'operations_manager'].includes(adminRow.role)
    ? adminRow.role
    : (adminRow.can_manage_team || adminRow.can_manage_users ? 'super_admin' : 'operations_manager')

  const defaults = getDefaultPermissions(role)

  if (role === 'super_admin') {
    return {
      role: 'super_admin',
      role_title: ROLE_TITLES.super_admin,
      permissions: {
        can_manage_inventory: true,
        can_manage_orders: true,
        can_review_kyc: true,
        can_manage_promotions: true,
        can_manage_reviews: true,
        can_delete_reviews: true,
        can_manage_users: true,
        can_manage_team: true,
      },
    }
  }

  return {
    role,
    role_title: ROLE_TITLES[role] || 'Operations Manager',
    permissions: {
      can_manage_inventory: adminRow.can_manage_inventory !== undefined ? Boolean(adminRow.can_manage_inventory) : defaults.can_manage_inventory,
      can_manage_orders: adminRow.can_manage_orders !== undefined ? Boolean(adminRow.can_manage_orders) : defaults.can_manage_orders,
      can_review_kyc: adminRow.can_review_kyc !== undefined ? Boolean(adminRow.can_review_kyc) : defaults.can_review_kyc,
      can_manage_promotions: adminRow.can_manage_promotions !== undefined ? Boolean(adminRow.can_manage_promotions) : defaults.can_manage_promotions,
      can_manage_reviews: adminRow.can_manage_reviews !== undefined ? Boolean(adminRow.can_manage_reviews) : defaults.can_manage_reviews,
      can_delete_reviews: adminRow.can_delete_reviews !== undefined ? Boolean(adminRow.can_delete_reviews) : Boolean(defaults.can_delete_reviews),
      can_manage_users: false,
      can_manage_team: false,
    },
  }
}

export async function requireAdmin(req) {
  // TODO: Enforce MFA (aal2) once administrators have completed TOTP enrollment
  const user = await authenticatedUser(req)
  if (!user?.id) return null

  // Admin access strictly requires an email-confirmed account
  if (!user.email_confirmed_at) {
    return null
  }

  let adminRow = null
  if (supabaseReady()) {
    try {
      const adminRows = await db(`admin_users?user_id=eq.${encodeURIComponent(user.id)}`)
      if (Array.isArray(adminRows) && adminRows.length > 0) {
        adminRow = adminRows[0]
      }
    } catch (err) {
      console.warn('requireAdmin DB lookup error:', err.message)
      return null
    }
  } else {
    adminRow = getMemoryStaffUser(user.id)
  }

  if (!adminRow || adminRow.is_active === false) {
    return null
  }

  const resolved = resolvePermissions(adminRow)
  if (!resolved) return null

  req.admin = {
    user,
    role: resolved.role,
    role_title: resolved.role_title,
    isSuperAdmin: resolved.role === 'super_admin',
    permissions: resolved.permissions,
  }
  return req.admin
}

export async function handleSignup(req, res) {
  const ip = getClientIp(req)
  const rateStatus = checkRateLimit(signupAttempts, ip, MAX_SIGNUP_ATTEMPTS, LOCKOUT_DURATION_MS)
  if (!rateStatus.allowed) {
    return json(res, 429, { error: rateStatus.error }, { 'Retry-After': String(rateStatus.retryAfter) })
  }
  recordAttempt(signupAttempts, ip, LOCKOUT_DURATION_MS, MAX_SIGNUP_ATTEMPTS)

  if (!getSupabaseUrl() || !getSupabaseAnonKey() || !supabaseReady()) {
    return json(res, 503, { error: 'Account service is not configured yet.' })
  }

  const input = await bodyJson(req)
  const accountType = input.accountType === 'dealer' ? 'dealer' : 'customer'
  const fullName = String(input.fullName || '').trim()
  const address = String(input.address || '').trim()
  const phone = String(input.phone || '').trim()
  const email = String(input.email || '').trim().toLowerCase()
  const gender = String(input.gender || '').trim()
  const password = String(input.password || '')
  const companyName = String(input.companyName || '').trim()

  if (
    !fullName || fullName.length > 120 ||
    !address || address.length > 500 ||
    !phone || phone.length > 40 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
    !['female', 'male', 'non_binary', 'prefer_not_to_say'].includes(gender) ||
    password.length < 8 || password.length > 128 ||
    !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) ||
    (accountType === 'dealer' && (!companyName || companyName.length > 160))
  ) {
    return json(res, 400, { error: 'Please complete all required fields. Password must be at least 8 characters and include uppercase, lowercase, and numbers.' })
  }

  const existingUser = await findAuthUserByEmail(email)
  if (existingUser?.email_confirmed_at) {
    const profileRows = await db(`profiles?id=eq.${existingUser.id}&select=account_type`).catch(() => [])
    const isTrulyRegistered = Boolean(profileRows?.[0]?.account_type)
    if (isTrulyRegistered) {
      return json(res, 409, { code: 'already_registered', error: 'You are already a registered customer. Please sign in to your account.' })
    }

    // Account was created via OAuth (Google / Apple) without completing registration. Complete it now:
    await db(`profiles?id=eq.${existingUser.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        full_name: fullName,
        phone,
        address,
        gender,
        account_type: accountType,
        dealer_status: accountType === 'dealer' ? 'pending_review' : 'not_applied',
      }),
    })

    if (accountType === 'dealer') {
      await db('dealer_applications', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: existingUser.id,
          registered_business_name: companyName,
          primary_contact: fullName,
          primary_email: email,
          business_address: { address },
          business_phone: phone,
          status: 'pending_review',
        }),
      })
    }

    try {
      await fetch(`${getSupabaseUrl()}/auth/v1/admin/users/${existingUser.id}`, {
        method: 'PUT',
        headers: {
          apikey: getSupabaseServiceRoleKey(),
          Authorization: `Bearer ${getSupabaseServiceRoleKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password,
          user_metadata: {
            ...existingUser.user_metadata,
            full_name: fullName,
            phone,
            address,
            gender,
            account_type: accountType,
          },
        }),
      })
    } catch {}

    return json(res, 201, {
      submitted: true,
      emailConfirmationRequired: false,
      accountType,
      message: accountType === 'dealer'
        ? 'Your dealer account request has been received. Dealer access will remain pending until an administrator approves it.'
        : 'Your customer account registration is now complete! You can now sign in with your account.',
    })
  }
  if (existingUser && !existingUser.email_confirmed_at) {
    const resend = await fetch(`${getSupabaseUrl()}/auth/v1/resend`, {
      method: 'POST',
      headers: { apikey: getSupabaseAnonKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'signup', email, options: { emailRedirectTo: getAuthRedirectUrl(req) } }),
    })
    if (!resend.ok) {
      const detail = await resend.json().catch(() => ({}))
      return json(res, resend.status, { error: detail.msg || detail.message || 'Your account is not confirmed yet, but a new email could not be sent. Please wait and try again.' })
    }
    return json(res, 200, { submitted: true, confirmationResent: true, message: 'Your account is not confirmed yet. We have requested a fresh confirmation email. Please check your inbox and spam folder.' })
  }

  const signupUrl = new URL('/auth/v1/signup', getSupabaseUrl())
  signupUrl.searchParams.set('redirect_to', getAuthRedirectUrl(req))
  const signup = await fetch(signupUrl, {
    method: 'POST',
    headers: { apikey: getSupabaseAnonKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: { full_name: fullName, account_type: accountType } }),
  })
  const authData = await signup.json()
  if (!signup.ok) {
    return json(res, signup.status, { error: authData.msg || authData.message || authData.error_description || 'Unable to create this account. Check the details or sign in if the email is already registered.' })
  }

  if (authData.user?.id) {
    await db(`profiles?id=eq.${authData.user.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        full_name: fullName,
        phone,
        address,
        gender,
        account_type: accountType,
        dealer_status: accountType === 'dealer' ? 'pending_review' : 'not_applied',
      }),
    })
    if (accountType === 'dealer') {
      await db('dealer_applications', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: authData.user.id,
          registered_business_name: companyName,
          primary_contact: fullName,
          primary_email: email,
          business_address: { address },
          business_phone: phone,
          status: 'pending_review',
        }),
      })
    }
  }

  return json(res, 201, {
    submitted: true,
    emailConfirmationRequired: !authData.session,
    accountType,
    message: accountType === 'dealer'
      ? 'Your dealer account request has been received. Please confirm your email; dealer access will remain pending until an administrator approves it.'
      : 'Your account has been created. Please check your email to confirm your address before signing in.',
  })
}

export async function handleResendConfirmation(req, res) {
  if (!getSupabaseUrl() || !getSupabaseAnonKey()) return json(res, 503, { error: 'Email confirmation is not configured yet.' })
  const ip = getClientIp(req)
  const rateLimit = checkRateLimit(resendAttempts, ip, 3, LOCKOUT_DURATION_MS)
  if (!rateLimit.allowed) {
    return json(res, 429, { error: rateLimit.error }, { 'Retry-After': String(rateLimit.retryAfter) })
  }

  const input = await bodyJson(req)
  const email = String(input.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json(res, 400, { error: 'Enter a valid email address.' })
  }
  recordAttempt(resendAttempts, ip, LOCKOUT_DURATION_MS, 3)

  const response = await fetch(`${getSupabaseUrl()}/auth/v1/resend`, {
    method: 'POST',
    headers: { apikey: getSupabaseAnonKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'signup', email, options: { emailRedirectTo: getAuthRedirectUrl(req) } }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    return json(res, response.status, { error: data.msg || data.message || 'Unable to resend confirmation. The account may already be confirmed or email sending may be rate-limited.' })
  }
  return json(res, 200, { sent: true, message: 'If this account still needs email confirmation, a new confirmation email has been requested. Check your inbox and spam folder.' })
}

export async function handleSignin(req, res) {
  const ip = getClientIp(req)

  // Enforce brute-force rate limit by IP first
  const ipLimit = checkRateLimit(loginAttempts, ip, MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MS)
  if (!ipLimit.allowed) {
    return json(res, 429, { error: ipLimit.error }, { 'Retry-After': String(ipLimit.retryAfter) })
  }

  const input = await bodyJson(req)
  const email = String(input.email || '').trim().toLowerCase()
  const password = String(input.password || '')

  if (email) {
    const emailLimit = checkRateLimit(loginAttempts, `email:${email}`, MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MS)
    if (!emailLimit.allowed) {
      return json(res, 429, { error: emailLimit.error }, { 'Retry-After': String(emailLimit.retryAfter) })
    }
  }

  if (!getSupabaseUrl() || !getSupabaseAnonKey()) return json(res, 503, { error: 'Sign-in service is not configured yet.' })

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 128) {
    return json(res, 400, { error: 'Enter a valid email and password.' })
  }

  const response = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: getSupabaseAnonKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await response.json()
  if (!response.ok) {
    // Record failed login attempt against both IP and Email
    recordAttempt(loginAttempts, ip, LOCKOUT_DURATION_MS, MAX_LOGIN_ATTEMPTS)
    recordAttempt(loginAttempts, `email:${email}`, LOCKOUT_DURATION_MS, MAX_LOGIN_ATTEMPTS)
    return json(res, response.status, { error: data.msg || data.message || 'Email or password is incorrect.' })
  }

  // Login successful: reset failure counts
  resetAttempts(loginAttempts, ip)
  resetAttempts(loginAttempts, `email:${email}`)

  let adminRecord = null
  let isAdmin = false
  if (data.user.email_confirmed_at) {
    if (supabaseReady()) {
      try {
        const adminRows = await db(`admin_users?user_id=eq.${encodeURIComponent(data.user.id)}`)
        if (adminRows && adminRows.length > 0 && adminRows[0].is_active !== false) {
          adminRecord = adminRows[0]
          isAdmin = true
        }
      } catch (err) {
        console.warn('Admin status lookup failed during signin:', err.message)
      }
    } else {
      adminRecord = getMemoryStaffUser(data.user.id)
      if (adminRecord && adminRecord.is_active !== false) {
        isAdmin = true
      }
    }
  }

  const profiles = await db(`profiles?id=eq.${encodeURIComponent(data.user.id)}&select=account_type,dealer_status,full_name`).catch(() => [])
  const resolved = adminRecord ? resolvePermissions(adminRecord) : null
  const accountType = isAdmin ? 'admin' : (profiles?.[0]?.account_type === 'dealer' ? 'dealer' : 'customer')

  return json(res, 200, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    user: {
      email: data.user.email,
      ...(profiles?.[0] || {}),
      account_type: accountType,
      role: resolved?.role || undefined,
      role_title: resolved?.role_title || undefined,
      is_super_admin: resolved?.role === 'super_admin',
      permissions: resolved?.permissions || undefined,
    },
  })
}

export async function handleForgotPassword(req, res) {
  const ip = getClientIp(req)

  const ipLimit = checkRateLimit(passwordResetAttempts, ip, 3, LOCKOUT_DURATION_MS)
  if (!ipLimit.allowed) {
    return json(res, 429, { error: ipLimit.error }, { 'Retry-After': String(ipLimit.retryAfter) })
  }

  const input = await bodyJson(req)
  const email = String(input.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address.' })

  if (!getSupabaseUrl() || !getSupabaseAnonKey()) return json(res, 503, { error: 'Password reset is not configured yet.' })

  recordAttempt(passwordResetAttempts, ip, LOCKOUT_DURATION_MS, 3)
  recordAttempt(passwordResetAttempts, `reset:${email}`, LOCKOUT_DURATION_MS, 3)

  // Standard safe password recovery dispatch directly via GoTrue email
  // Security rule: NEVER generate or expose direct recovery links in the HTTP response.
  try {
    await fetch(`${getSupabaseUrl()}/auth/v1/recover`, {
      method: 'POST',
      headers: { apikey: getSupabaseAnonKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, redirect_to: getAuthRedirectUrl(req) }),
    })
  } catch (err) {
    console.warn('Password recover request warning:', err.message)
  }

  // Return a generic response preventing email enumeration and ensuring zero token leakage
  return json(res, 200, {
    sent: true,
    message: 'If an account exists for this email address, a password reset link has been dispatched to your inbox. Please check your email and spam folder.',
  })
}

export async function handleResetPassword(req, res) {
  if (!getSupabaseUrl() || !getSupabaseAnonKey()) return json(res, 503, { error: 'Authentication service is not configured yet.' })
  const input = await bodyJson(req)
  const password = String(input.password || '')
  const authHeader = req.headers['authorization'] || ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const token = bearerToken || String(input.accessToken || '').trim()

  if (!token) {
    return json(res, 401, { error: 'Your password reset session or link is invalid or expired. Please request a new link.' })
  }

  if (
    password.length < 8 ||
    password.length > 128 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return json(res, 400, {
      error: 'Password must be between 8 and 128 characters and include uppercase, lowercase, and numbers.',
    })
  }

  try {
    const response = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: getSupabaseAnonKey(),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return json(res, response.status, {
        error: data.msg || data.message || 'Unable to update password. Your reset link may have expired.',
      })
    }
    return json(res, 200, {
      success: true,
      message: 'Your password has been updated successfully. You can now sign in with your new password.',
    })
  } catch {
    return json(res, 500, { error: 'Failed to communicate with authentication service.' })
  }
}

export async function handleGetProfile(req, res) {
  const user = await authenticatedUser(req)
  if (!user?.id) return json(res, 401, { error: 'Please sign in to view your profile.' })

  let profileData = null
  let isAdmin = false
  let adminRecord = null
  if (supabaseReady()) {
    try {
      const rows = await db(`profiles?id=eq.${encodeURIComponent(user.id)}`)
      if (rows && rows.length > 0) {
        profileData = rows[0]
      }
      if (user.email_confirmed_at) {
        const adminRows = await db(`admin_users?user_id=eq.${encodeURIComponent(user.id)}`)
        if (adminRows && adminRows.length > 0 && adminRows[0].is_active !== false) {
          isAdmin = true
          adminRecord = adminRows[0]
        }
      }
    } catch (err) {
      console.warn('Profile fetch from DB failed:', err.message)
    }
  } else {
    adminRecord = getMemoryStaffUser(user.id)
    if (adminRecord && adminRecord.is_active !== false) {
      isAdmin = true
    }
  }

  const resolved = adminRecord ? resolvePermissions(adminRecord) : null
  // Never trust user_metadata for role or account_type elevation
  const accountType = isAdmin ? 'admin' : (profileData?.account_type === 'dealer' ? 'dealer' : 'customer')
  const meta = user.user_metadata || {}
  const isRegisteredCustomer = Boolean(isAdmin || (profileData && profileData.account_type))

  return json(res, 200, {
    id: user.id,
    email: user.email,
    full_name: profileData?.full_name || meta.full_name || meta.name || '',
    phone: profileData?.phone || meta.phone || '',
    address: profileData?.address || meta.address || '',
    gender: profileData?.gender || meta.gender || 'prefer_not_to_say',
    account_type: accountType,
    dealer_status: profileData?.dealer_status || 'not_applied',
    is_registered: isRegisteredCustomer,
    is_admin: isAdmin,
    is_super_admin: resolved?.role === 'super_admin',
    role: resolved?.role || undefined,
    role_title: resolved?.role_title || undefined,
    permissions: resolved?.permissions || undefined,
    created_at: profileData?.created_at || user.created_at,
  })
}

export async function handleUpdateProfile(req, res) {
  const user = await authenticatedUser(req)
  if (!user?.id) return json(res, 401, { error: 'Please sign in to update your profile.' })

  const input = await bodyJson(req)
  const fullName = String(input.fullName || input.full_name || '').trim()
  const phone = String(input.phone || '').trim()
  const address = String(input.address || '').trim()
  const gender = String(input.gender || 'prefer_not_to_say').trim()

  if (fullName && fullName.length > 120) {
    return json(res, 400, { error: 'Full name must be 120 characters or fewer.' })
  }
  if (phone && phone.length > 40) {
    return json(res, 400, { error: 'Phone number must be 40 characters or fewer.' })
  }

  // Update in public.profiles table
  if (supabaseReady()) {
    try {
      await db(`profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: fullName,
          phone,
          updated_at: new Date().toISOString(),
        }),
      })
    } catch (dbErr) {
      console.warn('Profile DB patch failed:', dbErr.message)
    }
  }

  // Update user_metadata in GoTrue auth
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (token && getSupabaseUrl() && getSupabaseAnonKey()) {
    try {
      await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: getSupabaseAnonKey(),
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            ...user.user_metadata,
            full_name: fullName,
            phone,
            address,
            gender,
          },
        }),
      })
    } catch (authErr) {
      console.warn('GoTrue metadata update failed:', authErr.message)
    }
  }

  let profileData = null
  let isAdmin = false
  let adminRecord = null
  if (supabaseReady()) {
    try {
      const rows = await db(`profiles?id=eq.${encodeURIComponent(user.id)}`)
      if (rows && rows.length > 0) profileData = rows[0]
      if (user.email_confirmed_at) {
        const adminRows = await db(`admin_users?user_id=eq.${encodeURIComponent(user.id)}`)
        if (adminRows && adminRows.length > 0 && adminRows[0].is_active !== false) {
          isAdmin = true
          adminRecord = adminRows[0]
        }
      }
    } catch (err) {
      console.warn('Profile fetch after update failed:', err.message)
    }
  } else {
    adminRecord = getMemoryStaffUser(user.id)
    if (adminRecord && adminRecord.is_active !== false) isAdmin = true
  }

  const resolved = adminRecord ? resolvePermissions(adminRecord) : null
  const accountType = isAdmin ? 'admin' : (profileData?.account_type === 'dealer' ? 'dealer' : 'customer')

  return json(res, 200, {
    success: true,
    message: 'Profile updated successfully.',
    user: {
      id: user.id,
      email: user.email,
      full_name: fullName,
      phone,
      address,
      gender,
      account_type: accountType,
      dealer_status: profileData?.dealer_status || 'not_applied',
      is_registered: Boolean(isAdmin || (profileData && profileData.account_type)),
      is_admin: isAdmin,
      is_super_admin: resolved?.role === 'super_admin',
      role: resolved?.role || undefined,
      role_title: resolved?.role_title || undefined,
      permissions: resolved?.permissions || undefined,
    },
  })
}

export async function handleOAuth(req, res, url) {
  if (!getSupabaseUrl() || !getSupabaseAnonKey()) {
    return json(res, 503, { error: 'Auth service is not configured yet.' })
  }
  const provider = (url.searchParams.get('provider') || '').toLowerCase()
  if (!['google', 'apple'].includes(provider)) {
    return json(res, 400, { error: 'Invalid provider. Supported providers: google, apple' })
  }
  const redirectUrl = getAuthRedirectUrl(req)

  try {
    const probe = await fetch(`${getSupabaseUrl()}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectUrl)}`, {
      method: 'GET',
      redirect: 'manual',
    })

    if (probe.status === 400) {
      return json(res, 200, {
        enabled: false,
        provider,
        message: `${provider === 'google' ? 'Google' : 'Apple'} Sign-In is prepared, but not yet enabled in your Supabase Auth dashboard. To activate 1-click ${provider === 'google' ? 'Google' : 'Apple'} sign-in, enable it under Authentication > Providers in the Supabase dashboard.`,
      })
    }

    const location = probe.headers.get('location')
    const targetUrl = location || `${getSupabaseUrl()}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectUrl)}`
    return json(res, 200, {
      enabled: true,
      provider,
      url: targetUrl,
    })
  } catch (err) {
    return json(res, 500, { error: 'Failed to initialize OAuth.' })
  }
}

export async function handleCheckRegistered(req, res, url) {
  const email = String(url.searchParams.get('email') || '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(res, 400, { error: 'A valid email address is required.' })
  }

  if (!supabaseReady()) {
    const mem = memoryStaffUsers.find(s => s.email.toLowerCase() === email)
    if (mem && mem.is_active !== false) {
      return json(res, 200, { registered: true, isAdmin: true, isStaff: true })
    }
    return json(res, 200, { registered: false })
  }

  try {
    const user = await findAuthUserByEmail(email)
    if (!user) {
      return json(res, 200, { registered: false })
    }

    if (user.email_confirmed_at) {
      const adminRows = await db(`admin_users?user_id=eq.${encodeURIComponent(user.id)}`).catch(() => [])
      if (Array.isArray(adminRows) && adminRows.length > 0 && adminRows[0].is_active !== false) {
        return json(res, 200, { registered: true, isAdmin: true, isStaff: true })
      }
    }

    const profileRows = await db(`profiles?id=eq.${encodeURIComponent(user.id)}&select=account_type`).catch(() => [])
    if (profileRows?.[0]?.account_type) {
      return json(res, 200, { registered: true })
    }

    return json(res, 200, { registered: false })
  } catch (err) {
    const mem = memoryStaffUsers.find(s => s.email.toLowerCase() === email)
    if (mem && mem.is_active !== false) {
      return json(res, 200, { registered: true, isAdmin: true, isStaff: true })
    }
    console.warn('Check registered lookup error:', err.message)
    return json(res, 200, { registered: false })
  }
}



