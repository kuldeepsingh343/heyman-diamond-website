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

const ADMIN_EMAILS = [
  'heymandiamondllc@gmail.com',
  'heymandiamonllc@gmail.com',
  'info@heymandiamond.com',
  'sales@heymandiamond.com',
  'amy@heymandiamond.com',
  'nikky@heymandiamond.com',
  'kuldeepsingh343@gmail.com',
  'chauhanenterprises09@gmail.com',
]

function isStaffEmail(email) {
  if (!email) return false
  const em = String(email).toLowerCase().trim()
  return em.endsWith('@heymandiamond.com') || ADMIN_EMAILS.includes(em)
}

export async function requireAdmin(req) {
  const user = await authenticatedUser(req)
  if (!user?.id) return null
  if (user.email && isStaffEmail(user.email)) {
    return {
      user,
      permissions: {
        can_review_kyc: true,
        can_manage_orders: true,
        can_manage_promotions: true,
        can_manage_reviews: true,
      },
    }
  }
  try {
    const permissions = await db(`admin_users?user_id=eq.${user.id}`)
    if (permissions && permissions.length > 0) {
      return { user, permissions: permissions[0] }
    }
    return null
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
  const adminRows = await db(`admin_users?user_id=eq.${data.user.id}`).catch(() => [])
  const isAdmin = (Array.isArray(adminRows) && adminRows.length > 0) || isStaffEmail(email)
  const accountType = isAdmin ? 'admin' : (profiles?.[0]?.account_type || 'customer')
  return json(res, 200, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    user: { email: data.user.email, ...(profiles?.[0] || {}), account_type: accountType },
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

export async function handleGetProfile(req, res) {
  const user = await authenticatedUser(req)
  if (!user?.id) return json(res, 401, { error: 'Please sign in to view your profile.' })

  let profileData = null
  let isAdmin = false
  if (supabaseReady()) {
    try {
      const rows = await db(`profiles?id=eq.${user.id}`)
      if (rows && rows.length > 0) {
        profileData = rows[0]
      }
      const adminRows = await db(`admin_users?user_id=eq.${user.id}`)
      if ((adminRows && adminRows.length > 0) || isStaffEmail(user.email)) {
        isAdmin = true
      }
    } catch (err) {
      console.warn('Profile fetch from DB failed:', err.message)
    }
  }

  if (isStaffEmail(user.email)) {
    isAdmin = true
  }

  const meta = user.user_metadata || {}
  const accountType = isAdmin ? 'admin' : (profileData?.account_type || meta.account_type || 'customer')
  return json(res, 200, {
    id: user.id,
    email: user.email,
    full_name: profileData?.full_name || meta.full_name || '',
    phone: profileData?.phone || meta.phone || '',
    address: meta.address || '',
    gender: meta.gender || 'prefer_not_to_say',
    account_type: accountType,
    dealer_status: profileData?.dealer_status || 'not_applied',
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
  if (token && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: SUPABASE_ANON_KEY,
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

  return json(res, 200, {
    success: true,
    message: 'Profile updated successfully.',
    user: {
      email: user.email,
      full_name: fullName,
      phone,
      address,
      gender,
      account_type: user.user_metadata?.account_type || 'customer',
      dealer_status: user.user_metadata?.dealer_status || 'not_applied',
    },
  })
}

export async function handleOAuth(req, res, url) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(res, 503, { error: 'Auth service is not configured yet.' })
  }
  const provider = (url.searchParams.get('provider') || '').toLowerCase()
  if (!['google', 'apple'].includes(provider)) {
    return json(res, 400, { error: 'Invalid provider. Supported providers: google, apple' })
  }
  const redirectUrl = getAuthRedirectUrl(req)

  try {
    const probe = await fetch(`${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectUrl)}`, {
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
    const targetUrl = location || `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectUrl)}`
    return json(res, 200, {
      enabled: true,
      provider,
      url: targetUrl,
    })
  } catch (err) {
    return json(res, 500, { error: 'Failed to initialize OAuth.' })
  }
}


