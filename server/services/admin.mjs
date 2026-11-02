import { db, json, bodyJson } from './shared.mjs'

export async function handleGetDealerApplications(req, res, admin) {
  if (!admin?.permissions?.can_review_kyc) return json(res, 403, { error: 'KYC review permission required.' })
  const rows = await db('dealer_applications?select=id,user_id,status,registered_business_name,primary_contact,primary_email,submitted_at&order=submitted_at.desc')
  return json(res, 200, { items: rows })
}

export async function handleUpdateDealerApplication(req, res, admin, id) {
  if (!admin?.permissions?.can_review_kyc) return json(res, 403, { error: 'KYC review permission required.' })
  const input = await bodyJson(req)
  const allowed = ['pending_review', 'more_information_required', 'approved', 'rejected', 'suspended']
  if (!allowed.includes(input.status)) return json(res, 400, { error: 'Invalid dealer application status.' })

  const rows = await db(`dealer_applications?id=eq.${id}&select=id,user_id,status`)
  const currentApp = rows?.[0]
  if (!currentApp) return json(res, 404, { error: 'Dealer application not found.' })

  await db(`dealer_applications?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: input.status, reviewed_at: new Date().toISOString(), reviewed_by: admin.user.id }) })
  if (currentApp.user_id && ['approved', 'rejected', 'suspended', 'pending_review'].includes(input.status)) {
    await db(`profiles?id=eq.${currentApp.user_id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ dealer_status: input.status }) })
  }
  await db('audit_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ actor_user_id: admin.user.id, action: 'dealer_application_status_changed', entity_type: 'dealer_application', entity_id: id, metadata: { status: input.status } }) })

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
