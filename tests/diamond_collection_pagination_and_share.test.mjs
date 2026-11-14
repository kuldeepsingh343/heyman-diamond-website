import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Diamond Collection: 9-Item Pagination & Social Share Verification', () => {
  const tsxPath = resolve(process.cwd(), 'src/DiamondCollection.tsx')
  const cssPath = resolve(process.cwd(), 'src/DiamondCollection.css')
  const tsx = readFileSync(tsxPath, 'utf8')
  const css = readFileSync(cssPath, 'utf8')

  it('configures DIAMONDS_PER_PAGE strictly to 9 for a 3x3 storefront grid', () => {
    assert.match(tsx, /const\s+DIAMONDS_PER_PAGE\s*=\s*9/)
  })

  it('implements interleaveByCategory to balance collections from Page 1', () => {
    assert.match(tsx, /function\s+interleaveByCategory/)
    assert.match(tsx, /displayItems\s*=\s*selectedCategory\s*===\s*'all'\s*\?\s*interleaveByCategory\(filteredItems\)\s*:\s*filteredItems/)
  })

  it('resets page to 1 whenever category, shape, or search filter changes', () => {
    assert.match(tsx, /useEffect\(\(\)\s*=>\s*\{\s*setCurrentPage\(1\)\s*\}\s*,\s*\[selectedCategory,\s*selectedShape,\s*searchQuery\]\)/)
  })

  it('renders accessible pagination navigation with Previous, Next, and Page Numbers', () => {
    assert.match(tsx, /className="diamond-pagination"/)
    assert.match(tsx, /className="pagination-btn pagination-prev"/)
    assert.match(tsx, /className="pagination-btn pagination-next"/)
    assert.match(tsx, /className=\{`pagination-number-btn \$\{safeCurrentPage === page \? 'pagination-number-btn--active' : ''\}`\}/)
  })

  it('supports deep-link auto-opening of diamonds via ?sku= or ?diamond= in URL', () => {
    assert.match(tsx, /params\.get\('sku'\)\s*\|\|\s*params\.get\('diamond'\)/)
    assert.match(tsx, /setActiveMediaDiamond\(found\)/)
  })

  it('provides WhatsApp, SMS, Email, and Copy Link share buttons in diamond viewer modal', () => {
    assert.match(tsx, /className="media-modal-share"/)
    assert.match(tsx, /className="share-btn share-btn--whatsapp"/)
    assert.match(tsx, /className="share-btn share-btn--sms"/)
    assert.match(tsx, /className="share-btn share-btn--email"/)
    assert.match(tsx, /className="share-btn share-btn--copy"/)
    assert.match(tsx, /api\.whatsapp\.com\/send\?text=/)
    assert.match(tsx, /sms:\?&body=/)
    assert.match(tsx, /mailto:\?subject=/)
  })

  it('defines comprehensive CSS rules for diamond pagination and sharing buttons', () => {
    assert.match(css, /\.diamond-pagination\s*\{/)
    assert.match(css, /\.pagination-number-btn--active\s*\{/)
    assert.match(css, /\.media-modal-share\s*\{/)
    assert.match(css, /\.share-btn--whatsapp\s*\{[^}]*background:\s*#25D366/)
    assert.match(css, /\.share-btn--sms\s*\{[^}]*background:\s*#007aff/)
  })
})
