import { json, bodyJson, db, supabaseReady } from './shared.mjs'

// ── Flomiz Stock Pull API Configuration ─────────────────────────────────────
export const getFlomizApiKey = () => (process.env.FLOMIZ_API_KEY || '').trim()
export const getFlomizBaseUrl = () => (process.env.FLOMIZ_BASE_URL || process.env.FLOMIZ_STOCK_URL || 'https://diamond.flomiz.com').replace(/\/$/, '')

export function isFlomizConfigured() {
  const key = getFlomizApiKey()
  return Boolean(key && key.length > 0)
}

// In-memory inventory store for instant uploads and fallback caching
let memoryInventory = [
  {
    sku: 'HMD-LG-1001',
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
    wholesalePrice: 1350,
    measurements: '7.38 x 7.42 x 4.55 mm',
    status: 'available',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    sku: 'HMD-LG-1002',
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
    status: 'available',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    sku: 'HMD-LG-1003',
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
    status: 'available',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    sku: 'HMD-LG-1004',
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
    status: 'available',
    source: 'seed',
    updatedAt: new Date().toISOString(),
  },
  {
    sku: 'HMD-LG-1005',
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
    status: 'available',
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
 * Normalizes diamond spreadsheet rows into structured inventory records.
 */
export function parseDiamondSpreadsheet(fileContent) {
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
    wholesalePrice: ['wholesaleprice', 'dealerprice', 'tradeprice', 'b2bprice', 'cost'],
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
    const rawCat = getVal('category')
    const category = rawCat ? String(rawCat).trim() : 'Loose Fancy Diamonds'

    validItems.push({
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
      wholesalePrice,
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
 * Returns a downloadable CSV template with standard diamond columns.
 */
export function generateInventoryTemplate() {
  const headers = [
    'SKU',
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
    'Wholesale Price (USD)',
    'Measurements',
    'Image URL',
    'Video URL',
  ]
  const sample1 = [
    'HMD-001',
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
    '1350',
    '7.35 x 7.39 x 4.52 mm',
    'https://example.com/images/hmd-001.jpg',
    'https://example.com/videos/hmd-001.mp4',
  ]
  const sample2 = [
    'HMD-002',
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
    '1950',
    '10.12 x 7.15 x 4.48 mm',
    '',
    '',
  ]
  return [headers.join(','), sample1.join(','), sample2.join(',')].join('\n')
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
    wholesalePrice: Math.round(wholesaleTotal),
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
    const shapes = query.shape.split(',').map(s => s.trim().toLowerCase())
    filtered = filtered.filter(item => shapes.includes(item.shape.toLowerCase()))
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

    // Check if external supplier API is active
    let activeItems = memoryInventory
    let source = 'inventory_catalog'
    let isCached = false

    if (isConfigured) {
      try {
        const flomizData = await syncFlomizCatalog(page, perPage)
        if (flomizData?.items && flomizData.items.length > 0) {
          activeItems = flomizData.items
          source = 'flomiz_api'
          isCached = Boolean(flomizData.cached)
        }
      } catch (err) {
        console.warn('Flomiz API sync failed, falling back to local inventory:', err.message)
      }
    }

    // Filter inventory according to 4Cs and query params
    const queryParams = Object.fromEntries(url.searchParams.entries())
    const filtered = filterInventory(activeItems, queryParams)

    // Check if user is an approved dealer to surface wholesale pricing
    const isApprovedDealer = user?.account_type === 'dealer' && user?.dealer_status === 'approved'
    const sanitized = filtered.map(item => {
      const copy = { ...item }
      if (!isApprovedDealer) {
        delete copy.wholesalePrice
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
    keyPrefix: apiKey ? `${apiKey.slice(0, 10)}...` : null,
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

    const result = parseDiamondSpreadsheet(content)

    if (result.items.length === 0) {
      return json(res, 400, {
        error: 'No valid diamond rows found in the uploaded file.',
        skipped: result.skipped,
      })
    }

    if (mode === 'replace') {
      memoryInventory = result.items
    } else {
      // Append mode: update matching SKUs or add new ones
      const existingSkuMap = new Map(memoryInventory.map(item => [item.sku, item]))
      for (const item of result.items) {
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
          category: item.category || input.defaultCategory || 'Loose Fancy Diamonds',
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
          dealer_price: item.wholesalePrice || 0,
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
      if (status && status !== 'all') {
        query += `&status=eq.${encodeURIComponent(status)}`
      }
      if (category && category !== 'all') {
        query += `&category=eq.${encodeURIComponent(category)}`
      }
      const rows = await db(query)
      if (Array.isArray(rows)) {
        items = rows.map(r => ({
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
          customerPrice: parseFloat(r.customer_price) || 0,
          dealerPrice: parseFloat(r.dealer_price) || 0,
          price: parseFloat(r.customer_price) || 0,
          wholesalePrice: parseFloat(r.dealer_price) || 0,
          measurements: r.measurements,
          imageUrl: r.image_url,
          videoUrl: r.video_url,
          status: r.status,
          source: r.source,
          updatedAt: r.updated_at,
          createdAt: r.created_at,
        }))
      }
    } catch (err) {
      console.warn('Failed to load admin diamonds from DB:', err.message)
    }
  }

  // Fallback to memoryInventory if DB has no rows
  if (items.length === 0 && memoryInventory.length > 0) {
    items = memoryInventory.map(item => ({
      ...item,
      category: item.category || 'Certified Diamonds',
      customerPrice: item.price,
      dealerPrice: item.wholesalePrice,
      status: item.status || 'published',
      source: item.source || 'excel_upload',
    }))
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

  const counts = {
    total: items.length,
    pendingReview: items.filter(i => i.status === 'pending_review').length,
    published: items.filter(i => i.status === 'published').length,
    hidden: items.filter(i => i.status === 'hidden').length,
  }

  return json(res, 200, { items, counts })
}

export async function handleUpdateAdminDiamond(req, res, admin, diamondId) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })
  const input = await bodyJson(req)

  const updates = {
    updated_at: new Date().toISOString(),
  }

  if (input.category !== undefined) updates.category = String(input.category).trim()
  if (input.customerPrice !== undefined) updates.customer_price = parseFloat(input.customerPrice) || 0
  if (input.dealerPrice !== undefined) updates.dealer_price = parseFloat(input.dealerPrice) || 0
  if (input.price !== undefined) updates.customer_price = parseFloat(input.price) || 0
  if (input.wholesalePrice !== undefined) updates.dealer_price = parseFloat(input.wholesalePrice) || 0
  if (input.status !== undefined) updates.status = input.status

  if (supabaseReady()) {
    try {
      await db(`diamonds_inventory?id=eq.${diamondId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(updates),
      })
    } catch (err) {
      try {
        await db(`diamonds_inventory?sku=eq.${diamondId}`, {
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
  const memItem = memoryInventory.find(i => i.id === diamondId || i.sku === diamondId)
  if (memItem) {
    if (updates.category) memItem.category = updates.category
    if (updates.customer_price !== undefined) memItem.price = updates.customer_price
    if (updates.dealer_price !== undefined) memItem.wholesalePrice = updates.dealer_price
    if (updates.status) memItem.status = updates.status
  }

  return json(res, 200, { success: true, message: 'Diamond updated successfully.' })
}

export async function handleBatchPublishAdminDiamonds(req, res, admin) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })
  const input = await bodyJson(req).catch(() => ({}))

  if (supabaseReady()) {
    try {
      if (Array.isArray(input.ids) && input.ids.length > 0) {
        for (const id of input.ids) {
          await db(`diamonds_inventory?id=eq.${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'published', updated_at: new Date().toISOString() }),
          })
        }
      } else {
        await db('diamonds_inventory?status=eq.pending_review', {
          method: 'PATCH',
          body: JSON.stringify({ status: 'published', updated_at: new Date().toISOString() }),
        })
      }
    } catch (err) {
      console.warn('Batch publish DB failed:', err.message)
    }
  }

  memoryInventory.forEach(item => {
    if (item.status === 'pending_review') {
      item.status = 'published'
    }
  })

  return json(res, 200, { success: true, message: 'All pending diamonds have been published to the live website.' })
}

export async function handleSyncFlomizToStaging(req, res, admin) {
  if (!admin) return json(res, 401, { error: 'Admin authorization required.' })
  if (!isFlomizConfigured()) {
    return json(res, 503, { error: 'Flomiz API key or domain is not configured yet.' })
  }

  const flomizData = await syncFlomizCatalog(1, 100, true)
  if (!flomizData || !Array.isArray(flomizData.items)) {
    return json(res, 502, { error: 'Unable to fetch diamonds from Flomiz API at this moment.' })
  }

  const dbRows = flomizData.items.map(item => ({
    sku: item.sku,
    category: 'Certified Diamonds',
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
    customer_price: item.price || 0,
    dealer_price: item.wholesalePrice || 0,
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

  return json(res, 200, {
    success: true,
    count: dbRows.length,
    message: `Successfully fetched ${dbRows.length} certified diamonds from Flomiz API into Staging (Pending Review).`,
  })
}
