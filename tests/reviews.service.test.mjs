import test from 'node:test'
import assert from 'node:assert/strict'
import {
  handleGetReviews,
  handleCreateReview,
  handleGetAdminReviews,
  handleCreateReviewReply,
  handleDeleteReview,
  handleUpdateReviewStatus,
} from '../server/services/reviews.mjs'

const mockAdmin = {
  user: { id: 'admin-uuid-1', email: 'heymandiamondllc@gmail.com' },
  permissions: {
    can_manage_reviews: true,
  },
}

const mockUnauthorizedUser = {
  user: { id: 'user-uuid-2', email: 'customer@example.com' },
  permissions: {
    can_manage_reviews: false,
  },
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    writeHead(code, headers = {}) {
      this.statusCode = code
      Object.assign(this.headers, headers)
    },
    end(data) {
      if (data && typeof data === 'string') {
        try {
          this.body = JSON.parse(data)
        } catch {
          this.body = data
        }
      }
    },
  }
}

test('Reviews Service — Admin Permissions Enforcement', async () => {
  const res = createMockRes()
  await handleGetAdminReviews({}, res, mockUnauthorizedUser)
  assert.equal(res.statusCode, 403)
  assert.equal(res.body?.error, 'Review-management permission required.')

  const res2 = createMockRes()
  await handleDeleteReview({}, res2, mockUnauthorizedUser, 'sample-1')
  assert.equal(res2.statusCode, 403)

  const res3 = createMockRes()
  await handleCreateReviewReply({}, res3, mockUnauthorizedUser)
  assert.equal(res3.statusCode, 403)
})

test('Reviews Service — Admin Get Reviews and Reply Flow', async () => {
  const res = createMockRes()
  await handleGetAdminReviews({}, res, mockAdmin)
  assert.equal(res.statusCode, 200)
  assert.ok(Array.isArray(res.body?.items))
  assert.ok(res.body.items.length >= 1)

  const targetReview = res.body.items[0]
  const reviewId = targetReview.id

  // Post official reply as admin
  const replyReq = {
    headers: { 'content-type': 'application/json' },
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(JSON.stringify({ reviewId, replyText: 'Thank you for your valued feedback from Hey Man Diamond LLC!' }))
    },
  }
  const replyRes = createMockRes()
  await handleCreateReviewReply(replyReq, replyRes, mockAdmin)
  assert.equal(replyRes.statusCode, 201)
  assert.equal(replyRes.body?.success, true)
  assert.equal(replyRes.body?.reply?.reply_text, 'Thank you for your valued feedback from Hey Man Diamond LLC!')

  // Verify review now contains the reply
  const checkRes = createMockRes()
  await handleGetAdminReviews({}, checkRes, mockAdmin)
  const updated = checkRes.body.items.find(r => r.id === reviewId)
  assert.equal(updated.reply, 'Thank you for your valued feedback from Hey Man Diamond LLC!')
})

test('Reviews Service — Admin Delete Review Flow', async () => {
  // Get current list of reviews
  const listRes = createMockRes()
  await handleGetAdminReviews({}, listRes, mockAdmin)
  assert.ok(listRes.body.items.length >= 1)

  const targetToDelete = listRes.body.items[listRes.body.items.length - 1]
  const targetId = targetToDelete.id
  assert.ok(targetId)

  // Delete review as admin
  const deleteRes = createMockRes()
  await handleDeleteReview({}, deleteRes, mockAdmin, targetId)
  assert.equal(deleteRes.statusCode, 200)
  assert.equal(deleteRes.body?.success, true)
  assert.equal(deleteRes.body?.deletedId, targetId)

  // Verify it is no longer in admin reviews list
  const afterDeleteRes = createMockRes()
  await handleGetAdminReviews({}, afterDeleteRes, mockAdmin)
  assert.equal(afterDeleteRes.body.items.some(r => r.id === targetId), false)
})

test('Reviews Service — Reply-Only user cannot delete or hide reviews', async () => {
  const replyOnlyUser = {
    user: { id: 'reply-only-staff-1', email: 'support@heymandiamond.com' },
    role: 'sales_manager',
    permissions: {
      can_manage_reviews: true,
      can_delete_reviews: false,
    },
  }

  // Attempt delete
  const delRes = createMockRes()
  await handleDeleteReview({}, delRes, replyOnlyUser, 'sample-1')
  assert.equal(delRes.statusCode, 403)
  assert.match(delRes.body?.error, /Delete review permission required/)

  // Attempt hide/unhide
  const patchReq = {
    headers: { 'content-type': 'application/json' },
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(JSON.stringify({ status: 'hidden' }))
    },
  }
  const patchRes = createMockRes()
  await handleUpdateReviewStatus(patchReq, patchRes, replyOnlyUser, 'sample-1')
  assert.equal(patchRes.statusCode, 403)
  assert.match(patchRes.body?.error, /Review status management permission required/)
})

test('Reviews Service — Status Toggle (published / hidden)', async () => {
  const listRes = createMockRes()
  await handleGetAdminReviews({}, listRes, mockAdmin)
  const target = listRes.body.items[0]

  const patchReq = {
    headers: { 'content-type': 'application/json' },
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(JSON.stringify({ status: 'hidden' }))
    },
  }
  const patchRes = createMockRes()
  await handleUpdateReviewStatus(patchReq, patchRes, mockAdmin, target.id)
  assert.equal(patchRes.statusCode, 200)
  assert.equal(patchRes.body?.status, 'hidden')
})
