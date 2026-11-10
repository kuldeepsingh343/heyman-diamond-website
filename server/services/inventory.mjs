import fs from 'node:fs'
import path from 'node:path'
import { json, bodyJson, db, supabaseReady } from './shared.mjs'
import {
  computeDiscount,
  processDiamondPricingUpdates,
  roundMoney,
  roundPercent,
} from './pricing.mjs'

// ── Flomiz Stock Pull API Configuration ─────────────────────────────────────
const FLOMIZ_CONFIG_FILE = path.resolve(process.cwd(), '.flomiz_config.json')

let dynamicFlomizConfig = {
  apiKey: null,
  baseUrl: null,
}

// Attempt to load persisted config if present
try {
  if (fs.existsSync(FLOMIZ_CONFIG_FILE)) {
    const raw = fs.readFileSync(FLOMIZ_CONFIG_FILE, 'utf8')
    const saved = JSON.parse(raw)
    if (saved.apiKey) dynamicFlomizConfig.apiKey = saved.apiKey
    if (saved.baseUrl) dynamicFlomizConfig.baseUrl = saved.baseUrl
  }
} catch {
  // ignore
}

const ALLOWED_FLOMIZ_HOST_PATTERNS = [
  /^([a-zA-Z0-9-]+\.)*flomiz\.com$/i,
]

export function isAllowedFlomizUrl(rawUrl) {
  try {
    let testUrl = String(rawUrl || '').trim()
    if (!testUrl) return true
    if (!/^https?:\/\//i.test(testUrl)) testUrl = `https://${testUrl}`
    const parsed = new URL(testUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false

    if (process.env.NODE_ENV !== 'production' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return true
    }

    return ALLOWED_FLOMIZ_HOST_PATTERNS.some(p => p.test(parsed.hostname))
  } catch {
    return false
  }
}

export function cleanFlomizBaseUrl(rawUrl) {
  if (!rawUrl) return 'https://diamond.flomiz.com'
  let url = String(rawUrl).trim()
  if (/^www\.billing\.flomiz\.com/i.test(url)) {
    url = 'https://billing.flomiz.com'
  } else if (/^https?:\/\/www\.billing\.flomiz\.com/i.test(url)) {
    url = url.replace(/www\./i, '')
  } else if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`
  }

  // SSRF defense: enforce allowed domain pattern
  if (!isAllowedFlomizUrl(url)) {
    return 'https://diamond.flomiz.com'
  }

  return url.replace(/\/+$/, '')
}

export const getFlomizApiKey = () => (dynamicFlomizConfig.apiKey ?? (process.env.FLOMIZ_API_KEY || process.env.FLOMIZ_KEY || '')).trim()
export const getFlomizBaseUrl = () => cleanFlomizBaseUrl(dynamicFlomizConfig.baseUrl ?? (process.env.FLOMIZ_BASE_URL || process.env.FLOMIZ_STOCK_URL || 'https://diamond.flomiz.com'))
export function setFlomizConfig(apiKey, baseUrl) {
  if (apiKey !== undefined) dynamicFlomizConfig.apiKey = String(apiKey || '').trim()
  if (baseUrl !== undefined) dynamicFlomizConfig.baseUrl = cleanFlomizBaseUrl(baseUrl)

  try {
    fs.writeFileSync(FLOMIZ_CONFIG_FILE, JSON.stringify({
      apiKey: dynamicFlomizConfig.apiKey,
      baseUrl: dynamicFlomizConfig.baseUrl,
      updatedAt: new Date().toISOString(),
    }, null, 2), 'utf8')
  } catch {
    // ignore
  }
}

export function isFlomizConfigured() {
  const key = getFlomizApiKey()
  return Boolean(key && key.length > 0)
}

// In-memory inventory store for instant uploads and fallback caching
let memoryInventory = [
  {
    id: 'seed-hmd-lg-1001',
    sku: 'HMD-LG-1001',
    category: 'Certified Diamonds',
    shape: 'Round',
    carat: 1.52,
    color: 'E',
    clarity: 'VVS2',
    cut: 'Ideal',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'None',
    lab: 'IGI',
    certificateNumber: 'LG624918231',
    price: 1850,
    customerPrice: 1850,
    customerDiscountPrice: 1480,
    customerDiscountPercent: 20,
    wholesalePrice: 1350,
    dealerPrice: 1350,
    dealerDiscountPrice: 1080,
    dealerDiscountPercent: 20,
    measurements: '7.38 x 7.42 x 4.55 mm',
    imageUrl: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=800&q=85',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-diamond-rotating-on-a-black-background-41584-large.mp4',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-lg-1002',
    sku: 'HMD-LG-1002',
    category: 'Certified Diamonds',
    shape: 'Oval',
    carat: 2.05,
    color: 'F',
    clarity: 'VS1',
    cut: 'Excellent',
    polish: 'Excellent',
    symmetry: 'Very Good',
    fluorescence: 'None',
    lab: 'IGI',
    certificateNumber: 'LG628104928',
    price: 2650,
    wholesalePrice: 1950,
    measurements: '10.12 x 7.15 x 4.48 mm',
    imageUrl: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=85',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-diamond-rotating-on-a-black-background-41584-large.mp4',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-lg-1003',
    sku: 'HMD-LG-1003',
    category: 'Certified Diamonds',
    shape: 'Emerald',
    carat: 2.50,
    color: 'D',
    clarity: 'VVS1',
    cut: 'Ideal',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'None',
    lab: 'GIA',
    certificateNumber: '2487192831',
    price: 4200,
    wholesalePrice: 3100,
    measurements: '9.20 x 6.50 x 4.30 mm',
    imageUrl: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=85',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-diamond-rotating-on-a-black-background-41584-large.mp4',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-lg-1004',
    sku: 'HMD-LG-1004',
    category: 'Loose Fancy Diamonds',
    shape: 'Radiant',
    carat: 3.01,
    color: 'E',
    clarity: 'VS2',
    cut: 'Excellent',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'None',
    lab: 'IGI',
    certificateNumber: 'LG639201948',
    price: 4900,
    wholesalePrice: 3600,
    measurements: '9.80 x 7.40 x 4.90 mm',
    imageUrl: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=85',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-diamond-rotating-on-a-black-background-41584-large.mp4',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-lg-1005',
    sku: 'HMD-LG-1005',
    category: 'Loose Fancy Diamonds',
    shape: 'Pear',
    carat: 1.80,
    color: 'G',
    clarity: 'VS1',
    cut: 'Very Good',
    polish: 'Excellent',
    symmetry: 'Very Good',
    fluorescence: 'None',
    lab: 'IGI',
    certificateNumber: 'LG619028341',
    price: 2100,
    wholesalePrice: 1550,
    measurements: '10.50 x 6.70 x 4.10 mm',
    imageUrl: 'https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=800&q=85',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-diamond-rotating-on-a-black-background-41584-large.mp4',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-rm-2001',
    sku: 'HMD-RM-2001',
    category: 'Round Melee Diamonds',
    shape: 'Round',
    carat: 0.05,
    color: 'DEF',
    clarity: 'VVS-VS',
    cut: 'Ideal',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'None',
    lab: 'In-House',
    certificateNumber: 'Calibrated Parcel',
    price: 350,
    wholesalePrice: 240,
    measurements: '0.8mm - 2.5mm',
    imageUrl: '/round-melee-diamonds.jpg',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-diamond-rotating-on-a-black-background-41584-large.mp4',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-cp-3001',
    sku: 'HMD-CP-3001',
    category: 'Solitaire Non-Certified Diamonds',
    shape: 'Radiant',
    carat: 2.15,
    color: 'Fancy Vivid Pink',
    clarity: 'VS1',
    cut: 'Excellent',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'Faint',
    lab: 'In-House',
    certificateNumber: 'N/A',
    price: 3400,
    wholesalePrice: 2500,
    measurements: '8.40 x 6.20 x 4.10 mm',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-mp-4001',
    sku: 'HMD-MP-4001',
    category: 'Matched Pairs',
    shape: 'Pear',
    carat: 2.02,
    color: 'E',
    clarity: 'VVS2',
    cut: 'Ideal',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'None',
    lab: 'IGI',
    certificateNumber: 'LG652819001/02',
    price: 3600,
    wholesalePrice: 2650,
    measurements: '8.90 x 5.80 mm (Matched Pair)',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-lg-1006',
    sku: 'HMD-LG-1006',
    category: 'Certified Diamonds',
    shape: 'Princess',
    carat: 1.75,
    color: 'E',
    clarity: 'VVS1',
    cut: 'Ideal',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'None',
    lab: 'IGI',
    certificateNumber: 'LG641029182',
    price: 2450,
    wholesalePrice: 1800,
    measurements: '6.85 x 6.82 x 4.90 mm',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-lg-1007',
    sku: 'HMD-LG-1007',
    category: 'Certified Diamonds',
    shape: 'Cushion',
    carat: 2.20,
    color: 'F',
    clarity: 'VS1',
    cut: 'Excellent',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'None',
    lab: 'IGI',
    certificateNumber: 'LG649821033',
    price: 2950,
    wholesalePrice: 2150,
    measurements: '8.10 x 7.35 x 4.75 mm',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-lg-1008',
    sku: 'HMD-LG-1008',
    category: 'Certified Diamonds',
    shape: 'Asscher',
    carat: 2.08,
    color: 'D',
    clarity: 'VVS2',
    cut: 'Ideal',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'None',
    lab: 'IGI',
    certificateNumber: 'LG651039812',
    price: 3300,
    wholesalePrice: 2400,
    measurements: '7.15 x 7.12 x 4.85 mm',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-lf-1009',
    sku: 'HMD-LF-1009',
    category: 'Loose Fancy Diamonds',
    shape: 'Marquise',
    carat: 1.65,
    color: 'E',
    clarity: 'VS1',
    cut: 'Excellent',
    polish: 'Excellent',
    symmetry: 'Very Good',
    fluorescence: 'None',
    lab: 'IGI',
    certificateNumber: 'LG655910244',
    price: 2200,
    wholesalePrice: 1600,
    measurements: '12.40 x 6.10 x 3.85 mm',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-lf-1010',
    sku: 'HMD-LF-1010',
    category: 'Loose Fancy Diamonds',
    shape: 'Heart',
    carat: 1.50,
    color: 'Fancy Intense Pink',
    clarity: 'VVS2',
    cut: 'Excellent',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'None',
    lab: 'IGI',
    certificateNumber: 'LG660192841',
    price: 2850,
    wholesalePrice: 2050,
    measurements: '7.50 x 7.80 x 4.50 mm',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-mp-4002',
    sku: 'HMD-MP-4002',
    category: 'Matched Pairs',
    shape: 'Baguette',
    carat: 1.20,
    color: 'DEF',
    clarity: 'VVS',
    cut: 'Excellent',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'None',
    lab: 'In-House',
    certificateNumber: 'Matched Side Stone Pair',
    price: 1400,
    wholesalePrice: 980,
    measurements: '6.50 x 3.20 mm (Matched Pair)',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-hmd-cp-3002',
    sku: 'HMD-CP-3002',
    category: 'Solitaire Non-Certified Diamonds',
    shape: 'Square Cushion',
    carat: 2.55,
    color: 'Fancy Vivid Yellow',
    clarity: 'VS1',
    cut: 'Excellent',
    polish: 'Excellent',
    symmetry: 'Excellent',
    fluorescence: 'Medium',
    lab: 'In-House',
    certificateNumber: 'N/A',
    price: 3800,
    wholesalePrice: 2750,
    measurements: '8.10 x 8.05 x 5.15 mm',
    status: 'published',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
]

/**
 * Robust CSV/TSV parser supporting quotes, commas within quotes, and newlines.
 */
export function parseCSV(text, delimiter = ',') {
  const rows = []
  let currentRow = []
  let currentCell = ''
  let insideQuotes = false

  // Detect delimiter if not strictly specified
  if (text.includes('\t') && !text.includes(',')) delimiter = '\t'

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"'
        i++ // Skip escaped quote
      } else {
        insideQuotes = !insideQuotes
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentCell.trim())
      currentCell = ''
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++
      currentRow.push(currentCell.trim())
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow)
      }
      currentRow = []
      currentCell = ''
    } else {
      currentCell += char
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim())
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow)
    }
  }

  return rows
}

/**
 * Normalizes user-entered category strings to official catalog categories.
 */
export function normalizeCategoryName(raw) {
  if (!raw || typeof raw !== 'string') return null
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (cleaned.includes('melee') || cleaned.includes('sieve')) {
    return 'Round Melee Diamonds'
  }
  if (cleaned.includes('loosefancy') || cleaned.includes('fancy')) {
    return 'Loose Fancy Diamonds'
  }
  if (cleaned.includes('solitairenon') || cleaned.includes('noncertified') || cleaned.includes('solitaire') || cleaned.includes('color')) {
    return 'Solitaire Non-Certified Diamonds'
  }
  if (cleaned.includes('pair') || cleaned.includes('matched')) {
    return 'Matched Pairs'
  }
  if (cleaned.includes('certified') || cleaned.includes('solitaire')) {
    return 'Certified Diamonds'
  }
  return raw.trim()
}

/**
 * Normalizes diamond spreadsheet rows into structured inventory records.
 */
export function parseDiamondSpreadsheet(fileContent, defaultCategory = 'all') {
  const rows = parseCSV(fileContent)
  if (!rows || rows.length < 2) {
    throw new Error('Spreadsheet must contain a header row and at least one diamond row.')
  }

  const rawHeaders = rows[0].map(h => String(h || '').toLowerCase().trim().replace(/[^a-z0-9]/g, ''))

  // Mapping aliases to standard diamond fields
  const fieldAliases = {
    sku: ['sku', 'stock', 'stocknum', 'stocknumber', 'id', 'itemid', 'stoneid'],
    category: ['category', 'categoryname', 'type', 'diamondtype', 'group'],
    shape: ['shape', 'stoneshape', 'cutshape'],
    carat: ['carat', 'carats', 'weight', 'cts', 'caratweight', 'size'],
    color: ['color', 'colour', 'col'],
    clarity: ['clarity', 'cla', 'purity'],
    cut: ['cut', 'cutgrade', 'make'],
    polish: ['polish', 'pol'],
    symmetry: ['symmetry', 'sym'],
    fluorescence: ['fluorescence', 'fluor', 'flour', 'flr'],
    lab: ['lab', 'certlab', 'gradinglab', 'laboratory'],
    certificateNumber: ['certificatenumber', 'certnumber', 'certno', 'cert', 'reportnumber', 'reportno', 'reportnum'],
    price: ['price', 'customerprice', 'retailprice', 'priceusd', 'amount', 'totalprice', 'saleprice'],
    customerDiscountPrice: ['customerdiscountprice', 'discountprice', 'customerdiscount', 'retaildiscountprice'],
    customerDiscountPercent: ['customerdiscountpercent', 'discountpercent', 'discountpct', 'customerdiscountpct'],
    wholesalePrice: ['wholesaleprice', 'dealerprice', 'tradeprice', 'b2bprice', 'cost'],
    dealerDiscountPrice: ['dealerdiscountprice', 'wholesalediscountprice', 'dealerdiscount', 'b2bdiscountprice'],
    dealerDiscountPercent: ['dealerdiscountpercent', 'wholesalediscountpercent', 'dealerdiscountpct', 'b2bdiscountpct'],
    measurements: ['measurements', 'dimensions', 'measurement', 'size_mm'],
    imageUrl: ['imageurl', 'image', 'picture', 'photo', 'photourl'],
    videoUrl: ['videourl', 'video', '360video', 'movie'],
  }

  const headerIndices = {}
  for (const [standardKey, aliases] of Object.entries(fieldAliases)) {
    const index = rawHeaders.findIndex(h => aliases.includes(h))
    if (index !== -1) {
      headerIndices[standardKey] = index
    }
  }

  if (headerIndices.carat === undefined && headerIndices.shape === undefined) {
    throw new Error('Spreadsheet must contain at least "Carat" and "Shape" columns.')
  }

  const validItems = []
  const skippedRows = []

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    const getVal = key => (headerIndices[key] !== undefined ? row[headerIndices[key]] || '' : '')

    const rawCarat = getVal('carat')
    const carat = parseFloat(rawCarat)
    const shape = getVal('shape') || 'Round'
    const color = (getVal('color') || 'G').toUpperCase()
    const clarity = (getVal('clarity') || 'VS1').toUpperCase()
    const cut = getVal('cut') || 'Excellent'

    if (isNaN(carat) || carat <= 0) {
      skippedRows.push({ row: rowIndex + 1, reason: `Invalid carat weight: "${rawCarat}"` })
      continue
    }

    const price = parseFloat(getVal('price')) || 0
    const wholesalePrice = parseFloat(getVal('wholesalePrice')) || (price > 0 ? Math.round(price * 0.75) : 0)
    const sku = getVal('sku') || `HMD-UPL-${Date.now().toString().slice(-6)}-${rowIndex}`

    let customerDiscountPrice = null
    let customerDiscountPercent = null
    let dealerDiscountPrice = null
    let dealerDiscountPercent = null

    const rawCustDiscPrice = getVal('customerDiscountPrice')
    const rawCustDiscPct = getVal('customerDiscountPercent')
    if ((rawCustDiscPrice && String(rawCustDiscPrice).trim() !== '') || (rawCustDiscPct && String(rawCustDiscPct).trim() !== '')) {
      try {
        const disc = computeDiscount(price, rawCustDiscPrice, rawCustDiscPct)
        customerDiscountPrice = disc.discountPrice
        customerDiscountPercent = disc.discountPercent
      } catch (err) {
        skippedRows.push({ row: rowIndex + 1, sku, reason: `Customer discount validation failed: ${err.message}` })
        continue
      }
    }

    const rawDealDiscPrice = getVal('dealerDiscountPrice')
    const rawDealDiscPct = getVal('dealerDiscountPercent')
    if ((rawDealDiscPrice && String(rawDealDiscPrice).trim() !== '') || (rawDealDiscPct && String(rawDealDiscPct).trim() !== '')) {
      try {
        const disc = computeDiscount(wholesalePrice, rawDealDiscPrice, rawDealDiscPct)
        dealerDiscountPrice = disc.discountPrice
        dealerDiscountPercent = disc.discountPercent
      } catch (err) {
        skippedRows.push({ row: rowIndex + 1, sku, reason: `Dealer discount validation failed: ${err.message}` })
        continue
      }
    }

    const rawCat = getVal('category')
    const normalizedCat = normalizeCategoryName(rawCat)
    let category = normalizedCat
    if (!category) {
      if (defaultCategory && defaultCategory !== 'all' && defaultCategory !== 'All Categories') {
        category = normalizeCategoryName(defaultCategory) || defaultCategory
      } else {
        category = 'Loose Fancy Diamonds'
      }
    }

    const rowId = `upl-${sku.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-${rowIndex}`
    validItems.push({
      id: rowId,
      sku,
      category,
      shape: shape.charAt(0).toUpperCase() + shape.slice(1).toLowerCase(),
      carat,
      color,
      clarity,
      cut,
      polish: getVal('polish') || 'Excellent',
      symmetry: getVal('symmetry') || 'Very Good',
      fluorescence: getVal('fluorescence') || 'None',
      lab: (getVal('lab') || 'IGI').toUpperCase(),
      certificateNumber: getVal('certificateNumber') || 'N/A',
      price,
      customerPrice: price,
      customerDiscountPrice,
      customerDiscountPercent,
      wholesalePrice,
      dealerPrice: wholesalePrice,
      dealerDiscountPrice,
      dealerDiscountPercent,
      measurements: getVal('measurements') || 'N/A',
      imageUrl: getVal('imageUrl') || null,
      videoUrl: getVal('videoUrl') || null,
      status: 'published',
      source: 'excel_upload',
      updatedAt: new Date().toISOString(),
    })
  }

  return { items: validItems, skipped: skippedRows, totalProcessed: rows.length - 1 }
}

/**
 * Returns a downloadable CSV template with standard diamond columns, including Category.
 */
export function generateInventoryTemplate() {
  const headers = [
    'SKU',
    'Category',
    'Shape',
    'Carat',
    'Color',
    'Clarity',
    'Cut',
    'Polish',
    'Symmetry',
    'Fluorescence',
    'Lab',
    'Certificate Number',
    'Price (USD)',
    'Customer Discount Price',
    'Customer Discount %',
    'Wholesale Price (USD)',
    'Dealer Discount Price',
    'Dealer Discount %',
    'Measurements',
    'Image URL',
    'Video URL',
  ]
  const sample1 = [
    'HMD-001',
    'Loose Fancy Diamonds',
    'Round',
    '1.50',
    'E',
    'VVS2',
    'Ideal',
    'Excellent',
    'Excellent',
    'None',
    'IGI',
    'LG624918231',
    '1850',
    '1480',
    '20',
    '1350',
    '1080',
    '20',
    '7.35 x 7.39 x 4.52 mm',
    'https://example.com/images/hmd-001.jpg',
    'https://example.com/videos/hmd-001.mp4',
  ]
  const sample2 = [
    'HMD-002',
    'Certified Diamonds',
    'Oval',
    '2.01',
    'F',
    'VS1',
    'Excellent',
    'Excellent',
    'Very Good',
    'None',
    'IGI',
    'LG628104928',
    '2650',
    '',
    '',
    '1950',
    '',
    '',
    '1950',
    '10.12 x 7.15 x 4.48 mm',
    '',
    '',
  ]
  const sample3 = [
    'HMD-003',
    'Round Melee Diamonds',
    'Round',
    '0.05',
    'F-G',
    'VS-SI',
    'Very Good',
    'Very Good',
    'Good',
    'None',
    'None',
    'N/A',
    '45',
    '32',
    '2.4 mm',
    '',
    '',
  ]
  const sample4 = [
    'HMD-004',
    'Matched Pairs',
    'Pear',
    '1.00',
    'E',
    'VVS1',
    'Excellent',
    'Excellent',
    'Excellent',
    'None',
    'IGI',
    'LG629100122',
    '1400',
    '1050',
    '7.80 x 5.20 x 3.25 mm',
    '',
    '',
  ]
  const sample5 = [
    'HMD-005',
    'Solitaire Non-Certified Diamonds',
    'Cushion',
    '2.50',
    'Fancy Vivid Pink',
    'VVS2',
    'Excellent',
    'Excellent',
    'Excellent',
    'None',
    'None',
    'N/A',
    '3200',
    '2400',
    '8.10 x 7.95 x 5.10 mm',
    '',
    '',
  ]
  return [
    headers.join(','),
    sample1.join(','),
    sample2.join(','),
    sample3.join(','),
    sample4.join(','),
    sample5.join(','),
  ].join('\n')
}

/**
 * Normalizes a Flomiz Stock API product into Hey Man Diamond catalog schema.
 * 
 * Flomiz product schema (21 fixed fields + dynamic custom fields):
 * SerialNo, ProductName, SKU, CategoryName, Branch, Lab, ProductStatus,
 * Stock, CommittedStock, AvailableForSale, RapPrice, RapBack, RapBackValue,
 * PricePerCarat, TotalPrice, OPStock, QuantityIN, QuantityOUT, SOStock, POStock, lstImages,
 * Color, Clarity, Shape, Cut, CertificateNo, Measurement, Polish, Symmetry, Fluorescence...
 */
export function normalizeFlomizProduct(raw) {
  if (!raw || typeof raw !== 'object') return null

  const sku = String(raw.SKU || raw.ProductName || raw.SerialNo || '').trim()
  if (!sku) return null

  const shapeRaw = String(raw.Shape || 'Round').trim()
  const shape = shapeRaw.charAt(0).toUpperCase() + shapeRaw.slice(1).toLowerCase()

  const carat = parseFloat(raw.AvailableForSale ?? raw.Stock ?? 0)
  const wholesaleTotal = parseFloat(raw.TotalPrice) || (parseFloat(raw.PricePerCarat) * (carat || 1)) || 0
  const retailPrice = Math.round(wholesaleTotal * 1.30) // Standard 30% retail markup over wholesale partner cost

  // Inferred category mapping for Certified, Matched Pairs, Color Non-Cert, Melee & Loose Fancy
  const rawCat = String(raw.CategoryName || '').toLowerCase()
  const rawName = String(raw.ProductName || '').toLowerCase()
  const rawShape = shapeRaw.toLowerCase()
  const rawColor = String(raw.Color || '').toUpperCase()
  const rawLab = String(raw.Lab || '').toUpperCase().trim()

  let category = 'Certified Diamonds'
  if (rawCat.includes('pair') || rawName.includes('pair') || rawShape.includes('pair')) {
    category = 'Matched Pairs'
  } else if (
    ['FANCY', 'PINK', 'YELLOW', 'BLUE', 'GREEN', 'ORANGE', 'PURPLE', 'CHAMPAGNE'].some(c => rawColor.includes(c)) ||
    !rawLab || rawLab === 'NONE' || rawLab === 'N/A' || rawCat.includes('non cert') || rawCat.includes('color') || rawCat.includes('solitaire')
  ) {
    category = 'Solitaire Non-Certified Diamonds'
  } else if (rawCat.includes('melee') || rawName.includes('melee')) {
    category = 'Round Melee Diamonds'
  } else if (rawCat.includes('loose fancy') || (!rawShape.includes('round') && (!rawLab || rawLab === 'NONE'))) {
    category = 'Loose Fancy Diamonds'
  }

  // Extract primary image if available
  let imageUrl = null
  if (Array.isArray(raw.lstImages) && raw.lstImages.length > 0) {
    const firstImg = raw.lstImages[0]
    if (firstImg?.base64FileByte && firstImg.base64FileByte.length > 10) {
      imageUrl = `data:image/jpeg;base64,${firstImg.base64FileByte}`
    } else if (firstImg?.url || firstImg?.imageUrl) {
      imageUrl = firstImg.url || firstImg.imageUrl
    }
  }

  return {
    sku,
    category,
    shape,
    carat: isNaN(carat) ? 0 : carat,
    color: String(raw.Color || 'G').trim().toUpperCase(),
    clarity: String(raw.Clarity || 'VS1').trim().toUpperCase(),
    cut: String(raw.Cut || 'Excellent').trim(),
    polish: String(raw.Polish || 'Excellent').trim(),
    symmetry: String(raw.Symmetry || 'Very Good').trim(),
    fluorescence: String(raw.Fluorescence || 'None').trim(),
    lab: String(raw.Lab || 'IGI').trim().toUpperCase(),
    certificateNumber: String(raw.CertificateNo || raw.certificateNumber || 'N/A').trim(),
    price: retailPrice,
    customerPrice: retailPrice,
    wholesalePrice: Math.round(wholesaleTotal),
    dealerPrice: Math.round(wholesaleTotal),
    pricePerCarat: parseFloat(raw.PricePerCarat) || 0,
    measurements: String(raw.Measurement || raw.Measurements || 'N/A').trim(),
    imageUrl,
    videoUrl: raw.videoUrl || null,
    status: String(raw.ProductStatus || 'Available').toLowerCase(),
    source: 'flomiz_api',
    branch: raw.Branch || '',
    categoryName: raw.CategoryName || '',
    serialNo: raw.SerialNo || null,
    updatedAt: new Date().toISOString(),
  }
}

// In-memory cache for live Flomiz catalog to respect 300 req / 60s limit
let flomizCache = {
  items: [],
  timestamp: 0,
  pageContext: null,
  ttlMs: 15 * 60 * 1000, // 15 minute cache TTL
}

export function getFlomizCache() {
  return flomizCache
}

export function clearFlomizCache() {
  flomizCache = { items: [], timestamp: 0, pageContext: null, ttlMs: 15 * 60 * 1000 }
}

/**
 * Synchronizes inventory from Flomiz Stock API (Pull Method).
 * Endpoint: GET {baseUrl}/api/stock-api/products
 * Header: x-api-key: {apiKey}
 */
export async function syncFlomizCatalog(page = 1, perPage = 100, forceRefresh = false) {
  const apiKey = getFlomizApiKey()
  const baseUrl = getFlomizBaseUrl()

  if (!apiKey) return null

  const now = Date.now()
  if (!forceRefresh && flomizCache.items.length > 0 && (now - flomizCache.timestamp) < flomizCache.ttlMs) {
    return {
      items: flomizCache.items,
      cached: true,
      pageContext: flomizCache.pageContext,
      totalRecord: flomizCache.items.length,
    }
  }

  const queryParams = new URLSearchParams()
  if (page) queryParams.set('Page', String(page))
  if (perPage) queryParams.set('PerPage', String(perPage))

  const endpoint = `${baseUrl}/api/stock-api/products?${queryParams.toString()}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.status === 401) {
      console.warn('Flomiz API: 401 Authentication failed. Verify that server outbound IP is allowlisted with Flomiz administrator and API key is valid.')
      return null
    }

    if (response.status === 429) {
      console.warn('Flomiz API: 429 Rate limit or quota exceeded.')
      return flomizCache.items.length > 0 ? { items: flomizCache.items, cached: true } : null
    }

    if (!response.ok) {
      console.warn(`Flomiz API responded with status ${response.status}`)
      return null
    }

    const payload = await response.json()
    if (payload && payload.Code === 1 && Array.isArray(payload.lstProduct)) {
      const normalized = payload.lstProduct
        .map(normalizeFlomizProduct)
        .filter(Boolean)

      flomizCache = {
        items: normalized,
        timestamp: now,
        pageContext: payload.PageContext || null,
        ttlMs: 15 * 60 * 1000,
      }

      // Merge into local memory inventory so local search & upload operations retain external stock
      const skuMap = new Map(memoryInventory.map(item => [item.sku, item]))
      for (const item of normalized) {
        skuMap.set(item.sku, item)
      }
      memoryInventory = Array.from(skuMap.values())

      return {
        items: normalized,
        cached: false,
        pageContext: payload.PageContext,
        totalRecord: payload.PageContext?.TotalRecord || normalized.length,
      }
    } else {
      console.warn('Flomiz API response code was not 1:', payload?.Message)
      return null
    }
  } catch (err) {
    clearTimeout(timeoutId)
    console.warn('Flomiz API sync error:', err.message)
    return null
  }
}

/**
 * Filters inventory by 4Cs, price, shape, lab, and query.
 */
export function filterInventory(items, query = {}) {
  let filtered = [...items]

  if (query.shape) {
    const rawShapes = query.shape.split(',').map(s => s.trim().toLowerCase())
    const normShapes = rawShapes.map(s => s.replace(/[\s-_]/g, ''))
    filtered = filtered.filter(item => {
      const is = item.shape.toLowerCase()
      const normIs = is.replace(/[\s-_]/g, '')
      return rawShapes.includes(is) || normShapes.some(s => s === normIs || normIs.includes(s) || s.includes(normIs))
    })
  }
  if (query.minCarat) {
    const min = parseFloat(query.minCarat)
    if (!isNaN(min)) filtered = filtered.filter(item => item.carat >= min)
  }
  if (query.maxCarat) {
    const max = parseFloat(query.maxCarat)
    if (!isNaN(max)) filtered = filtered.filter(item => item.carat <= max)
  }
  if (query.color) {
    const colors = query.color.split(',').map(c => c.trim().toUpperCase())
    filtered = filtered.filter(item => colors.includes(item.color.toUpperCase()))
  }
  if (query.clarity) {
    const clarities = query.clarity.split(',').map(c => c.trim().toUpperCase())
    filtered = filtered.filter(item => clarities.includes(item.clarity.toUpperCase()))
  }
  if (query.cut) {
    const cuts = query.cut.split(',').map(c => c.trim().toLowerCase())
    filtered = filtered.filter(item => cuts.includes(item.cut.toLowerCase()))
  }
  if (query.lab) {
    const labs = query.lab.split(',').map(l => l.trim().toUpperCase())
    filtered = filtered.filter(item => labs.includes(item.lab.toUpperCase()))
  }
  if (query.minPrice) {
    const min = parseFloat(query.minPrice)
    if (!isNaN(min)) filtered = filtered.filter(item => item.price >= min)
  }
  if (query.maxPrice) {
    const max = parseFloat(query.maxPrice)
    if (!isNaN(max)) filtered = filtered.filter(item => item.price <= max)
  }
  if (query.q) {
    const search = query.q.toLowerCase()
    filtered = filtered.filter(item =>
      item.sku.toLowerCase().includes(search) ||
      item.certificateNumber.toLowerCase().includes(search) ||
      item.shape.toLowerCase().includes(search)
    )
  }

  return filtered
}

// ── HTTP Handlers ──────────────────────────────────────────────────────────

export async function handleGetCatalog(req, res, url, user = null) {
  try {
    const isConfigured = isFlomizConfigured()
    if (url.pathname === '/api/catalog' && !isConfigured) {
      return json(res, 503, { error: 'Diamond inventory is not connected yet.' })
    }

    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('perPage') || '24', 10)))
    const categoryParam = url.searchParams.get('category')

    let activeItems = []
    let source = 'diamonds_inventory'
    let isCached = false

    // 1. Fetch published diamonds from database if Supabase is connected
    if (supabaseReady()) {
      try {
        let dbQuery = 'diamonds_inventory?select=*&status=eq.published&deleted_at=is.null&order=created_at.desc&limit=500'
        if (categoryParam && categoryParam !== 'all') {
          if (categoryParam === 'Solitaire Non-Certified Diamonds' || categoryParam === 'Color Non-Certified Diamonds') {
            dbQuery += `&or=(category.eq.${encodeURIComponent('Solitaire Non-Certified Diamonds')},category.eq.${encodeURIComponent('Color Non-Certified Diamonds')})`
          } else {
            dbQuery += `&category=eq.${encodeURIComponent(categoryParam)}`
          }
        }
        const rows = await db(dbQuery)
        if (Array.isArray(rows) && rows.length > 0) {
          activeItems = rows.map(r => {
            const customerListPrice = parseFloat(r.customer_price) || 0
            const customerDiscPrice = r.customer_discount_price != null ? parseFloat(r.customer_discount_price) : null
            const customerDiscPct = r.customer_discount_percent != null ? parseFloat(r.customer_discount_percent) : null
            const customerEffectivePrice = customerDiscPrice != null ? customerDiscPrice : customerListPrice

            const dealerListPrice = parseFloat(r.dealer_price) || 0
            const dealerDiscPrice = r.dealer_discount_price != null ? parseFloat(r.dealer_discount_price) : null
            const dealerDiscPct = r.dealer_discount_percent != null ? parseFloat(r.dealer_discount_percent) : null
            const dealerEffectivePrice = dealerDiscPrice != null ? dealerDiscPrice : dealerListPrice

            return {
              id: r.id,
              sku: r.sku,
              category: r.category === 'Color Non-Certified Diamonds' ? 'Solitaire Non-Certified Diamonds' : (r.category || 'Certified Diamonds'),
              shape: r.shape,
              carat: parseFloat(r.carat) || 0,
              color: r.color,
              clarity: r.clarity,
              cut: r.cut,
              polish: r.polish,
              symmetry: r.symmetry,
              fluorescence: r.fluorescence,
              lab: r.lab,
              certificateNumber: r.certificate_number,
              customerPrice: customerListPrice,
              customerDiscountPrice: customerDiscPrice,
              customerDiscountPercent: customerDiscPct,
              customerEffectivePrice,
              dealerPrice: dealerListPrice,
              dealerDiscountPrice: dealerDiscPrice,
              dealerDiscountPercent: dealerDiscPct,
              dealerEffectivePrice,
              measurements: r.measurements,
              imageUrl: r.image_url,
              videoUrl: r.video_url,
              status: r.status,
              source: r.source,
              updatedAt: r.updated_at,
            }
          })
        }
      } catch (dbErr) {
        console.warn('DB diamonds fetch fallback to memory:', dbErr.message)
      }
    }

    // 2. Fallback to memory inventory if DB returned 0 items
    if (activeItems.length === 0) {
      activeItems = memoryInventory
        .filter(item => (item.status === 'published' || item.status === 'available') && !item.deletedAt && !item.deleted_at)
        .map(item => {
          const customerListPrice = parseFloat(item.customerPrice ?? item.price) || 0
          const customerDiscPrice = item.customerDiscountPrice != null ? parseFloat(item.customerDiscountPrice) : null
          const customerDiscPct = item.customerDiscountPercent != null ? parseFloat(item.customerDiscountPercent) : null
          const customerEffectivePrice = customerDiscPrice != null ? customerDiscPrice : customerListPrice

          const dealerListPrice = parseFloat(item.dealerPrice ?? item.wholesalePrice) || 0
          const dealerDiscPrice = item.dealerDiscountPrice != null ? parseFloat(item.dealerDiscountPrice) : null
          const dealerDiscPct = item.dealerDiscountPercent != null ? parseFloat(item.dealerDiscountPercent) : null
          const dealerEffectivePrice = dealerDiscPrice != null ? dealerDiscPrice : dealerListPrice

          return {
            ...item,
            customerPrice: customerListPrice,
            customerDiscountPrice: customerDiscPrice,
            customerDiscountPercent: customerDiscPct,
            customerEffectivePrice,
            dealerPrice: dealerListPrice,
            dealerDiscountPrice: dealerDiscPrice,
            dealerDiscountPercent: dealerDiscPct,
            dealerEffectivePrice,
          }
        })
      if (categoryParam && categoryParam !== 'all') {
        const isNonCert = categoryParam === 'Solitaire Non-Certified Diamonds' || categoryParam === 'Color Non-Certified Diamonds'
        activeItems = activeItems.filter(item => {
          const cat = item.category || 'Certified Diamonds'
          if (isNonCert) {
            return cat === 'Solitaire Non-Certified Diamonds' || cat === 'Color Non-Certified Diamonds'
          }
          return cat.toLowerCase() === categoryParam.toLowerCase()
        })
      }
      source = 'inventory_catalog'
    }

    // 3. Filter inventory according to 4Cs, search, and query params
    const queryParams = Object.fromEntries(url.searchParams.entries())
    const filtered = filterInventory(activeItems, queryParams)

    // 4. Resolve user dealer status
    let isApprovedDealer = false
    let isDealerPending = false

    if (user) {
      let accountType = 'customer'
      let dealerStatus = 'not_applied'

      if (user.id && supabaseReady()) {
        try {
          const profileRows = await db(`profiles?id=eq.${encodeURIComponent(user.id)}&select=account_type,dealer_status`)
          if (Array.isArray(profileRows) && profileRows.length > 0) {
            accountType = profileRows[0].account_type || 'customer'
            dealerStatus = profileRows[0].dealer_status || 'not_applied'
          } else if (user.account_type) {
            accountType = user.account_type
            dealerStatus = user.dealer_status || 'not_applied'
          }
        } catch {
          if (user.account_type) {
            accountType = user.account_type
            dealerStatus = user.dealer_status || 'not_applied'
          }
        }
      } else if (user.account_type) {
        accountType = user.account_type
        dealerStatus = user.dealer_status || 'not_applied'
      }

      isApprovedDealer = accountType === 'dealer' && dealerStatus === 'approved'
      isDealerPending = accountType === 'dealer' && dealerStatus !== 'approved'
    }

    // 5. Strictly isolate retail and dealer pricing per audience
    const sanitized = filtered.map(item => {
      const copy = { ...item }
      if (isApprovedDealer) {
        // Approved Dealer View: dealer list price, discount price, discount percent
        copy.price = copy.dealerEffectivePrice
        copy.listPrice = copy.dealerPrice
        copy.discountPrice = copy.dealerDiscountPrice
        copy.discountPercent = copy.dealerDiscountPercent
        copy.wholesalePrice = copy.dealerPrice
        copy.dealerPrice = copy.dealerPrice

        // Strictly purge retail customer prices & discounts
        delete copy.customerPrice
        delete copy.customer_price
        delete copy.customerDiscountPrice
        delete copy.customer_discount_price
        delete copy.customerDiscountPercent
        delete copy.customer_discount_percent
        delete copy.customerEffectivePrice
        delete copy.dealerEffectivePrice
      } else {
        // Retail Customer & Anonymous Visitor View: customer list price, discount price, discount percent
        copy.price = copy.customerEffectivePrice
        copy.listPrice = copy.customerPrice
        copy.discountPrice = copy.customerDiscountPrice
        copy.discountPercent = copy.customerDiscountPercent

        // Strictly purge wholesale dealer prices & discounts
        delete copy.wholesalePrice
        delete copy.dealerPrice
        delete copy.dealer_price
        delete copy.dealerDiscountPrice
        delete copy.dealer_discount_price
        delete copy.dealerDiscountPercent
        delete copy.dealer_discount_percent
        delete copy.customerEffectivePrice
        delete copy.dealerEffectivePrice
      }
      return copy
    })

    const startIndex = (page - 1) * perPage
    const paginated = sanitized.slice(startIndex, startIndex + perPage)

    return json(res, 200, {
      items: paginated,
      source,
      cached: isCached,
      page,
      perPage,
      totalRecords: filtered.length,
      totalPages: Math.ceil(filtered.length / perPage),
      isDealerPricing: isApprovedDealer,
      dealerPendingApproval: isDealerPending,
    })
  } catch (error) {
    console.error('Catalog fetch error:', error)
    return json(res, 500, { error: 'Unable to load diamond catalog.' })
  }
}

export function handleFlomizStatus(req, res) {
  const apiKey = getFlomizApiKey()
  const baseUrl = getFlomizBaseUrl()
  const isConfigured = isFlomizConfigured()

  return json(res, 200, {
    configured: isConfigured,
    baseUrl,
    keyConfigured: Boolean(apiKey),
    cachedItems: flomizCache.items.length,
    lastSync: flomizCache.timestamp ? new Date(flomizCache.timestamp).toISOString() : null,
    status: isConfigured ? 'Ready to sync' : 'API key missing',
  })
}

export async function handleUploadInventory(req, res, admin) {
  try {
    if (!admin) {
      return json(res, 401, { error: 'Admin authentication required.' })
    }

    const input = await bodyJson(req)
    const content = input.content || input.fileContent || input.csv
    const mode = input.mode === 'replace' ? 'replace' : 'append'

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return json(res, 400, { error: 'Spreadsheet content (CSV or TSV string) is required.' })
    }

    const defaultCat = input.defaultCategory || 'all'
    const result = parseDiamondSpreadsheet(content, defaultCat)

    // Retrieve all soft-deleted SKUs to strictly prevent accidental resurrection
    const deletedSkus = new Set()
    for (const mem of memoryInventory) {
      if (mem.deletedAt || mem.deleted_at) {
        deletedSkus.add(mem.sku)
      }
    }
    if (supabaseReady()) {
      try {
        const delRows = await db('diamonds_inventory?deleted_at=not.is.null&select=sku')
        if (Array.isArray(delRows)) {
          for (const r of delRows) if (r.sku) deletedSkus.add(r.sku)
        }
      } catch {
        // ignore
      }
    }

    let skippedDeletedCount = 0
    const nonDeletedItems = []
    for (const item of result.items) {
      if (deletedSkus.has(item.sku)) {
        skippedDeletedCount++
        result.skipped.push({ row: 0, sku: item.sku, reason: 'SKU is soft-deleted and cannot be resurrected by upload.' })
      } else {
        nonDeletedItems.push(item)
      }
    }
    result.items = nonDeletedItems

    if (result.items.length === 0) {
      return json(res, 400, {
        error: skippedDeletedCount > 0
          ? `All ${skippedDeletedCount} diamond(s) in this upload are soft-deleted and were skipped.`
          : 'No valid diamond rows found in the uploaded file.',
        skipped: result.skipped,
        skippedDeletedCount,
      })
    }

    if (mode === 'replace') {
      memoryInventory = result.items
    } else {
      // Append mode: update matching SKUs or add new ones without overwriting manual discounts
      const existingSkuMap = new Map(memoryInventory.map(item => [item.sku, item]))
      for (const item of result.items) {
        const existing = existingSkuMap.get(item.sku)
        if (existing) {
          if (item.customerDiscountPrice === null && item.customerDiscountPercent === null) {
            item.customerDiscountPrice = existing.customerDiscountPrice ?? null
            item.customerDiscountPercent = existing.customerDiscountPercent ?? null
          }
          if (item.dealerDiscountPrice === null && item.dealerDiscountPercent === null) {
            item.dealerDiscountPrice = existing.dealerDiscountPrice ?? null
            item.dealerDiscountPercent = existing.dealerDiscountPercent ?? null
          }
        }
        existingSkuMap.set(item.sku, item)
      }
      memoryInventory = Array.from(existingSkuMap.values())
    }

    // Attempt persistence to Supabase if database is available
    let dbPersisted = false
    if (supabaseReady()) {
      try {
        const dbRows = result.items.map(item => ({
          sku: item.sku,
          category: item.category || (defaultCat !== 'all' ? defaultCat : 'Loose Fancy Diamonds'),
          shape: item.shape,
          carat: item.carat,
          color: item.color,
          clarity: item.clarity,
          cut: item.cut,
          polish: item.polish,
          symmetry: item.symmetry,
          fluorescence: item.fluorescence,
          lab: item.lab,
          certificate_number: item.certificateNumber || 'N/A',
          customer_price: item.price || 0,
          customer_discount_price: item.customerDiscountPrice || null,
          customer_discount_percent: item.customerDiscountPercent || null,
          dealer_price: item.wholesalePrice || 0,
          dealer_discount_price: item.dealerDiscountPrice || null,
          dealer_discount_percent: item.dealerDiscountPercent || null,
          measurements: item.measurements || 'N/A',
          image_url: item.imageUrl || null,
          video_url: item.videoUrl || null,
          status: 'published',
          source: 'excel_upload',
          updated_at: new Date().toISOString(),
        }))

        await db('diamonds_inventory', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(dbRows),
        })
        dbPersisted = true
      } catch (dbErr) {
        console.warn('Note: Diamonds table sync to Supabase skipped:', dbErr.message)
      }
    }

    return json(res, 200, {
      success: true,
      mode,
      importedCount: result.items.length,
      skippedCount: result.skipped.length,
      totalCatalogCount: memoryInventory.length,
      dbPersisted,
      message: `Successfully imported ${result.items.length} diamonds. Total active stock: ${memoryInventory.length}.`,
      skipped: result.skipped.slice(0, 10), // Return first 10 skipped warnings if any
    })
  } catch (error) {
    console.error('Inventory upload failed:', error)
    return json(res, 400, { error: error.message || 'Failed to parse and upload inventory file.' })
  }
}

export function handleDownloadTemplate(req, res) {
  const csv = generateInventoryTemplate()
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="heyman_diamond_inventory_template.csv"',
    'Cache-Control': 'no-cache',
  })
  res.end(csv)
}

/**
 * ── Admin Diamonds Inventory & Price Management Handlers ──────────────────
 */

export async function handleGetAdminDiamonds(req, res, admin, url) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })

  const category = url.searchParams.get('category')
  const status = url.searchParams.get('status')
  const search = url.searchParams.get('search') || url.searchParams.get('q')

  let items = []

  if (supabaseReady()) {
    try {
      let query = 'diamonds_inventory?select=*&order=created_at.desc&limit=250'
      if (status === 'deleted') {
        query += '&deleted_at=not.is.null'
      } else {
        query += '&deleted_at=is.null'
        if (status && status !== 'all') {
          query += `&status=eq.${encodeURIComponent(status)}`
        }
      }
      if (category && category !== 'all') {
        query += `&category=eq.${encodeURIComponent(category)}`
      }
      const rows = await db(query)
      if (Array.isArray(rows)) {
        items = rows.map(r => {
          const customerListPrice = parseFloat(r.customer_price) || 0
          const customerDiscPrice = r.customer_discount_price != null ? parseFloat(r.customer_discount_price) : null
          const customerDiscPct = r.customer_discount_percent != null ? parseFloat(r.customer_discount_percent) : null
          const customerEffectivePrice = customerDiscPrice != null ? customerDiscPrice : customerListPrice

          const dealerListPrice = parseFloat(r.dealer_price) || 0
          const dealerDiscPrice = r.dealer_discount_price != null ? parseFloat(r.dealer_discount_price) : null
          const dealerDiscPct = r.dealer_discount_percent != null ? parseFloat(r.dealer_discount_percent) : null
          const dealerEffectivePrice = dealerDiscPrice != null ? dealerDiscPrice : dealerListPrice

          return {
            id: r.id,
            sku: r.sku,
            category: r.category || 'Certified Diamonds',
            shape: r.shape,
            carat: parseFloat(r.carat) || 0,
            color: r.color,
            clarity: r.clarity,
            cut: r.cut,
            polish: r.polish,
            symmetry: r.symmetry,
            fluorescence: r.fluorescence,
            lab: r.lab,
            certificateNumber: r.certificate_number,
            customerPrice: customerListPrice,
            customerDiscountPrice: customerDiscPrice,
            customerDiscountPercent: customerDiscPct,
            customerEffectivePrice,
            dealerPrice: dealerListPrice,
            dealerDiscountPrice: dealerDiscPrice,
            dealerDiscountPercent: dealerDiscPct,
            dealerEffectivePrice,
            price: customerListPrice,
            wholesalePrice: dealerListPrice,
            measurements: r.measurements,
            imageUrl: r.image_url,
            videoUrl: r.video_url,
            status: r.status,
            source: r.source,
            deletedAt: r.deleted_at || null,
            updatedAt: r.updated_at,
            createdAt: r.created_at,
          }
        })
      }
    } catch (err) {
      console.warn('Failed to load admin diamonds from DB:', err.message)
    }
  }

  // Fallback to memoryInventory if DB has no rows
  if (items.length === 0 && memoryInventory.length > 0) {
    let memSource = memoryInventory
    if (status === 'deleted') {
      memSource = memSource.filter(item => Boolean(item.deletedAt || item.deleted_at))
    } else {
      memSource = memSource.filter(item => !item.deletedAt && !item.deleted_at)
      if (status && status !== 'all') {
        memSource = memSource.filter(item => item.status === status)
      }
    }

    items = memSource.map(item => {
      const customerListPrice = parseFloat(item.customerPrice ?? item.price) || 0
      const customerDiscPrice = item.customerDiscountPrice != null ? parseFloat(item.customerDiscountPrice) : null
      const customerDiscPct = item.customerDiscountPercent != null ? parseFloat(item.customerDiscountPercent) : null
      const customerEffectivePrice = customerDiscPrice != null ? customerDiscPrice : customerListPrice

      const dealerListPrice = parseFloat(item.dealerPrice ?? item.wholesalePrice) || 0
      const dealerDiscPrice = item.dealerDiscountPrice != null ? parseFloat(item.dealerDiscountPrice) : null
      const dealerDiscPct = item.dealerDiscountPercent != null ? parseFloat(item.dealerDiscountPercent) : null
      const dealerEffectivePrice = dealerDiscPrice != null ? dealerDiscPrice : dealerListPrice

      return {
        ...item,
        category: item.category || 'Certified Diamonds',
        customerPrice: customerListPrice,
        customerDiscountPrice: customerDiscPrice,
        customerDiscountPercent: customerDiscPct,
        customerEffectivePrice,
        dealerPrice: dealerListPrice,
        dealerDiscountPrice: dealerDiscPrice,
        dealerDiscountPercent: dealerDiscPct,
        dealerEffectivePrice,
        price: customerListPrice,
        wholesalePrice: dealerListPrice,
        deletedAt: item.deletedAt || item.deleted_at || null,
        status: item.status || 'published',
        source: item.source || 'excel_upload',
      }
    })
  }

  // Filter in memory for search
  if (search) {
    const s = search.toLowerCase()
    items = items.filter(i =>
      i.sku?.toLowerCase().includes(s) ||
      i.certificateNumber?.toLowerCase().includes(s) ||
      i.shape?.toLowerCase().includes(s) ||
      i.category?.toLowerCase().includes(s)
    )
  }

  // Guarantee every diamond returned from admin diamonds API has a strictly non-null, unique id
  const seenIds = new Set()
  items = items.map((item, index) => {
    let id = item.id ? String(item.id).trim() : ''
    if (!id) {
      id = item.sku ? `dia-${String(item.sku).toLowerCase().replace(/[^a-z0-9_-]/g, '-')}` : `dia-${Date.now()}-${index}`
    }
    if (seenIds.has(id)) {
      id = `${id}-${index}`
    }
    seenIds.add(id)
    return {
      ...item,
      id,
    }
  })

  const allDiamonds = memoryInventory
  const counts = {
    total: allDiamonds.filter(i => !i.deletedAt && !i.deleted_at).length,
    pendingReview: allDiamonds.filter(i => i.status === 'pending_review' && !i.deletedAt && !i.deleted_at).length,
    published: allDiamonds.filter(i => i.status === 'published' && !i.deletedAt && !i.deleted_at).length,
    hidden: allDiamonds.filter(i => i.status === 'hidden' && !i.deletedAt && !i.deleted_at).length,
    deleted: allDiamonds.filter(i => Boolean(i.deletedAt || i.deleted_at)).length,
  }

  return json(res, 200, { items, counts })
}

export async function handleUpdateAdminDiamond(req, res, admin, diamondId) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })
  if (admin.permissions && admin.permissions.can_manage_inventory === false) {
    return json(res, 403, { error: 'Inventory management permission required.' })
  }
  const cleanId = String(diamondId || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid diamond identifier.' })
  }
  const safeId = encodeURIComponent(cleanId)
  const input = await bodyJson(req)

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)
  const filterQuery = isUuid ? `id=eq.${safeId}` : `sku=eq.${safeId}`

  // Find existing diamond record to get baseline prices and capture before/after audit data
  let existing = null
  if (supabaseReady()) {
    try {
      const rows = await db(`diamonds_inventory?${filterQuery}&limit=1`)
      if (Array.isArray(rows) && rows.length > 0) existing = rows[0]
    } catch {
      // ignore
    }
  }
  if (!existing) {
    existing = memoryInventory.find(i => i.id === cleanId || i.sku === cleanId)
  }

  if (!existing) {
    return json(res, 404, { error: 'Diamond item not found.' })
  }

  let pricingUpdates = {}
  try {
    pricingUpdates = processDiamondPricingUpdates(existing, input)
  } catch (err) {
    return json(res, 400, { error: err.message })
  }

  const updates = {
    ...pricingUpdates,
    updated_at: new Date().toISOString(),
  }

  if (input.category !== undefined) updates.category = String(input.category).trim()
  if (input.status !== undefined) updates.status = input.status

  if (supabaseReady()) {
    try {
      await db(`diamonds_inventory?id=eq.${safeId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(updates),
      })
    } catch (err) {
      try {
        await db(`diamonds_inventory?sku=eq.${safeId}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(updates),
        })
      } catch (e) {
        console.warn('DB update diamond failed:', e.message)
      }
    }
  }

  // Update in memoryInventory
  const memItem = memoryInventory.find(i => i.id === cleanId || i.sku === cleanId)
  if (memItem) {
    if (updates.category) memItem.category = updates.category
    if (updates.status) memItem.status = updates.status
    if (updates.customer_price !== undefined) {
      memItem.customerPrice = updates.customer_price
      memItem.price = updates.customer_price
    }
    if (updates.customer_discount_price !== undefined) {
      memItem.customerDiscountPrice = updates.customer_discount_price
    }
    if (updates.customer_discount_percent !== undefined) {
      memItem.customerDiscountPercent = updates.customer_discount_percent
    }
    if (updates.dealer_price !== undefined) {
      memItem.dealerPrice = updates.dealer_price
      memItem.wholesalePrice = updates.dealer_price
    }
    if (updates.dealer_discount_price !== undefined) {
      memItem.dealerDiscountPrice = updates.dealer_discount_price
    }
    if (updates.dealer_discount_percent !== undefined) {
      memItem.dealerDiscountPercent = updates.dealer_discount_percent
    }
  }

  // Audit log price & inventory update
  if (supabaseReady()) {
    try {
      await db('audit_log', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          actor_user_id: admin?.user?.id || 'admin',
          action: 'diamond_price_updated',
          entity_type: 'diamond',
          entity_id: cleanId,
          metadata: {
            sku: existing.sku,
            before: {
              customer_price: existing.customer_price ?? existing.customerPrice ?? existing.price,
              customer_discount_price: existing.customer_discount_price ?? existing.customerDiscountPrice ?? null,
              customer_discount_percent: existing.customer_discount_percent ?? existing.customerDiscountPercent ?? null,
              dealer_price: existing.dealer_price ?? existing.dealerPrice ?? existing.wholesalePrice,
              dealer_discount_price: existing.dealer_discount_price ?? existing.dealerDiscountPrice ?? null,
              dealer_discount_percent: existing.dealer_discount_percent ?? existing.dealerDiscountPercent ?? null,
            },
            after: {
              customer_price: updates.customer_price,
              customer_discount_price: updates.customer_discount_price,
              customer_discount_percent: updates.customer_discount_percent,
              dealer_price: updates.dealer_price,
              dealer_discount_price: updates.dealer_discount_price,
              dealer_discount_percent: updates.dealer_discount_percent,
            },
          },
        }),
      })
    } catch (auditErr) {
      console.warn('Audit log write error:', auditErr.message)
    }
  }

  return json(res, 200, { success: true, message: 'Diamond updated successfully.' })
}

export async function handleDeleteAdminDiamond(req, res, admin, diamondId) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })
  if (admin.permissions && admin.permissions.can_manage_inventory === false) {
    return json(res, 403, { error: 'Inventory management permission required.' })
  }
  const cleanId = String(diamondId || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid diamond identifier.' })
  }
  const safeId = encodeURIComponent(cleanId)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)
  const filterQuery = isUuid ? `id=eq.${safeId}` : `sku=eq.${safeId}`

  let existing = null
  if (supabaseReady()) {
    try {
      const rows = await db(`diamonds_inventory?${filterQuery}&limit=1`)
      if (Array.isArray(rows) && rows.length > 0) existing = rows[0]
    } catch {
      // ignore
    }
  }
  if (!existing) {
    existing = memoryInventory.find(i => i.id === cleanId || i.sku === cleanId)
  }

  if (!existing) {
    return json(res, 404, { error: 'Diamond item not found.' })
  }

  const now = new Date().toISOString()
  const deletedBy = admin.user?.id || null

  if (supabaseReady()) {
    try {
      await db(`diamonds_inventory?${filterQuery}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          deleted_at: now,
          deleted_by: deletedBy,
          status: 'hidden',
          updated_at: now,
        }),
      })
    } catch (err) {
      console.warn('DB soft delete failed:', err.message)
    }
  }

  // Update in memoryInventory
  const memItem = memoryInventory.find(i => i.id === cleanId || i.sku === cleanId)
  if (memItem) {
    memItem.deletedAt = now
    memItem.deleted_at = now
    memItem.deletedBy = deletedBy
    memItem.status = 'hidden'
  }

  // Write audit log
  if (supabaseReady()) {
    try {
      await db('audit_log', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          actor_user_id: admin?.user?.id || 'admin',
          action: 'diamond_deleted',
          entity_type: 'diamond',
          entity_id: cleanId,
          metadata: { sku: existing.sku },
        }),
      })
    } catch (auditErr) {
      console.warn('Audit log write error:', auditErr.message)
    }
  }

  return json(res, 200, { success: true, message: `Diamond ${existing.sku} soft-deleted successfully.` })
}

export async function handleRestoreAdminDiamond(req, res, admin, diamondId) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })
  if (admin.permissions && admin.permissions.can_manage_inventory === false) {
    return json(res, 403, { error: 'Inventory management permission required.' })
  }
  const cleanId = String(diamondId || '').trim()
  if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return json(res, 400, { error: 'Invalid diamond identifier.' })
  }
  const safeId = encodeURIComponent(cleanId)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)
  const filterQuery = isUuid ? `id=eq.${safeId}` : `sku=eq.${safeId}`

  let existing = null
  if (supabaseReady()) {
    try {
      const rows = await db(`diamonds_inventory?${filterQuery}&limit=1`)
      if (Array.isArray(rows) && rows.length > 0) existing = rows[0]
    } catch {
      // ignore
    }
  }
  if (!existing) {
    existing = memoryInventory.find(i => i.id === cleanId || i.sku === cleanId)
  }

  if (!existing) {
    return json(res, 404, { error: 'Diamond item not found.' })
  }

  const now = new Date().toISOString()

  if (supabaseReady()) {
    try {
      await db(`diamonds_inventory?${filterQuery}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          deleted_at: null,
          deleted_by: null,
          status: 'pending_review',
          updated_at: now,
        }),
      })
    } catch (err) {
      console.warn('DB restore failed:', err.message)
    }
  }

  // Update in memoryInventory
  const memItem = memoryInventory.find(i => i.id === cleanId || i.sku === cleanId)
  if (memItem) {
    memItem.deletedAt = null
    memItem.deleted_at = null
    memItem.deletedBy = null
    memItem.status = 'pending_review'
  }

  // Write audit log
  if (supabaseReady()) {
    try {
      await db('audit_log', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          actor_user_id: admin?.user?.id || 'admin',
          action: 'diamond_restored',
          entity_type: 'diamond',
          entity_id: cleanId,
          metadata: { sku: existing.sku },
        }),
      })
    } catch (auditErr) {
      console.warn('Audit log write error:', auditErr.message)
    }
  }

  return json(res, 200, { success: true, message: `Diamond ${existing.sku} restored successfully.` })
}

export async function handleBatchPublishAdminDiamonds(req, res, admin) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })
  const input = await bodyJson(req).catch(() => ({}))

  if (supabaseReady()) {
    try {
      if (Array.isArray(input.ids) && input.ids.length > 0) {
        const validIds = input.ids
          .map(id => String(id || '').trim())
          .filter(id => /^[a-zA-Z0-9_-]+$/.test(id))
        for (const id of validIds) {
          await db(`diamonds_inventory?id=eq.${encodeURIComponent(id)}&deleted_at=is.null`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'published', updated_at: new Date().toISOString() }),
          })
        }
      } else {
        await db('diamonds_inventory?status=eq.pending_review&deleted_at=is.null', {
          method: 'PATCH',
          body: JSON.stringify({ status: 'published', updated_at: new Date().toISOString() }),
        })
      }
    } catch (err) {
      console.warn('Batch publish DB failed:', err.message)
    }
  }

  memoryInventory.forEach(item => {
    if (item.status === 'pending_review' && !item.deletedAt && !item.deleted_at) {
      item.status = 'published'
    }
  })

  return json(res, 200, { success: true, message: 'All pending diamonds have been published to the live website.' })
}

export async function handleSyncFlomizToStaging(req, res, admin) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })
  if (!isFlomizConfigured()) {
    return json(res, 503, { error: 'Flomiz API key or domain is not configured yet. Set FLOMIZ_API_KEY and FLOMIZ_BASE_URL.' })
  }

  const flomizData = await syncFlomizCatalog(1, 100, true)
  if (!flomizData || !Array.isArray(flomizData.items)) {
    return json(res, 502, {
      error: 'Unable to fetch diamonds from Flomiz API at this moment. Ensure server outbound domain or IP is registered in Flomiz Origin Allowlist.',
    })
  }

  // Prevent resurrecting soft-deleted items
  const deletedSkus = new Set()
  for (const mem of memoryInventory) {
    if (mem.deletedAt || mem.deleted_at) {
      deletedSkus.add(mem.sku)
    }
  }
  if (supabaseReady()) {
    try {
      const delRows = await db('diamonds_inventory?deleted_at=not.is.null&select=sku')
      if (Array.isArray(delRows)) {
        for (const r of delRows) if (r.sku) deletedSkus.add(r.sku)
      }
    } catch {
      // ignore
    }
  }

  let skippedDeletedCount = 0
  const syncableFlomizItems = []
  for (const item of flomizData.items) {
    if (deletedSkus.has(item.sku)) {
      skippedDeletedCount++
    } else {
      syncableFlomizItems.push(item)
    }
  }

  const dbRows = syncableFlomizItems.map(item => ({
    sku: item.sku,
    category: item.category || 'Certified Diamonds',
    shape: item.shape,
    carat: item.carat,
    color: item.color,
    clarity: item.clarity,
    cut: item.cut,
    polish: item.polish,
    symmetry: item.symmetry,
    fluorescence: item.fluorescence,
    lab: item.lab,
    certificate_number: item.certificateNumber,
    customer_price: item.customerPrice || item.price || 0,
    dealer_price: item.dealerPrice || item.wholesalePrice || 0,
    measurements: item.measurements,
    image_url: item.imageUrl,
    video_url: item.videoUrl,
    status: 'pending_review',
    source: 'flomiz_api',
    updated_at: new Date().toISOString(),
  }))

  if (supabaseReady()) {
    try {
      await db('diamonds_inventory', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(dbRows),
      })
    } catch (err) {
      console.warn('Flomiz staging insert to DB failed:', err.message)
    }
  }

  // Also stage in local memoryInventory
  for (const row of dbRows) {
    const existing = memoryInventory.find(m => m.sku === row.sku)
    if (existing) {
      Object.assign(existing, {
        category: row.category,
        customerPrice: row.customer_price,
        dealerPrice: row.dealer_price,
        price: row.customer_price,
        wholesalePrice: row.dealer_price,
        status: 'pending_review',
      })
    } else {
      memoryInventory.push({
        ...row,
        price: row.customer_price,
        wholesalePrice: row.dealer_price,
      })
    }
  }

  return json(res, 200, {
    success: true,
    count: dbRows.length,
    skippedDeletedCount,
    message: `Successfully fetched ${dbRows.length} diamonds from Flomiz API into Staging (Pending Review).${skippedDeletedCount > 0 ? ` (${skippedDeletedCount} soft-deleted diamonds skipped).` : ''}`,
  })
}

export async function handleTestFlomizConnection(req, res, admin) {
  if (!admin) {
    return json(res, 401, {
      success: false,
      code: 401,
      error: 'Admin authorization required. Please sign in to your administrator account.',
      message: 'Admin authorization required. Please sign in to your administrator account.',
    })
  }

  // Accept URL and Key directly from body if tested on-the-fly
  const body = await bodyJson(req).catch(() => ({}))
  if (body.baseUrl && !isAllowedFlomizUrl(body.baseUrl)) {
    return json(res, 400, {
      success: false,
      code: 400,
      error: 'Invalid Flomiz server URL.',
      message: 'Only official *.flomiz.com endpoints are allowed.',
    })
  }
  const rawBaseUrl = body.baseUrl || getFlomizBaseUrl() || ''
  const baseUrl = cleanFlomizBaseUrl(rawBaseUrl)
  const apiKey = (body.apiKey || getFlomizApiKey() || '').trim()

  if (body.baseUrl || body.apiKey) {
    setFlomizConfig(apiKey || undefined, baseUrl || undefined)
  }

  if (!apiKey) {
    return json(res, 400, {
      success: false,
      code: 400,
      error: 'Flomiz API Key is missing.',
      message: 'Please enter your issued Flomiz API Key (sk_live_...) before testing connection.',
    })
  }

  if (!baseUrl) {
    return json(res, 400, {
      success: false,
      code: 400,
      error: 'Flomiz Instance Base URL is missing.',
      message: 'Please enter your Flomiz server URL.',
    })
  }

  const endpoint = `${baseUrl}/api/stock-api/products?PerPage=1`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 9000)

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    const contentType = response.headers.get('content-type') || ''
    const isJson = contentType.includes('application/json')
    const responseBody = isJson ? await response.json().catch(() => ({})) : await response.text().catch(() => '')

    if (response.status === 200) {
      const data = isJson ? responseBody : {}
      const total = data.PageContext?.TotalRecord ?? (Array.isArray(data.lstProduct) ? data.lstProduct.length : 0)
      return json(res, 200, {
        success: true,
        code: 200,
        message: `Connection successful! Connected to Flomiz B2B Stock API (${total} products currently available).`,
        endpoint,
        baseUrl,
        totalRecord: total,
      })
    }

    if (response.status === 401) {
      return json(res, 200, {
        success: false,
        code: 401,
        endpoint,
        baseUrl,
        error: 'Authentication failed (401). Origin allowlist rejected request.',
        message: 'Authentication failed (401): Flomiz rejected this request. Per Flomiz Stock API integration guidelines, your API Key is locked to an Origin / IP allowlist. Please contact your Flomiz administrator to register Hey Man Diamond website domain (heymandiamond.com) and hosting outbound IP in your key allowlist.',
      })
    }

    if (response.status === 404) {
      const isNextJsBilling = typeof responseBody === 'string' && (responseBody.includes('Page Not Found - Flomiz') || baseUrl.includes('billing.flomiz.com'))
      const diagnosticMsg = isNextJsBilling
        ? `Flomiz returned 404 Not Found at "${endpoint}". "billing.flomiz.com" is Flomiz's customer billing dashboard, not the inventory API server. The Stock API is hosted on Flomiz's ERP system (e.g. https://diamond.flomiz.com). Please check with Flomiz support for your dedicated API Server URL.`
        : `Flomiz returned 404 Not Found at "${endpoint}". The server instance at "${baseUrl}" does not expose the stock API endpoint.`

      return json(res, 200, {
        success: false,
        code: 404,
        endpoint,
        baseUrl,
        error: 'Flomiz Endpoint Not Found (404)',
        message: diagnosticMsg,
      })
    }

    const msg = isJson && responseBody?.Message
      ? `Flomiz responded with: ${responseBody.Message}`
      : `Flomiz responded with HTTP status ${response.status}.`

    return json(res, 200, {
      success: false,
      code: response.status,
      endpoint,
      baseUrl,
      error: `HTTP Error ${response.status}`,
      message: msg,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    const errMsg = err?.message || 'Network error'
    const isDnsError = errMsg.includes('ENOTFOUND') || errMsg.includes('getaddrinfo')
    const userFriendlyMsg = isDnsError
      ? `Could not resolve domain "${baseUrl}". "www.billing.flomiz.com" does not exist in public DNS. Please use billing.flomiz.com or diamond.flomiz.com without "www."`
      : `Network connection to Flomiz failed: ${errMsg}`

    return json(res, 200, {
      success: false,
      code: 504,
      endpoint,
      baseUrl,
      error: isDnsError ? 'DNS Resolution Failed' : 'Connection Failed',
      message: userFriendlyMsg,
    })
  }
}

export async function handleUpdateFlomizConfig(req, res, admin) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.', message: 'Admin authorization required.' })
  const body = await bodyJson(req).catch(() => ({}))
  if (body.apiKey) setFlomizConfig(body.apiKey, body.baseUrl)
  else if (body.baseUrl) setFlomizConfig(undefined, body.baseUrl)

  return json(res, 200, {
    success: true,
    message: 'Flomiz configuration updated successfully.',
    baseUrl: getFlomizBaseUrl(),
    apiKeyConfigured: Boolean(getFlomizApiKey()),
    keyPrefix: getFlomizApiKey() ? `${getFlomizApiKey().slice(0, 10)}...` : null,
  })
}

/**
 * Returns the authoritative server-side effective price for a stone, respecting
 * audience discounts (customer vs approved dealer).
 */
export async function getEffectiveDiamondPrice(sku, isApprovedDealer = false) {
  const cleanSku = String(sku || '').trim()
  if (!cleanSku) return 0

  let item = null
  if (supabaseReady()) {
    try {
      const rows = await db(`diamonds_inventory?sku=eq.${encodeURIComponent(cleanSku)}&select=customer_price,customer_discount_price,dealer_price,dealer_discount_price&limit=1`)
      if (Array.isArray(rows) && rows.length > 0) {
        item = rows[0]
      }
    } catch {
      // ignore
    }
  }

  if (!item) {
    const mem = memoryInventory.find(m => m.sku === cleanSku || m.id === cleanSku)
    if (mem) {
      item = {
        customer_price: mem.customerPrice ?? mem.price,
        customer_discount_price: mem.customerDiscountPrice ?? null,
        dealer_price: mem.dealerPrice ?? mem.wholesalePrice,
        dealer_discount_price: mem.dealerDiscountPrice ?? null,
      }
    }
  }

  if (!item) return 0

  if (isApprovedDealer) {
    if (item.dealer_discount_price !== null && item.dealer_discount_price !== undefined) {
      return Number(item.dealer_discount_price)
    }
    return Number(item.dealer_price) || 0
  }

  if (item.customer_discount_price !== null && item.customer_discount_price !== undefined) {
    return Number(item.customer_discount_price)
  }
  return Number(item.customer_price) || 0
}

export function getInventoryItemBySku(sku) {
  return memoryInventory.find(m => m.sku === sku || m.id === sku) || null
}
