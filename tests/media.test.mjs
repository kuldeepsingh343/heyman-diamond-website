import test from 'node:test'
import assert from 'node:assert/strict'

import {
  verifyMagicBytes,
  handleGetMediaUploadUrl,
  handleConfirmMediaUpload,
  handleGetDiamondMedia,
  handleUpdateMediaItem,
  handleDeleteMediaItem,
  resetMemoryMediaStore,
  getMemoryMediaStore,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from '../server/services/media.mjs'

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

const authorizedAdmin = {
  user: { id: 'admin-media-test-1', email: 'director@heymandiamond.com' },
  permissions: { can_manage_inventory: true },
}

const unauthorizedAdmin = {
  user: { id: 'sales-rep-1', email: 'sales@heymandiamond.com' },
  permissions: { can_manage_inventory: false },
}

test('Feature 3: Magic Bytes Verification — strictly accepts valid formats and rejects malicious/fake files', () => {
  // Valid JPEG
  const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
  const jpegRes = verifyMagicBytes(jpegBuf, 'image')
  assert.equal(jpegRes.valid, true)
  assert.equal(jpegRes.mime, 'image/jpeg')

  // Valid PNG
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
  const pngRes = verifyMagicBytes(pngBuf, 'image')
  assert.equal(pngRes.valid, true)
  assert.equal(pngRes.mime, 'image/png')

  // Valid WEBP (RIFF .... WEBP)
  const webpBuf = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP'),
  ])
  const webpRes = verifyMagicBytes(webpBuf, 'image')
  assert.equal(webpRes.valid, true)
  assert.equal(webpRes.mime, 'image/webp')

  // Valid MP4 (box header with ftyp)
  const mp4Buf = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])
  const mp4Res = verifyMagicBytes(mp4Buf, 'video')
  assert.equal(mp4Res.valid, true)
  assert.equal(mp4Res.mime, 'video/mp4')

  // Valid WEBM (1A 45 DF A3)
  const webmBuf = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81])
  const webmRes = verifyMagicBytes(webmBuf, 'video')
  assert.equal(webmRes.valid, true)
  assert.equal(webmRes.mime, 'video/webm')

  // REJECT: Fake image disguised with SVG payload (<svg xmlns="http://www.w3.org/2000/svg">)
  const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  assert.equal(verifyMagicBytes(svgPayload, 'image').valid, false)

  // REJECT: HTML disguised file
  const htmlPayload = Buffer.from('<!DOCTYPE html><html><body><h1>XSS</h1></body></html>')
  assert.equal(verifyMagicBytes(htmlPayload, 'image').valid, false)

  // REJECT: XML payload
  const xmlPayload = Buffer.from('<?xml version="1.0"?><data></data>')
  assert.equal(verifyMagicBytes(xmlPayload, 'image').valid, false)

  // REJECT: Empty / Short buffer
  assert.equal(verifyMagicBytes(Buffer.from([]), 'image').valid, false)
  assert.equal(verifyMagicBytes(Buffer.from([0x01, 0x02]), 'image').valid, false)

  // REJECT: Type mismatch (MP4 header provided when image expected)
  assert.equal(verifyMagicBytes(mp4Buf, 'image').valid, false)
})

test('Feature 3: Media Upload URL — Authorization, Format Whitelist & Quotas', async () => {
  resetMemoryMediaStore([])

  // 1. Non-admin is rejected 401
  const res1 = createMockRes()
  await handleGetMediaUploadUrl(createMockReq({}, {}), res1, null, 'HMD-LG-1001')
  assert.equal(res1.statusCode, 401)

  // 2. Staff without can_manage_inventory is rejected 403
  const res2 = createMockRes()
  await handleGetMediaUploadUrl(createMockReq({}, {}), res2, unauthorizedAdmin, 'HMD-LG-1001')
  assert.equal(res2.statusCode, 403)

  // 3. Disallowed file formats (.svg, .html, .exe, .sh) are rejected 400
  const disallowedFormats = ['test.svg', 'exploit.html', 'malware.exe', 'script.sh']
  for (const filename of disallowedFormats) {
    const res = createMockRes()
    const req = createMockReq({}, { type: 'image', fileName: filename, fileSize: 1024 })
    await handleGetMediaUploadUrl(req, res, authorizedAdmin, 'HMD-LG-1001')
    assert.equal(res.statusCode, 400, `Expected 400 for ${filename}`)
    assert.match(res.json.error, /Disallowed file format/)
  }

  // 4. Oversized files rejected (Image > 5MB, Video > 50MB)
  const resImageOver = createMockRes()
  await handleGetMediaUploadUrl(
    createMockReq({}, { type: 'image', fileName: 'huge.jpg', fileSize: MAX_IMAGE_BYTES + 1024 }),
    resImageOver,
    authorizedAdmin,
    'HMD-LG-1001'
  )
  assert.equal(resImageOver.statusCode, 400)
  assert.match(resImageOver.json.error, /Image size exceeds the maximum allowed limit of 5 MB/)

  const resVideoOver = createMockRes()
  await handleGetMediaUploadUrl(
    createMockReq({}, { type: 'video', fileName: 'movie.mp4', fileSize: MAX_VIDEO_BYTES + 1024 }),
    resVideoOver,
    authorizedAdmin,
    'HMD-LG-1001'
  )
  assert.equal(resVideoOver.statusCode, 400)
  assert.match(resVideoOver.json.error, /Video size exceeds the maximum allowed limit of 50 MB/)

  // 5. Successful upload URL generation for valid image
  const resValid = createMockRes()
  await handleGetMediaUploadUrl(
    createMockReq({}, { type: 'image', fileName: 'diamond-photo.png', fileSize: 2 * 1024 * 1024 }),
    resValid,
    authorizedAdmin,
    'HMD-LG-1001'
  )
  assert.equal(resValid.statusCode, 200)
  assert.equal(resValid.json.success, true)
  assert.match(resValid.json.storagePath, /^diamonds\/HMD-LG-1001\/[a-f0-9-]+\.png$/)
  assert.ok(resValid.json.uploadUrl)
})

test('Feature 3: Media Upload Confirm, Reorder, Set Primary and Delete Lifecycle', async () => {
  resetMemoryMediaStore([])

  const diamondId = 'HMD-TEST-9999'

  // Step 1: Upload and confirm item 1 (JPEG image)
  const validJpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).toString('base64')
  const storagePath1 = `diamonds/${diamondId}/uuid-image-1.jpg`

  const resConf1 = createMockRes()
  await handleConfirmMediaUpload(
    createMockReq({}, {
      storagePath: storagePath1,
      type: 'image',
      altText: 'Top table view of test diamond',
      headerBase64: validJpegHeader,
      isPrimary: true,
    }),
    resConf1,
    authorizedAdmin,
    diamondId
  )
  assert.equal(resConf1.statusCode, 201)
  assert.equal(resConf1.json.success, true)
  const item1 = resConf1.json.media
  assert.equal(item1.is_primary, true)
  assert.equal(item1.type, 'image')

  // Step 2: Upload and confirm item 2 (MP4 video)
  const validMp4Header = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]).toString('base64')
  const storagePath2 = `diamonds/${diamondId}/uuid-video-2.mp4`

  const resConf2 = createMockRes()
  await handleConfirmMediaUpload(
    createMockReq({}, {
      storagePath: storagePath2,
      type: 'video',
      altText: '360 degree video spin',
      headerBase64: validMp4Header,
      isPrimary: false,
    }),
    resConf2,
    authorizedAdmin,
    diamondId
  )
  assert.equal(resConf2.statusCode, 201)
  const item2 = resConf2.json.media
  assert.equal(item2.is_primary, false)
  assert.equal(item2.type, 'video')

  // Step 3: Public GET /api/diamonds/:id/media returns both items in sort order
  const resGet = createMockRes()
  await handleGetDiamondMedia(createMockReq(), resGet, diamondId)
  assert.equal(resGet.statusCode, 200)
  assert.equal(resGet.json.items.length, 2)
  assert.equal(resGet.json.items[0].id, item1.id)
  assert.equal(resGet.json.items[1].id, item2.id)

  // Step 4: Reorder and Set Primary on item 2
  const resUpdate = createMockRes()
  await handleUpdateMediaItem(
    createMockReq({}, { isPrimary: true, sortOrder: 0, altText: 'New Primary Video' }),
    resUpdate,
    authorizedAdmin,
    diamondId,
    item2.id
  )
  assert.equal(resUpdate.statusCode, 200)

  // Verify item 2 is now primary, and item 1 is not primary
  const memStore = getMemoryMediaStore()
  const mem2 = memStore.find(m => m.id === item2.id)
  const mem1 = memStore.find(m => m.id === item1.id)
  assert.equal(mem2.is_primary, true)
  assert.equal(mem1.is_primary, false)
  assert.equal(mem2.alt_text, 'New Primary Video')

  // Step 5: Path Traversal Attack on confirm is blocked
  const resMalicious = createMockRes()
  await handleConfirmMediaUpload(
    createMockReq({}, {
      storagePath: `diamonds/${diamondId}/../../../etc/passwd.jpg`,
      type: 'image',
    }),
    resMalicious,
    authorizedAdmin,
    diamondId
  )
  assert.equal(resMalicious.statusCode, 400)
  assert.match(resMalicious.json.error, /Invalid or unauthorized storage path/)

  // Step 6: Delete item 1
  const resDelete = createMockRes()
  await handleDeleteMediaItem(createMockReq(), resDelete, authorizedAdmin, diamondId, item1.id)
  assert.equal(resDelete.statusCode, 200)

  const resGetAfterDelete = createMockRes()
  await handleGetDiamondMedia(createMockReq(), resGetAfterDelete, diamondId)
  assert.equal(resGetAfterDelete.json.items.length, 1)
  assert.equal(resGetAfterDelete.json.items[0].id, item2.id)
})

test('Feature 3: Content-Security-Policy includes frame-src for 360 viewer iframes', async () => {
  const { CSP_HEADER } = await import('../server/services/shared.mjs')
  assert.match(CSP_HEADER, /frame-src 'self' https: blob:/, 'CSP must allow frame-src for 360 viewer iframes')
  assert.match(CSP_HEADER, /img-src 'self' data: blob: https:/, 'CSP must allow img-src https: for CDN images')
})

test('Feature 3: Diamond Media Resolver strictly avoids false diamond stock photos', async () => {
  const {
    getDiamondMedia,
    isDirectVideoFile,
    isInteractiveVideoViewer,
    DIAMOND_PLACEHOLDER_SVG,
  } = await import('../src/diamondUtils.ts')

  // 1. Diamonds with no image URL return the neutral placeholder SVG (never stock photos)
  const noImageStones = [
    { shape: 'Round', category: 'Certified Diamonds' },
    { shape: 'Emerald', category: 'Solitaire Non-Certified Diamonds' },
    { shape: 'Trilliant', category: 'Matched Pairs' },
    { shape: 'Oval', category: 'Loose Fancy Diamonds' },
    { shape: 'Round', category: 'Round Melee Diamonds' },
  ]

  for (const stone of noImageStones) {
    const res = getDiamondMedia(stone)
    assert.equal(res.imageUrl, DIAMOND_PLACEHOLDER_SVG, `Stone ${stone.shape} in ${stone.category} must not show stock photo`)
    assert.equal(res.isFallback, true)
    assert.equal(res.hasActualImage, false)
    assert.doesNotMatch(res.imageUrl, /\.jpg$/, 'Must never return .jpg stock photos')
    assert.doesNotMatch(res.imageUrl, /unsplash/, 'Must never return unsplash stock photos')
  }

  // 2. Diamond with genuine image URL retains genuine image
  const genuineStone = {
    shape: 'Round',
    imageUrl: 'https://view.gem360.in/imaged/0809261803-HM-398/still.jpg',
    videoUrl: 'https://view.gem360.in/gem360.html?d=0809261803-HM-398',
  }
  const genuineRes = getDiamondMedia(genuineStone)
  assert.equal(genuineRes.imageUrl, 'https://view.gem360.in/imaged/0809261803-HM-398/still.jpg')
  assert.equal(genuineRes.isFallback, false)
  assert.equal(genuineRes.hasActualImage, true)
  assert.equal(genuineRes.hasActualVideo, true)
  assert.equal(genuineRes.isVideoViewer, true)

  // 3. Diamond with video URL but NO image URL
  const videoOnlyStone = {
    shape: 'Round',
    videoUrl: 'https://dnaimages.s3.ap-south-1.amazonaws.com/videos/Vision360.html?d=749593252&v=6&btn=1,2,3,5,6',
  }
  const videoOnlyRes = getDiamondMedia(videoOnlyStone)
  assert.equal(videoOnlyRes.imageUrl, DIAMOND_PLACEHOLDER_SVG)
  assert.equal(videoOnlyRes.isFallback, true)
  assert.equal(videoOnlyRes.hasActualImage, false)
  assert.equal(videoOnlyRes.hasActualVideo, true)
  assert.equal(videoOnlyRes.isVideoViewer, true)

  // 4. Misplaced HTML viewer in imageUrl gets routed safely
  const misplacedViewerStone = {
    shape: 'Emerald',
    imageUrl: 'https://view.gem360.in/gem360/2009230847-HD-10344/gem360-2009230847-HD-10344.html',
    videoUrl: null,
  }
  const misplacedRes = getDiamondMedia(misplacedViewerStone)
  assert.equal(misplacedRes.imageUrl, DIAMOND_PLACEHOLDER_SVG)
  assert.equal(misplacedRes.hasActualImage, false)
  assert.equal(misplacedRes.hasActualVideo, true)
  assert.equal(misplacedRes.videoUrl, 'https://view.gem360.in/gem360/2009230847-HD-10344/gem360-2009230847-HD-10344.html')
  assert.equal(misplacedRes.isVideoViewer, true)

  // 5. isDirectVideoFile vs isInteractiveVideoViewer classifications
  assert.equal(isDirectVideoFile('https://cdn.example.com/stone.mp4'), true)
  assert.equal(isDirectVideoFile('https://cdn.example.com/stone.webm?token=123'), true)
  assert.equal(isDirectVideoFile('https://view.gem360.in/gem360.html?d=123'), false)
  assert.equal(isDirectVideoFile('https://dnaimages.s3.ap-south-1.amazonaws.com/videos/Vision360.html?d=749593252'), false)

  assert.equal(isInteractiveVideoViewer('https://view.gem360.in/gem360.html?d=123'), true)
  assert.equal(isInteractiveVideoViewer('https://dnaimages.s3.ap-south-1.amazonaws.com/videos/Vision360.html?d=749593252'), true)
  assert.equal(isInteractiveVideoViewer('https://v360.in/viewer4.0/vision360.html?d=xyz'), true)
  assert.equal(isInteractiveVideoViewer('https://cdn.example.com/stone.mp4'), false)
})


