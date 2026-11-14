import { useState, useEffect, useRef } from 'react'
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


// Interleaves items across categories so "All Collections" showcases a balanced variety
// of Certified, Solitaires, Match Pairs, Round Melee, and Loose Fancy from Page 1 onwards.
function interleaveByCategory(list: PublicDiamondItem[]): PublicDiamondItem[] {
  if (list.length <= 1) return list
  const groups: Record<string, PublicDiamondItem[]> = {}
  const categoryOrder: string[] = []

  for (const item of list) {
    const cat = item.category || 'Certified Diamonds'
    if (!groups[cat]) {
      groups[cat] = []
      categoryOrder.push(cat)
    }
    groups[cat].push(item)
  }

  if (categoryOrder.length <= 1) return list

  const result: PublicDiamondItem[] = []
  let hasMore = true
  let index = 0

  while (hasMore) {
    hasMore = false
    for (const cat of categoryOrder) {
      if (index < groups[cat].length) {
        result.push(groups[cat][index])
        if (index + 1 < groups[cat].length) {
          hasMore = true
        }
      }
    }
    index++
  }

  return result
}

function getLabBadgeText(item: { lab?: string; category?: string } | null | undefined): string {
  if (!item) return 'Fine Diamond'
  const lab = (item.lab || '').trim()
  const hasValidLab = lab && lab !== 'N/A' && lab.toUpperCase() !== 'NONE'
  if (hasValidLab) {
    return `${lab} Certified`
  }
  const cat = (item.category || '').toLowerCase()
  if (cat.includes('non-certified') || cat.includes('non certified')) {
    return 'Non-Certified'
  }
  if (cat.includes('pair')) {
    return 'Matched Pair'
  }
  return 'Certified Stone'
}

export default function DiamondCollection({ currentUser, onCartChange }: DiamondCollectionProps) {
  const [items, setItems] = useState<PublicDiamondItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedShape, setSelectedShape] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const DIAMONDS_PER_PAGE = 9
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [addedSku, setAddedSku] = useState<string | null>(null)
  const [activeMediaDiamond, setActiveMediaDiamond] = useState<PublicDiamondItem | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
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

  const hasAutoOpenedRef = useRef(false)

  const closeMediaModal = () => {
    setActiveMediaDiamond(null)
    setDiamondGallery([])
    setActiveGalleryIndex(0)
    // Clear sku query parameter so category switching does not unexpectedly re-open the modal
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (url.searchParams.has('sku') || url.searchParams.has('diamond')) {
        url.searchParams.delete('sku')
        url.searchParams.delete('diamond')
        window.history.replaceState({}, '', url.pathname + url.search + url.hash)
      }
    }
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

  // Reset to page 1 whenever category, shape, or search query changes
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedCategory, selectedShape, searchQuery])

  // Auto-open diamond modal once if URL contains ?sku=, ?diamond=, or #diamond-
  useEffect(() => {
    if (items.length === 0 || typeof window === 'undefined' || hasAutoOpenedRef.current) return
    const params = new URLSearchParams(window.location.search)
    const hashIndex = window.location.hash.indexOf('?')
    const hashParams = new URLSearchParams(hashIndex >= 0 ? window.location.hash.slice(hashIndex) : '')
    const targetSku = params.get('sku') || params.get('diamond') || hashParams.get('sku') || hashParams.get('diamond') || (window.location.hash.startsWith('#diamond-') ? window.location.hash.replace('#diamond-', '') : null)
    if (targetSku) {
      const found = items.find(i => i.sku.toLowerCase() === targetSku.toLowerCase())
      if (found) {
        hasAutoOpenedRef.current = true
        setActiveMediaDiamond(found)
        const target = document.getElementById('diamond-catalog-grid')
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' })
        }
      }
    }
  }, [items])

  const getDiamondShareUrl = (diamond: PublicDiamondItem) => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/?sku=${encodeURIComponent(diamond.sku)}#collection`
  }

  const getDiamondShareText = (diamond: PublicDiamondItem) => {
    const isPair = (diamond.category || '').toLowerCase().includes('pair')
    const descriptor = isPair ? 'Matched Pair' : 'Diamond'
    return `Check out this ${diamond.carat}ct ${diamond.shape} ${descriptor} (${diamond.color} / ${diamond.clarity}, SKU: ${diamond.sku}) at Hey Man Diamond LLC!`
  }

  const handleCopyLink = (diamond: PublicDiamondItem) => {
    const url = getDiamondShareUrl(diamond)
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => {
          setCopiedLink(true)
          setTimeout(() => setCopiedLink(false), 2500)
        })
        .catch(() => {
          setToastMessage(`Diamond link: ${url}`)
          setTimeout(() => setToastMessage(null), 3000)
        })
    } else {
      setToastMessage(`Diamond link: ${url}`)
      setTimeout(() => setToastMessage(null), 3000)
    }
  }

  const handleNativeShare = async (diamond: PublicDiamondItem) => {
    const url = getDiamondShareUrl(diamond)
    const text = getDiamondShareText(diamond)
    if (navigator?.share) {
      try {
        await navigator.share({
          title: `${diamond.carat}ct ${diamond.shape} Diamond | Hey Man Diamond LLC`,
          text,
          url,
        })
      } catch {
        // User dismissed share sheet
      }
    }
  }

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

  // When browsing 'All Collections', interleave categories so stones from every collection
  // (Certified, Solitaire Non-Certified, Matched Pairs, Round Melee, Loose Fancy)
  // appear balanced right from Page 1 rather than being separated by batch timestamps.
  const displayItems = selectedCategory === 'all' ? interleaveByCategory(filteredItems) : filteredItems

  // 9 diamonds per page
  const totalPages = Math.max(1, Math.ceil(displayItems.length / DIAMONDS_PER_PAGE))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)
  const startIndex = (safeCurrentPage - 1) * DIAMONDS_PER_PAGE
  const endIndex = Math.min(startIndex + DIAMONDS_PER_PAGE, displayItems.length)
  const paginatedItems = displayItems.slice(startIndex, endIndex)

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
    const target = document.getElementById('diamond-catalog-grid')
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const getPageNumbers = (): (number | string)[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    if (safeCurrentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages]
    }
    if (safeCurrentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    }
    return [1, '...', safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, '...', totalPages]
  }

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
              {displayItems.length} {displayItems.length === 1 ? 'Stone Available' : 'Stones Available'}
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
        ) : displayItems.length === 0 ? (
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
          <>
            <div className="public-diamond-grid">
              {paginatedItems.map(item => {
              const displayCustomerPrice = item.customerPrice || item.price || 0
              const displayDealerPrice = item.dealerPrice || item.wholesalePrice || 0

              return (
                <article className="public-diamond-card" key={item.sku}>
                  {/* Top Badges */}
                  <div className="card-top-badges">
                    <span className="lab-badge">
                      {getLabBadgeText(item)}
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setActiveMediaDiamond(item)
                        setMediaTab(item.videoUrl ? 'video' : 'photo')
                      }
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

            {totalPages > 1 && (
              <nav className="diamond-pagination" aria-label="Diamond inventory pagination">
                <div className="diamond-pagination-summary">
                  Showing <strong>{startIndex + 1}–{endIndex}</strong> of <strong>{displayItems.length}</strong> diamonds (Page {safeCurrentPage} of {totalPages})
                </div>

                <div className="diamond-pagination-controls">
                  <button
                    type="button"
                    className="pagination-btn pagination-prev"
                    disabled={safeCurrentPage === 1}
                    onClick={() => handlePageChange(safeCurrentPage - 1)}
                    aria-label="Previous page"
                  >
                    ‹ Previous
                  </button>

                  <div className="pagination-numbers">
                    {getPageNumbers().map((page, idx) =>
                      page === '...' ? (
                        <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>
                      ) : (
                        <button
                          key={`page-${page}`}
                          type="button"
                          className={`pagination-number-btn ${safeCurrentPage === page ? 'pagination-number-btn--active' : ''}`}
                          onClick={() => handlePageChange(Number(page))}
                          aria-current={safeCurrentPage === page ? 'page' : undefined}
                          aria-label={`Page ${page}`}
                        >
                          {page}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    type="button"
                    className="pagination-btn pagination-next"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => handlePageChange(safeCurrentPage + 1)}
                    aria-label="Next page"
                  >
                    Next ›
                  </button>
                </div>
              </nav>
            )}
          </>
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
                {diamondGallery.length === 0 && activeMediaDiamond.videoUrl && getDiamondMedia(activeMediaDiamond).hasActualImage && (
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
                  <span>{getLabBadgeText(activeMediaDiamond)}</span>
                  <span className="media-modal-sku">SKU: {activeMediaDiamond.sku}</span>
                </div>

                <h3 className="media-modal-title">
                  {activeMediaDiamond.carat} Carat {activeMediaDiamond.shape} {(activeMediaDiamond.category || '').toLowerCase().includes('pair') ? 'Matched Pair' : 'Diamond'}
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

                {/* ── Share Options (WhatsApp, SMS, Email, Copy Link) ── */}
                <div className="media-modal-share">
                  <div className="modal-share-header">
                    <span className="modal-share-label">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                      </svg>
                      Share this Diamond:
                    </span>
                    {copiedLink && <span className="modal-share-copied">✓ Link Copied!</span>}
                  </div>

                  <div className="modal-share-row">
                    {/* WhatsApp */}
                    <a
                      href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${getDiamondShareText(activeMediaDiamond)} ${getDiamondShareUrl(activeMediaDiamond)}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="share-btn share-btn--whatsapp"
                      title="Share on WhatsApp"
                      aria-label="Share on WhatsApp"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.592 2.654-.697c.969.53 1.83.82 2.806.82h.005c3.18 0 5.767-2.586 5.768-5.766 0-1.54-.6-2.988-1.688-4.076-1.088-1.089-2.535-1.686-4.085-1.686zm3.385 8.167c-.14.394-.814.747-1.13.785-.297.037-.681.057-2.146-.554-1.874-.781-3.08-2.693-3.174-.819-.093-.125-.75-1-.75-1.907 0-.907.474-1.353.643-1.536.168-.184.368-.23.491-.23.123 0 .246.002.353.007.112.006.262-.043.41.313.153.368.523 1.275.569 1.368.046.092.077.2.016.323-.061.123-.092.2-.184.307-.092.108-.194.241-.277.324-.093.092-.19.192-.082.378.108.185.479.79 1.028 1.28.707.63 1.303.825 1.488.917.185.092.292.077.4-.046.108-.124.462-.539.585-.724.123-.184.246-.153.415-.092.169.062 1.077.508 1.262.6.185.093.308.139.354.216.046.077.046.446-.094.84zM12 2C6.477 2 2 6.477 2 12c0 1.81.487 3.513 1.336 4.981L2.05 22l5.179-1.258A9.954 9.954 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
                      </svg>
                      <span>WhatsApp</span>
                    </a>

                    {/* Text Message / SMS */}
                    <a
                      href={`sms:?&body=${encodeURIComponent(`${getDiamondShareText(activeMediaDiamond)} ${getDiamondShareUrl(activeMediaDiamond)}`)}`}
                      className="share-btn share-btn--sms"
                      title="Share via Text Message"
                      aria-label="Share via Text Message"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <span>Message</span>
                    </a>

                    {/* Email */}
                    <a
                      href={`mailto:?subject=${encodeURIComponent(`${activeMediaDiamond.carat}ct ${activeMediaDiamond.shape} Diamond - Hey Man Diamond LLC`)}&body=${encodeURIComponent(`${getDiamondShareText(activeMediaDiamond)}\n\nView complete details & 360° video:\n${getDiamondShareUrl(activeMediaDiamond)}`)}`}
                      className="share-btn share-btn--email"
                      title="Share via Email"
                      aria-label="Share via Email"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                      </svg>
                      <span>Email</span>
                    </a>

                    {/* Copy Link */}
                    <button
                      type="button"
                      className="share-btn share-btn--copy"
                      onClick={() => handleCopyLink(activeMediaDiamond)}
                      title="Copy Diamond Link"
                      aria-label="Copy Diamond Link"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                    </button>

                    {/* Native Device Share Sheet (AirDrop, Apps, etc.) */}
                    {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                      <button
                        type="button"
                        className="share-btn share-btn--more"
                        onClick={() => handleNativeShare(activeMediaDiamond)}
                        title="More Sharing Options"
                        aria-label="More Sharing Options"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="1"></circle>
                          <circle cx="19" cy="12" r="1"></circle>
                          <circle cx="5" cy="12" r="1"></circle>
                        </svg>
                        <span>More...</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
