import { db, json, bodyJson, supabaseReady, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './shared.mjs'
import { isStaffEmail } from './auth.mjs'

// In-memory staff storage for development and offline/mock operation
const memoryStaffUsers = [
  {
    id: 'staff-superadmin-1',
    user_id: 'staff-superadmin-1',
    email: 'kuldeepsingh343@gmail.com',
    full_name: 'Kuldeep Singh',
    role_title: 'Super Administrator',
    is_super_admin: true,
    status: 'active',
    created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
    permissions: {
      can_manage_inventory: true,
      can_manage_orders: true,
      can_review_kyc: true,
      can_manage_reviews: true,
      can_manage_promotions: true,
      can_manage_team: true,
    },
  },
  {
    id: 'staff-superadmin-2',
    user_id: 'staff-superadmin-2',
    email: 'heymandiamondllc@gmail.com',
    full_name: 'Heyman Diamond Operations',
    role_title: 'Super Administrator',
    is_super_admin: true,
    status: 'active',
    created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
    permissions: {
      can_manage_inventory: true,
      can_manage_orders: true,
      can_review_kyc: true,
      can_manage_reviews: true,
      can_manage_promotions: true,
      can_manage_team: true,
    },
  },
]

export async function handleGetStaffUsers(req, res, admin) {
  if (!admin?.permissions?.can_manage_team && !admin?.isSuperAdmin) {
    return json(res, 403, { error: 'Super Administrator privilege required to view team and staff accounts.' })
  }

  let dbStaff = []
  if (supabaseReady()) {
    try {
      const rows = await db('admin_users?select=*&order=created_at.desc')
      if (Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) {
          let email = ''
          let fullName = row.role_title || 'Staff Member'
          try {
            const profileRows = await db(`profiles?id=eq.${encodeURIComponent(row.user_id)}&select=full_name`)
            if (profileRows?.[0]?.full_name) fullName = profileRows[0].full_name
          } catch {}

          dbStaff.push({
            id: row.user_id,
            user_id: row.user_id,
            email,
            full_name: fullName,
            role_title: row.role_title || 'Operations Staff',
            is_super_admin: Boolean(row.can_manage_team),
            status: 'active',
            created_at: row.created_at,
            permissions: {
              can_manage_inventory: row.can_manage_inventory !== false,
              can_manage_orders: Boolean(row.can_manage_orders),
              can_review_kyc: Boolean(row.can_review_kyc),
              can_manage_reviews: Boolean(row.can_manage_reviews),
              can_manage_promotions: Boolean(row.can_manage_promotions),
              can_manage_team: Boolean(row.can_manage_team),
            },
          })
        }
      }
    } catch (err) {
      console.warn('DB fetch staff failed, using memory store:', err.message)
    }
  }

  // Merge database staff with memory staff ensuring no duplicates
  const map = new Map()
  for (const s of memoryStaffUsers) {
    map.set(s.email.toLowerCase(), s)
  }
  for (const s of dbStaff) {
    if (s.email) {
      map.set(s.email.toLowerCase(), s)
    } else {
      map.set(s.id, s)
    }
  }

  return json(res, 200, { staff: Array.from(map.values()) })
}

export async function handleCreateStaffUser(req, res, admin) {
  if (!admin?.permissions?.can_manage_team && !admin?.isSuperAdmin) {
    return json(res, 403, { error: 'Super Administrator privilege required to create staff accounts.' })
  }

  const input = await bodyJson(req).catch(() => ({}))
  const fullName = String(input.fullName || input.full_name || '').trim()
  const email = String(input.email || '').trim().toLowerCase()
  const password = String(input.password || '').trim()
  const roleTitle = String(input.roleTitle || input.role_title || 'Operations Manager').trim()
  const perms = input.permissions || {}

  if (fullName.length < 2 || fullName.length > 100) {
    return json(res, 400, { error: 'Please enter a valid staff full name (2–100 characters).' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json(res, 400, { error: 'Please provide a valid email address.' })
  }
  if (password.length < 8) {
    return json(res, 400, { error: 'Staff account password must be at least 8 characters long.' })
  }

  // Check if staff already exists in memory
  if (memoryStaffUsers.some(s => s.email.toLowerCase() === email)) {
    return json(res, 409, { error: 'A staff account with this email address already exists.' })
  }

  const newStaffItem = {
    id: `staff-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    user_id: `staff-${Date.now()}`,
    email,
    full_name: fullName,
    role_title: roleTitle,
    is_super_admin: Boolean(perms.can_manage_team),
    status: 'active',
    created_at: new Date().toISOString(),
    permissions: {
      can_manage_inventory: perms.can_manage_inventory !== false,
      can_manage_orders: Boolean(perms.can_manage_orders),
      can_review_kyc: Boolean(perms.can_review_kyc),
      can_manage_reviews: Boolean(perms.can_manage_reviews),
      can_manage_promotions: Boolean(perms.can_manage_promotions),
      can_manage_team: Boolean(perms.can_manage_team),
    },
  }

  let dbSaved = false
  if (supabaseReady() && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      // 1. Create or retrieve auth user via Supabase Admin API
      let userId = ''
      const adminUsersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      })
      if (adminUsersRes.ok) {
        const adminData = await adminUsersRes.json()
        const existing = (adminData.users || []).find(u => String(u.email || '').toLowerCase() === email)
        if (existing) {
          userId = existing.id
        }
      }

      if (!userId) {
        const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              full_name: fullName,
              account_type: 'admin',
              role_title: roleTitle,
            },
          }),
        })
        if (createRes.ok) {
          const createData = await createRes.json()
          userId = createData.id || createData.user?.id
        }
      }

      if (userId) {
        newStaffItem.id = userId
        newStaffItem.user_id = userId

        // 2. Insert profile record
        await db('profiles', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            id: userId,
            full_name: fullName,
            account_type: 'admin',
            dealer_status: 'not_applied',
            updated_at: new Date().toISOString(),
          }),
        }).catch(() => {})

        // 3. Upsert admin_users record with granular permissions
        await db('admin_users', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            user_id: userId,
            role_title: roleTitle,
            can_manage_inventory: Boolean(perms.can_manage_inventory),
            can_manage_orders: Boolean(perms.can_manage_orders),
            can_review_kyc: Boolean(perms.can_review_kyc),
            can_manage_reviews: Boolean(perms.can_manage_reviews),
            can_manage_promotions: Boolean(perms.can_manage_promotions),
            can_manage_team: Boolean(perms.can_manage_team),
            created_at: new Date().toISOString(),
          }),
        }).catch(() => {})

        dbSaved = true
      }
    } catch (err) {
      console.warn('DB create staff user failed, stored in memory:', err.message)
    }
  }

  // Save to memory store
  memoryStaffUsers.push(newStaffItem)

  // Write audit log
  await db('audit_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      actor_user_id: admin.user.id,
      action: 'staff_account_created',
      entity_type: 'admin_user',
      entity_id: newStaffItem.id,
      metadata: { email, roleTitle, permissions: newStaffItem.permissions },
    }),
  }).catch(() => {})

  return json(res, 201, {
    success: true,
    message: `Account for ${fullName} (${roleTitle}) created successfully.`,
    staff: newStaffItem,
    dbSaved,
  })
}

export async function handleUpdateStaffUser(req, res, admin, id) {
  if (!admin?.permissions?.can_manage_team && !admin?.isSuperAdmin) {
    return json(res, 403, { error: 'Super Administrator privilege required to modify staff permissions.' })
  }

  const cleanId = String(id || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid staff account identifier.' })
  }

  const input = await bodyJson(req).catch(() => ({}))
  const roleTitle = input.roleTitle !== undefined ? String(input.roleTitle).trim() : undefined
  const perms = input.permissions
  const status = input.status

  // Prevent Super Admin from locking themselves out of team management
  if ((cleanId === admin.user.id || cleanId === 'staff-superadmin-1') && perms && perms.can_manage_team === false) {
    return json(res, 400, { error: 'Cannot revoke Super Administrator privilege from your own account.' })
  }

  // Update in memory store
  const mem = memoryStaffUsers.find(s => s.id === cleanId || s.user_id === cleanId)
  if (mem) {
    if (roleTitle) mem.role_title = roleTitle
    if (status) mem.status = status
    if (perms) {
      mem.permissions = {
        ...mem.permissions,
        ...(perms.can_manage_inventory !== undefined && { can_manage_inventory: Boolean(perms.can_manage_inventory) }),
        ...(perms.can_manage_orders !== undefined && { can_manage_orders: Boolean(perms.can_manage_orders) }),
        ...(perms.can_review_kyc !== undefined && { can_review_kyc: Boolean(perms.can_review_kyc) }),
        ...(perms.can_manage_reviews !== undefined && { can_manage_reviews: Boolean(perms.can_manage_reviews) }),
        ...(perms.can_manage_promotions !== undefined && { can_manage_promotions: Boolean(perms.can_manage_promotions) }),
        ...(perms.can_manage_team !== undefined && { can_manage_team: Boolean(perms.can_manage_team) }),
      }
      mem.is_super_admin = Boolean(mem.permissions.can_manage_team)
    }
  }

  if (supabaseReady() && /^[0-9a-f-]{36}$/i.test(cleanId)) {
    try {
      const dbUpdates = {}
      if (roleTitle) dbUpdates.role_title = roleTitle
      if (perms) {
        if (perms.can_manage_inventory !== undefined) dbUpdates.can_manage_inventory = Boolean(perms.can_manage_inventory)
        if (perms.can_manage_orders !== undefined) dbUpdates.can_manage_orders = Boolean(perms.can_manage_orders)
        if (perms.can_review_kyc !== undefined) dbUpdates.can_review_kyc = Boolean(perms.can_review_kyc)
        if (perms.can_manage_reviews !== undefined) dbUpdates.can_manage_reviews = Boolean(perms.can_manage_reviews)
        if (perms.can_manage_promotions !== undefined) dbUpdates.can_manage_promotions = Boolean(perms.can_manage_promotions)
        if (perms.can_manage_team !== undefined) dbUpdates.can_manage_team = Boolean(perms.can_manage_team)
      }

      await db(`admin_users?user_id=eq.${encodeURIComponent(cleanId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(dbUpdates),
      })
    } catch (err) {
      console.warn('DB update staff permissions failed:', err.message)
    }
  }

  // Audit log
  await db('audit_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      actor_user_id: admin.user.id,
      action: 'staff_permissions_updated',
      entity_type: 'admin_user',
      entity_id: cleanId,
      metadata: { roleTitle, perms, status },
    }),
  }).catch(() => {})

  return json(res, 200, {
    success: true,
    updated: true,
    message: 'Staff account and permissions updated successfully.',
    staff: mem || { id: cleanId, role_title: roleTitle, permissions: perms },
  })
}

export async function handleDeleteStaffUser(req, res, admin, id) {
  if (!admin?.permissions?.can_manage_team && !admin?.isSuperAdmin) {
    return json(res, 403, { error: 'Super Administrator privilege required to revoke staff accounts.' })
  }

  const cleanId = String(id || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid staff account identifier.' })
  }

  if (cleanId === admin.user.id || cleanId === 'staff-superadmin-1') {
    return json(res, 400, { error: 'Cannot revoke permissions from the primary Super Administrator account.' })
  }

  // Remove from memory
  const idx = memoryStaffUsers.findIndex(s => s.id === cleanId || s.user_id === cleanId)
  if (idx !== -1) {
    memoryStaffUsers.splice(idx, 1)
  }

  if (supabaseReady() && /^[0-9a-f-]{36}$/i.test(cleanId)) {
    try {
      await db(`admin_users?user_id=eq.${encodeURIComponent(cleanId)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      })
      await db(`profiles?id=eq.${encodeURIComponent(cleanId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ account_type: 'customer', updated_at: new Date().toISOString() }),
      })
    } catch (err) {
      console.warn('DB delete staff user failed:', err.message)
    }
  }

  // Audit log
  await db('audit_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      actor_user_id: admin.user.id,
      action: 'staff_account_revoked',
      entity_type: 'admin_user',
      entity_id: cleanId,
    }),
  }).catch(() => {})

  return json(res, 200, {
    success: true,
    deleted: true,
    message: 'Staff operational access revoked successfully.',
  })
}

export async function handleGetDealerApplications(req, res, admin) {
  if (!admin?.permissions?.can_review_kyc) return json(res, 403, { error: 'KYC review permission required.' })
  const rows = await db('dealer_applications?select=id,user_id,status,registered_business_name,primary_contact,primary_email,submitted_at&order=submitted_at.desc')
  return json(res, 200, { items: rows })
}

export async function handleUpdateDealerApplication(req, res, admin, id) {
  if (!admin?.permissions?.can_review_kyc) return json(res, 403, { error: 'KYC review permission required.' })
  const cleanId = String(id || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid dealer application identifier.' })
  }
  const input = await bodyJson(req)
  const allowed = ['pending_review', 'more_information_required', 'approved', 'rejected', 'suspended']
  if (!allowed.includes(input.status)) return json(res, 400, { error: 'Invalid dealer application status.' })

  const safeId = encodeURIComponent(cleanId)
  const rows = await db(`dealer_applications?id=eq.${safeId}&select=id,user_id,status`)
  const currentApp = rows?.[0]
  if (!currentApp) return json(res, 404, { error: 'Dealer application not found.' })

  await db(`dealer_applications?id=eq.${safeId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: input.status, reviewed_at: new Date().toISOString(), reviewed_by: admin.user.id }) })
  if (currentApp.user_id && ['approved', 'rejected', 'suspended', 'pending_review'].includes(input.status)) {
    const safeUserId = encodeURIComponent(String(currentApp.user_id))
    await db(`profiles?id=eq.${safeUserId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ dealer_status: input.status }) })
  }
  await db('audit_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ actor_user_id: admin.user.id, action: 'dealer_application_status_changed', entity_type: 'dealer_application', entity_id: cleanId, metadata: { status: input.status } }) })

  return json(res, 200, { updated: true, status: input.status })
}

export async function handleGetOrders(req, res, admin) {
  if (!admin?.permissions?.can_manage_orders) return json(res, 403, { error: 'Order-management permission required.' })
  const rows = await db('orders?select=id,order_number,customer_name,customer_email,status,total,currency,created_at&order=created_at.desc')
  return json(res, 200, { items: rows })
}

export async function handleGetPromotions(req, res, admin) {
  if (!admin?.permissions?.can_manage_promotions) return json(res, 403, { error: 'Promotion-management permission required.' })
  const rows = await db('promotions?select=*&order=created_at.desc')
  return json(res, 200, { items: rows })
}

