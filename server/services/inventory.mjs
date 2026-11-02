import { json, bodyJson, db, supabaseReady } from './shared.mjs'

const FLOMIZ_URL = process.env.FLOMIZ_STOCK_SUMMARY_URL || 'https://diamond.flomiz.com/FAccount/API/StockSummary/GetData_2.aspx'
const FLOMIZ_CUSTOMER_ID = process.env.FLOMIZ_CUSTOMER_ID
const FLOMIZ_PORTAL_TYPE = Number(process.env.FLOMIZ_PORTAL_TYPE || 1000)
const FLOMIZ_API_USERNAME = process.env.FLOMIZ_API_USERNAME
const FLOMIZ_API_PASSWORD = process.env.FLOMIZ_API_PASSWORD

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
    price: ['price', 'retailprice', 'priceusd', 'amount', 'totalprice', 'saleprice'],
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

    validItems.push({
      sku,
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
      status: 'available',
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
 * Synchronizes inventory from external Flomiz API if configured.
 */
export async function syncFlomizCatalog(page = 1, perPage = 50) {
  if (!FLOMIZ_CUSTOMER_ID) return null
  const auth = FLOMIZ_API_USERNAME && FLOMIZ_API_PASSWORD
    ? { Authorization: `Basic ${Buffer.from(`${FLOMIZ_API_USERNAME}:${FLOMIZ_API_PASSWORD}`).toString('base64')}` }
    : {}

  const response = await fetch(FLOMIZ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...auth },
    body: JSON.stringify({
      CustomerID: FLOMIZ_CUSTOMER_ID,
      PortalType: FLOMIZ_PORTAL_TYPE,
      PageNo: page,
      PageSize: perPage,
    }),
  })

  if (!response.ok) throw new Error(`Supplier API responded with ${response.status}`)
  const data = await response.json()
  return data
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
    if (url.pathname === '/api/catalog' && !FLOMIZ_CUSTOMER_ID) {
      return json(res, 503, { error: 'Diamond inventory is not connected yet.' })
    }
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('perPage') || '24', 10)))

    // Check if external supplier API is active
    if (FLOMIZ_CUSTOMER_ID) {
      try {
        const flomizData = await syncFlomizCatalog(page, perPage)
        if (flomizData?.Data) {
          return json(res, 200, {
            items: flomizData.Data,
            source: 'flomiz_api',
            page,
            perPage,
            totalRecords: flomizData.PageContext?.TotalRecord ?? flomizData.Data.length,
          })
        }
      } catch (err) {
        console.warn('Flomiz API sync failed, falling back to local catalog:', err.message)
      }
    }

    // Filter in-memory / database inventory
    const queryParams = Object.fromEntries(url.searchParams.entries())
    const filtered = filterInventory(memoryInventory, queryParams)

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
      source: 'inventory_catalog',
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
        await db('diamonds_inventory', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(result.items),
        })
        dbPersisted = true
      } catch (dbErr) {
        console.warn('Note: Diamonds table sync to Supabase skipped (table may need migration):', dbErr.message)
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
