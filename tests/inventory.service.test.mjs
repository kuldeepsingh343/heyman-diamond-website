import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCSV,
  parseDiamondSpreadsheet,
  generateInventoryTemplate,
  filterInventory,
  normalizeFlomizProduct,
  isFlomizConfigured,
  getFlomizApiKey,
  getFlomizBaseUrl,
  setFlomizConfig,
  cleanFlomizBaseUrl,
  handleUploadInventory,
} from '../server/services/inventory.mjs'
import { handleRefreshToken } from '../server/services/auth.mjs'

test('Inventory Service — CSV and TSV Parsing', () => {
  const standardCsv = 'SKU,Shape,Carat\nHMD-1,Round,1.5\nHMD-2,Oval,2.0'
  const parsed = parseCSV(standardCsv)
  assert.equal(parsed.length, 3)
  assert.deepEqual(parsed[0], ['SKU', 'Shape', 'Carat'])
  assert.deepEqual(parsed[1], ['HMD-1', 'Round', '1.5'])

  const quotedCsv = 'SKU,Measurements\nHMD-1,"7.35 x 7.39 x 4.52, mm"\nHMD-2,"10.12, 7.15 mm"'
  const parsedQuoted = parseCSV(quotedCsv)
  assert.equal(parsedQuoted[1][1], '7.35 x 7.39 x 4.52, mm')

  const tsv = 'SKU\tShape\tCarat\nHMD-3\tEmerald\t2.5'
  const parsedTsv = parseCSV(tsv)
  assert.equal(parsedTsv.length, 2)
  assert.equal(parsedTsv[1][1], 'Emerald')
})

test('Inventory Service — Diamond Spreadsheet Normalization and Validation', () => {
  const validCsv = `
SKU,Shape,Carat,Color,Clarity,Cut,Polish,Symmetry,Fluorescence,Lab,Certificate Number,Price,Wholesale Price
HMD-101,Round,1.52,E,VVS2,Ideal,Excellent,Excellent,None,IGI,LG624918231,1850,1350
HMD-102,Oval,2.05,F,VS1,Excellent,Excellent,Very Good,None,IGI,LG628104928,2650,1950
HMD-BAD,Radiant,INVALID_CARAT,D,VS2,Excellent,Excellent,Excellent,None,IGI,LG999,3000,2100
`.trim()

  const result = parseDiamondSpreadsheet(validCsv)
  assert.equal(result.items.length, 2)
  assert.equal(result.skipped.length, 1)
  assert.equal(result.skipped[0].reason.includes('Invalid carat'), true)

  const firstDiamond = result.items[0]
  assert.equal(firstDiamond.sku, 'HMD-101')
  assert.equal(firstDiamond.shape, 'Round')
  assert.equal(firstDiamond.carat, 1.52)
  assert.equal(firstDiamond.color, 'E')
  assert.equal(firstDiamond.clarity, 'VVS2')
  assert.equal(firstDiamond.price, 1850)
  assert.equal(firstDiamond.wholesalePrice, 1350)
  assert.equal(firstDiamond.lab, 'IGI')
  assert.equal(firstDiamond.certificateNumber, 'LG624918231')

  assert.throws(() => {
    parseDiamondSpreadsheet('Random,Header,Only\n1,2,3')
  }, /must contain at least "Carat" and "Shape" columns/)
})

test('Inventory Service — 4Cs Filtering and Search', () => {
  const inventory = [
    { sku: 'HMD-001', shape: 'Round', carat: 1.05, color: 'D', clarity: 'VVS1', cut: 'Ideal', lab: 'IGI', price: 1500, certificateNumber: 'LG1' },
    { sku: 'HMD-002', shape: 'Round', carat: 2.10, color: 'G', clarity: 'VS2', cut: 'Excellent', lab: 'GIA', price: 2800, certificateNumber: 'GIA2' },
    { sku: 'HMD-003', shape: 'Emerald', carat: 2.50, color: 'E', clarity: 'VVS2', cut: 'Ideal', lab: 'IGI', price: 4200, certificateNumber: 'LG3' },
    { sku: 'HMD-004', shape: 'Oval', carat: 3.20, color: 'F', clarity: 'SI1', cut: 'Very Good', lab: 'IGI', price: 3900, certificateNumber: 'LG4' },
  ]

  const shapeFiltered = filterInventory(inventory, { shape: 'Round' })
  assert.equal(shapeFiltered.length, 2)

  const caratFiltered = filterInventory(inventory, { minCarat: '2.0', maxCarat: '3.0' })
  assert.equal(caratFiltered.length, 2)
  assert.deepEqual(caratFiltered.map(i => i.sku), ['HMD-002', 'HMD-003'])

  const colorFiltered = filterInventory(inventory, { color: 'D,E' })
  assert.equal(colorFiltered.length, 2)

  const priceFiltered = filterInventory(inventory, { maxPrice: '2000' })
  assert.equal(priceFiltered.length, 1)
  assert.equal(priceFiltered[0].sku, 'HMD-001')

  const searchFiltered = filterInventory(inventory, { q: 'GIA2' })
  assert.equal(searchFiltered.length, 1)
  assert.equal(searchFiltered[0].sku, 'HMD-002')

  // Normalized and flexible shape matching
  const cushionFiltered = filterInventory([
    { sku: 'C1', shape: 'Square Cushion' },
    { sku: 'C2', shape: 'Round' },
    { sku: 'C3', shape: 'Square-Radiant' },
  ], { shape: 'square cushion' })
  assert.equal(cushionFiltered.length, 1)
  assert.equal(cushionFiltered[0].sku, 'C1')
})

test('Inventory Service — Downloadable CSV Template', () => {
  const template = generateInventoryTemplate()
  assert.equal(template.includes('SKU,Category,Shape,Carat,Color,Clarity'), true)
  assert.equal(template.includes('Loose Fancy Diamonds'), true)
  assert.equal(template.includes('Round Melee Diamonds'), true)
  assert.equal(template.includes('Round'), true)
  assert.equal(template.includes('LG624918231'), true)
})

test('Inventory Service — Multi-Category Spreadsheet Parsing and Normalization', () => {
  const multiCatCsv = `
SKU,Category,Shape,Carat,Color,Clarity,Price,Wholesale Price
HMD-CAT-1,Round Melee Diamonds,Round,0.05,F,VS,50,35
HMD-CAT-2,Loose Fancy Diamonds,Oval,1.50,E,VVS2,1800,1300
HMD-CAT-3,Matched Pairs,Pear,2.00,D,VVS1,2500,1900
HMD-CAT-4,Certified Diamonds,Princess,1.20,G,VS1,1200,900
HMD-CAT-5,Solitaire Non-Certified Diamonds,Cushion,2.20,Fancy Yellow,VS2,2100,1600
`.trim()

  const result = parseDiamondSpreadsheet(multiCatCsv, 'all')
  assert.equal(result.items.length, 5)
  assert.equal(result.items[0].category, 'Round Melee Diamonds')
  assert.equal(result.items[1].category, 'Loose Fancy Diamonds')
  assert.equal(result.items[2].category, 'Matched Pairs')
  assert.equal(result.items[3].category, 'Certified Diamonds')
  assert.equal(result.items[4].category, 'Solitaire Non-Certified Diamonds')
})

test('Inventory Service — Flomiz Product Normalization', () => {
  const rawSample = {
    SerialNo: 106,
    ProductName: 'DBS138-734',
    SKU: '843855',
    CategoryName: 'Loose Diamond',
    Branch: 'HARI DIAMOND',
    Lab: 'IGI',
    ProductStatus: 'Available',
    Stock: 2.05,
    CommittedStock: 0,
    AvailableForSale: 2.05,
    RapPrice: 0,
    RapBack: '',
    RapBackValue: 0,
    PricePerCarat: 120,
    TotalPrice: 246,
    OPStock: 0,
    QuantityIN: 2.05,
    QuantityOUT: 0,
    SOStock: 0,
    POStock: 0,
    lstImages: [{ eProductImageType: 1, SerialNo: 1, base64FileByte: '' }],
    Color: 'D',
    Clarity: 'VVS2',
    Shape: 'Round',
    Cut: 'EX',
    CertificateNo: '7451501803',
    Measurement: '8.12 x 8.16 x 5.01 mm',
    Polish: 'EX',
    Symmetry: 'EX',
    Fluorescence: 'NONE',
  }

  const normalized = normalizeFlomizProduct(rawSample)
  assert.equal(normalized.sku, '843855')
  assert.equal(normalized.shape, 'Round')
  assert.equal(normalized.carat, 2.05)
  assert.equal(normalized.color, 'D')
  assert.equal(normalized.clarity, 'VVS2')
  assert.equal(normalized.cut, 'EX')
  assert.equal(normalized.lab, 'IGI')
  assert.equal(normalized.certificateNumber, '7451501803')
  assert.equal(normalized.wholesalePrice, 246)
  assert.equal(normalized.price, Math.round(246 * 1.30))
  assert.equal(normalized.measurements, '8.12 x 8.16 x 5.01 mm')
  assert.equal(normalized.source, 'flomiz_api')
  assert.equal(normalized.status, 'available')

  // Test omitted fields fallback
  const minimal = normalizeFlomizProduct({ SKU: 'MIN-001', Stock: 1.5 })
  assert.equal(minimal.sku, 'MIN-001')
  assert.equal(minimal.carat, 1.5)
  assert.equal(minimal.shape, 'Round')
  assert.equal(minimal.color, 'G')
  assert.equal(minimal.clarity, 'VS1')
  assert.equal(minimal.certificateNumber, 'N/A')

  // Test invalid input
  assert.equal(normalizeFlomizProduct(null), null)
  assert.equal(normalizeFlomizProduct({}), null)

  // Test API key configuration helper
  assert.equal(typeof getFlomizApiKey(), 'string')
  process.env.FLOMIZ_API_KEY = 'test_key_123'
  assert.equal(isFlomizConfigured(), true)
  assert.equal(getFlomizApiKey(), 'test_key_123')
  delete process.env.FLOMIZ_API_KEY
  assert.equal(isFlomizConfigured(), false)

  // Test URL cleaning and normalization
  assert.equal(cleanFlomizBaseUrl('https://www.billing.flomiz.com'), 'https://billing.flomiz.com')
  assert.equal(cleanFlomizBaseUrl('www.billing.flomiz.com'), 'https://billing.flomiz.com')
  assert.equal(cleanFlomizBaseUrl('https://diamond.flomiz.com/'), 'https://diamond.flomiz.com')
  assert.equal(cleanFlomizBaseUrl('diamond.flomiz.com'), 'https://diamond.flomiz.com')
  assert.equal(cleanFlomizBaseUrl(''), 'https://diamond.flomiz.com')

  // Test setFlomizConfig normalization
  setFlomizConfig('my_key', 'https://www.billing.flomiz.com/')
  assert.equal(getFlomizBaseUrl(), 'https://billing.flomiz.com')
  assert.equal(getFlomizApiKey(), 'my_key')
  setFlomizConfig('', 'https://diamond.flomiz.com')
})

test('Inventory Upload — Supports large spreadsheet uploads (> 100KB) without 413 error', async () => {
  const rows = ['SKU,Shape,Carat,Color,Clarity,Cut,Price,Wholesale Price']
  for (let i = 1; i <= 2500; i++) {
    rows.push(`HMD-BULK-${i},Round,1.00,D,VVS1,Ideal,1500,1000`)
  }
  const largeCsv = rows.join('\n')
  assert.ok(largeCsv.length > 100000, 'Payload must be > 100KB to test limit elevation')

  const admin = {
    user: { id: 'af4c0658-56f0-4325-b8e4-6cf338ac6004', email: 'heymandiamondllc@gmail.com' },
    role: 'super_admin',
    permissions: { can_manage_inventory: true },
  }

  async function* generator() {
    yield Buffer.from(JSON.stringify({ fileContent: largeCsv, mode: 'append' }))
  }
  const req = generator()
  req.headers = { 'content-type': 'application/json' }

  let statusCode = null
  let body = ''
  const res = {
    writeHead(code) { statusCode = code },
    end(data) { body = data || '' },
  }

  await handleUploadInventory(req, res, admin)
  assert.equal(statusCode, 200)
  const jsonRes = JSON.parse(body)
  assert.equal(jsonRes.success, true)
  assert.equal(jsonRes.importedCount, 2500)
})

test('Inventory Upload — Mode "overwrite" updates matching SKUs and adds new ones', async () => {
  const admin = {
    user: { id: 'admin-mode-test-1', email: 'director@heymandiamond.com' },
    role: 'super_admin',
    permissions: { can_manage_inventory: true },
  }

  // Initial upload of stone D-100 with price 1000
  const initialCsv = 'SKU,Shape,Carat,Color,Clarity,Cut,Price,Wholesale Price\nD-100,Round,1.00,D,VVS1,Ideal,1000,750'
  async function* gen1() { yield Buffer.from(JSON.stringify({ fileContent: initialCsv, mode: 'overwrite' })) }
  const req1 = gen1()
  req1.headers = { 'content-type': 'application/json' }
  let sc1 = null; let b1 = ''
  await handleUploadInventory(req1, { writeHead(c) { sc1 = c }, end(d) { b1 = d || '' } }, admin)
  assert.equal(sc1, 200)

  // Re-upload with overwrite mode: update D-100 price to 1250 and add D-101
  const updateCsv = 'SKU,Shape,Carat,Color,Clarity,Cut,Price,Wholesale Price\nD-100,Round,1.00,D,VVS1,Ideal,1250,900\nD-101,Oval,2.00,E,VS1,Excellent,2000,1500'
  async function* gen2() { yield Buffer.from(JSON.stringify({ fileContent: updateCsv, mode: 'overwrite' })) }
  const req2 = gen2()
  req2.headers = { 'content-type': 'application/json' }
  let sc2 = null; let b2 = ''
  await handleUploadInventory(req2, { writeHead(c) { sc2 = c }, end(d) { b2 = d || '' } }, admin)
  assert.equal(sc2, 200)
  const json2 = JSON.parse(b2)
  assert.equal(json2.success, true)
  assert.equal(json2.mode, 'overwrite')
  assert.equal(json2.overwrittenCount, 1)
  assert.equal(json2.newCount, 1)
})

test('Inventory Upload — Mode "skip_duplicate" preserves existing stones and skips duplicate SKUs', async () => {
  const admin = {
    user: { id: 'admin-mode-test-2', email: 'director@heymandiamond.com' },
    role: 'super_admin',
    permissions: { can_manage_inventory: true },
  }

  // Upload D-200 with initial price 2000
  const initialCsv = 'SKU,Shape,Carat,Color,Clarity,Cut,Price,Wholesale Price\nD-200,Round,1.50,F,VVS2,Ideal,2000,1500'
  async function* gen1() { yield Buffer.from(JSON.stringify({ fileContent: initialCsv, mode: 'overwrite' })) }
  const req1 = gen1()
  req1.headers = { 'content-type': 'application/json' }
  let sc1 = null; let b1 = ''
  await handleUploadInventory(req1, { writeHead(c) { sc1 = c }, end(d) { b1 = d || '' } }, admin)
  assert.equal(sc1, 200)

  // Upload again with mode: 'skip_duplicate', attempting to alter D-200 price to 9999 and introducing D-201
  const duplicateCsv = 'SKU,Shape,Carat,Color,Clarity,Cut,Price,Wholesale Price\nD-200,Round,1.50,F,VVS2,Ideal,9999,8888\nD-201,Emerald,3.00,G,VS2,Excellent,3500,2800'
  async function* gen2() { yield Buffer.from(JSON.stringify({ fileContent: duplicateCsv, mode: 'skip_duplicate' })) }
  const req2 = gen2()
  req2.headers = { 'content-type': 'application/json' }
  let sc2 = null; let b2 = ''
  await handleUploadInventory(req2, { writeHead(c) { sc2 = c }, end(d) { b2 = d || '' } }, admin)
  assert.equal(sc2, 200)
  const json2 = JSON.parse(b2)
  assert.equal(json2.success, true)
  assert.equal(json2.mode, 'skip_duplicate')
  assert.equal(json2.importedCount, 1) // Only D-201 imported
  assert.equal(json2.skippedDuplicatesCount, 1) // D-200 skipped
})

test('Auth Service — handleRefreshToken validates refresh token', async () => {
  async function* gen1() { yield Buffer.from(JSON.stringify({})) }
  const req1 = gen1()
  let sc1 = null
  let b1 = ''
  const res1 = { writeHead(c) { sc1 = c }, end(d) { b1 = d || '' } }
  await handleRefreshToken(req1, res1)
  assert.equal(sc1, 400)
  assert.match(JSON.parse(b1).error, /Refresh token is required/i)
})



