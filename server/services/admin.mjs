import { db, json, bodyJson, supabaseReady, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './shared.mjs'
import { ROLE_TITLES, getDefaultPermissions, resolvePermissions } from './auth.mjs'

// In-memory staff storage for development and offline/mock operation
export const memoryStaffUsers = [
  {
    id: 'staff-superadmin-1',
    user_id: 'staff-superadmin-1',
    email: 'superadmin.test@internal.test',
    full_name: 'Test Super Admin',
    role: 'super_admin',
    role_title: 'Super Administrator',
    is_super_admin: true,
    is_active: true,
    status: 'active',
    created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
    updated_at: new Date('2026-10-01T00:00:00Z').toISOString(),
    permissions: {
      can_manage_inventory: true,
      can_manage_orders: true,
      can_review_kyc: true,
      can_manage_reviews: true,
      can_manage_promotions: true,
      can_manage_users: true,
      can_manage_team: true,
    },
  },
]

export function getMemoryStaffUser(id) {
  if (!id) return null
  return memoryStaffUsers.find(s => s.id === id || s.user_id === id) || null
}

export async function handleGetStaffUsers(req, res, admin) {
  if (admin?.role !== 'super_admin' || (!admin?.permissions?.can_manage_users && !admin?.permissions?.can_manage_team)) {
    return json(res, 403, { error: 'Super Administrator privilege required to view staff and user accounts.' })
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

          const resolved = resolvePermissions(row)
          dbStaff.push({
            id: row.user_id,
            user_id: row.user_id,
            email,
            full_name: fullName,
            role: resolved.role,
            role_title: resolved.role_title,
            is_super_admin: resolved.role === 'super_admin',
            is_active: row.is_active !== false,
            status: row.is_active !== false ? 'active' : 'inactive',
            created_at: row.created_at,
            updated_at: row.updated_at,
            permissions: resolved.permissions,
          })
        }
      }
    } catch (err) {
      console.warn('DB fetch staff failed, using memory store:', err.message)
    }
  }

  const map = new Map()
  for (const s of memoryStaffUsers) {
    map.set(s.id, {
      ...s,
      is_active: s.is_active !== false,
      status: s.is_active !== false ? 'active' : 'inactive',
    })
  }
  for (const s of dbStaff) {
    map.set(s.id, s)
  }

  const staffList = Array.from(map.values())
  return json(res, 200, { users: staffList, staff: staffList })
}

export async function handleCreateStaffUser(req, res, admin) {
  if (admin?.role !== 'super_admin' || (!admin?.permissions?.can_manage_users && !admin?.permissions?.can_manage_team)) {
    return json(res, 403, { error: 'Super Administrator privilege required to create and invite staff accounts.' })
  }

  const input = await bodyJson(req).catch(() => ({}))
  const fullName = String(input.fullName || input.full_name || '').trim()
  const email = String(input.email || '').trim().toLowerCase()
  const requestedRole = String(input.role || '').trim()

  if (fullName.length < 2 || fullName.length > 100) {
    return json(res, 400, { error: 'Please enter a valid staff full name (2–100 characters).' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json(res, 400, { error: 'Please provide a valid email address.' })
  }

  // Reject super_admin role assignment via API
  if (requestedRole === 'super_admin') {
    return json(res, 400, { error: 'Super Administrator privilege cannot be granted via the API. Super admins must be designated via database migration.' })
  }

  const allowedRoles = ['admin', 'sales_manager', 'operations_manager']
  const role = allowedRoles.includes(requestedRole) ? requestedRole : 'operations_manager'
  const roleTitle = input.roleTitle || input.role_title || ROLE_TITLES[role]

  // Reject client-sent passwords in live mode — invitations send a set-password link via Supabase Auth
  if (input.password && (!SUPABASE_URL || !SUPABASE_URL.includes('mock')) && supabaseReady()) {
    return json(res, 400, { error: 'Passwords cannot be set manually. Staff invitations send a secure set-password link via email.' })
  }

  // Check if staff already exists in memory
  if (memoryStaffUsers.some(s => s.email.toLowerCase() === email && s.is_active !== false)) {
    return json(res, 409, { error: 'A staff account with this email address already exists.' })
  }

  // Compute permissions
  const defaults = getDefaultPermissions(role)
  const customPerms = input.permissions || {}
  const perms = {
    can_manage_inventory: customPerms.can_manage_inventory !== undefined ? Boolean(customPerms.can_manage_inventory) : defaults.can_manage_inventory,
    can_manage_orders: customPerms.can_manage_orders !== undefined ? Boolean(customPerms.can_manage_orders) : defaults.can_manage_orders,
    can_review_kyc: customPerms.can_review_kyc !== undefined ? Boolean(customPerms.can_review_kyc) : defaults.can_review_kyc,
    can_manage_reviews: customPerms.can_manage_reviews !== undefined ? Boolean(customPerms.can_manage_reviews) : defaults.can_manage_reviews,
    can_manage_promotions: customPerms.can_manage_promotions !== undefined ? Boolean(customPerms.can_manage_promotions) : defaults.can_manage_promotions,
    can_manage_users: false, // strictly false for non-super_admin
    can_manage_team: false,
  }

  let userId = `staff-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  let dbSaved = false

  if (supabaseReady() && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL && !SUPABASE_URL.includes('mock')) {
    try {
      // Dispatch invitation email via Supabase Admin API
      const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          data: {
            full_name: fullName,
          },
        }),
      })
      const inviteData = await inviteRes.json().catch(() => ({}))
      if (!inviteRes.ok) {
        return json(res, inviteRes.status || 400, { error: inviteData.msg || inviteData.message || 'Failed to dispatch staff invitation email.' })
      }
      userId = inviteData.id || inviteData.user?.id || userId

      // Insert profile record
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

      // Insert admin_users record
      await db('admin_users', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          user_id: userId,
          role,
          role_title: roleTitle,
          is_active: true,
          created_by: admin.user.id,
          can_manage_inventory: perms.can_manage_inventory,
          can_manage_orders: perms.can_manage_orders,
          can_review_kyc: perms.can_review_kyc,
          can_manage_reviews: perms.can_manage_reviews,
          can_manage_promotions: perms.can_manage_promotions,
          can_manage_users: false,
          can_manage_team: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }).catch(() => {})

      dbSaved = true
    } catch (err) {
      console.warn('DB invite staff user failed:', err.message)
    }
  }

  const newStaffItem = {
    id: userId,
    user_id: userId,
    email,
    full_name: fullName,
    role,
    role_title: roleTitle,
    is_super_admin: false,
    is_active: true,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    permissions: perms,
  }

  memoryStaffUsers.push(newStaffItem)

  // Write audit log
  await db('audit_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      actor_user_id: admin.user.id,
      action: 'admin_user_invited',
      entity_type: 'admin_user',
      entity_id: userId,
      metadata: { email, fullName, role, permissions: perms },
    }),
  }).catch(() => {})

  return json(res, 201, {
    success: true,
    message: `Invitation successfully sent to ${email} for role ${ROLE_TITLES[role]}.`,
    user: newStaffItem,
    staff: newStaffItem,
    dbSaved,
  })
}

export async function handleUpdateStaffUser(req, res, admin, id) {
  if (admin?.role !== 'super_admin' || (!admin?.permissions?.can_manage_users && !admin?.permissions?.can_manage_team)) {
    return json(res, 403, { error: 'Super Administrator privilege required to modify staff roles and permissions.' })
  }

  const cleanId = String(id || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid staff account identifier.' })
  }

  const input = await bodyJson(req).catch(() => ({}))

  // Self modification prevention
  if (cleanId === admin.user.id || cleanId === 'staff-superadmin-1') {
    if (input.is_active === false || input.status === 'inactive') {
      return json(res, 400, { error: 'You cannot deactivate your own account.' })
    }
    if (input.role && input.role !== 'super_admin') {
      return json(res, 400, { error: 'You cannot demote or change your own role.' })
    }
    if (input.permissions && (input.permissions.can_manage_users === false || input.permissions.can_manage_team === false)) {
      return json(res, 400, { error: 'You cannot revoke Super Administrator privileges from your own account.' })
    }
  }

  // Reject promotion to super_admin via API
  if (input.role === 'super_admin') {
    return json(res, 400, { error: 'Super Administrator privilege cannot be granted via the API. Super admins must be designated via database migration.' })
  }

  // Protection for the last remaining active super_admin
  let targetIsSuperAdmin = false
  if (supabaseReady()) {
    try {
      const rows = await db(`admin_users?user_id=eq.${encodeURIComponent(cleanId)}`)
      if (rows?.[0]?.role === 'super_admin' || rows?.[0]?.can_manage_users || rows?.[0]?.can_manage_team) {
        targetIsSuperAdmin = true
      }
    } catch {}
  } else {
    const mem = memoryStaffUsers.find(s => s.id === cleanId || s.user_id === cleanId)
    if (mem?.role === 'super_admin' || mem?.is_super_admin) {
      targetIsSuperAdmin = true
    }
  }

  if (targetIsSuperAdmin) {
    const deactivating = input.is_active === false || input.status === 'inactive'
    const demoting = input.role && input.role !== 'super_admin'
    if (deactivating || demoting) {
      let activeSuperCount = 0
      if (supabaseReady()) {
        try {
          const supers = await db('admin_users?role=eq.super_admin&is_active=eq.true')
          activeSuperCount = Array.isArray(supers) ? supers.length : 0
        } catch {}
      } else {
        activeSuperCount = memoryStaffUsers.filter(s => (s.role === 'super_admin' || s.is_super_admin) && s.is_active !== false).length
      }
      if (activeSuperCount <= 1) {
        return json(res, 400, { error: 'Cannot deactivate or demote the last remaining active Super Administrator.' })
      }
    }
  }

  const roleTitle = input.roleTitle !== undefined ? String(input.roleTitle).trim() : (input.role ? ROLE_TITLES[input.role] : undefined)
  const role = input.role && ['admin', 'sales_manager', 'operations_manager'].includes(input.role) ? input.role : undefined
  const perms = input.permissions
  const isActive = input.is_active !== undefined ? Boolean(input.is_active) : (input.status ? input.status === 'active' : undefined)

  // Update memory store
  const mem = memoryStaffUsers.find(s => s.id === cleanId || s.user_id === cleanId)
  if (mem) {
    if (roleTitle) mem.role_title = roleTitle
    if (role) mem.role = role
    if (isActive !== undefined) {
      mem.is_active = isActive
      mem.status = isActive ? 'active' : 'inactive'
    }
    if (perms) {
      mem.permissions = {
        ...mem.permissions,
        ...(perms.can_manage_inventory !== undefined && { can_manage_inventory: Boolean(perms.can_manage_inventory) }),
        ...(perms.can_manage_orders !== undefined && { can_manage_orders: Boolean(perms.can_manage_orders) }),
        ...(perms.can_review_kyc !== undefined && { can_review_kyc: Boolean(perms.can_review_kyc) }),
        ...(perms.can_manage_reviews !== undefined && { can_manage_reviews: Boolean(perms.can_manage_reviews) }),
        ...(perms.can_manage_promotions !== undefined && { can_manage_promotions: Boolean(perms.can_manage_promotions) }),
        can_manage_users: mem.role === 'super_admin',
        can_manage_team: mem.role === 'super_admin',
      }
      mem.is_super_admin = mem.role === 'super_admin'
    }
    mem.updated_at = new Date().toISOString()
  }

  if (supabaseReady() && /^[0-9a-f-]{36}$/i.test(cleanId)) {
    try {
      const dbUpdates = { updated_at: new Date().toISOString() }
      if (roleTitle) dbUpdates.role_title = roleTitle
      if (role) dbUpdates.role = role
      if (isActive !== undefined) dbUpdates.is_active = isActive
      if (perms) {
        if (perms.can_manage_inventory !== undefined) dbUpdates.can_manage_inventory = Boolean(perms.can_manage_inventory)
        if (perms.can_manage_orders !== undefined) dbUpdates.can_manage_orders = Boolean(perms.can_manage_orders)
        if (perms.can_review_kyc !== undefined) dbUpdates.can_review_kyc = Boolean(perms.can_review_kyc)
        if (perms.can_manage_reviews !== undefined) dbUpdates.can_manage_reviews = Boolean(perms.can_manage_reviews)
        if (perms.can_manage_promotions !== undefined) dbUpdates.can_manage_promotions = Boolean(perms.can_manage_promotions)
        if (!targetIsSuperAdmin) {
          dbUpdates.can_manage_users = false
          dbUpdates.can_manage_team = false
        }
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
      action: 'admin_user_updated',
      entity_type: 'admin_user',
      entity_id: cleanId,
      metadata: { role, roleTitle, perms, isActive },
    }),
  }).catch(() => {})

  return json(res, 200, {
    success: true,
    updated: true,
    message: 'Staff account and permissions updated successfully.',
    user: mem || { id: cleanId, role, role_title: roleTitle, permissions: perms, is_active: isActive },
    staff: mem || { id: cleanId, role, role_title: roleTitle, permissions: perms, is_active: isActive },
  })
}

export async function handleDeleteStaffUser(req, res, admin, id) {
  if (admin?.role !== 'super_admin' || (!admin?.permissions?.can_manage_users && !admin?.permissions?.can_manage_team)) {
    return json(res, 403, { error: 'Super Administrator privilege required to deactivate staff accounts.' })
  }

  const cleanId = String(id || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid staff account identifier.' })
  }

  if (cleanId === admin.user.id || cleanId === 'staff-superadmin-1') {
    return json(res, 400, { error: 'You cannot deactivate your own account.' })
  }

  // Protection for the last remaining active super_admin
  let targetIsSuperAdmin = false
  if (supabaseReady()) {
    try {
      const rows = await db(`admin_users?user_id=eq.${encodeURIComponent(cleanId)}`)
      if (rows?.[0]?.role === 'super_admin' || rows?.[0]?.can_manage_users || rows?.[0]?.can_manage_team) {
        targetIsSuperAdmin = true
      }
    } catch {}
  } else {
    const mem = memoryStaffUsers.find(s => s.id === cleanId || s.user_id === cleanId)
    if (mem?.role === 'super_admin' || mem?.is_super_admin) {
      targetIsSuperAdmin = true
    }
  }

  if (targetIsSuperAdmin) {
    let activeSuperCount = 0
    if (supabaseReady()) {
      try {
        const supers = await db('admin_users?role=eq.super_admin&is_active=eq.true')
        activeSuperCount = Array.isArray(supers) ? supers.length : 0
      } catch {}
    } else {
      activeSuperCount = memoryStaffUsers.filter(s => (s.role === 'super_admin' || s.is_super_admin) && s.is_active !== false).length
    }
    if (activeSuperCount <= 1) {
      return json(res, 400, { error: 'Cannot deactivate the last remaining active Super Administrator.' })
    }
  }

  // Soft delete in memory
  const mem = memoryStaffUsers.find(s => s.id === cleanId || s.user_id === cleanId)
  if (mem) {
    mem.is_active = false
    mem.status = 'inactive'
    mem.updated_at = new Date().toISOString()
  }

  // Soft delete in database (set is_active = false)
  if (supabaseReady() && /^[0-9a-f-]{36}$/i.test(cleanId)) {
    try {
      await db(`admin_users?user_id=eq.${encodeURIComponent(cleanId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
      })
    } catch (err) {
      console.warn('DB soft delete staff user failed:', err.message)
    }
  }

  // Write audit log
  await db('audit_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      actor_user_id: admin.user.id,
      action: 'admin_user_deactivated',
      entity_type: 'admin_user',
      entity_id: cleanId,
    }),
  }).catch(() => {})

  return json(res, 200, {
    success: true,
    deactivated: true,
    deleted: true,
    message: 'Staff operational access deactivated successfully.',
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

