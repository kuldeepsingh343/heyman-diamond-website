import './AuthPages.css'
import { useState, useEffect, useRef, useCallback } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { parseAuthStatusFromHash } from './routeUtils'
import type { PromotionOffer } from './OffersHero'

type Mode = 'signup-customer' | 'signup-dealer' | 'signin' | 'account' | 'admin'
type AccountTab = 'overview' | 'catalog' | 'cart' | 'profile' | 'orders' | 'tools' | 'dealers' | 'offers'

export interface DealerApplication {
  id: string
  user_id: string
  status: string
  registered_business_name: string
  primary_contact: string
  primary_email: string
  business_phone?: string
  submitted_at: string
}

export interface UserProfile {
  email: string
  full_name?: string
  phone?: string
  address?: string
  gender?: string
  account_type?: 'customer' | 'dealer' | 'admin'
  dealer_status?: string
}

export interface DiamondItem {
  sku: string
  shape: string
  carat: number
  color: string
  clarity: string
  cut: string
  polish?: string
  symmetry?: string
  fluorescence?: string
  lab: string
  certificateNumber: string
  price: number
  wholesalePrice?: number
  measurements?: string
  status?: string
}

export interface CartItem extends DiamondItem {
  quantity: number
}

interface UserOrder {
  id: string
  quote_number?: string | number
  order_number?: string | number
  customer_name: string
  status: string
  created_at: string
  customer_message?: string
  quote_request_items?: Array<{
    flomiz_sku: string
    product_name: string
    quantity: number
    current_unit_price?: number
  }>
}

export interface AdminDiamond {
  id?: string
  sku: string
  category: string
  shape: string
  carat: number
  color: string
  clarity: string
  cut?: string
  polish?: string
  symmetry?: string
  fluorescence?: string
  lab?: string
  certificateNumber?: string
  customerPrice: number
  dealerPrice: number
  status: 'published' | 'pending_review' | 'hidden'
  source?: string
  imageUrl?: string | null
  videoUrl?: string | null
}

function getInitialStatus(): { text: string; kind: 'info' | 'error' | 'success' } {
  if (typeof window === 'undefined') return { text: '', kind: 'info' }
  const result = parseAuthStatusFromHash(window.location.hash)
  if (result.accessToken) {
    localStorage.setItem('hmd_access_token', result.accessToken)
    if (result.refreshToken) localStorage.setItem('hmd_refresh_token', result.refreshToken)
    window.history.replaceState(null, '', window.location.pathname + '#account')
  } else if (result.kind === 'error') {
    window.history.replaceState(null, '', window.location.pathname + '#signin')
  }
  return { text: result.text, kind: result.kind }
}

export default function AuthPages({
  mode,
  onUserChange,
}: {
  mode: string
  onUserChange?: (user: UserProfile | null) => void
}) {
  const current = (['signup-customer', 'signup-dealer', 'signin', 'account'].includes(mode) ? mode : 'signin') as Mode
  const dealer = current === 'signup-dealer'
  const signup = current === 'signup-customer' || current === 'signup-dealer'

  // ── user session state ──────────────────────────────────────────────────
  const [user, setUser] = useState<UserProfile | null>(() => {
    if (typeof window === 'undefined') return null
    const token = localStorage.getItem('hmd_access_token')
    const saved = localStorage.getItem('hmd_user')
    if (token && saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return { email: 'Customer', full_name: 'Customer' }
      }
    }
    return null
  })

  const [activeTab, setActiveTab] = useState<AccountTab>(mode === 'admin' ? 'tools' : 'overview')

  // ── signup / signin form state ──────────────────────────────────────────
  const [fullName, setFullName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [gender, setGender] = useState('prefer_not_to_say')
  const [companyName, setCompanyName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // ── async / UX state ────────────────────────────────────────────────────
  const [status, setStatus] = useState<{ text: string; kind: 'info' | 'error' | 'success' }>(getInitialStatus)
  const [busy, setBusy] = useState(false)
  const [resendBusy, setResendBusy] = useState(false)
  const [canResend, setCanResend] = useState(false)

  // ── profile editing state ───────────────────────────────────────────────
  const [editName, setEditName] = useState(user?.full_name || '')
  const [editPhone, setEditPhone] = useState(user?.phone || '')
  const [editAddress, setEditAddress] = useState(user?.address || '')
  const [editGender, setEditGender] = useState(user?.gender || 'prefer_not_to_say')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)

  // ── catalog / diamond inventory state ───────────────────────────────────
  const [catalogItems, setCatalogItems] = useState<DiamondItem[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [selectedShape, setSelectedShape] = useState('all')

  // ── cart state ──────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('hmd_cart')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [submittingCart, setSubmittingCart] = useState(false)
  const [cartMsg, setCartMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)

  // ── orders & quotes state ───────────────────────────────────────────────
  const [orders, setOrders] = useState<UserOrder[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  // ── inventory upload state (Admin / Dealer portal) ──────────────────────
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ── Admin Diamonds Inventory & Price Manager state ───────────────────────
  const [adminDiamonds, setAdminDiamonds] = useState<AdminDiamond[]>([])
  const [loadingAdminDiamonds, setLoadingAdminDiamonds] = useState(false)
  const [diamondFilterCategory, setDiamondFilterCategory] = useState('all')
  const [diamondFilterStatus, setDiamondFilterStatus] = useState('all')
  const [diamondSearch, setDiamondSearch] = useState('')
  const [uploadCategory, setUploadCategory] = useState('Round Melee Diamonds')
  const [syncingFlomiz, setSyncingFlomiz] = useState(false)
  const [flomizSyncMsg, setFlomizSyncMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)
  const [savedDiamondId, setSavedDiamondId] = useState<string | null>(null)

  // ── Offers & Schemes state (Admin / Owner portal) ───────────────────────
  const [promotions, setPromotions] = useState<PromotionOffer[]>([])
  const [loadingPromotions, setLoadingPromotions] = useState(false)
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null)
  const [promoName, setPromoName] = useState('')
  const [promoDesc, setPromoDesc] = useState('')
  const [promoMediaType, setPromoMediaType] = useState<'image' | 'video'>('image')
  const [promoMediaUrl, setPromoMediaUrl] = useState('')
  const [promoCtaText, setPromoCtaText] = useState('Explore Offer')
  const [promoCtaLink, setPromoCtaLink] = useState('#collection')
  const [promoActive, setPromoActive] = useState(true)
  const [promoSaving, setPromoSaving] = useState(false)
  const [promoMsg, setPromoMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)

  // ── Wholesale Dealer Applications state (Admin) ──────────────────────────
  const [dealerApps, setDealerApps] = useState<DealerApplication[]>([])
  const [loadingDealerApps, setLoadingDealerApps] = useState(false)
  const [dealerAppMsg, setDealerAppMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)

  const isUserAdmin = Boolean(
    user?.account_type === 'admin' ||
    user?.email.toLowerCase().includes('heyman') ||
    user?.email.toLowerCase().includes('patel') ||
    user?.email.toLowerCase().includes('kuldeep') ||
    user?.email.toLowerCase().includes('chauhan')
  )

  const fetchPromotions = useCallback(async () => {
    setLoadingPromotions(true)
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch('/api/admin/promotions', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        if (data && Array.isArray(data.promotions)) {
          setPromotions(data.promotions)
          return
        }
      }
      const pubRes = await fetch('/api/promotions')
      if (pubRes.ok) {
        const pubData = await pubRes.json()
        if (pubData && Array.isArray(pubData.promotions)) {
          setPromotions(pubData.promotions)
        }
      }
    } catch {
      // Fallback safe
    } finally {
      setLoadingPromotions(false)
    }
  }, [])

  const handleEditPromo = (item: PromotionOffer) => {
    setEditingPromoId(item.id)
    setPromoName(item.name || '')
    setPromoDesc(item.description || '')
    setPromoMediaType(item.media_type === 'video' ? 'video' : 'image')
    setPromoMediaUrl(item.media_url || '')
    setPromoCtaText(item.cta_text || 'Explore Offer')
    setPromoCtaLink(item.cta_link || '#collection')
    setPromoActive(item.active !== false)
    setPromoMsg(null)
  }

  const handleResetPromoForm = () => {
    setEditingPromoId(null)
    setPromoName('')
    setPromoDesc('')
    setPromoMediaType('image')
    setPromoMediaUrl('')
    setPromoCtaText('Explore Offer')
    setPromoCtaLink('#collection')
    setPromoActive(true)
    setPromoMsg(null)
  }

  const handleSavePromotion = async (e: FormEvent) => {
    e.preventDefault()
    if (!promoName.trim()) {
      setPromoMsg({ text: 'Please enter a name or title for this offer.', kind: 'error' })
      return
    }

    setPromoSaving(true)
    setPromoMsg(null)
    const token = localStorage.getItem('hmd_access_token')
    const payload = {
      name: promoName.trim(),
      description: promoDesc.trim(),
      media_type: promoMediaType,
      media_url: promoMediaUrl.trim(),
      cta_text: promoCtaText.trim() || 'Explore Offer',
      cta_link: promoCtaLink.trim() || '#collection',
      active: promoActive,
    }

    try {
      const url = editingPromoId
        ? `/api/admin/promotions/${editingPromoId}`
        : '/api/admin/promotions'
      const method = editingPromoId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPromoMsg({ text: data.error || 'Failed to save offer banner.', kind: 'error' })
        return
      }

      setPromoMsg({
        text: editingPromoId ? 'Offer banner updated successfully!' : 'New offer banner published successfully!',
        kind: 'success',
      })
      handleResetPromoForm()
      await fetchPromotions()
    } catch {
      setPromoMsg({ text: 'Network connection failed. Please retry.', kind: 'error' })
    } finally {
      setPromoSaving(false)
    }
  }

  const handleDeletePromotion = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove the offer "${name}"?`)) return

    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch(`/api/admin/promotions/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        setPromotions(prev => prev.filter(p => p.id !== id))
        if (editingPromoId === id) handleResetPromoForm()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to delete offer.')
      }
    } catch {
      alert('Network request failed.')
    }
  }

  const fetchDealerApplications = useCallback(async () => {
    setLoadingDealerApps(true)
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch('/api/admin/dealer-applications', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.items)) {
          setDealerApps(data.items)
        }
      }
    } catch (err) {
      console.warn('Failed to fetch dealer applications:', err)
    } finally {
      setLoadingDealerApps(false)
    }
  }, [])

  const handleUpdateDealerStatus = async (appId: string, nextStatus: 'approved' | 'rejected' | 'pending_review') => {
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch(`/api/admin/dealer-applications/${appId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update dealer status.')
      setDealerAppMsg({ text: `Dealer application status updated to: ${nextStatus}.`, kind: 'success' })
      setDealerApps(prev => prev.map(a => a.id === appId ? { ...a, status: nextStatus } : a))
      setTimeout(() => setDealerAppMsg(null), 3000)
    } catch (err) {
      setDealerAppMsg({ text: err instanceof Error ? err.message : 'Update failed', kind: 'error' })
    }
  }

  const fetchAdminDiamonds = useCallback(async () => {
    setLoadingAdminDiamonds(true)
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch('/api/admin/diamonds', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        if (data && Array.isArray(data.items)) {
          setAdminDiamonds(data.items)
        }
      }
    } catch (err) {
      console.warn('Failed to fetch admin diamonds:', err)
    } finally {
      setLoadingAdminDiamonds(false)
    }
  }, [])

  const handleUpdateDiamond = async (diamondId: string, updates: Partial<AdminDiamond>) => {
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch(`/api/admin/diamonds/${diamondId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        setSavedDiamondId(diamondId)
        setTimeout(() => setSavedDiamondId(null), 2500)
        setAdminDiamonds(prev =>
          prev.map(d => (d.id === diamondId || d.sku === diamondId ? { ...d, ...updates } : d))
        )
      }
    } catch (err) {
      console.warn('Failed to update diamond:', err)
    }
  }

  const handleBatchPublish = async () => {
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch('/api/admin/diamonds/batch-publish', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        fetchAdminDiamonds()
      }
    } catch (err) {
      console.warn('Failed to batch publish:', err)
    }
  }

  const handleSyncFlomizStaging = async () => {
    setSyncingFlomiz(true)
    setFlomizSyncMsg({ text: 'Syncing diamonds from Flomiz API to Staging…', kind: 'info' })
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch('/api/admin/diamonds/sync-flomiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      if (res.ok) {
        setFlomizSyncMsg({ text: data.message || 'Successfully fetched diamonds to Staging.', kind: 'success' })
        fetchAdminDiamonds()
      } else {
        setFlomizSyncMsg({ text: data.error || 'Flomiz sync failed.', kind: 'error' })
      }
    } catch (err) {
      setFlomizSyncMsg({ text: err instanceof Error ? err.message : 'Sync request failed.', kind: 'error' })
    } finally {
      setSyncingFlomiz(false)
    }
  }

  const handleTogglePromoActive = async (item: PromotionOffer) => {
    const nextActive = !item.active
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch(`/api/admin/promotions/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ active: nextActive }),
      })
      if (res.ok) {
        setPromotions(prev =>
          prev.map(p => (p.id === item.id ? { ...p, active: nextActive } : p))
        )
      }
    } catch {
      // Safe ignore
    }
  }

  const updateUserSession = useCallback((profile: UserProfile | null) => {
    setUser(profile)
    if (profile) {
      setEditName(profile.full_name || '')
      setEditPhone(profile.phone || '')
      setEditAddress(profile.address || '')
      setEditGender(profile.gender || 'prefer_not_to_say')
    }
    if (onUserChange) onUserChange(profile)
  }, [onUserChange])

  // Save cart to localStorage
  const updateCart = (newCart: CartItem[]) => {
    setCart(newCart)
    localStorage.setItem('hmd_cart', JSON.stringify(newCart))
    window.dispatchEvent(new Event('storage'))
  }

  const addToCart = (diamond: DiamondItem) => {
    const existing = cart.find(c => c.sku === diamond.sku)
    if (existing) {
      updateCart(cart.map(c => c.sku === diamond.sku ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      updateCart([...cart, { ...diamond, quantity: 1 }])
    }
    setCartMsg({ text: `Added ${diamond.shape} ${diamond.carat}ct (${diamond.sku}) to your cart.`, kind: 'success' })
  }

  const removeFromCart = (sku: string) => {
    updateCart(cart.filter(c => c.sku !== sku))
  }

  const loadCatalog = () => {
    setLoadingCatalog(true)
    const token = localStorage.getItem('hmd_access_token')
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    fetch('/api/inventory', { headers })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.items)) {
          setCatalogItems(data.items)
        }
      })
      .catch(err => {
        console.warn('Failed to load catalog:', err)
      })
      .finally(() => setLoadingCatalog(false))
  }

  const loadOrders = () => {
    setLoadingOrders(true)
    const token = localStorage.getItem('hmd_access_token')
    fetch('/api/user/orders', {
      headers: { Authorization: `Bearer ${token || ''}` },
    })
      .then(res => res.json())
      .then(data => {
        const combined = [...(data.quotes || []), ...(data.orders || [])]
        setOrders(combined)
      })
      .catch(err => {
        console.warn('Failed to load orders:', err)
      })
      .finally(() => setLoadingOrders(false))
  }

  const switchTab = (tab: AccountTab) => {
    setActiveTab(tab)
    if (tab === 'catalog' && catalogItems.length === 0) {
      loadCatalog()
    }
    if (tab === 'orders') {
      loadOrders()
    }
    if (tab === 'offers') {
      fetchPromotions()
    }
    if (tab === 'tools') {
      fetchAdminDiamonds()
    }
    if (tab === 'dealers') {
      fetchDealerApplications()
    }
  }

  // Load profile if token is present but user state is empty (e.g. after OAuth redirect)
  useEffect(() => {
    const token = localStorage.getItem('hmd_access_token')
    if (token && !user) {
      fetch('/api/user/profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(data => {
          if (data?.email) {
            const profile: UserProfile = {
              email: data.email,
              full_name: data.full_name || data.email.split('@')[0],
              phone: data.phone || '',
              address: data.address || '',
              gender: data.gender || 'prefer_not_to_say',
              account_type: data.account_type || 'customer',
              dealer_status: data.dealer_status || 'not_applied',
            }
            localStorage.setItem('hmd_user', JSON.stringify(profile))
            updateUserSession(profile)
          }
        })
        .catch(() => {})
    }
  }, [user, updateUserSession])

  // Auto-fetch admin data asynchronously when administrator is logged in
  useEffect(() => {
    let ignore = false
    const token = localStorage.getItem('hmd_access_token')
    if (user && (mode === 'admin' || isUserAdmin)) {
      fetch('/api/admin/diamonds', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(res => res.json())
        .then(data => {
          if (!ignore && data?.items && Array.isArray(data.items)) {
            setAdminDiamonds(data.items)
          }
        })
        .catch(() => {})

      fetch('/api/admin/dealer-applications', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(res => res.json())
        .then(data => {
          if (!ignore && Array.isArray(data?.items)) {
            setDealerApps(data.items)
          }
        })
        .catch(() => {})
    }
    return () => {
      ignore = true
    }
  }, [user, mode, isUserAdmin])

  // Load profile from server when entering profile tab
  useEffect(() => {
    if (user && activeTab === 'profile') {
      const token = localStorage.getItem('hmd_access_token')
      if (token) {
        fetch('/api/user/profile', {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(res => res.json())
          .then(data => {
            if (data?.email) {
              setEditName(data.full_name || '')
              setEditPhone(data.phone || '')
              setEditAddress(data.address || '')
              setEditGender(data.gender || 'prefer_not_to_say')
            }
          })
          .catch(() => {})
      }
    }
  }, [user, activeTab])

  // ── client-side validation for signup ─────────────────────────────────────
  function validate(): string | null {
    if (signup) {
      if (!fullName.trim() || fullName.trim().length < 2)
        return 'Please enter your full name (at least 2 characters).'
      if (!address.trim() || address.trim().length < 5)
        return 'Please enter a valid address.'
      if (!phone.trim() || phone.trim().length < 6)
        return 'Please enter a valid phone number.'
      if (dealer && (!companyName.trim() || companyName.trim().length < 2))
        return 'Please enter your company name.'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return 'Please enter a valid email address.'
    if (password.length < 10)
      return 'Password must be at least 10 characters long.'
    return null
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus({ text: '', kind: 'info' })

    const validationError = validate()
    if (validationError) {
      setStatus({ text: validationError, kind: 'error' })
      return
    }

    setBusy(true)
    try {
      const endpoint = signup ? '/api/auth/signup' : '/api/auth/signin'
      const body = signup
        ? { fullName: fullName.trim(), address: address.trim(), phone: phone.trim(), email: email.trim(), gender, password, companyName: companyName.trim(), accountType: dealer ? 'dealer' : 'customer' }
        : { email: email.trim(), password }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')

      if (!signup && data.accessToken) {
        localStorage.setItem('hmd_access_token', data.accessToken)
        localStorage.setItem('hmd_refresh_token', data.refreshToken || '')
        const profile: UserProfile = data.user || { email: email.trim(), full_name: email.split('@')[0], account_type: 'customer' }
        localStorage.setItem('hmd_user', JSON.stringify(profile))
        updateUserSession(profile)
        const msg = (profile?.account_type === 'admin' || email.toLowerCase().includes('heyman') || email.toLowerCase().includes('kuldeep') || email.toLowerCase().includes('patel') || email.toLowerCase().includes('chauhan'))
          ? 'Signed in as Administrator. Welcome to the Admin Control Center.'
          : (profile?.account_type === 'dealer' && profile?.dealer_status !== 'approved')
          ? 'Signed in. Your dealer access is still awaiting administrator approval.'
          : 'You are signed in successfully.'
        setStatus({ text: msg, kind: 'success' })
        window.location.hash = (mode === 'admin' || profile?.account_type === 'admin' || email.toLowerCase().includes('heyman') || email.toLowerCase().includes('kuldeep')) ? '#admin' : '#account'
      } else {
        setStatus({ text: data.message || 'Request received.', kind: 'success' })
        setCanResend(true)
      }
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : 'Something went wrong.', kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    setProfileSaving(true)
    setProfileMsg(null)

    try {
      const token = localStorage.getItem('hmd_access_token') || ''
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: editName.trim(),
          phone: editPhone.trim(),
          address: editAddress.trim(),
          gender: editGender,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update profile.')

      const updated: UserProfile = {
        ...(user || { email: '' }),
        full_name: editName.trim(),
        phone: editPhone.trim(),
        address: editAddress.trim(),
        gender: editGender,
      }
      localStorage.setItem('hmd_user', JSON.stringify(updated))
      updateUserSession(updated)
      setProfileMsg({ text: 'Your account profile and shipping details have been saved.', kind: 'success' })
    } catch (err) {
      setProfileMsg({ text: err instanceof Error ? err.message : 'Error updating profile.', kind: 'error' })
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleCheckoutCart() {
    if (cart.length === 0) return
    setSubmittingCart(true)
    setCartMsg(null)

    try {
      const token = localStorage.getItem('hmd_access_token')
      const itemPayloads = cart.map(item => ({
        flomiz_sku: item.sku,
        name: `${item.shape} ${item.carat}ct ${item.color} ${item.clarity} (${item.lab})`,
        requestedPrice: item.price,
        quantity: item.quantity,
      }))

      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({
          name: user?.full_name || user?.email || 'Valued Customer',
          phone: user?.phone || '',
          message: `Cart checkout order containing ${cart.length} diamond items. Total value: $${cartTotal.toLocaleString()}.`,
          items: itemPayloads,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit quote request.')

      updateCart([])
      setCartMsg({
        text: `Success! Your order request (${data.quoteNumber || 'Received'}) has been submitted to Hey Man Diamond sales team. We will review and confirm availability immediately.`,
        kind: 'success',
      })
    } catch (err) {
      setCartMsg({ text: err instanceof Error ? err.message : 'Could not submit cart order.', kind: 'error' })
    } finally {
      setSubmittingCart(false)
    }
  }

  async function resendConfirmation() {
    if (!email.trim()) {
      setStatus({ text: 'Please enter your email address before resending.', kind: 'error' })
      return
    }
    setResendBusy(true)
    setStatus({ text: '', kind: 'info' })
    try {
      const response = await fetch('/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to request a new confirmation email.')
      setStatus({ text: data.message || 'If confirmation is still required, a new email has been requested.', kind: 'success' })
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : 'Unable to request a new confirmation email.', kind: 'error' })
    } finally {
      setResendBusy(false)
    }
  }

  async function handleSocialLogin(provider: 'Google' | 'Apple') {
    setBusy(true)
    setStatus({ text: `Connecting to ${provider}…`, kind: 'info' })
    try {
      const res = await fetch(`/api/auth/oauth?provider=${provider.toLowerCase()}`)
      const data = await res.json()
      if (data.enabled && data.url) {
        window.location.href = data.url
      } else {
        setStatus({
          text: data.message || `${provider} single sign-on is prepared. Once ${provider} credentials are enabled in Supabase Auth, you can sign in with 1 click.`,
          kind: 'info',
        })
      }
    } catch {
      setStatus({
        text: `Unable to initialize ${provider} sign-in right now. Please sign in with your email and password below.`,
        kind: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0])
      setUploadStatus(null)
    }
  }

  async function handleInventoryUpload() {
    if (!uploadFile) {
      setUploadStatus({ text: 'Please choose a CSV or Excel spreadsheet file first.', kind: 'error' })
      return
    }

    setUploadBusy(true)
    setUploadStatus({ text: 'Processing spreadsheet…', kind: 'info' })

    try {
      const text = await uploadFile.text()
      const token = localStorage.getItem('hmd_access_token') || ''
      const res = await fetch('/api/admin/inventory/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileContent: text,
          mode: 'append',
          defaultCategory: uploadCategory,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload diamond inventory.')
      }

      setUploadStatus({
        text: `Success: ${data.message || `Imported ${data.importedCount} diamonds.`}`,
        kind: 'success',
      })
      setUploadFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      // Refresh catalogs
      fetchAdminDiamonds()
      setCatalogItems([])
    } catch (err) {
      setUploadStatus({
        text: err instanceof Error ? err.message : 'Spreadsheet upload failed.',
        kind: 'error',
      })
    } finally {
      setUploadBusy(false)
    }
  }

  const statusClass = `auth-status auth-status--${status.kind}`
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const filteredCatalog = selectedShape === 'all'
    ? catalogItems
    : catalogItems.filter(item => item.shape.toLowerCase() === selectedShape.toLowerCase())

  // ── Account Dashboard View (Rendered when signed in) ──────────────────────
  if (user) {
    return (
      <main className="auth-page">
        <header className="auth-header">
          <a href="#home">
            <img src="/heyman-diamond-logo.png" alt="Hey Man Diamond LLC" />
          </a>
          <a href="#home">← Back to website</a>
        </header>

        <section className="auth-card account-dashboard">
          <span className="auth-eyebrow">HEY MAN DIAMOND LLC · SECURE CUSTOMER PORTAL</span>
          <h1>Welcome, {user.full_name || user.email.split('@')[0]}!</h1>
          <p className="account-subtitle">
            Signed in as <strong>{user.email}</strong>
          </p>

          <div className="account-badge-container">
            <span className={`account-badge account-badge--${user.account_type || 'customer'}`}>
              {user.account_type === 'dealer'
                ? 'Wholesale Dealer'
                : user.account_type === 'admin'
                ? 'Administrator'
                : 'Verified Customer'}
            </span>
            {user.account_type === 'dealer' && (
              <span className={`account-badge account-badge--status-${user.dealer_status || 'pending'}`}>
                {user.dealer_status === 'approved' ? 'Approved & Active' : 'Pending Review'}
              </span>
            )}
          </div>

          {/* ── Account Navigation Tabs ── */}
          <nav className="account-tabs-bar" aria-label="Account navigation">
            <button
              type="button"
              className={`account-tab-btn ${activeTab === 'overview' ? 'account-tab-btn--active' : ''}`}
              onClick={() => switchTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={`account-tab-btn ${activeTab === 'catalog' ? 'account-tab-btn--active' : ''}`}
              onClick={() => switchTab('catalog')}
            >
              💎 Diamond Products ({catalogItems.length > 0 ? catalogItems.length : '5+'})
            </button>
            <button
              type="button"
              className={`account-tab-btn ${activeTab === 'cart' ? 'account-tab-btn--active' : ''}`}
              onClick={() => switchTab('cart')}
            >
              🛒 Cart & Shortlist ({cart.reduce((s, i) => s + i.quantity, 0)})
            </button>
            <button
              type="button"
              className={`account-tab-btn ${activeTab === 'profile' ? 'account-tab-btn--active' : ''}`}
              onClick={() => switchTab('profile')}
            >
              👤 Edit Profile & Address
            </button>
            <button
              type="button"
              className={`account-tab-btn ${activeTab === 'orders' ? 'account-tab-btn--active' : ''}`}
              onClick={() => switchTab('orders')}
            >
              📋 Orders & Transactions
            </button>
            {(isUserAdmin || user.account_type === 'dealer' || user.account_type === 'admin') && (
              <button
                type="button"
                className={`account-tab-btn ${activeTab === 'tools' ? 'account-tab-btn--active' : ''}`}
                onClick={() => switchTab('tools')}
              >
                ⚙️ Diamond Inventory & Pricing
              </button>
            )}
            {isUserAdmin && (
              <button
                type="button"
                className={`account-tab-btn ${activeTab === 'dealers' ? 'account-tab-btn--active' : ''}`}
                onClick={() => switchTab('dealers')}
              >
                🏢 Dealer Approvals {dealerApps.filter(a => a.status === 'pending_review').length > 0 ? `(${dealerApps.filter(a => a.status === 'pending_review').length})` : ''}
              </button>
            )}
            {(isUserAdmin || user.account_type === 'dealer') && (
              <button
                type="button"
                className={`account-tab-btn ${activeTab === 'offers' ? 'account-tab-btn--active' : ''}`}
                onClick={() => switchTab('offers')}
              >
                ✨ Offers & Schemes Banner
              </button>
            )}
          </nav>

          {/* ── TAB 1: OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div className="tab-content tab-content--overview">
              {status.text && (
                <p className={statusClass} role="status" aria-live="polite">
                  {status.text}
                </p>
              )}

              <div className="account-cards-grid">
                {isUserAdmin && (
                  <div className="account-card-item account-card-item--admin-highlight">
                    <div>
                      <h3>💎 Diamond Inventory &amp; Dual-Price Manager</h3>
                      <p>Review staged diamonds from Flomiz API, reclassify categories, set Customer &amp; Dealer prices, or upload Excel spreadsheets.</p>
                    </div>
                    <button type="button" className="button-primary" onClick={() => switchTab('tools')}>
                      Manage Diamonds &amp; Prices →
                    </button>
                  </div>
                )}

                {isUserAdmin && (
                  <div className="account-card-item account-card-item--admin-highlight">
                    <div>
                      <h3>🏢 Dealer Account Approvals</h3>
                      <p>Review wholesale trade applications from jewelry retailers and activate their wholesale pricing access.</p>
                    </div>
                    <button type="button" className="button-primary" onClick={() => switchTab('dealers')}>
                      Review Dealer Requests →
                    </button>
                  </div>
                )}

                {(isUserAdmin || user.account_type === 'dealer') && (
                  <div className="account-card-item">
                    <div>
                      <h3>✨ Front Page Offers &amp; Schemes</h3>
                      <p>Manage liquid glass banners, promotional images, video schemes, and 3-4s slider presentation on your home page.</p>
                    </div>
                    <button type="button" className="button-primary" onClick={() => switchTab('offers')}>
                      Manage Offers &amp; Schemes
                    </button>
                  </div>
                )}

                <div className="account-card-item">
                  <div>
                    <h3>💎 Certified Diamonds</h3>
                    <p>Search lab-grown diamonds, filter 4Cs, compare certifications (IGI/GIA), and add to your cart.</p>
                  </div>
                  <button type="button" className="button-primary" onClick={() => switchTab('catalog')}>
                    Browse Diamond Products
                  </button>
                </div>

                <div className="account-card-item">
                  <div>
                    <h3>🛒 Cart & Shortlist</h3>
                    <p>Review items currently in your cart ({cart.reduce((s, i) => s + i.quantity, 0)} items) and submit your quote order.</p>
                  </div>
                  <button type="button" className="button-secondary" onClick={() => switchTab('cart')}>
                    View Cart (${cartTotal.toLocaleString()})
                  </button>
                </div>

                <div className="account-card-item">
                  <div>
                    <h3>👤 My Profile & Details</h3>
                    <p>Update your full name, contact phone number, and primary shipping/billing address.</p>
                  </div>
                  <button type="button" className="button-secondary" onClick={() => switchTab('profile')}>
                    Manage Profile
                  </button>
                </div>

                <div className="account-card-item">
                  <div>
                    <h3>📋 Past Quotes & Orders</h3>
                    <p>View your past order history, quote statuses, and active diamond purchase requests.</p>
                  </div>
                  <button type="button" className="button-secondary" onClick={() => switchTab('orders')}>
                    View Order History
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 2: PRODUCT CATALOG ── */}
          {activeTab === 'catalog' && (
            <div className="tab-content tab-content--catalog">
              <div className="catalog-header-bar">
                <div>
                  <h2>Lab-Grown Certified Diamonds</h2>
                  <p>Individual certified stones in stock with live 4Cs specifications.</p>
                </div>

                <div className="shape-filter-group">
                  {['all', 'Round', 'Oval', 'Emerald', 'Radiant', 'Pear'].map(s => (
                    <button
                      key={s}
                      type="button"
                      className={`shape-pill ${selectedShape.toLowerCase() === s.toLowerCase() ? 'shape-pill--active' : ''}`}
                      onClick={() => setSelectedShape(s)}
                    >
                      {s === 'all' ? 'All Shapes' : s}
                    </button>
                  ))}
                </div>
              </div>

              {cartMsg && (
                <p className={`auth-status auth-status--${cartMsg.kind}`} style={{ margin: '14px 0' }}>
                  {cartMsg.text}
                </p>
              )}

              {loadingCatalog ? (
                <p style={{ padding: '30px', textAlign: 'center', color: '#77746b' }}>Loading diamond inventory…</p>
              ) : (
                <div className="diamond-products-grid">
                  {filteredCatalog.map(item => (
                    <div className="diamond-product-card" key={item.sku}>
                      <div className="diamond-card-badge">{item.lab} Certified</div>
                      <div className="diamond-card-shape">{item.shape} Diamond</div>
                      <div className="diamond-card-specs">
                        <span className="spec-highlight">{item.carat} Carat</span>
                        <span className="spec-divider">·</span>
                        <span>Color {item.color}</span>
                        <span className="spec-divider">·</span>
                        <span>{item.clarity}</span>
                        <span className="spec-divider">·</span>
                        <span>{item.cut}</span>
                      </div>

                      <div className="diamond-card-details">
                        <div><strong>Cert #:</strong> {item.certificateNumber}</div>
                        <div><strong>Dimensions:</strong> {item.measurements || 'Available on request'}</div>
                        <div><strong>Polish/Symm:</strong> {item.polish || 'Ex'} / {item.symmetry || 'Ex'}</div>
                        <div><strong>SKU:</strong> {item.sku}</div>
                      </div>

                      <div className="diamond-card-footer">
                        <div className="diamond-card-price">${item.price.toLocaleString()}</div>
                        <button
                          type="button"
                          className="button-primary add-cart-btn"
                          onClick={() => addToCart(item)}
                        >
                          + Add to Cart
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: CART & SHORTLIST ── */}
          {activeTab === 'cart' && (
            <div className="tab-content tab-content--cart">
              <h2>Your Diamond Cart & Shortlist</h2>
              <p>Items in your cart are reserved for direct quote submission and ordering.</p>

              {cartMsg && (
                <p className={`auth-status auth-status--${cartMsg.kind}`} style={{ margin: '14px 0' }}>
                  {cartMsg.text}
                </p>
              )}

              {cart.length === 0 ? (
                <div className="empty-cart-view">
                  <p>Your cart is currently empty.</p>
                  <button type="button" className="button-primary" onClick={() => switchTab('catalog')}>
                    Explore Diamond Products
                  </button>
                </div>
              ) : (
                <div className="cart-table-wrap">
                  <table className="cart-table">
                    <thead>
                      <tr>
                        <th>Stone / Spec</th>
                        <th>Lab Report</th>
                        <th>Price</th>
                        <th>Qty</th>
                        <th>Total</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map(item => (
                        <tr key={item.sku}>
                          <td>
                            <strong>{item.shape} {item.carat} ct</strong>
                            <div style={{ fontSize: '11px', color: '#77746b' }}>
                              Color {item.color} · Clarity {item.clarity} · Cut {item.cut}
                            </div>
                            <div style={{ fontSize: '10px', color: '#999' }}>SKU: {item.sku}</div>
                          </td>
                          <td>
                            <span className="lab-tag">{item.lab}</span>
                            <div style={{ fontSize: '11px' }}>{item.certificateNumber}</div>
                          </td>
                          <td>${item.price.toLocaleString()}</td>
                          <td>{item.quantity}</td>
                          <td><strong>${(item.price * item.quantity).toLocaleString()}</strong></td>
                          <td>
                            <button
                              type="button"
                              className="cart-remove-btn"
                              onClick={() => removeFromCart(item.sku)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="cart-summary-box">
                    <div className="cart-total-line">
                      <span>Total Quote Estimate ({cart.reduce((s, i) => s + i.quantity, 0)} stones):</span>
                      <strong className="cart-grand-total">${cartTotal.toLocaleString()}</strong>
                    </div>

                    <button
                      type="button"
                      className="button-primary checkout-btn"
                      onClick={handleCheckoutCart}
                      disabled={submittingCart}
                    >
                      {submittingCart ? 'Submitting Order Request…' : 'Submit Cart for Order & Quote'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 4: EDIT PROFILE & ADDRESS ── */}
          {activeTab === 'profile' && (
            <div className="tab-content tab-content--profile">
              <h2>My Profile & Account Settings</h2>
              <p>Update your personal information, contact number, and shipping address.</p>

              {profileMsg && (
                <p className={`auth-status auth-status--${profileMsg.kind}`} style={{ margin: '14px 0' }}>
                  {profileMsg.text}
                </p>
              )}

              <form className="profile-form" onSubmit={handleSaveProfile}>
                <label>
                  Email Address (Verified)
                  <input type="email" value={user.email} disabled style={{ background: '#f5f4ef', cursor: 'not-allowed' }} />
                </label>

                <label>
                  Full Name
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    required
                    maxLength={120}
                    placeholder="Your legal or preferred full name"
                  />
                </label>

                <label>
                  Mobile / Phone Number
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    maxLength={40}
                    placeholder="+1 (555) 000-0000"
                  />
                </label>

                <label>
                  Shipping & Billing Address
                  <textarea
                    value={editAddress}
                    onChange={e => setEditAddress(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Street, Suite/Apt, City, State, ZIP Code"
                  />
                </label>

                <label>
                  Gender
                  <select value={editGender} onChange={e => setEditGender(e.target.value)}>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="non_binary">Non-binary</option>
                  </select>
                </label>

                <button type="submit" className="button-primary save-profile-btn" disabled={profileSaving}>
                  {profileSaving ? 'Saving Changes…' : 'Save Profile Changes'}
                </button>
              </form>
            </div>
          )}

          {/* ── TAB 5: ORDERS & TRANSACTIONS ── */}
          {activeTab === 'orders' && (
            <div className="tab-content tab-content--orders">
              <h2>Order & Transaction History</h2>
              <p>Review your historical quote requests, custom diamond inquiries, and order transactions.</p>

              {loadingOrders ? (
                <p style={{ padding: '30px', textAlign: 'center', color: '#77746b' }}>Loading your orders…</p>
              ) : orders.length === 0 ? (
                <div className="empty-orders-view">
                  <p>No past orders or quote requests found for this account.</p>
                  <button type="button" className="button-primary" onClick={() => switchTab('catalog')}>
                    Browse Diamond Products
                  </button>
                </div>
              ) : (
                <div className="orders-table-wrap">
                  <table className="orders-table">
                    <thead>
                      <tr>
                        <th>Order / Quote #</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Items</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(order => (
                        <tr key={order.id}>
                          <td><strong>{order.quote_number || order.order_number || order.id.slice(0, 8)}</strong></td>
                          <td>{new Date(order.created_at).toLocaleDateString()}</td>
                          <td>
                            <span className={`status-pill status-pill--${order.status}`}>
                              {order.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td>{order.quote_request_items?.length || 1} stone(s)</td>
                          <td><span className="order-message">{order.customer_message || 'Standard quote request'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 6: INVENTORY TOOLS (DEALER / ADMIN) ── */}
          {activeTab === 'tools' && (user.account_type === 'dealer' || user.account_type === 'admin') && (
            <div className="tab-content tab-content--tools">
              <div className="account-inventory-box" style={{ margin: 0 }}>
                <div className="inventory-box-header">
                  <h3>📦 Wholesale &amp; Inventory Management</h3>
                  <p>Certified solitaires synced via API, and melee / fancy shapes uploaded via Excel. Manage categories, customer prices, and dealer wholesale rates below.</p>
                </div>

                <div className="inventory-options-grid">
                  <div className="inventory-option-card">
                    <span className="option-tag">Option 1 · Automated API</span>
                    <h4>Supplier API Integration</h4>
                    <p>Fetches certified lab diamonds directly from the Flomiz B2B API into your Staging Queue for review before publishing.</p>
                    <div className="api-status-pill" style={{ marginBottom: '14px' }}>
                      <span className="api-status-dot" /> Flomiz Gateway Ready
                    </div>
                    {isUserAdmin && (
                      <div>
                        <button
                          type="button"
                          className="sync-api-btn"
                          onClick={handleSyncFlomizStaging}
                          disabled={syncingFlomiz}
                        >
                          {syncingFlomiz ? 'Fetching from Flomiz API…' : '🔄 Sync from Flomiz API to Staging'}
                        </button>
                        {flomizSyncMsg && (
                          <p className={`auth-status auth-status--${flomizSyncMsg.kind}`} style={{ marginTop: '10px' }}>
                            {flomizSyncMsg.text}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="inventory-option-card">
                    <span className="option-tag">Option 2 · Bulk File</span>
                    <h4>Excel / CSV Upload Portal</h4>
                    <p>Upload your own diamond inventory sheet (Round Melee, Loose Fancy, Matched Pairs, or Color Diamonds).</p>
                    <a href="/api/inventory/template" download="heyman_diamond_template.csv" className="template-download-link">
                      ⬇ Download Standard CSV Template
                    </a>

                    <div className="upload-category-selector">
                      <label htmlFor="upload-cat-select">Upload As Category:</label>
                      <select
                        id="upload-cat-select"
                        value={uploadCategory}
                        onChange={(e) => setUploadCategory(e.target.value)}
                      >
                        <option value="Round Melee Diamonds">Round Melee Diamonds (Melees / Sieves)</option>
                        <option value="Loose Fancy Diamonds">Loose Fancy Diamonds (Fancy Shapes)</option>
                        <option value="Color Non-Certified Diamonds">Color Non-Certified Diamonds (Pink, Yellow, Blue, Green)</option>
                        <option value="Matched Pairs">Matched Pairs (Earring &amp; Layout Pairs)</option>
                        <option value="Certified Diamonds">Certified Diamonds (Solitaires)</option>
                      </select>
                    </div>

                    <div className="upload-dropzone">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.tsv,text/csv,application/vnd.ms-excel"
                        onChange={handleFileSelected}
                        disabled={uploadBusy}
                        id="diamond-csv-file"
                      />
                      {uploadFile && <span className="selected-filename">📄 {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)</span>}

                      <button
                        type="button"
                        className="button-primary upload-btn"
                        onClick={handleInventoryUpload}
                        disabled={uploadBusy || !uploadFile}
                      >
                        {uploadBusy ? 'Uploading &amp; Validating…' : 'Upload Spreadsheet'}
                      </button>
                    </div>

                    {uploadStatus && (
                      <p className={`auth-status auth-status--${uploadStatus.kind}`} style={{ marginTop: '12px' }}>
                        {uploadStatus.text}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── LIVE DIAMOND INVENTORY & DUAL-PRICE MANAGER TABLE ── */}
              {isUserAdmin && (
                <div className="diamonds-manager-wrap">
                  <div className="diamonds-manager-header">
                    <div>
                      <h3>💎 Diamond Inventory &amp; Dual-Price Manager</h3>
                      <p>
                        Manage categories, set <strong>Customer (Retail)</strong> and <strong>Dealer (Wholesale)</strong> prices, and publish API or Excel diamonds.
                      </p>
                    </div>

                    <div className="diamonds-header-actions">
                      <button
                        type="button"
                        className="sync-api-btn"
                        onClick={fetchAdminDiamonds}
                        disabled={loadingAdminDiamonds}
                      >
                        {loadingAdminDiamonds ? 'Refreshing…' : '🔄 Refresh List'}
                      </button>
                    </div>
                  </div>

                  {/* Staging Alert Banner for API Diamonds */}
                  {adminDiamonds.some((d) => d.status === 'pending_review') && (
                    <div className="diamonds-staging-alert">
                      <div className="staging-alert-text">
                        <strong>
                          ⏳ {adminDiamonds.filter((d) => d.status === 'pending_review').length} Diamonds Awaiting Review (Staged)
                        </strong>
                        <p>
                          Fetched via API. Review their category, Customer Price, and Dealer Price below before publishing to the live website.
                        </p>
                      </div>
                      <button type="button" className="batch-publish-btn" onClick={handleBatchPublish}>
                        🚀 Publish All Staged Diamonds
                      </button>
                    </div>
                  )}

                  {/* Filter & Search Toolbar */}
                  <div className="diamonds-toolbar">
                    <input
                      type="text"
                      className="diamonds-search-input"
                      placeholder="🔍 Search SKU, Cert #, Shape, or Category…"
                      value={diamondSearch}
                      onChange={(e) => setDiamondSearch(e.target.value)}
                    />

                    <select
                      className="diamonds-filter-select"
                      value={diamondFilterCategory}
                      onChange={(e) => setDiamondFilterCategory(e.target.value)}
                      aria-label="Filter diamonds by category"
                    >
                      <option value="all">All Categories</option>
                      <option value="Certified Diamonds">Certified Diamonds</option>
                      <option value="Round Melee Diamonds">Round Melee Diamonds</option>
                      <option value="Loose Fancy Diamonds">Loose Fancy Diamonds</option>
                      <option value="Color Non-Certified Diamonds">Color Non-Certified Diamonds</option>
                      <option value="Matched Pairs">Matched Pairs</option>
                    </select>

                    <select
                      className="diamonds-filter-select"
                      value={diamondFilterStatus}
                      onChange={(e) => setDiamondFilterStatus(e.target.value)}
                      aria-label="Filter diamonds by status"
                    >
                      <option value="all">All Statuses</option>
                      <option value="published">Published (Live on Website)</option>
                      <option value="pending_review">Pending Review (Staged)</option>
                      <option value="hidden">Hidden</option>
                    </select>
                  </div>

                  {/* Diamonds Table */}
                  <div className="diamonds-table-wrap">
                    <table className="diamonds-table">
                      <thead>
                        <tr>
                          <th>Diamond / SKU</th>
                          <th>Specs</th>
                          <th>Category</th>
                          <th>Customer Price ($)</th>
                          <th>Dealer Price ($)</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminDiamonds
                          .filter((d) => {
                            if (diamondFilterCategory !== 'all' && d.category !== diamondFilterCategory) return false
                            if (diamondFilterStatus !== 'all' && d.status !== diamondFilterStatus) return false
                            if (diamondSearch) {
                              const s = diamondSearch.toLowerCase()
                              return (
                                d.sku?.toLowerCase().includes(s) ||
                                d.certificateNumber?.toLowerCase().includes(s) ||
                                d.shape?.toLowerCase().includes(s) ||
                                d.category?.toLowerCase().includes(s)
                              )
                            }
                            return true
                          })
                          .map((d) => {
                            const isSaved = savedDiamondId === (d.id || d.sku)
                            return (
                              <tr key={d.id || d.sku}>
                                <td className="diamond-sku-cell">
                                  <strong>{d.sku}</strong>
                                  <small>{d.lab ? `${d.lab} ${d.certificateNumber || ''}` : 'Non-Certified'}</small>
                                  <span
                                    className={`diamond-source-tag diamond-source-tag--${
                                      d.source === 'flomiz_api' ? 'api' : 'excel'
                                    }`}
                                  >
                                    {d.source === 'flomiz_api' ? 'API' : 'Excel'}
                                  </span>
                                </td>

                                <td>
                                  <div>
                                    <strong>
                                      {d.carat}ct {d.shape}
                                    </strong>
                                  </div>
                                  <small style={{ color: '#6d6a60' }}>
                                    {d.color} · {d.clarity} {d.cut ? `· ${d.cut}` : ''}
                                  </small>
                                </td>

                                <td>
                                  <select
                                    className="diamond-cat-select"
                                    value={d.category}
                                    onChange={(e) => {
                                      const newCat = e.target.value
                                      setAdminDiamonds((prev) =>
                                        prev.map((item) =>
                                          (item.id === d.id || item.sku === d.sku)
                                            ? { ...item, category: newCat }
                                            : item
                                        )
                                      )
                                    }}
                                  >
                                    <option value="Certified Diamonds">Certified Diamonds</option>
                                    <option value="Round Melee Diamonds">Round Melee Diamonds</option>
                                    <option value="Loose Fancy Diamonds">Loose Fancy Diamonds</option>
                                    <option value="Color Non-Certified Diamonds">Color Non-Certified Diamonds</option>
                                    <option value="Matched Pairs">Matched Pairs</option>
                                  </select>
                                </td>

                                <td>
                                  <div className="diamond-price-input-wrap">
                                    <span>$</span>
                                    <input
                                      type="number"
                                      className="diamond-price-input"
                                      value={d.customerPrice ?? 0}
                                      onChange={(e) => {
                                        const newPrice = parseFloat(e.target.value) || 0
                                        setAdminDiamonds((prev) =>
                                          prev.map((item) =>
                                            (item.id === d.id || item.sku === d.sku)
                                              ? { ...item, customerPrice: newPrice, price: newPrice }
                                              : item
                                          )
                                        )
                                      }}
                                    />
                                  </div>
                                </td>

                                <td>
                                  <div className="diamond-price-input-wrap">
                                    <span>$</span>
                                    <input
                                      type="number"
                                      className="diamond-price-input"
                                      value={d.dealerPrice ?? 0}
                                      onChange={(e) => {
                                        const newWholesale = parseFloat(e.target.value) || 0
                                        setAdminDiamonds((prev) =>
                                          prev.map((item) =>
                                            (item.id === d.id || item.sku === d.sku)
                                              ? { ...item, dealerPrice: newWholesale, wholesalePrice: newWholesale }
                                              : item
                                          )
                                        )
                                      }}
                                    />
                                  </div>
                                </td>

                                <td>
                                  <span className={`diamond-status-pill diamond-status-pill--${d.status}`}>
                                    {d.status === 'published'
                                      ? 'Published'
                                      : d.status === 'pending_review'
                                      ? 'Staged'
                                      : 'Hidden'}
                                  </span>
                                </td>

                                <td>
                                  <div className="diamond-row-actions">
                                    <button
                                      type="button"
                                      className={`diamond-save-btn ${isSaved ? 'diamond-save-btn--success' : ''}`}
                                      onClick={() =>
                                        handleUpdateDiamond(d.id || d.sku, {
                                          category: d.category,
                                          customerPrice: d.customerPrice,
                                          dealerPrice: d.dealerPrice,
                                          status: d.status,
                                        })
                                      }
                                    >
                                      {isSaved ? 'Saved ✓' : 'Save'}
                                    </button>

                                    <button
                                      type="button"
                                      className="diamond-status-btn"
                                      onClick={() => {
                                        const nextStatus =
                                          d.status === 'published' ? 'hidden' : 'published'
                                        handleUpdateDiamond(d.id || d.sku, {
                                          category: d.category,
                                          customerPrice: d.customerPrice,
                                          dealerPrice: d.dealerPrice,
                                          status: nextStatus,
                                        })
                                      }}
                                      title={d.status === 'published' ? 'Hide from store' : 'Publish live'}
                                    >
                                      {d.status === 'published' ? 'Hide' : 'Publish'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 7: OFFERS & SCHEMES BANNER (ADMIN / OWNER) ── */}
          {activeTab === 'offers' && (isUserAdmin || user.account_type === 'dealer') && (
            <div className="tab-content tab-content--offers">
              <div className="offers-manager-box">
                <div className="offers-manager-header">
                  <h3>✨ Liquid Glass Offers & Schemes Manager</h3>
                  <p>
                    Configure promotional image banners, videos, headlines, and call-to-actions shown on your website's front page in the luxury liquid glass hero.
                    If you configure <strong>1 offer</strong>, it is displayed full screen. If you configure <strong>2 or more offers</strong>, the website automatically displays them using an auto-slider (advancing every 3.5 seconds) with narrow frosted glass side arrows.
                  </p>
                </div>

                {/* Offer Editor Form */}
                <form className="offers-form-card" onSubmit={handleSavePromotion}>
                  <h4>{editingPromoId ? '✏️ Edit Offer or Scheme' : '➕ Add New Offer or Scheme Banner'}</h4>

                  <div className="offers-form-grid">
                    <div className="full-span">
                      <label className="offers-field-label" htmlFor="promo-name">Offer / Scheme Name *</label>
                      <input
                        id="promo-name"
                        type="text"
                        className="offers-input"
                        placeholder="e.g. Holiday Diamond Celebration, Trade Volume Privilege Scheme"
                        value={promoName}
                        onChange={(e) => setPromoName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="full-span">
                      <label className="offers-field-label" htmlFor="promo-desc">Offer Description / Subtext</label>
                      <textarea
                        id="promo-desc"
                        rows={2}
                        className="offers-textarea"
                        placeholder="e.g. Exclusive wholesale incentive on certified lab-grown solitaires above 2.0 carats. Direct from Surat & New York vaults."
                        value={promoDesc}
                        onChange={(e) => setPromoDesc(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="offers-field-label">Media Type</label>
                      <div className="offers-type-toggle">
                        <button
                          type="button"
                          className={`offers-type-btn ${promoMediaType === 'image' ? 'offers-type-btn--active' : ''}`}
                          onClick={() => setPromoMediaType('image')}
                        >
                          📷 Image Banner
                        </button>
                        <button
                          type="button"
                          className={`offers-type-btn ${promoMediaType === 'video' ? 'offers-type-btn--active' : ''}`}
                          onClick={() => setPromoMediaType('video')}
                        >
                          🎬 Video Banner (.mp4, .webm)
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="offers-field-label" htmlFor="promo-url">
                        {promoMediaType === 'video' ? 'Video File URL (.mp4 / .webm)' : 'Banner Image URL'}
                      </label>
                      <input
                        id="promo-url"
                        type="url"
                        className="offers-input"
                        placeholder={promoMediaType === 'video' ? 'https://example.com/diamonds-reel.mp4' : 'https://images.unsplash.com/...'}
                        value={promoMediaUrl}
                        onChange={(e) => setPromoMediaUrl(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="offers-field-label" htmlFor="promo-cta-text">Button Text</label>
                      <input
                        id="promo-cta-text"
                        type="text"
                        className="offers-input"
                        placeholder="e.g. Explore Certified Stones"
                        value={promoCtaText}
                        onChange={(e) => setPromoCtaText(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="offers-field-label" htmlFor="promo-cta-link">Button Link (Anchor or URL)</label>
                      <input
                        id="promo-cta-link"
                        type="text"
                        className="offers-input"
                        placeholder="#collection, #signup-dealer, #contact, etc."
                        value={promoCtaLink}
                        onChange={(e) => setPromoCtaLink(e.target.value)}
                      />
                    </div>

                    <div className="full-span">
                      <label className="offers-checkbox-label">
                        <input
                          type="checkbox"
                          checked={promoActive}
                          onChange={(e) => setPromoActive(e.target.checked)}
                        />
                        <span>Active · Show this offer on website front page</span>
                      </label>
                    </div>

                    {/* Preview box if URL provided */}
                    {promoMediaUrl && (
                      <div className="full-span">
                        <label className="offers-field-label">Banner Preview</label>
                        <div className="offers-preview-banner">
                          {promoMediaType === 'video' ? (
                            <video src={promoMediaUrl} autoPlay loop muted playsInline />
                          ) : (
                            <img src={promoMediaUrl} alt="Preview" onError={(e) => (e.currentTarget.style.display = 'none')} />
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {promoMsg && (
                    <p className={`auth-status auth-status--${promoMsg.kind}`} style={{ marginTop: '16px' }}>
                      {promoMsg.text}
                    </p>
                  )}

                  <div className="offers-form-actions">
                    <button
                      type="submit"
                      className="button-primary"
                      disabled={promoSaving}
                    >
                      {promoSaving ? 'Saving…' : (editingPromoId ? 'Update Offer / Scheme' : 'Publish Offer / Scheme')}
                    </button>
                    {editingPromoId && (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={handleResetPromoForm}
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                </form>

                {/* List of Existing Offers */}
                <div className="offers-list-container">
                  <div className="offers-list-header">
                    <h4>Current Offers & Schemes ({promotions.length})</h4>
                    {loadingPromotions && <small style={{ color: '#888' }}>Refreshing…</small>}
                  </div>

                  {promotions.length === 0 ? (
                    <p style={{ color: '#777', fontSize: '13px' }}>No promotional offers created yet. Use the form above to add your first offer or scheme.</p>
                  ) : (
                    <div className="offers-items-grid">
                      {promotions.map((item) => (
                        <div key={item.id} className="offer-item-card">
                          <div className="offer-card-media">
                            {item.media_type === 'video' && item.media_url ? (
                              <video src={item.media_url} muted />
                            ) : (
                              <img
                                src={item.media_url || 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=600&q=80'}
                                alt={item.name}
                              />
                            )}
                            <span className="offer-card-type-badge">
                              {item.media_type === 'video' ? '🎬 Video' : '📷 Image'}
                            </span>
                            <span className={`offer-card-status-badge ${item.active ? 'offer-card-status-badge--active' : 'offer-card-status-badge--inactive'}`}>
                              {item.active ? '● Live on Front' : '○ Inactive'}
                            </span>
                          </div>

                          <div className="offer-card-body">
                            <h5 className="offer-card-title">{item.name}</h5>
                            {item.description && <p className="offer-card-desc">{item.description}</p>}
                            <div className="offer-card-cta-preview">
                              Button: <strong>{item.cta_text || 'Explore Offer'}</strong> → {item.cta_link || '#collection'}
                            </div>

                            <div className="offer-card-actions">
                              <button
                                type="button"
                                className="offer-btn-sm"
                                onClick={() => handleTogglePromoActive(item)}
                              >
                                {item.active ? 'Hide from Front' : 'Publish Live'}
                              </button>
                              <button
                                type="button"
                                className="offer-btn-sm"
                                onClick={() => handleEditPromo(item)}
                              >
                                ✏️ Edit
                              </button>
                              <button
                                type="button"
                                className="offer-btn-sm offer-btn-sm--danger"
                                onClick={() => handleDeletePromotion(item.id, item.name)}
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 8: DEALER APPROVALS (ADMIN) ── */}
          {activeTab === 'dealers' && isUserAdmin && (
            <div className="tab-content tab-content--dealers">
              <div className="dealers-manager-box">
                <div className="dealers-manager-header">
                  <div>
                    <h3>🏢 Wholesale Dealer Applications &amp; KYC Approvals</h3>
                    <p>
                      Review dealer accounts and activate their status to unlock wholesale trade pricing on the live website.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="sync-api-btn"
                    onClick={fetchDealerApplications}
                    disabled={loadingDealerApps}
                  >
                    {loadingDealerApps ? 'Refreshing…' : '🔄 Refresh Applications'}
                  </button>
                </div>

                {dealerAppMsg && (
                  <p className={`auth-status auth-status--${dealerAppMsg.kind}`} style={{ margin: '14px 0' }}>
                    {dealerAppMsg.text}
                  </p>
                )}

                {loadingDealerApps ? (
                  <p style={{ padding: '30px', textAlign: 'center', color: '#77746b' }}>Loading dealer applications…</p>
                ) : dealerApps.length === 0 ? (
                  <div className="dealers-empty-box" style={{ padding: '30px', textAlign: 'center', color: '#77746b' }}>
                    <p>No dealer applications received yet.</p>
                  </div>
                ) : (
                  <div className="dealers-table-wrap">
                    <table className="dealers-table">
                      <thead>
                        <tr>
                          <th>Business Name</th>
                          <th>Primary Contact</th>
                          <th>Email Address</th>
                          <th>Phone</th>
                          <th>Submitted</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dealerApps.map(app => (
                          <tr key={app.id}>
                            <td><strong>{app.registered_business_name || 'N/A'}</strong></td>
                            <td>{app.primary_contact || 'N/A'}</td>
                            <td><a href={`mailto:${app.primary_email}`}>{app.primary_email}</a></td>
                            <td>{app.business_phone || 'N/A'}</td>
                            <td>{app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : 'Recent'}</td>
                            <td>
                              <span className={`dealer-app-badge dealer-app-badge--${app.status}`}>
                                {app.status === 'approved' ? '✓ Approved' : app.status === 'rejected' ? '✕ Rejected' : '⏳ Pending'}
                              </span>
                            </td>
                            <td>
                              <div className="dealer-action-btns">
                                {app.status !== 'approved' && (
                                  <button
                                    type="button"
                                    className="approve-dealer-btn"
                                    onClick={() => handleUpdateDealerStatus(app.id, 'approved')}
                                  >
                                    ✓ Approve
                                  </button>
                                )}
                                {app.status !== 'rejected' && (
                                  <button
                                    type="button"
                                    className="reject-dealer-btn"
                                    onClick={() => handleUpdateDealerStatus(app.id, 'rejected')}
                                  >
                                    ✕ Reject
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Footer Actions ── */}
          <div className="account-footer-actions">
            <a href="#home" className="button-primary">Return to Shop</a>
            <button
              type="button"
              className="auth-signout-btn"
              onClick={() => {
                localStorage.removeItem('hmd_access_token')
                localStorage.removeItem('hmd_refresh_token')
                localStorage.removeItem('hmd_user')
                updateUserSession(null)
                setStatus({ text: '', kind: 'info' })
                window.location.hash = '#home'
              }}
            >
              Sign Out
            </button>
          </div>
        </section>
      </main>
    )
  }

  // ── Standard Sign In / Sign Up Form View ─────────────────────────────────
  const isAdminLogin = mode === 'admin'
  return (
    <main className="auth-page">
      <header className="auth-header">
        <a href="#home">
          <img src="/heyman-diamond-logo.png" alt="Hey Man Diamond LLC" />
        </a>
        <a href="#home">← Back to website</a>
      </header>

      <section className="auth-card">
        <span className="auth-eyebrow">
          {isAdminLogin
            ? 'HEY MAN DIAMOND LLC · SECURE ADMINISTRATOR ACCESS'
            : 'HEY MAN DIAMOND LLC · SECURE ACCOUNT'}
        </span>
        <h1>
          {isAdminLogin
            ? 'Administrator Sign In'
            : signup
            ? (dealer ? 'Dealer account request' : 'Create your account')
            : 'Welcome back'}
        </h1>
        <p>
          {isAdminLogin
            ? 'Enter your authorized administrator email (e.g. kuldeepsingh343@gmail.com, info@heymandiamond.com) to access diamond inventory, pricing controls, and dealer approvals.'
            : signup
            ? (dealer
              ? 'Create your dealer account with basic business details. Access will be activated after admin approval.'
              : 'Create an account to make your diamond experience more personal.')
            : 'Sign in with the email and password you registered with.'}
        </p>

        {/* ── Social Login Buttons ── */}
        <div className="social-auth-container">
          <button
            type="button"
            className="social-auth-btn social-auth-google"
            onClick={() => handleSocialLogin('Google')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Continue with Google</span>
          </button>

          <button
            type="button"
            className="social-auth-btn social-auth-apple"
            onClick={() => handleSocialLogin('Apple')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-1.98.6-2.62 1.35-.57.65-1.07 1.72-.94 2.74 1 .08 2.02-.49 2.64-1.24z" />
            </svg>
            <span>Continue with Apple</span>
          </button>
        </div>

        <div className="auth-divider">
          <span>or continue with email</span>
        </div>

        <form onSubmit={submit} noValidate>
          {signup && (
            <>
              <label>
                Full name
                <input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  autoComplete="name"
                  required
                  maxLength={120}
                  placeholder="Your full name"
                />
              </label>
              <label>
                Address
                <input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  autoComplete="street-address"
                  required
                  maxLength={500}
                  placeholder="Your shipping / billing address"
                />
              </label>
              <label>
                Mobile number
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  type="tel"
                  autoComplete="tel"
                  required
                  maxLength={40}
                  placeholder="+1 (555) 000-0000"
                />
              </label>
              <label>
                Gender
                <select value={gender} onChange={e => setGender(e.target.value)}>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="non_binary">Non-binary</option>
                </select>
              </label>
              {dealer && (
                <label>
                  Company name
                  <input
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    autoComplete="organization"
                    required
                    maxLength={160}
                    placeholder="Your registered business name"
                  />
                </label>
              )}
            </>
          )}

          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@example.com"
            />
          </label>

          <label>
            Password {signup && <span style={{ fontWeight: 400, opacity: 0.7 }}>(min. 10 characters)</span>}
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={signup ? 'new-password' : 'current-password'}
                minLength={10}
                required
                maxLength={128}
                placeholder="••••••••••"
                style={{ paddingRight: '48px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#77746b',
                  padding: '4px',
                }}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </label>

          <button type="submit" disabled={busy}>
            {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {status.text && (
          <p className={statusClass} role="status" aria-live="polite">
            {status.text}
          </p>
        )}

        {canResend && (
          <button
            type="button"
            className="auth-resend"
            onClick={resendConfirmation}
            disabled={resendBusy || !email.trim()}
          >
            {resendBusy ? 'Requesting…' : 'Resend confirmation email'}
          </button>
        )}

        {signup
          ? <p className="auth-switch">Already registered? <a href="#signin">Sign in</a></p>
          : <p className="auth-switch">New here? <a href="#signup-customer">Customer signup</a> · <a href="#signup-dealer">Dealer signup</a></p>
        }

        <p className="auth-footnote">
          Passwords are securely handled by Supabase authentication. Dealer accounts remain
          restricted until an administrator approves the application.
        </p>
      </section>
    </main>
  )
}
