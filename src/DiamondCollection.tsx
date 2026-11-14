import { useState, useEffect } from 'react'
import type { UserProfile } from './AuthPages'
import './DiamondCollection.css'
import { getDiamondMedia, isDirectVideoFile } from './diamondUtils'
import DiamondShapeFilter from './DiamondShapeFilter'
import { DIAMOND_SHAPES } from './diamondShapesData'

export interface PublicDiamondItem {
  id?: string
  sku: string
  category: string
  shape: string
  carat: number
  color: string
  clarity: string
  cut: string
  polish?: string
  symmetry?: string
  fluorescence?: string
  lab?: string
  certificateNumber?: string
  price: number
  listPrice?: number
  discountPrice?: number | null
  discountPercent?: number | null
  customerPrice?: number
  wholesalePrice?: number
  dealerPrice?: number
  measurements?: string
  imageUrl?: string | null
  videoUrl?: string | null
  status?: string
}

interface DiamondCollectionProps {
  currentUser: UserProfile | null
  onCartChange?: () => void
}

const categoriesMeta = [
  {
    categoryKey: 'Loose Fancy Diamonds',
    number: '01',
    name: 'Loose Fancy Diamonds',
    description: 'Explore fancy shapes and distinctive diamond styles.',
    image: '/loose-fancy-diamonds.jpg',
  },
  {
    categoryKey: 'Round Melee Diamonds',
    number: '02',
    name: 'Round Melee Diamonds',
    description: 'Round diamonds for jewelry manufacturing and design.',
    image: '/round-melee-diamonds.jpg',
  },
  {
    categoryKey: 'Certified Diamonds',
    number: '03',
    name: 'Certified Diamonds',
    description: 'Explore certified stones and ask our team for details.',
    image: '/certified-diamonds.jpg',
  },
  {
    categoryKey: 'Solitaire Non-Certified Diamonds',
    number: '04',
    name: 'Solitaire Non-Certified Diamonds',
    description: 'Ask us about available colors, sizes, and specifications.',
    image: '/solitaire-non-certified-diamonds.jpg',
  },
  {
    categoryKey: 'Matched Pairs',
    number: '05',
    name: 'Match Pairs',
    description: 'Find matching diamond pairs for your next design.',
    image: '/matched-pairs-diamonds.jpg',
  },
]

const categoryFilters = [
  { label: 'All Collections', value: 'all' },
  { label: 'Certified Diamonds', value: 'Certified Diamonds' },
  { label: 'Round Melee Diamonds', value: 'Round Melee Diamonds' },
  { label: 'Loose Fancy Diamonds', value: 'Loose Fancy Diamonds' },
  { label: 'Solitaire Non-Certified Diamonds', value: 'Solitaire Non-Certified Diamonds' },
  { label: 'Match Pairs', value: 'Matched Pairs' },
]


export default function DiamondCollection({ currentUser, onCartChange }: DiamondCollectionProps) {
  const [items, setItems] = useState<PublicDiamondItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedShape, setSelectedShape] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [addedSku, setAddedSku] = useState<string | null>(null)
  const [activeMediaDiamond, setActiveMediaDiamond] = useState<PublicDiamondItem | null>(null)
  const [mediaTab, setMediaTab] = useState<'video' | 'photo'>('video')
  const [diamondGallery, setDiamondGallery] = useState<{
    id: string
    diamond_id: string
    type: 'image' | 'video'
    storage_path: string
    public_url: string
    sort_order: number
    is_primary: boolean
    alt_text?: string
  }[]>([])
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0)

  const isApprovedDealer =
    currentUser?.account_type === 'dealer' && currentUser?.dealer_status === 'approved'
  const isPendingDealer =
    currentUser?.account_type === 'dealer' && currentUser?.dealer_status !== 'approved'

  const closeMediaModal = () => {
    setActiveMediaDiamond(null)
    setDiamondGallery([])
    setActiveGalleryIndex(0)
  }

  // Fetch gallery media when active diamond modal opens
  useEffect(() => {
    if (!activeMediaDiamond) return
    let active = true
    const stoneId = activeMediaDiamond.id || activeMediaDiamond.sku
    fetch(`/api/diamonds/${encodeURIComponent(stoneId)}/media`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => {
        if (!active) return
        const list: typeof diamondGallery = Array.isArray(data.items) ? data.items : []
        setDiamondGallery(list)
        const primaryIdx = list.findIndex(m => m.is_primary)
        setActiveGalleryIndex(primaryIdx >= 0 ? primaryIdx : 0)
      })
      .catch(() => {
        if (active) setDiamondGallery([])
      })
    return () => { active = false }
  }, [activeMediaDiamond])

  // Fetch live inventory
  useEffect(() => {
    let active = true

    const token = typeof window !== 'undefined' ? localStorage.getItem('hmd_access_token') : null
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const url = selectedCategory === 'all'
      ? '/api/inventory'
      : `/api/inventory?category=${encodeURIComponent(selectedCategory)}`

    fetch(url, { headers })
      .then(res => {
        if (!res.ok) throw new Error('Unable to load live inventory.')
        return res.json()
      })
      .then(data => {
        if (!active) return
        setItems(Array.isArray(data.items) ? data.items : [])
        setError(null)
      })
      .catch(err => {
        if (!active) return
        console.warn('Live catalog fetch notice:', err.message)
        setError('Live inventory is loading. You can also contact our team directly for custom stone requests.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedCategory])

  const handleSelectCategoryCard = (categoryKey: string) => {
    setLoading(true)
    setSelectedCategory(categoryKey)
    setSelectedShape('all')
    const target = document.getElementById('diamond-shape-filter-section') || document.getElementById('diamond-catalog-grid')
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleSelectTab = (tabValue: string) => {
    setLoading(true)
    setSelectedCategory(tabValue)
    setSelectedShape('all')
  }

  const addToCart = (diamond: PublicDiamondItem) => {
    try {
      const effectivePrice = isApprovedDealer
        ? (diamond.wholesalePrice || diamond.dealerPrice || diamond.customerPrice || diamond.price || 0)
        : (diamond.customerPrice || diamond.price || 0)

      const currentCart = JSON.parse(localStorage.getItem('hmd_cart') || '[]')
      const existing = currentCart.find((c: { sku: string }) => c.sku === diamond.sku)
      let nextCart
      if (existing) {
        nextCart = currentCart.map((c: { sku: string; quantity: number; price?: number }) =>
          c.sku === diamond.sku ? { ...c, quantity: (c.quantity || 1) + 1, price: effectivePrice } : c
        )
      } else {
        nextCart = [...currentCart, { ...diamond, price: effectivePrice, quantity: 1 }]
      }
      sessionStorage.setItem('hmd_guest_cart_active', 'true')
      localStorage.setItem('hmd_cart', JSON.stringify(nextCart))
      window.dispatchEvent(new Event('storage'))
      if (onCartChange) onCartChange()

      const totalItems = nextCart.reduce((s: number, i: { quantity?: number }) => s + (i.quantity || 1), 0)
      const subtotal = nextCart.reduce((s: number, i: { price?: number; quantity?: number }) => s + ((i.price || 0) * (i.quantity || 1)), 0)

      // Micro-interaction on clicked button
      setAddedSku(diamond.sku)
      setTimeout(() => {
        setAddedSku(prev => (prev === diamond.sku ? null : prev))
      }, 1800)

      // Dispatch Amazon-style added to cart event to sync across header and drawer
      window.dispatchEvent(
        new CustomEvent('hmd-cart-added', {
          detail: {
            diamond: {
              sku: diamond.sku,
              shape: diamond.shape,
              carat: diamond.carat,
              color: diamond.color,
              clarity: diamond.clarity,
              cut: diamond.cut || 'Excellent',
              price: effectivePrice,
              certificateNumber: diamond.certificateNumber || '',
              imageUrl: diamond.imageUrl || null,
            },
            totalItems,
            subtotal,
          },
        })
      )

      setToastMessage(`✓ Added ${diamond.shape} ${diamond.carat}ct (${diamond.sku}) to your cart.`)
      setTimeout(() => setToastMessage(null), 3500)
    } catch (e) {
      console.warn('Cart error:', e)
    }
  }

  // Client-side filtering for shape and search text
  const filteredItems = items.filter(item => {
    if (selectedShape !== 'all') {
      const targetShape = selectedShape.toLowerCase().replace(/[\s-_]/g, '')
      const itemShape = (item.shape || '').toLowerCase().replace(/[\s-_]/g, '')
      const shapeDef = DIAMOND_SHAPES.find(s =>
        s.name.toLowerCase().replace(/[\s-_]/g, '') === targetShape ||
        s.id.toLowerCase().replace(/[\s-_]/g, '') === targetShape ||
        s.aliases.some(a => a.toLowerCase().replace(/[\s-_]/g, '') === targetShape)
      )
      const matches =
        itemShape === targetShape ||
        (shapeDef && shapeDef.aliases.some(a => a.toLowerCase().replace(/[\s-_]/g, '') === itemShape)) ||
        itemShape.includes(targetShape) ||
        targetShape.includes(itemShape)

      if (!matches) {
        return false
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const matchSku = item.sku?.toLowerCase().includes(q)
      const matchCert = item.certificateNumber?.toLowerCase().includes(q)
      const matchShape = item.shape?.toLowerCase().includes(q)
      const matchColor = item.color?.toLowerCase().includes(q)
      const matchClarity = item.clarity?.toLowerCase().includes(q)
      const matchCategory = item.category?.toLowerCase().includes(q)
      if (!matchSku && !matchCert && !matchShape && !matchColor && !matchClarity && !matchCategory) {
        return false
      }
    }
    return true
  })

  return (
    <section className="collection diamond-collection-section" id="collection">
      {/* ── Section Heading ── */}
      <div className="section-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            FIND YOUR PERFECT STONE
          </div>
          <h2>
            Explore our <em>diamond</em> collections.
          </h2>
        </div>
        <p>
          From individual certified solitaires to matching pairs and calibrated round melee,
          browse our live inventory below or contact our sales team for bespoke sourcing.
        </p>
      </div>

      {/* ── 5 Visual Category Cards ── */}
      <div className="category-grid" aria-label="Diamond Categories">
        {categoriesMeta.map(category => (
          <button
            type="button"
            className={`category-card category-card-button ${selectedCategory === category.categoryKey ? 'category-card-button--active' : ''}`}
            key={category.number}
            onClick={() => handleSelectCategoryCard(category.categoryKey)}
            title={`View ${category.name}`}
          >
            <div className="category-image-wrap">
              <img
                className="category-image"
                src={category.image}
                alt=""
                loading="lazy"
              />
              <span className="category-number">{category.number}</span>
            </div>
            <div className="category-copy">
              <h3>{category.name}</h3>
              <p>{category.description}</p>
              <span className="text-link">Explore stones →</span>
            </div>
          </button>
        ))}
      </div>

      {/* ── Toast Notification Banner ── */}
      {toastMessage && (
        <div className="diamond-cart-toast" role="status">
          <span>{toastMessage}</span>
          <a href="#account" className="toast-cart-link">View Cart & Shortlist →</a>
        </div>
      )}

      {/* ── Live Diamond Catalog Explorer ── */}
      <div className="diamond-catalog-wrap" id="diamond-catalog-grid">
        <div className="diamond-catalog-header">
          <div className="diamond-catalog-title-box">
            <h3>Live Diamond Inventory</h3>
            <span className="diamond-count-pill">
              {filteredItems.length} {filteredItems.length === 1 ? 'Stone Available' : 'Stones Available'}
            </span>
          </div>

          {/* Pricing Access Indicator */}
          <div className="pricing-access-pill">
            {isApprovedDealer ? (
              <span className="access-dealer">
                💎 <strong>Dealer Trade Pricing Active:</strong> Wholesale rates unlocked.
              </span>
            ) : isPendingDealer ? (
              <span className="access-pending">
                ⏳ <strong>Dealer Account Pending Review:</strong> Wholesale rates unlock after admin verification.
              </span>
            ) : (
              <span className="access-retail">
                🏷️ <strong>Customer Retail Pricing:</strong> Are you a jeweler or dealer?{' '}
                <a href="#signup-dealer">Apply for Dealer Account</a> to unlock wholesale pricing.
              </span>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="diamond-catalog-toolbar">
          {/* Category Tabs */}
          <div className="diamond-category-tabs" role="tablist" aria-label="Diamond Categories">
            {categoryFilters.map(tab => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={selectedCategory === tab.value}
                className={`diamond-tab-btn ${selectedCategory === tab.value ? 'diamond-tab-btn--active' : ''}`}
                onClick={() => handleSelectTab(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Interactive Diamond Shapes Filter (Real Diamond Photos) ── */}
          <DiamondShapeFilter
            selectedShape={selectedShape}
            onSelectShape={(shape: string) => setSelectedShape(shape)}
            selectedCategoryName={
              selectedCategory === 'all'
                ? 'All Diamond Collections'
                : selectedCategory
            }
          />

          {/* Search Controls */}
          <div className="diamond-toolbar-controls">
            <div className="diamond-search-box">
              <input
                type="text"
                placeholder="🔍 Search SKU, Cert #, Color, Clarity, Shape…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="diamond-search-input"
                aria-label="Search diamond products"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Products Display ── */}
        {loading ? (
          <div className="diamond-loading-state">
            <div className="diamond-spinner" />
            <p>Loading live diamond inventory…</p>
          </div>
        ) : error && items.length === 0 ? (
          <div className="diamond-empty-state">
            <p>{error}</p>
            <a href="#contact" className="button-primary">Talk to Our Sales Team</a>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="diamond-empty-state">
            <div className="empty-state-gem-icon">💎</div>
            <h4>
              {selectedShape !== 'all'
                ? `No In-Stock ${selectedShape} Diamonds Found in This Category`
                : 'No diamonds match your selected filters'}
            </h4>
            <p>
              {selectedShape !== 'all'
                ? `Looking for an exclusive ${selectedShape} cut? Hey Man Diamond LLC custom cuts, calibrates, and sources fine lab-grown stones to your exact carat, color, and clarity specifications.`
                : 'Try selecting "All Shapes" or clearing your search keywords to view available stones.'}
            </p>
            <div className="empty-state-actions">
              {selectedShape !== 'all' ? (
                <>
                  <a
                    href={`mailto:sales@heymandiamond.com?subject=Custom%20Sourcing%20Request%3A%20${encodeURIComponent(selectedShape)}%20Diamond&body=Hello%20Hey%20Man%20Diamond%20Team%2C%0A%0AI%20am%20looking%20for%20a%20${encodeURIComponent(selectedShape)}%20cut%20diamond.%20Could%20you%20please%20share%20availability%20or%20a%20custom%20cutting%20quote%3F%0A%0ARequirements%3A%0A-%20Shape%3A%20${encodeURIComponent(selectedShape)}%0A-%20Target%20Carat%3A%20%0A-%20Preferred%20Color%20%26%20Clarity%3A%20%0A-%20Delivery%20Timeline%3A%20`}
                    className="button-primary"
                  >
                    Request Custom {selectedShape} Cut →
                  </a>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      setSelectedShape('all')
                      setSearchQuery('')
                    }}
                  >
                    View All Available Shapes
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => {
                    setSelectedCategory('all')
                    setSelectedShape('all')
                    setSearchQuery('')
                  }}
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="public-diamond-grid">
            {filteredItems.map(item => {
              const displayCustomerPrice = item.customerPrice || item.price || 0
              const displayDealerPrice = item.dealerPrice || item.wholesalePrice || 0

              return (
                <article className="public-diamond-card" key={item.sku}>
                  {/* Top Badges */}
                  <div className="card-top-badges">
                    <span className="lab-badge">
                      {item.lab && item.lab !== 'N/A' ? `${item.lab} Certified` : 'Certified Stone'}
                    </span>
                    <span className="category-tag-badge">{item.category || 'Fine Diamond'}</span>
                  </div>

                  {/* Diamond Photo / 360 Video Showcase */}
                  <div
                    className="card-media-wrapper"
                    onClick={() => {
                      setActiveMediaDiamond(item)
                      setMediaTab(item.videoUrl ? 'video' : 'photo')
                    }}
                    role="button"
                    tabIndex={0}
                    title="Click to view stone media & specifications"
                  >
                    <img
                      src={getDiamondMedia(item).imageUrl}
                      alt={`${item.shape} ${item.carat}ct Diamond`}
                      className="card-diamond-image"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.onerror = null
                        e.currentTarget.src = '/diamond-placeholder.svg'
                      }}
                    />
                    <div className="card-media-overlay">
                      {item.videoUrl ? (
                        <span className="card-video-pill">
                          <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" aria-hidden="true">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                          </svg>
                          360° Video
                        </span>
                      ) : getDiamondMedia(item).hasActualImage ? (
                        <span className="card-photo-pill">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" aria-hidden="true">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                          View Photo
                        </span>
                      ) : (
                        <span className="card-photo-pill" style={{ opacity: 0.9 }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" aria-hidden="true">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                          View Specs
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stone Header */}
                  <div className="card-stone-heading">
                    <h4 className="stone-shape-name">
                      {item.shape} Diamond
                    </h4>
                    <span className="stone-carat-tag">{item.carat} ct</span>
                  </div>

                  {/* 4Cs Specifications Strip */}
                  <div className="card-specs-row">
                    <span className="spec-item">
                      <small>Color</small>
                      <strong>{item.color}</strong>
                    </span>
                    <span className="spec-pipe">|</span>
                    <span className="spec-item">
                      <small>Clarity</small>
                      <strong>{item.clarity}</strong>
                    </span>
                    <span className="spec-pipe">|</span>
                    <span className="spec-item">
                      <small>Cut</small>
                      <strong>{item.cut || 'Excellent'}</strong>
                    </span>
                  </div>

                  {/* Details / Dimensions */}
                  <div className="card-tech-details">
                    <div className="tech-detail-row">
                      <span>Report / Cert:</span>
                      <strong>{item.certificateNumber || 'On file'}</strong>
                    </div>
                    <div className="tech-detail-row">
                      <span>Measurements:</span>
                      <span>{item.measurements || 'Available on request'}</span>
                    </div>
                    <div className="tech-detail-row">
                      <span>SKU:</span>
                      <span className="sku-mono">{item.sku}</span>
                    </div>
                  </div>

                  {/* Dual-Tier Pricing Display */}
                  <div className="card-pricing-block">
                    {/* 1. Customer Price (Visible for non-dealers or when retail price is available) */}
                    {!isApprovedDealer && (
                      <div className="customer-price-box">
                        <span className="price-label">Customer Price</span>
                        {item.discountPrice && item.discountPercent && item.listPrice && item.listPrice > item.discountPrice ? (
                          <div className="discount-price-display">
                            <span className="price-list-struck">${item.listPrice.toLocaleString()}</span>
                            <span className="price-value price-value--discounted">${item.discountPrice.toLocaleString()}</span>
                            <span className="discount-tag-badge">{Math.round(item.discountPercent)}% OFF</span>
                          </div>
                        ) : (
                          <div className="price-value">
                            ${displayCustomerPrice.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 2. Diamond Dealer Price (Strictly Gated for Approved Dealers) */}
                    <div className="dealer-price-box">
                      {isApprovedDealer ? (
                        <div className="dealer-price-unlocked">
                          <span className="dealer-label">💎 Dealer Wholesale Rate</span>
                          {item.discountPrice && item.discountPercent && item.listPrice && item.listPrice > item.discountPrice ? (
                            <div className="discount-price-display">
                              <span className="price-list-struck">${item.listPrice.toLocaleString()}</span>
                              <span className="dealer-price-value dealer-price-value--discounted">${item.discountPrice.toLocaleString()}</span>
                              <span className="discount-tag-badge discount-tag-badge--dealer">{Math.round(item.discountPercent)}% OFF</span>
                            </div>
                          ) : (
                            <div className="dealer-price-value">
                              ${displayDealerPrice.toLocaleString()}
                            </div>
                          )}
                          <small className="dealer-discount-badge">Approved Trade Partner Rate</small>
                        </div>
                      ) : isPendingDealer ? (
                        <div className="dealer-price-locked dealer-price-locked--pending">
                          <span className="dealer-lock-icon">⏳</span>
                          <span className="dealer-lock-text">
                            <strong>Dealer Wholesale Rate</strong>
                            <small>Pending admin approval</small>
                          </span>
                        </div>
                      ) : (
                        <div className="dealer-price-locked">
                          <span className="dealer-lock-icon">🔒</span>
                          <span className="dealer-lock-text">
                            <strong>Dealer Wholesale Rate</strong>
                            <small>
                              <a href="#signin">Sign In</a> or <a href="#signup-dealer">Register as Dealer</a>
                            </small>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="card-actions-row">
                    <button
                      type="button"
                      className={`button-primary card-add-btn ${addedSku === item.sku ? 'card-add-btn--added' : ''}`}
                      onClick={() => addToCart(item)}
                    >
                      {addedSku === item.sku ? '✓ Added to Cart!' : '+ Add to Cart'}
                    </button>
                    <a
                      href={`mailto:sales@heymandiamond.com?subject=Inquiry%20about%20${encodeURIComponent(item.shape)}%20${item.carat}ct%20(${encodeURIComponent(item.sku)})&body=Hello%20Hey%20Man%20Diamond%20Team,%0A%0AI%20am%20interested%20in%20learning%20more%20about%20SKU%20${encodeURIComponent(item.sku)}%20(${encodeURIComponent(item.shape)}%20${item.carat}ct,%20Color%20${encodeURIComponent(item.color)},%20Clarity%20${encodeURIComponent(item.clarity)}).%0A%0APlease%20let%20me%20know%20availability%20and%20shipping%20details.`}
                      className="card-inquire-btn"
                      title="Contact sales about this stone"
                    >
                      Inquire
                    </a>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Luxury Diamond Media Viewer Modal (Photos & 360° Videos) ── */}
      {activeMediaDiamond && (
        <div
          className="diamond-media-modal-backdrop"
          onClick={closeMediaModal}
          role="dialog"
          aria-label="Diamond Media Viewer"
        >
          <div
            className="diamond-media-modal"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="media-modal-close"
              onClick={closeMediaModal}
              aria-label="Close viewer"
            >
              ✕
            </button>

            <div className="media-modal-grid">
              {/* Left: Media Display Pane */}
              <div className="media-modal-viewer">
                {diamondGallery.length === 0 && activeMediaDiamond.videoUrl && (
                  <div className="media-modal-tabs">
                    <button
                      type="button"
                      className={`media-tab-btn ${mediaTab === 'video' ? 'media-tab-btn--active' : ''}`}
                      onClick={() => setMediaTab('video')}
                    >
                      ▶ 360° Video
                    </button>
                    <button
                      type="button"
                      className={`media-tab-btn ${mediaTab === 'photo' ? 'media-tab-btn--active' : ''}`}
                      onClick={() => setMediaTab('photo')}
                    >
                      📷 High-Res Photo
                    </button>
                  </div>
                )}

                <div className="media-display-area">
                  {diamondGallery.length > 0 ? (
                    diamondGallery[activeGalleryIndex]?.type === 'video' ? (
                      isDirectVideoFile(diamondGallery[activeGalleryIndex].public_url) ? (
                        <video
                          key={diamondGallery[activeGalleryIndex].id}
                          src={diamondGallery[activeGalleryIndex].public_url}
                          controls
                          autoPlay
                          loop
                          playsInline
                          className="media-modal-video"
                        />
                      ) : (
                        <iframe
                          key={diamondGallery[activeGalleryIndex].id}
                          src={diamondGallery[activeGalleryIndex].public_url}
                          title={diamondGallery[activeGalleryIndex]?.alt_text || `${activeMediaDiamond.shape} 360° Diamond Viewer`}
                          className="media-modal-iframe"
                          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      )
                    ) : (
                      <img
                        key={diamondGallery[activeGalleryIndex]?.id}
                        src={diamondGallery[activeGalleryIndex]?.public_url}
                        alt={diamondGallery[activeGalleryIndex]?.alt_text || `${activeMediaDiamond.shape} Diamond`}
                        className="media-modal-img"
                        onError={(e) => {
                          e.currentTarget.onerror = null
                          e.currentTarget.src = '/diamond-placeholder.svg'
                        }}
                      />
                    )
                  ) : mediaTab === 'video' && activeMediaDiamond.videoUrl ? (
                    isDirectVideoFile(activeMediaDiamond.videoUrl) ? (
                      <video
                        src={activeMediaDiamond.videoUrl}
                        controls
                        autoPlay
                        loop
                        playsInline
                        className="media-modal-video"
                      />
                    ) : (
                      <iframe
                        src={activeMediaDiamond.videoUrl}
                        title={`${activeMediaDiamond.shape} 360° Diamond Viewer`}
                        className="media-modal-iframe"
                        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    )
                  ) : (
                    <img
                      src={getDiamondMedia(activeMediaDiamond).imageUrl}
                      alt={`${activeMediaDiamond.shape} Diamond`}
                      className="media-modal-img"
                      onError={(e) => {
                        e.currentTarget.onerror = null
                        e.currentTarget.src = '/diamond-placeholder.svg'
                      }}
                    />
                  )}
                </div>

                {diamondGallery.length > 1 && (
                  <div className="media-modal-gallery-strip" role="tablist" aria-label="Stone views">
                    {diamondGallery.map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`media-gallery-thumb-btn ${activeGalleryIndex === idx ? 'media-gallery-thumb-btn--active' : ''}`}
                        onClick={() => setActiveGalleryIndex(idx)}
                        title={item.alt_text || (item.type === 'video' ? '360° Video' : 'Photo')}
                      >
                        {item.type === 'video' ? (
                          <div className="thumb-video-badge">▶ 360°</div>
                        ) : (
                          <img src={item.public_url} alt="" loading="lazy" />
                        )}
                        {item.is_primary && <span className="thumb-primary-tag">★</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Stone Profile & Direct Quote Actions */}
              <div className="media-modal-details">
                <div className="media-modal-eyebrow">
                  <span>{activeMediaDiamond.lab && activeMediaDiamond.lab !== 'N/A' ? `${activeMediaDiamond.lab} Certified` : 'Certified Lab Diamond'}</span>
                  <span className="media-modal-sku">SKU: {activeMediaDiamond.sku}</span>
                </div>

                <h3 className="media-modal-title">
                  {activeMediaDiamond.carat} Carat {activeMediaDiamond.shape} Diamond
                </h3>

                <div className="media-modal-specs-table">
                  <div className="spec-row">
                    <span>Color Grade:</span>
                    <strong>{activeMediaDiamond.color}</strong>
                  </div>
                  <div className="spec-row">
                    <span>Clarity Grade:</span>
                    <strong>{activeMediaDiamond.clarity}</strong>
                  </div>
                  <div className="spec-row">
                    <span>Cut Grade:</span>
                    <strong>{activeMediaDiamond.cut || 'Excellent'}</strong>
                  </div>
                  <div className="spec-row">
                    <span>Polish / Symmetry:</span>
                    <strong>{activeMediaDiamond.polish || 'Excellent'} / {activeMediaDiamond.symmetry || 'Excellent'}</strong>
                  </div>
                  <div className="spec-row">
                    <span>Fluorescence:</span>
                    <strong>{activeMediaDiamond.fluorescence || 'None'}</strong>
                  </div>
                  <div className="spec-row">
                    <span>Measurements:</span>
                    <strong>{activeMediaDiamond.measurements || 'Available on request'}</strong>
                  </div>
                  <div className="spec-row">
                    <span>Certificate Report #:</span>
                    <strong>{activeMediaDiamond.certificateNumber || 'On file'}</strong>
                  </div>
                </div>

                <div className="media-modal-pricing">
                  {!isApprovedDealer && (
                    <div className="modal-price-box">
                      <span className="modal-price-label">Customer Price</span>
                      {activeMediaDiamond.discountPrice && activeMediaDiamond.discountPercent && activeMediaDiamond.listPrice && activeMediaDiamond.listPrice > activeMediaDiamond.discountPrice ? (
                        <div className="modal-discount-wrap">
                          <span className="modal-price-struck">${activeMediaDiamond.listPrice.toLocaleString()}</span>
                          <span className="modal-price-value modal-price-value--discounted">${activeMediaDiamond.discountPrice.toLocaleString()}</span>
                          <span className="discount-tag-badge">{Math.round(activeMediaDiamond.discountPercent)}% OFF</span>
                        </div>
                      ) : (
                        <span className="modal-price-value">
                          ${(activeMediaDiamond.customerPrice || activeMediaDiamond.price || 0).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                  {isApprovedDealer && (
                    <div className="modal-price-box modal-price-box--dealer">
                      <span className="modal-price-label">💎 Dealer Wholesale Rate</span>
                      {activeMediaDiamond.discountPrice && activeMediaDiamond.discountPercent && activeMediaDiamond.listPrice && activeMediaDiamond.listPrice > activeMediaDiamond.discountPrice ? (
                        <div className="modal-discount-wrap">
                          <span className="modal-price-struck">${activeMediaDiamond.listPrice.toLocaleString()}</span>
                          <span className="modal-price-value modal-price-value--dealer modal-price-value--discounted">${activeMediaDiamond.discountPrice.toLocaleString()}</span>
                          <span className="discount-tag-badge discount-tag-badge--dealer">{Math.round(activeMediaDiamond.discountPercent)}% OFF</span>
                        </div>
                      ) : (
                        <span className="modal-price-value modal-price-value--dealer">
                          ${(activeMediaDiamond.dealerPrice || activeMediaDiamond.wholesalePrice || activeMediaDiamond.price || 0).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="media-modal-actions">
                  <button
                    type="button"
                    className="button-primary modal-cart-btn"
                    onClick={() => {
                      addToCart(activeMediaDiamond)
                    }}
                  >
                    + Add to Cart &amp; Request Quote
                  </button>
                  <a
                    href={`mailto:sales@heymandiamond.com?subject=Inquiry%20about%20${encodeURIComponent(activeMediaDiamond.shape)}%20${activeMediaDiamond.carat}ct%20(${encodeURIComponent(activeMediaDiamond.sku)})`}
                    className="modal-inquire-btn"
                  >
                    Contact Diamond Specialist
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
