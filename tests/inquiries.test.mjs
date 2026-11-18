import test from 'node:test'
import assert from 'node:assert/strict'

process.env.TEST_ALLOW_MEMORY_INQUIRIES = 'true'

import {
  handleCreateInquiry,
  handleGetAdminInquiries,
  handleReplyAdminInquiry,
  handleUpdateInquiryStatus,
  handleGetUserInquiries,
  resetMemoryInquiries,
} from '../server/services/quotes.mjs'

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

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(code, headers = {}) {
      this.statusCode = code
      this.headers = { ...this.headers, ...headers }
      return this
    },
    end(data = '') {
      this.body = data
      try {
        this.json = JSON.parse(data)
      } catch {
        this.json = null
      }
      return this
    },
  }
  return res
}

const mockAdminUser = {
  user: { id: 'admin-uuid-1', email: 'sales@heymandiamond.com', user_metadata: { full_name: 'Hey Man Specialist' } },
  role: 'sales_manager',
  permissions: { can_manage_orders: true, can_manage_inventory: true },
}

const mockUnauthorizedUser = {
  user: { id: 'staff-uuid-2', email: 'junior@heymandiamond.com' },
  role: 'assistant',
  permissions: { can_manage_orders: false, can_manage_inventory: false },
}

test('Diamond Inquiries — handleCreateInquiry validation and submission', async () => {
  resetMemoryInquiries()

  // 1. Missing name & email
  const req1 = createMockReq({ 'x-test-memory': 'true' }, {
    sku: 'HM-151',
    remarks: 'Looking for a ring setting',
  })
  const res1 = createMockRes()
  await handleCreateInquiry(req1, res1)
  assert.equal(res1.statusCode, 401, 'Unauthenticated inquiry without name/email must be rejected')

  // 2. Empty remarks
  const req2 = createMockReq({ 'x-test-memory': 'true' }, {
    name: 'Jessica Miller',
    email: 'jessica@example.com',
    sku: 'HM-151',
    remarks: '',
  })
  const res2 = createMockRes()
  await handleCreateInquiry(req2, res2)
  assert.equal(res2.statusCode, 400, 'Empty remarks must be rejected')

  // 3. Valid inquiry submission
  const req3 = createMockReq({ 'x-test-memory': 'true' }, {
    sku: 'HM-394',
    shape: 'Round',
    carat: 2.02,
    color: 'VIVID-YELLOW',
    clarity: 'VS2',
    cut: 'Ideal',
    price: 909,
    name: 'Sample Inquirer',
    email: 'inquirer@example.com',
    phone: '+1 312 646 0070',
    remarks: 'Hello, I am interested in SKU HM-394. Please let me know shipping timeline and if certificate LG-833652740 is available.',
  })
  const res3 = createMockRes()
  await handleCreateInquiry(req3, res3)
  assert.equal(res3.statusCode, 201, 'Valid inquiry must return 201 Created')
  assert.ok(res3.json?.inquiryId, 'Must return inquiryId')
  assert.ok(res3.json?.inquiryNumber, 'Must return inquiryNumber')
})

test('Diamond Inquiries — Admin listing and permission enforcement', async () => {
  // 1. Unauthorized staff rejected
  const reqUnauth = createMockReq()
  const resUnauth = createMockRes()
  await handleGetAdminInquiries(reqUnauth, resUnauth, mockUnauthorizedUser)
  assert.equal(resUnauth.statusCode, 403, 'Staff without order/inquiry permission must be rejected with 403')

  // 2. Authorized admin receives inquiries list
  const reqAuth = createMockReq()
  const resAuth = createMockRes()
  await handleGetAdminInquiries(reqAuth, resAuth, mockAdminUser)
  assert.equal(resAuth.statusCode, 200, 'Authorized admin must be able to list inquiries')
  assert.ok(Array.isArray(resAuth.json?.items), 'Must return items array')
  assert.ok(resAuth.json.items.length > 0, 'Must have at least 1 inquiry from previous test')
  assert.equal(resAuth.json.items[0].diamond_sku, 'HM-394')
  assert.equal(resAuth.json.items[0].customer_name, 'Sample Inquirer')
})

test('Diamond Inquiries — Admin reply flow and status lifecycle', async () => {
  // Fetch existing inquiry ID
  const listReq = createMockReq()
  const listRes = createMockRes()
  await handleGetAdminInquiries(listReq, listRes, mockAdminUser)
  const inquiry = listRes.json.items[0]
  assert.ok(inquiry?.id)

  // 1. Empty reply rejected
  const reqEmpty = createMockReq({}, { reply: '' })
  const resEmpty = createMockRes()
  await handleReplyAdminInquiry(reqEmpty, resEmpty, mockAdminUser, inquiry.id)
  assert.equal(resEmpty.statusCode, 400, 'Empty reply must be rejected')

  // 2. Submit valid specialist reply
  const replyText = 'Hello Bhikham, the 2.02ct Vivid Yellow diamond (HM-394) is in stock and certificate LG-833652740 is ready. We can ship within 2 business days via insured armored courier.'
  const reqReply = createMockReq({}, { reply: replyText, status: 'replied' })
  const resReply = createMockRes()
  await handleReplyAdminInquiry(reqReply, resReply, mockAdminUser, inquiry.id)
  assert.equal(resReply.statusCode, 200, 'Valid reply must return 200')
  assert.equal(resReply.json?.item?.status, 'replied')
  assert.equal(resReply.json?.item?.admin_reply, replyText)
  assert.ok(resReply.json?.item?.replied_at)

  // 3. Status update to closed
  const reqClose = createMockReq({}, { status: 'closed' })
  const resClose = createMockRes()
  await handleUpdateInquiryStatus(reqClose, resClose, mockAdminUser, inquiry.id)
  assert.equal(resClose.statusCode, 200)
  assert.equal(resClose.json?.status, 'closed')
})
