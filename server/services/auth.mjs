import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  supabaseReady,
  db,
  json,
  bodyJson,
  getAuthRedirectUrl,
} from './shared.mjs'

export async function findAuthUserByEmail(email) {
  if (!supabaseReady()) throw new Error('Database API is not configured')
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  })
  if (!response.ok) throw new Error(`Unable to check account status (${response.status})`)
  const data = await response.json()
  return (data.users || []).find(user => String(user.email || '').toLowerCase() === email) || null
}

export async function authenticatedUser(req) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  return response.json()
}

export async function requireAdmin(req) {
  const user = await authenticatedUser(req)
  if (!user?.id) return null
  try {
    const permissions = await db(`admin_permissions?user_id=eq.${user.id}`)
    if (!permissions || permissions.length === 0) return null
    return { user, permissions: permissions[0] }
  } catch {
    return null
  }
}

export async function handleSignup(req, res) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !supabaseReady()) {
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
    password.length < 10 || password.length > 128 ||
    (accountType === 'dealer' && (!companyName || companyName.length > 160))
  ) {
    return json(res, 400, { error: 'Please complete all required fields. Password must be at least 10 characters.' })
  }

  const existingUser = await findAuthUserByEmail(email)
  if (existingUser?.email_confirmed_at) {
    return json(res, 409, { code: 'already_registered', error: 'You are already a registered customer. Please sign in to your account.' })
  }
  if (existingUser && !existingUser.email_confirmed_at) {
    const resend = await fetch(`${SUPABASE_URL}/auth/v1/resend`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'signup', email, options: { emailRedirectTo: getAuthRedirectUrl(req) } }),
    })
    if (!resend.ok) {
      const detail = await resend.json().catch(() => ({}))
      return json(res, resend.status, { error: detail.msg || detail.message || 'Your account is not confirmed yet, but a new email could not be sent. Please wait and try again.' })
    }
    return json(res, 200, { submitted: true, confirmationResent: true, message: 'Your account is not confirmed yet. We have requested a fresh confirmation email. Please check your inbox and spam folder.' })
  }

  const signupUrl = new URL('/auth/v1/signup', SUPABASE_URL)
  signupUrl.searchParams.set('redirect_to', getAuthRedirectUrl(req))
  const signup = await fetch(signupUrl, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
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
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(res, 503, { error: 'Email confirmation is not configured yet.' })
  const input = await bodyJson(req)
  const email = String(input.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json(res, 400, { error: 'Enter a valid email address.' })
  }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/resend`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'signup', email, options: { emailRedirectTo: getAuthRedirectUrl(req) } }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    return json(res, response.status, { error: data.msg || data.message || 'Unable to resend confirmation. The account may already be confirmed or email sending may be rate-limited.' })
  }
  return json(res, 200, { sent: true, message: 'If this account still needs email confirmation, a new confirmation email has been requested. Check your inbox and spam folder.' })
}

export async function handleSignin(req, res) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(res, 503, { error: 'Sign-in service is not configured yet.' })
  const input = await bodyJson(req)
  const email = String(input.email || '').trim().toLowerCase()
  const password = String(input.password || '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 128) {
    return json(res, 400, { error: 'Enter a valid email and password.' })
  }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await response.json()
  if (!response.ok) return json(res, response.status, { error: data.msg || data.message || 'Email or password is incorrect.' })
  const profiles = await db(`profiles?id=eq.${data.user.id}&select=account_type,dealer_status,full_name`)
  return json(res, 200, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    user: { email: data.user.email, ...(profiles?.[0] || {}) },
  })
}

export async function handleForgotPassword(req, res) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(res, 503, { error: 'Password reset is not configured yet.' })
  const input = await bodyJson(req)
  const email = String(input.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address.' })
  const response = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, redirect_to: getAuthRedirectUrl(req) }),
  })
  if (!response.ok) return json(res, response.status, { error: 'Unable to send a password reset email right now.' })
  return json(res, 200, { sent: true, message: 'If this email has an account, a password reset link has been sent.' })
}
