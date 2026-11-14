import './AuthPages.css'
import { useState, useEffect, useRef, useCallback } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { parseAuthStatusFromHash } from './routeUtils'
import type { PromotionOffer } from './OffersHero'
import { getDiamondMedia } from './diamondUtils'
import { computeAudiencePricingDraft, validateRowDiscount } from './discountHelpers'
import { sanitizeAdminDiamonds } from './inventoryUtils'

type Mode = 'signup-customer' | 'signup-dealer' | 'signin' | 'account' | 'admin' | 'forgot-password' | 'reset-password'
type AccountTab = 'overview' | 'catalog' | 'cart' | 'profile' | 'orders' | 'tools' | 'dealers' | 'offers' | 'reviews' | 'team'

export interface StaffPermissions {
  can_manage_inventory?: boolean
  can_manage_orders?: boolean
  can_review_kyc?: boolean
  can_manage_reviews?: boolean
  can_delete_reviews?: boolean
  can_manage_promotions?: boolean
  can_manage_users?: boolean
  can_manage_team?: boolean
}

export interface StaffMember {
  id: string
  user_id?: string
  email: string
  full_name: string
  role?: 'super_admin' | 'admin' | 'sales_manager' | 'operations_manager'
  role_title: string
  is_super_admin?: boolean
  is_active?: boolean
  status?: string
  created_at?: string
  updated_at?: string
  permissions: StaffPermissions
}

export interface AdminReviewItem {
  id: string
  customer_name: string
  customer_email?: string
  rating: number
  remarks: string
  status: string
  submitted_at: string
  reply?: string | null
  reply_created_at?: string | null
}

export interface DealerApplication {
  id: string
  user_id: string
  status: string
  registered_business_name: string
  primary_contact: string
  primary_email: string
  business_phone?: string
  business_address?: { address?: string } | string
  submitted_at: string
  reviewed_at?: string
}

export interface UserProfile {
  id?: string
  email: string
  full_name?: string
  phone?: string
  address?: string
  gender?: string
  account_type?: 'customer' | 'dealer' | 'admin'
  dealer_status?: string
  role?: 'super_admin' | 'admin' | 'sales_manager' | 'operations_manager'
  role_title?: string
  is_super_admin?: boolean
  is_admin?: boolean
  permissions?: StaffPermissions
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
  imageUrl?: string | null
  videoUrl?: string | null
}

export interface DiamondMediaItem {
  id: string
  diamond_id: string
  type: 'image' | 'video'
  storage_path: string
  public_url: string
  sort_order: number
  is_primary: boolean
  alt_text?: string
  created_at?: string
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
  customerDiscountPrice?: number | null
  customerDiscountPercent?: number | null
  customerEffectivePrice?: number
  dealerPrice: number
  dealerDiscountPrice?: number | null
  dealerDiscountPercent?: number | null
  dealerEffectivePrice?: number
  deletedAt?: string | null
  status: 'published' | 'pending_review' | 'hidden'
  source?: string
  imageUrl?: string | null
  videoUrl?: string | null
}

export interface DiamondRowDraft {
  category?: string
  customerPrice?: number
  customerPriceInput?: string
  customerDiscountPrice?: number | null
  customerDiscountPriceInput?: string
  customerDiscountPercent?: number | null
  customerDiscountPercentInput?: string
  customerDiscountError?: string | null
  dealerPrice?: number
  dealerPriceInput?: string
  dealerDiscountPrice?: number | null
  dealerDiscountPriceInput?: string
  dealerDiscountPercent?: number | null
  dealerDiscountPercentInput?: string
  dealerDiscountError?: string | null
  isDirty?: boolean
}

export interface DiamondMediaItem {
  id: string
  diamond_id: string
  type: 'image' | 'video'
  storage_path: string
  public_url: string
  sort_order: number
  is_primary: boolean
  alt_text?: string
  created_at?: string
}

function getInitialStatus(): { text: string; kind: 'info' | 'error' | 'success' } {
  if (typeof window === 'undefined') return { text: '', kind: 'info' }
  const result = parseAuthStatusFromHash(window.location.hash)
  if (result.accessToken) {
    localStorage.setItem('hmd_access_token', result.accessToken)
    if (result.refreshToken) localStorage.setItem('hmd_refresh_token', result.refreshToken)
    window.history.replaceState(null, '', window.location.pathname + '#signin')
  } else if (result.kind === 'error') {
    window.history.replaceState(null, '', window.location.pathname + '#signin')
  }
  return { text: result.text, kind: result.kind }
}

export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  onSessionExpired?: () => void
): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('hmd_access_token') || '' : ''
  const headers = new Headers(init?.headers || {})
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let res = await fetch(input, { ...init, headers })

  if (res.status === 401 && typeof window !== 'undefined') {
    const refreshToken = localStorage.getItem('hmd_refresh_token')
    if (refreshToken) {
      try {
        const refreshRes = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          if (refreshData.accessToken) {
            localStorage.setItem('hmd_access_token', refreshData.accessToken)
            if (refreshData.refreshToken) {
              localStorage.setItem('hmd_refresh_token', refreshData.refreshToken)
            }
            if (refreshData.user) {
              localStorage.setItem('hmd_user', JSON.stringify(refreshData.user))
            }
            const retryHeaders = new Headers(init?.headers || {})
            retryHeaders.set('Authorization', `Bearer ${refreshData.accessToken}`)
            res = await fetch(input, { ...init, headers: retryHeaders })
            return res
          }
        }
      } catch (err) {
        console.warn('Auto token refresh attempt failed:', err)
      }
    }

    if (res.status === 401 && onSessionExpired) {
      onSessionExpired()
    }
  }

  return res
}

export default function AuthPages({
  mode,
  onUserChange,
}: {
  mode: string
  onUserChange?: (user: UserProfile | null) => void
}) {
  const current = (['signup-customer', 'signup-dealer', 'signin', 'account', 'admin', 'forgot-password', 'reset-password'].includes(mode) ? mode : 'signin') as Mode
  const dealer = current === 'signup-dealer'
  const signup = current === 'signup-customer' || current === 'signup-dealer'
  const isForgotPassword = current === 'forgot-password'
  const isResetPassword = current === 'reset-password'

  // ── user session state ──────────────────────────────────────────────────
  const [user, setUser] = useState<UserProfile | null>(() => {
    if (typeof window === 'undefined') return null
    const token = localStorage.getItem('hmd_access_token')
    const saved = localStorage.getItem('hmd_user')
    if (token && saved) {
      try {
        const parsed = JSON.parse(saved)
        return parsed
      } catch {
        return null
      }
    }
    return null
  })

  const [activeTab, setActiveTab] = useState<AccountTab>(() => {
    if (typeof window !== 'undefined') {
      const savedTab = localStorage.getItem('hmd_active_tab') as AccountTab | null
      if (savedTab && ['overview', 'catalog', 'cart', 'profile', 'orders', 'tools', 'dealers', 'promotions'].includes(savedTab)) {
        localStorage.removeItem('hmd_active_tab')
        return savedTab
      }
    }
    return mode === 'admin' ? 'tools' : 'overview'
  })
  const [addedCatalogSku, setAddedCatalogSku] = useState<string | null>(null)

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
      const token = localStorage.getItem('hmd_access_token')
      const raw = localStorage.getItem('hmd_user')
      const isGuestActive = sessionStorage.getItem('hmd_guest_cart_active') === 'true'
      if (!token && !raw && !isGuestActive) {
        localStorage.removeItem('hmd_cart')
        return []
      }
      const saved = localStorage.getItem('hmd_cart')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [submittingCart, setSubmittingCart] = useState(false)
  const [cartMsg, setCartMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)

  // ── forgot & reset password state ────────────────────────────────────────
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [forgotSubmitted, setForgotSubmitted] = useState(false)
  const [resetSubmitted, setResetSubmitted] = useState(false)
  const [recoveryToken, setRecoveryToken] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    const authStatus = parseAuthStatusFromHash()
    return authStatus.accessToken || ''
  })

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
  const [diamondDrafts, setDiamondDrafts] = useState<Record<string, DiamondRowDraft>>({})
  const [loadingAdminDiamonds, setLoadingAdminDiamonds] = useState(false)
  const [diamondFilterCategory, setDiamondFilterCategory] = useState('all')
  const [diamondFilterStatus, setDiamondFilterStatus] = useState('all')
  const [diamondSearch, setDiamondSearch] = useState('')
  const [uploadCategory, setUploadCategory] = useState('all')
  const [syncingFlomiz, setSyncingFlomiz] = useState(false)
  const [flomizSyncMsg, setFlomizSyncMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)
  const [savedDiamondId, setSavedDiamondId] = useState<string | null>(null)
  const [inventoryActionMsg, setInventoryActionMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)
  const [restoringDiamondId, setRestoringDiamondId] = useState<string | null>(null)
  const [flomizBaseUrlInput, setFlomizBaseUrlInput] = useState('https://diamond.flomiz.com')
  const [flomizApiKeyInput, setFlomizApiKeyInput] = useState('')
  const [testingFlomiz, setTestingFlomiz] = useState(false)
  const [flomizTestResult, setFlomizTestResult] = useState<{ success: boolean; code?: number; message: string; error?: string; endpoint?: string } | null>(null)
  const [mediaModalDiamond, setMediaModalDiamond] = useState<AdminDiamond | null>(null)
  const [diamondMediaList, setDiamondMediaList] = useState<DiamondMediaItem[]>([])
  const [loadingMediaList, setLoadingMediaList] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [mediaManagerMsg, setMediaManagerMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)
  const [mediaAltDraft, setMediaAltDraft] = useState<Record<string, string>>({})

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
  const [updatingDealerAppId, setUpdatingDealerAppId] = useState<string | null>(null)
  const [dealerAppFilter, setDealerAppFilter] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('all')
  const [dealerAppMsg, setDealerAppMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)

  // ── Customer Reviews moderation state (Admin) ─────────────────────────────
  const [adminReviews, setAdminReviews] = useState<AdminReviewItem[]>([])
  const [loadingReviews, setLoadingReviews] = useState(false)
  const [reviewReplyInputs, setReviewReplyInputs] = useState<Record<string, string>>({})
  const [editingReplyReviewId, setEditingReplyReviewId] = useState<string | null>(null)
  const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null)
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null)
  const [reviewMsg, setReviewMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)
  const [reviewSearch, setReviewSearch] = useState('')
  const [reviewStatusFilter, setReviewStatusFilter] = useState<'all' | 'published' | 'hidden'>('all')
  const [reviewRatingFilter, setReviewRatingFilter] = useState<number | 'all'>('all')

  const isSuperAdmin = Boolean(
    user?.role === 'super_admin' || user?.permissions?.can_manage_users || user?.permissions?.can_manage_team
  )

  const isUserAdmin = Boolean(
    isSuperAdmin || user?.account_type === 'admin'
  )

  const hasInventoryPerm = Boolean(
    isSuperAdmin || (isUserAdmin && (user?.permissions ? Boolean(user.permissions.can_manage_inventory) : true))
  )
  const hasOrdersPerm = Boolean(
    !isUserAdmin || isSuperAdmin || (user?.permissions ? Boolean(user.permissions.can_manage_orders) : true)
  )
  const hasKycPerm = Boolean(
    isSuperAdmin || (isUserAdmin && (user?.permissions ? Boolean(user.permissions.can_review_kyc) : true))
  )
  const hasPromotionsPerm = Boolean(
    isSuperAdmin || (isUserAdmin && (user?.permissions ? Boolean(user.permissions.can_manage_promotions) : true))
  )
  const hasReviewsPerm = Boolean(
    isSuperAdmin || (isUserAdmin && (user?.permissions ? Boolean(user.permissions.can_manage_reviews) : true))
  )

  const roleTitle = user?.role_title || (
    user?.role === 'super_admin' ? 'Super Administrator' :
    user?.role === 'admin' ? 'Administrator' :
    user?.role === 'sales_manager' ? 'Sales Manager' :
    user?.role === 'operations_manager' ? 'Operations Manager' :
    (isUserAdmin || user?.account_type === 'admin') ? 'Administrator' :
    user?.account_type === 'dealer' ? 'Wholesale Dealer' : 'Verified Customer'
  )

  // ── Staff & Operations Role Management (Super Admin) ─────────────────────
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [showCreateStaffForm, setShowCreateStaffForm] = useState(false)
  const [staffSearch, setStaffSearch] = useState('')
  const [staffMsg, setStaffMsg] = useState<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)
  const [creatingStaffBusy, setCreatingStaffBusy] = useState(false)

  // Form states for inviting staff
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffEmail, setNewStaffEmail] = useState('')
  const [newStaffRole, setNewStaffRole] = useState<'admin' | 'sales_manager' | 'operations_manager'>('sales_manager')
  const [newStaffRoleTitle, setNewStaffRoleTitle] = useState('Sales Manager')
  const [newStaffPerms, setNewStaffPerms] = useState<StaffPermissions>({
    can_manage_inventory: false,
    can_manage_orders: true,
    can_review_kyc: true,
    can_manage_reviews: true,
    can_delete_reviews: false,
    can_manage_promotions: false,
    can_manage_users: false,
  })

  // Editing staff state
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState<'admin' | 'sales_manager' | 'operations_manager'>('operations_manager')
  const [editRoleTitle, setEditRoleTitle] = useState('')
  const [editIsActive, setEditIsActive] = useState<boolean>(true)
  const [editPerms, setEditPerms] = useState<StaffPermissions>({})
  const [savingEditBusy, setSavingEditBusy] = useState(false)

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
    setUpdatingDealerAppId(appId)
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
      setDealerAppMsg({
        text: nextStatus === 'approved'
          ? '✓ Wholesale dealer account approved and activated successfully! The dealer can now sign in and access wholesale trade rates.'
          : `Dealer application status updated to: ${nextStatus}.`,
        kind: nextStatus === 'approved' ? 'success' : 'info',
      })
      setDealerApps(prev => prev.map(a => a.id === appId ? { ...a, status: nextStatus } : a))
      setTimeout(() => setDealerAppMsg(null), 4000)
    } catch (err) {
      setDealerAppMsg({ text: err instanceof Error ? err.message : 'Update failed', kind: 'error' })
    } finally {
      setUpdatingDealerAppId(null)
    }
  }

  const fetchAdminReviews = useCallback(async () => {
    setLoadingReviews(true)
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch('/api/admin/reviews', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.items)) {
          setAdminReviews(data.items)
          const initialInputs: Record<string, string> = {}
          data.items.forEach((r: AdminReviewItem) => {
            if (r.reply) initialInputs[r.id] = r.reply
          })
          setReviewReplyInputs(initialInputs)
        }
      }
    } catch (err) {
      console.warn('Failed to fetch admin reviews:', err)
    } finally {
      setLoadingReviews(false)
    }
  }, [])

  const handlePostReviewReply = async (reviewId: string) => {
    const text = (reviewReplyInputs[reviewId] || '').trim()
    if (!text) {
      setReviewMsg({ text: 'Please type a reply message before posting.', kind: 'error' })
      return
    }
    setSubmittingReplyId(reviewId)
    setReviewMsg(null)
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch('/api/admin/review-replies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reviewId, replyText: text }),
      })
      const data = await res.json()
      if (res.ok) {
        setAdminReviews(prev =>
          prev.map(r => (r.id === reviewId ? { ...r, reply: text } : r))
        )
        setEditingReplyReviewId(null)
        setReviewMsg({ text: '✓ Reply posted successfully! It is now visible on the website.', kind: 'success' })
        setTimeout(() => setReviewMsg(null), 4000)
      } else {
        setReviewMsg({ text: data.error || 'Failed to post reply.', kind: 'error' })
      }
    } catch (err) {
      setReviewMsg({ text: err instanceof Error ? err.message : 'Network error posting reply.', kind: 'error' })
    } finally {
      setSubmittingReplyId(null)
    }
  }

  const handleDeleteReview = async (reviewId: string, customerName: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete the review from "${customerName}"? This action cannot be undone.`)) {
      return
    }
    setDeletingReviewId(reviewId)
    setReviewMsg(null)
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await res.json()
      if (res.ok) {
        setAdminReviews(prev => prev.filter(r => r.id !== reviewId))
        setReviewMsg({ text: `✓ Review from "${customerName}" has been permanently deleted.`, kind: 'success' })
        setTimeout(() => setReviewMsg(null), 4000)
      } else {
        setReviewMsg({ text: data.error || 'Failed to delete review.', kind: 'error' })
      }
    } catch (err) {
      setReviewMsg({ text: err instanceof Error ? err.message : 'Network error deleting review.', kind: 'error' })
    } finally {
      setDeletingReviewId(null)
    }
  }

  const handleToggleReviewStatus = async (reviewId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'published' ? 'hidden' : 'published'
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (res.ok) {
        setAdminReviews(prev =>
          prev.map(r => (r.id === reviewId ? { ...r, status: nextStatus } : r))
        )
        setReviewMsg({ text: `✓ Review status updated to "${nextStatus}".`, kind: 'success' })
        setTimeout(() => setReviewMsg(null), 3000)
      } else {
        setReviewMsg({ text: data.error || 'Failed to update review status.', kind: 'error' })
      }
    } catch {
      setReviewMsg({ text: 'Error updating review status.', kind: 'error' })
    }
  }

  const fetchAdminDiamonds = useCallback(async (statusOverride?: string) => {
    setLoadingAdminDiamonds(true)
    const activeStatus = statusOverride !== undefined ? statusOverride : diamondFilterStatus
    const query = activeStatus && activeStatus !== 'all' ? `?status=${encodeURIComponent(activeStatus)}` : ''
    try {
      const res = await authFetch(`/api/admin/diamonds${query}`)
      if (res.ok) {
        const data = await res.json()
        if (data && Array.isArray(data.items)) {
          setAdminDiamonds(sanitizeAdminDiamonds<AdminDiamond>(data.items))
        }
      }
    } catch (err) {
      console.warn('Failed to fetch admin diamonds:', err)
    } finally {
      setLoadingAdminDiamonds(false)
    }
  }, [diamondFilterStatus])

  // ── Staff & Operations Handlers (Super Admin) ───────────────────────────
  const fetchStaff = useCallback(async () => {
    setLoadingStaff(true)
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch('/api/admin/users', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data.users) ? data.users : (Array.isArray(data.staff) ? data.staff : [])
        setStaffList(list)
      } else {
        const fbRes = await fetch('/api/admin/staff', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (fbRes.ok) {
          const fbData = await fbRes.json()
          const list = Array.isArray(fbData.users) ? fbData.users : (Array.isArray(fbData.staff) ? fbData.staff : [])
          setStaffList(list)
        }
      }
    } catch (err) {
      console.warn('Failed to fetch staff accounts:', err)
    } finally {
      setLoadingStaff(false)
    }
  }, [])

  const handleSelectRole = (role: 'admin' | 'sales_manager' | 'operations_manager') => {
    setNewStaffRole(role)
    if (role === 'admin') {
      setNewStaffRoleTitle('Administrator')
      setNewStaffPerms({
        can_manage_inventory: true,
        can_manage_orders: true,
        can_review_kyc: true,
        can_manage_reviews: true,
        can_delete_reviews: true,
        can_manage_promotions: true,
        can_manage_users: false,
      })
    } else if (role === 'sales_manager') {
      setNewStaffRoleTitle('Sales Manager')
      setNewStaffPerms({
        can_manage_inventory: false,
        can_manage_orders: true,
        can_review_kyc: true,
        can_manage_reviews: false,
        can_delete_reviews: false,
        can_manage_promotions: false,
        can_manage_users: false,
      })
    } else if (role === 'operations_manager') {
      setNewStaffRoleTitle('Operations Manager')
      setNewStaffPerms({
        can_manage_inventory: true,
        can_manage_orders: true,
        can_review_kyc: false,
        can_manage_reviews: true,
        can_delete_reviews: false,
        can_manage_promotions: false,
        can_manage_users: false,
      })
    }
  }

  const handleCreateStaff = async (e: FormEvent) => {
    e.preventDefault()
    if (!newStaffName.trim() || newStaffName.trim().length < 2) {
      setStaffMsg({ text: 'Please enter staff full name (at least 2 characters).', kind: 'error' })
      return
    }
    if (!newStaffEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newStaffEmail.trim())) {
      setStaffMsg({ text: 'Please enter a valid email address.', kind: 'error' })
      return
    }

    setCreatingStaffBusy(true)
    setStaffMsg(null)
    const token = localStorage.getItem('hmd_access_token')

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fullName: newStaffName.trim(),
          email: newStaffEmail.trim().toLowerCase(),
          role: newStaffRole,
          roleTitle: newStaffRoleTitle.trim() || undefined,
          permissions: newStaffPerms,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setStaffMsg({ text: `✓ Invitation dispatched to ${newStaffEmail}. They will receive an email to securely set their password.`, kind: 'success' })
        setNewStaffName('')
        setNewStaffEmail('')
        setShowCreateStaffForm(false)
        fetchStaff()
      } else {
        setStaffMsg({ text: data.error || 'Failed to dispatch staff invitation.', kind: 'error' })
      }
    } catch {
      setStaffMsg({ text: 'Network request failed. Could not invite staff member.', kind: 'error' })
    } finally {
      setCreatingStaffBusy(false)
    }
  }

  const handleStartEditStaff = (staff: StaffMember) => {
    setEditingStaffId(staff.id)
    const allowedRoles = ['admin', 'sales_manager', 'operations_manager']
    const currentRole = staff.role && allowedRoles.includes(staff.role) ? staff.role as 'admin' | 'sales_manager' | 'operations_manager' : 'operations_manager'
    setEditRole(currentRole)
    setEditRoleTitle(staff.role_title || '')
    setEditIsActive(staff.is_active !== false)
    setEditPerms({ ...staff.permissions })
    setStaffMsg(null)
  }

  const handleSaveEditStaff = async (staffId: string) => {
    setSavingEditBusy(true)
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch(`/api/admin/users/${staffId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          role: editRole,
          roleTitle: editRoleTitle,
          is_active: editIsActive,
          permissions: editPerms,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setStaffMsg({ text: '✓ Staff permissions and account status updated successfully.', kind: 'success' })
        setEditingStaffId(null)
        fetchStaff()
      } else {
        setStaffMsg({ text: data.error || 'Failed to update permissions.', kind: 'error' })
      }
    } catch {
      setStaffMsg({ text: 'Network request error while updating permissions.', kind: 'error' })
    } finally {
      setSavingEditBusy(false)
    }
  }

  const handleToggleStaffActive = async (staff: StaffMember) => {
    const isActivating = staff.is_active === false
    const actionWord = isActivating ? 'activate' : 'deactivate'
    if (!window.confirm(`Are you sure you want to ${actionWord} the account for ${staff.full_name} (${staff.email})?`)) {
      return
    }
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch(`/api/admin/users/${staff.id}`, {
        method: isActivating ? 'PATCH' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(isActivating ? { body: JSON.stringify({ is_active: true }) } : {}),
      })
      const data = await res.json()
      if (res.ok) {
        setStaffMsg({ text: `✓ Staff account for ${staff.full_name} ${isActivating ? 'activated' : 'deactivated'}.`, kind: 'success' })
        fetchStaff()
      } else {
        setStaffMsg({ text: data.error || `Failed to ${actionWord} account.`, kind: 'error' })
      }
    } catch {
      setStaffMsg({ text: `Network request error while ${actionWord}ing account.`, kind: 'error' })
    }
  }

  const handleUpdateDiamond = async (diamondId: string, updates: Partial<AdminDiamond>) => {
    if (!diamondId || typeof diamondId !== 'string') {
      alert('Cannot update diamond: Missing diamond identifier.')
      return
    }
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch(`/api/admin/diamonds/${encodeURIComponent(diamondId)}`, {
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
          prev.map(d => (d.id === diamondId ? { ...d, ...updates } : d))
        )
        // Clear draft edits for this row on save
        setDiamondDrafts(prev => {
          const next = { ...prev }
          delete next[diamondId]
          return next
        })
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to update diamond.')
      }
    } catch (err) {
      console.warn('Failed to update diamond:', err)
    }
  }

  const handleDeleteDiamond = async (diamondId: string, sku: string) => {
    if (!window.confirm(`Are you sure you want to delete diamond ${sku}?\nIt will be hidden from the live storefront and moved to the "Deleted Stones" list.`)) {
      return
    }
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch(`/api/admin/diamonds/${encodeURIComponent(diamondId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.ok) {
        setInventoryActionMsg({
          text: `✓ Diamond ${sku} moved to deleted stones. You can restore it anytime under the "Deleted Stones" filter.`,
          kind: 'info',
        })
        setTimeout(() => setInventoryActionMsg(null), 5000)
        fetchAdminDiamonds()
      } else {
        const data = await res.json().catch(() => ({}))
        setInventoryActionMsg({ text: data.error || 'Failed to delete diamond.', kind: 'error' })
      }
    } catch (err) {
      console.warn('Delete diamond failed:', err)
      setInventoryActionMsg({ text: 'Network error deleting diamond.', kind: 'error' })
    }
  }

  const handleRestoreDiamond = async (diamondId: string, sku?: string) => {
    setRestoringDiamondId(diamondId)
    const token = localStorage.getItem('hmd_access_token')
    try {
      const res = await fetch(`/api/admin/diamonds/${encodeURIComponent(diamondId)}/restore`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.ok) {
        setInventoryActionMsg({
          text: `✓ Diamond ${sku || diamondId} restored to active inventory.`,
          kind: 'success',
        })
        setTimeout(() => setInventoryActionMsg(null), 5000)
        fetchAdminDiamonds()
      } else {
        const data = await res.json().catch(() => ({}))
        setInventoryActionMsg({ text: data.error || 'Failed to restore diamond.', kind: 'error' })
      }
    } catch (err) {
      console.warn('Restore diamond failed:', err)
      setInventoryActionMsg({ text: 'Network error restoring diamond.', kind: 'error' })
    } finally {
      setRestoringDiamondId(null)
    }
  }

  const fetchDiamondMediaList = async (diamondId: string) => {
    setLoadingMediaList(true)
    setMediaManagerMsg(null)
    try {
      const res = await fetch(`/api/diamonds/${encodeURIComponent(diamondId)}/media`)
      if (res.ok) {
        const data = await res.json()
        const items: DiamondMediaItem[] = Array.isArray(data.items) ? data.items : []
        setDiamondMediaList(items)
        const drafts: Record<string, string> = {}
        items.forEach(m => {
          drafts[m.id] = m.alt_text || ''
        })
        setMediaAltDraft(drafts)
      } else {
        setMediaManagerMsg({ text: 'Unable to load media items.', kind: 'error' })
      }
    } catch {
      setMediaManagerMsg({ text: 'Unable to load media items.', kind: 'error' })
    } finally {
      setLoadingMediaList(false)
    }
  }

  const handleOpenMediaModal = (diamond: AdminDiamond) => {
    setMediaModalDiamond(diamond)
    fetchDiamondMediaList(diamond.id || diamond.sku)
  }

  const handleCloseMediaModal = () => {
    setMediaModalDiamond(null)
    setDiamondMediaList([])
    setMediaManagerMsg(null)
  }

  const handleUploadMediaFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !mediaModalDiamond) return

    const fileName = file.name
    const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/)
    const ext = extMatch ? extMatch[1].toLowerCase() : ''
    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
    const isVideo = ['mp4', 'webm'].includes(ext)

    if (!isImage && !isVideo) {
      setMediaManagerMsg({
        text: `Disallowed file format ".${ext}". Only JPG, PNG, WEBP (images) and MP4, WEBM (videos) are allowed.`,
        kind: 'error',
      })
      e.target.value = ''
      return
    }

    const type: 'image' | 'video' = isImage ? 'image' : 'video'
    const maxBytes = isImage ? 5 * 1024 * 1024 : 50 * 1024 * 1024
    if (file.size > maxBytes) {
      setMediaManagerMsg({
        text: `File exceeds maximum allowed size (${isImage ? '5 MB for images' : '50 MB for videos'}).`,
        kind: 'error',
      })
      e.target.value = ''
      return
    }

    const currentImages = diamondMediaList.filter(m => m.type === 'image').length
    const currentVideos = diamondMediaList.filter(m => m.type === 'video').length
    if (isImage && currentImages >= 10) {
      setMediaManagerMsg({ text: 'Maximum limit of 10 photos reached for this diamond.', kind: 'error' })
      e.target.value = ''
      return
    }
    if (isVideo && currentVideos >= 3) {
      setMediaManagerMsg({ text: 'Maximum limit of 3 videos reached for this diamond.', kind: 'error' })
      e.target.value = ''
      return
    }

    setUploadingMedia(true)
    setMediaManagerMsg(null)
    const token = localStorage.getItem('hmd_access_token')
    const diamondId = mediaModalDiamond.id || mediaModalDiamond.sku

    try {
      const initRes = await fetch(`/api/admin/diamonds/${encodeURIComponent(diamondId)}/media/upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type,
          fileName: file.name,
          fileSize: file.size,
        }),
      })
      const initData = await initRes.json()
      if (!initRes.ok) {
        throw new Error(initData.error || 'Failed to initialize media upload.')
      }

      // Read first 32 bytes for magic bytes validation
      const slice = file.slice(0, 32)
      const headerBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          const b64 = result.includes(',') ? result.split(',')[1] : result
          resolve(b64)
        }
        reader.onerror = reject
        reader.readAsDataURL(slice)
      })

      // Direct upload
      const uploadHeaders: Record<string, string> = {
        'Content-Type': file.type || (isImage ? 'image/jpeg' : 'video/mp4'),
      }
      if (initData.token) uploadHeaders['Authorization'] = `Bearer ${initData.token}`

      await fetch(initData.uploadUrl, {
        method: 'PUT',
        headers: uploadHeaders,
        body: file,
      }).catch(err => {
        console.warn('Storage upload note:', err)
      })

      // Confirm upload with server
      const confirmRes = await fetch(`/api/admin/diamonds/${encodeURIComponent(diamondId)}/media/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storagePath: initData.storagePath,
          type,
          altText: file.name.replace(/\.[^/.]+$/, ''),
          headerBase64,
          isPrimary: diamondMediaList.length === 0,
        }),
      })
      const confirmData = await confirmRes.json()
      if (!confirmRes.ok) {
        throw new Error(confirmData.error || 'Server rejected uploaded media.')
      }

      setMediaManagerMsg({ text: 'Media uploaded and verified successfully!', kind: 'success' })
      await fetchDiamondMediaList(diamondId)
      fetchAdminDiamonds()
    } catch (err) {
      setMediaManagerMsg({
        text: err instanceof Error ? err.message : 'Upload failed.',
        kind: 'error',
      })
    } finally {
      setUploadingMedia(false)
      e.target.value = ''
    }
  }

  const handleSetPrimaryMedia = async (mediaId: string) => {
    if (!mediaModalDiamond) return
    const token = localStorage.getItem('hmd_access_token')
    const diamondId = mediaModalDiamond.id || mediaModalDiamond.sku
    try {
      const res = await fetch(`/api/admin/diamonds/${encodeURIComponent(diamondId)}/media/${encodeURIComponent(mediaId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isPrimary: true }),
      })
      if (res.ok) {
        setDiamondMediaList(prev => prev.map(m => ({ ...m, is_primary: m.id === mediaId })))
        fetchAdminDiamonds()
      }
    } catch (err) {
      console.warn('Set primary failed:', err)
    }
  }

  const handleSaveMediaAlt = async (mediaId: string) => {
    if (!mediaModalDiamond) return
    const token = localStorage.getItem('hmd_access_token')
    const diamondId = mediaModalDiamond.id || mediaModalDiamond.sku
    const altText = mediaAltDraft[mediaId] ?? ''
    try {
      const res = await fetch(`/api/admin/diamonds/${encodeURIComponent(diamondId)}/media/${encodeURIComponent(mediaId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ altText }),
      })
      if (res.ok) {
        setDiamondMediaList(prev => prev.map(m => m.id === mediaId ? { ...m, alt_text: altText } : m))
        setMediaManagerMsg({ text: 'Caption saved.', kind: 'success' })
        setTimeout(() => setMediaManagerMsg(null), 2500)
      }
    } catch (err) {
      console.warn('Save alt text failed:', err)
    }
  }

  const handleReorderMedia = async (mediaId: string, direction: 'up' | 'down') => {
    if (!mediaModalDiamond) return
    const idx = diamondMediaList.findIndex(m => m.id === mediaId)
    if (idx < 0) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= diamondMediaList.length) return

    const itemA = diamondMediaList[idx]
    const itemB = diamondMediaList[targetIdx]
    const token = localStorage.getItem('hmd_access_token')
    const diamondId = mediaModalDiamond.id || mediaModalDiamond.sku

    const orderA = itemB.sort_order ?? targetIdx
    const orderB = itemA.sort_order ?? idx

    try {
      await Promise.all([
        fetch(`/api/admin/diamonds/${encodeURIComponent(diamondId)}/media/${encodeURIComponent(itemA.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sortOrder: orderA }),
        }),
        fetch(`/api/admin/diamonds/${encodeURIComponent(diamondId)}/media/${encodeURIComponent(itemB.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sortOrder: orderB }),
        }),
      ])
      await fetchDiamondMediaList(diamondId)
    } catch (err) {
      console.warn('Reorder failed:', err)
    }
  }

  const handleDeleteMediaItem = async (mediaId: string) => {
    if (!mediaModalDiamond) return
    if (!window.confirm('Are you sure you want to delete this media item? It will be removed from storage.')) return
    const token = localStorage.getItem('hmd_access_token')
    const diamondId = mediaModalDiamond.id || mediaModalDiamond.sku
    try {
      const res = await fetch(`/api/admin/diamonds/${encodeURIComponent(diamondId)}/media/${encodeURIComponent(mediaId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setDiamondMediaList(prev => prev.filter(m => m.id !== mediaId))
        setMediaManagerMsg({ text: 'Media deleted.', kind: 'success' })
        setTimeout(() => setMediaManagerMsg(null), 2500)
        fetchAdminDiamonds()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to delete media.')
      }
    } catch (err) {
      console.warn('Delete media failed:', err)
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

  const handleTestFlomizConnection = async () => {
    setTestingFlomiz(true)
    setFlomizTestResult(null)
    const token = localStorage.getItem('hmd_access_token')

    let cleanBaseUrl = flomizBaseUrlInput.trim()
    if (/^https?:\/\/www\.billing\.flomiz\.com/i.test(cleanBaseUrl)) {
      cleanBaseUrl = cleanBaseUrl.replace(/www\./i, '')
      setFlomizBaseUrlInput(cleanBaseUrl)
    } else if (/^www\.billing\.flomiz\.com/i.test(cleanBaseUrl)) {
      cleanBaseUrl = 'https://billing.flomiz.com'
      setFlomizBaseUrlInput(cleanBaseUrl)
    } else if (!/^https?:\/\//i.test(cleanBaseUrl) && cleanBaseUrl) {
      cleanBaseUrl = `https://${cleanBaseUrl}`
      setFlomizBaseUrlInput(cleanBaseUrl)
    }

    try {
      const res = await fetch('/api/admin/flomiz/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          baseUrl: cleanBaseUrl,
          apiKey: flomizApiKeyInput.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      const isSuccess = Boolean(data.success && res.ok)
      const msg = data.message || data.error || (res.ok ? 'Connection successful!' : `Server returned error (${res.status})`)
      setFlomizTestResult({
        success: isSuccess,
        code: data.code || res.status,
        message: msg,
        error: data.error,
        endpoint: data.endpoint,
      })
    } catch (err) {
      setFlomizTestResult({
        success: false,
        code: 500,
        message: err instanceof Error ? err.message : 'Failed to connect to gateway test endpoint.',
      })
    } finally {
      setTestingFlomiz(false)
    }
  }

  const handleSaveFlomizConfig = async () => {
    const token = localStorage.getItem('hmd_access_token')
    let cleanBaseUrl = flomizBaseUrlInput.trim()
    if (/^https?:\/\/www\.billing\.flomiz\.com/i.test(cleanBaseUrl)) {
      cleanBaseUrl = cleanBaseUrl.replace(/www\./i, '')
      setFlomizBaseUrlInput(cleanBaseUrl)
    } else if (/^www\.billing\.flomiz\.com/i.test(cleanBaseUrl)) {
      cleanBaseUrl = 'https://billing.flomiz.com'
      setFlomizBaseUrlInput(cleanBaseUrl)
    } else if (!/^https?:\/\//i.test(cleanBaseUrl) && cleanBaseUrl) {
      cleanBaseUrl = `https://${cleanBaseUrl}`
      setFlomizBaseUrlInput(cleanBaseUrl)
    }

    try {
      const res = await fetch('/api/admin/flomiz/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          baseUrl: cleanBaseUrl,
          apiKey: flomizApiKeyInput.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setFlomizTestResult({ success: true, message: 'Gateway settings saved! Click "Test Connection" to test.' })
      } else {
        setFlomizTestResult({
          success: false,
          code: res.status,
          message: data.message || data.error || 'Failed to save configuration.',
        })
      }
    } catch {
      setFlomizTestResult({ success: false, code: 500, message: 'Unable to save gateway settings.' })
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
    let nextCart: CartItem[]
    if (existing) {
      nextCart = cart.map(c => c.sku === diamond.sku ? { ...c, quantity: c.quantity + 1 } : c)
    } else {
      nextCart = [...cart, { ...diamond, quantity: 1 }]
    }
    updateCart(nextCart)
    setCartMsg({ text: `Added ${diamond.shape} ${diamond.carat}ct (${diamond.sku}) to your cart.`, kind: 'success' })

    setAddedCatalogSku(diamond.sku)
    setTimeout(() => {
      setAddedCatalogSku(prev => (prev === diamond.sku ? null : prev))
    }, 1800)

    const totalItems = nextCart.reduce((sum, i) => sum + (i.quantity || 1), 0)
    const subtotal = nextCart.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 1)), 0)

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
            price: diamond.price,
            certificateNumber: diamond.certificateNumber || '',
            imageUrl: diamond.imageUrl || null,
          },
          totalItems,
          subtotal,
        },
      })
    )
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

  const isTabAllowed = useCallback((tab: AccountTab): boolean => {
    if (!isUserAdmin) return true
    if (tab === 'orders') return hasOrdersPerm
    if (tab === 'tools') return hasInventoryPerm
    if (tab === 'dealers') return hasKycPerm
    if (tab === 'offers') return hasPromotionsPerm
    if (tab === 'reviews') return hasReviewsPerm
    if (tab === 'team') return isSuperAdmin
    return true
  }, [isUserAdmin, hasOrdersPerm, hasInventoryPerm, hasKycPerm, hasPromotionsPerm, hasReviewsPerm, isSuperAdmin])

  const effectiveTab = isTabAllowed(activeTab) ? activeTab : 'overview'

  const switchTab = (tab: AccountTab) => {
    const targetTab = isTabAllowed(tab) ? tab : 'overview'
    setActiveTab(targetTab)
    if (targetTab === 'catalog' && catalogItems.length === 0) {
      loadCatalog()
    }
    if (targetTab === 'orders') {
      loadOrders()
    }
    if (targetTab === 'offers') {
      fetchPromotions()
    }
    if (targetTab === 'tools') {
      fetchAdminDiamonds()
    }
    if (targetTab === 'dealers') {
      fetchDealerApplications()
    }
    if (targetTab === 'reviews') {
      fetchAdminReviews()
    }
    if (targetTab === 'team') {
      fetchStaff()
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
            // If user logged in with Google/Apple but is NOT an existing registered customer or admin:
            if (data.is_registered === false) {
              localStorage.removeItem('hmd_access_token')
              localStorage.removeItem('hmd_refresh_token')
              localStorage.removeItem('hmd_user')
              localStorage.removeItem('hmd_cart')
              sessionStorage.removeItem('hmd_guest_cart_active')
              updateUserSession(null)
              setEmail(data.email)
              if (data.full_name) {
                setFullName(data.full_name)
              }
              setStatus({
                text: 'This email is not registered. Please sign up first to create your customer account.',
                kind: 'error',
              })
              window.location.hash = '#signup-customer'
              return
            }

            const profile: UserProfile = {
              email: data.email,
              full_name: data.full_name || data.email.split('@')[0],
              phone: data.phone || '',
              address: data.address || '',
              gender: data.gender || 'prefer_not_to_say',
              account_type: data.account_type || 'customer',
              dealer_status: data.dealer_status || 'not_applied',
              permissions: data.permissions,
              role_title: data.role_title,
            }
            localStorage.setItem('hmd_user', JSON.stringify(profile))
            updateUserSession(profile)
          }
        })
        .catch(() => {})
    }
  }, [user, updateUserSession])

  // Synchronize recovery token if URL hash changes
  useEffect(() => {
    const handleHash = () => {
      const authStatus = parseAuthStatusFromHash()
      if (authStatus.accessToken) {
        setRecoveryToken(authStatus.accessToken)
      }
    }
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

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
            setAdminDiamonds(sanitizeAdminDiamonds<AdminDiamond>(data.items))
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

      fetch('/api/admin/reviews', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(res => res.json())
        .then(data => {
          if (!ignore && Array.isArray(data?.items)) {
            setAdminReviews(data.items)
            const initialInputs: Record<string, string> = {}
            data.items.forEach((r: AdminReviewItem) => {
              if (r.reply) initialInputs[r.id] = r.reply
            })
            setReviewReplyInputs(initialInputs)
          }
        })
        .catch(() => {})

      if (isSuperAdmin) {
        fetch('/api/admin/staff', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then(res => res.json())
          .then(data => {
            if (!ignore && data?.staff && Array.isArray(data.staff)) {
              setStaffList(data.staff)
            }
          })
          .catch(() => {})
      }
    }
    return () => {
      ignore = true
    }
  }, [user, mode, isUserAdmin, isSuperAdmin])

  // Redirect non-staff users away from admin mode
  useEffect(() => {
    if (user && mode === 'admin' && !isUserAdmin) {
      window.location.hash = '#account'
    }
  }, [user, mode, isUserAdmin])


  // Synchronize active tab when requested from cart flyout or header
  useEffect(() => {
    const handleSwitchTab = () => {
      const savedTab = localStorage.getItem('hmd_active_tab') as AccountTab | null
      if (savedTab && ['overview', 'catalog', 'cart', 'profile', 'orders', 'tools', 'dealers', 'promotions', 'offers', 'reviews', 'team'].includes(savedTab)) {
        localStorage.removeItem('hmd_active_tab')
        setActiveTab(savedTab)
      }
    }
    window.addEventListener('hmd-switch-tab', handleSwitchTab)
    window.addEventListener('hashchange', handleSwitchTab)
    return () => {
      window.removeEventListener('hmd-switch-tab', handleSwitchTab)
      window.removeEventListener('hashchange', handleSwitchTab)
    }
  }, [])

  // Load profile from server when entering profile tab
  useEffect(() => {
    if (user && effectiveTab === 'profile') {
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
  }, [user, effectiveTab])

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
    if (password.length < 8)
      return 'Password must be at least 8 characters long.'
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password))
      return 'Password must contain uppercase letters, lowercase letters, and numbers.'
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
      const isJson = response.headers.get('content-type')?.includes('application/json')
      const data = isJson ? await response.json().catch(() => ({})) : {}
      if (!response.ok) {
        if (!isJson) {
          throw new Error('The server is currently deploying or restarting. Please try again in a few moments.')
        }
        throw new Error(data.error || 'Something went wrong. Please try again.')
      }

      if (!signup && data.accessToken) {
        localStorage.setItem('hmd_access_token', data.accessToken)
        localStorage.setItem('hmd_refresh_token', data.refreshToken || '')
        const profile: UserProfile = data.user || { email: email.trim(), full_name: email.split('@')[0], account_type: 'customer' }
        localStorage.setItem('hmd_user', JSON.stringify(profile))
        updateUserSession(profile)
        const msg = profile?.account_type === 'admin'
          ? 'Signed in as Administrator. Welcome to the Admin Control Center.'
          : (profile?.account_type === 'dealer' && profile?.dealer_status !== 'approved')
          ? 'Signed in. Your dealer access is still awaiting administrator approval.'
          : 'You are signed in successfully.'
        setStatus({ text: msg, kind: 'success' })
        window.location.hash = (mode === 'admin' || profile?.account_type === 'admin') ? '#admin' : '#account'
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

      const isJson = res.headers.get('content-type')?.includes('application/json')
      const data = isJson ? await res.json().catch(() => ({})) : {}
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

      const isJson = res.headers.get('content-type')?.includes('application/json')
      const data = isJson ? await res.json().catch(() => ({})) : {}
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
      const isJson = response.headers.get('content-type')?.includes('application/json')
      const data = isJson ? await response.json().catch(() => ({})) : {}
      if (!response.ok) throw new Error(data.error || 'Unable to request a new confirmation email.')
      setStatus({ text: data.message || 'If confirmation is still required, a new email has been requested.', kind: 'success' })
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : 'Unable to request a new confirmation email.', kind: 'error' })
    } finally {
      setResendBusy(false)
    }
  }

  async function handleSocialLogin(provider: 'Google' | 'Apple') {
    // 1. If currently on sign-in page and user entered an email, pre-check if registered
    if (!signup && email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setBusy(true)
      setStatus({ text: `Checking account registration for ${email.trim()}…`, kind: 'info' })
      try {
        const checkRes = await fetch(`/api/auth/check-registered?email=${encodeURIComponent(email.trim().toLowerCase())}`)
        if (checkRes.ok) {
          const checkData = await checkRes.json()
          if (!checkData.registered) {
            setBusy(false)
            setStatus({
              text: 'This email is not registered. Please sign up first to create your customer account.',
              kind: 'error',
            })
            window.location.hash = '#signup-customer'
            return
          }
        }
      } catch {
        // Fall back to standard OAuth
      }
    }

    try {
      sessionStorage.setItem('hmd_social_intent', signup ? 'signup' : 'signin')
    } catch {
      // Ignore private mode sessionStorage restrictions
    }

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

  async function handleForgotPasswordSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus({ text: '', kind: 'info' })
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setStatus({ text: 'Please enter a valid email address.', kind: 'error' })
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      })
      const isJson = res.headers.get('content-type')?.includes('application/json')
      const data = isJson ? await res.json().catch(() => ({})) : {}
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send reset link. Please try again.')
      }
      setStatus({
        text: data.message || 'If this email has an account, a password reset link has been sent.',
        kind: 'success',
      })
      setForgotSubmitted(true)
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : 'Unable to request password reset.', kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleResetPasswordSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus({ text: '', kind: 'info' })
    const token = recoveryToken || parseAuthStatusFromHash().accessToken || ''
    if (!token) {
      setStatus({
        text: 'Your password reset link is invalid or has expired. Please request a new password reset link.',
        kind: 'error',
      })
      return
    }
    if (newPassword.length < 8) {
      setStatus({ text: 'Password must be at least 8 characters long.', kind: 'error' })
      return
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setStatus({ text: 'Password must contain uppercase letters, lowercase letters, and numbers.', kind: 'error' })
      return
    }
    if (newPassword !== confirmPassword) {
      setStatus({ text: 'Passwords do not match. Please verify and try again.', kind: 'error' })
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accessToken: token, password: newPassword }),
      })
      const isJson = res.headers.get('content-type')?.includes('application/json')
      const data = isJson ? await res.json().catch(() => ({})) : {}
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password. Your reset link may have expired.')
      }
      setStatus({
        text: data.message || 'Your password has been successfully updated! You can now sign in with your new password.',
        kind: 'success',
      })
      setResetSubmitted(true)
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : 'Unable to update password.', kind: 'error' })
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
      const res = await authFetch('/api/admin/inventory/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileContent: text,
          mode: 'append',
          defaultCategory: uploadCategory,
        }),
      })

      const isJson = res.headers.get('content-type')?.includes('application/json')
      const data = isJson ? await res.json().catch(() => ({})) : {}
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Your administrator session has expired. Please sign in again.')
        }
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

  // ── Account Dashboard View (Rendered when signed in and not in password recovery) ──
  if (user && !isForgotPassword && !isResetPassword) {
    return (
      <main className="auth-page auth-page--dashboard">
        <header className="auth-header auth-header--dashboard">
          <a href="#home">
            <img src="/heyman-diamond-logo.png" alt="Hey Man Diamond LLC" />
          </a>
          <a href="#home">← Back to website</a>
        </header>

        <section className="auth-card account-dashboard">
          <span className="auth-eyebrow">
            {isUserAdmin || user.account_type === 'admin'
              ? `HEY MAN DIAMOND LLC · SECURE ${roleTitle.toUpperCase()} CONTROL CENTER`
              : 'HEY MAN DIAMOND LLC · SECURE CUSTOMER PORTAL'}
          </span>
          <h1>Welcome, {user.full_name || user.email.split('@')[0]}!</h1>
          <p className="account-subtitle">
            Signed in as <strong>{user.email}</strong>
          </p>

          <div className="account-badge-container">
            <span className={`account-badge account-badge--${isUserAdmin || user.account_type === 'admin' ? (user.role || 'admin') : (user.account_type || 'customer')}`}>
              {isUserAdmin || user.account_type === 'admin'
                ? `🛡️ ${roleTitle}`
                : user.account_type === 'dealer'
                ? 'Wholesale Dealer'
                : 'Verified Customer'}
            </span>
            {user.account_type === 'dealer' && !isUserAdmin && (
              <span className={`account-badge account-badge--status-${user.dealer_status || 'pending'}`}>
                {user.dealer_status === 'approved' ? 'Approved & Active' : 'Pending Review'}
              </span>
            )}
          </div>

          {/* ── Account Navigation Tabs ── */}
          <nav className="account-tabs-bar" aria-label="Account navigation">
            <button
              type="button"
              className={`account-tab-btn ${effectiveTab === 'overview' ? 'account-tab-btn--active' : ''}`}
              onClick={() => switchTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={`account-tab-btn ${effectiveTab === 'catalog' ? 'account-tab-btn--active' : ''}`}
              onClick={() => switchTab('catalog')}
            >
              💎 Diamond Products ({catalogItems.length > 0 ? catalogItems.length : '5+'})
            </button>
            <button
              type="button"
              className={`account-tab-btn ${effectiveTab === 'cart' ? 'account-tab-btn--active' : ''}`}
              onClick={() => switchTab('cart')}
            >
              🛒 Cart & Shortlist ({cart.reduce((s, i) => s + i.quantity, 0)})
            </button>
            <button
              type="button"
              className={`account-tab-btn ${effectiveTab === 'profile' ? 'account-tab-btn--active' : ''}`}
              onClick={() => switchTab('profile')}
            >
              👤 Edit Profile & Address
            </button>
            {hasOrdersPerm && (
              <button
                type="button"
                className={`account-tab-btn ${effectiveTab === 'orders' ? 'account-tab-btn--active' : ''}`}
                onClick={() => switchTab('orders')}
              >
                📋 Orders & Transactions
              </button>
            )}
            {hasInventoryPerm && (
              <button
                type="button"
                className={`account-tab-btn ${effectiveTab === 'tools' ? 'account-tab-btn--active' : ''}`}
                onClick={() => switchTab('tools')}
              >
                ⚙️ Diamond Inventory & Pricing
              </button>
            )}
            {hasKycPerm && (
              <button
                type="button"
                className={`account-tab-btn ${effectiveTab === 'dealers' ? 'account-tab-btn--active' : ''}`}
                onClick={() => switchTab('dealers')}
              >
                🏢 Dealer Approvals {dealerApps.filter(a => a.status === 'pending_review').length > 0 ? `(${dealerApps.filter(a => a.status === 'pending_review').length})` : ''}
              </button>
            )}
            {hasPromotionsPerm && (
              <button
                type="button"
                className={`account-tab-btn ${effectiveTab === 'offers' ? 'account-tab-btn--active' : ''}`}
                onClick={() => switchTab('offers')}
              >
                ✨ Offers & Schemes Banner
              </button>
            )}
            {hasReviewsPerm && (
              <button
                type="button"
                className={`account-tab-btn ${effectiveTab === 'reviews' ? 'account-tab-btn--active' : ''}`}
                onClick={() => switchTab('reviews')}
              >
                ⭐ Reviews & Replies {adminReviews.length > 0 ? `(${adminReviews.length})` : ''}
              </button>
            )}
            {isSuperAdmin && (
              <button
                type="button"
                className={`account-tab-btn ${effectiveTab === 'team' ? 'account-tab-btn--active' : ''}`}
                onClick={() => switchTab('team')}
              >
                👥 Users & Access {staffList.length > 0 ? `(${staffList.length})` : ''}
              </button>
            )}
          </nav>

          {/* ── TAB 1: OVERVIEW ── */}
          {effectiveTab === 'overview' && (
            <div className="tab-content tab-content--overview">
              {status.text && (
                <p className={statusClass} role="status" aria-live="polite">
                  {status.text}
                </p>
              )}

              <div className="account-cards-grid">
                {hasInventoryPerm && (
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

                {hasKycPerm && (
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

                {hasReviewsPerm && (
                  <div className="account-card-item account-card-item--admin-highlight">
                    <div>
                      <h3>⭐ Customer Reviews &amp; Feedback Manager</h3>
                      <p>Read client testimonials, post official verified replies as Hey Man Diamond LLC to customer feedback, or delete reviews.</p>
                    </div>
                    <button type="button" className="button-primary" onClick={() => switchTab('reviews')}>
                      Manage Customer Reviews →
                    </button>
                  </div>
                )}

                {hasPromotionsPerm && (
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

                {isSuperAdmin && (
                  <div className="account-card-item account-card-item--admin-highlight">
                    <div>
                      <h3>👥 Users &amp; Access Control</h3>
                      <p>Invite operational team members, assign roles, and grant custom granular module permissions.</p>
                    </div>
                    <button type="button" className="button-primary" onClick={() => switchTab('team')}>
                      Manage Users &amp; Access →
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
          {effectiveTab === 'catalog' && (
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
                      <div className="card-media-wrapper" style={{ height: '175px', marginBottom: '12px' }}>
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
                          {item.videoUrl && (
                            <span className="card-video-pill">
                              <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11" aria-hidden="true">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                              </svg>
                              360° Video
                            </span>
                          )}
                        </div>
                      </div>

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
                          className={`button-primary add-cart-btn ${addedCatalogSku === item.sku ? 'card-add-btn--added' : ''}`}
                          onClick={() => addToCart(item)}
                        >
                          {addedCatalogSku === item.sku ? '✓ Added to Cart!' : '+ Add to Cart'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: CART & SHORTLIST ── */}
          {effectiveTab === 'cart' && (
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
          {effectiveTab === 'profile' && (
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
          {effectiveTab === 'orders' && (
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

          {/* ── TAB 6: INVENTORY TOOLS (STAFF / ADMIN ONLY) ── */}
          {effectiveTab === 'tools' && hasInventoryPerm && (
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

                    {/* Flomiz Gateway Configuration & Live Test */}
                    <div style={{ background: '#fcfaf6', border: '1px solid #e5ded2', borderRadius: '8px', padding: '14px', margin: '14px 0' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#7a652e', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>⚙️ Flomiz Gateway Settings</span>
                        <span style={{ fontSize: '11px', color: '#777' }}>Pull API (v1.0)</span>
                      </div>

                      <label style={{ display: 'block', fontSize: '11.5px', color: '#555', marginBottom: '4px' }}>
                        Flomiz Instance Base URL:
                        <input
                          type="text"
                          value={flomizBaseUrlInput}
                          onChange={e => setFlomizBaseUrlInput(e.target.value)}
                          placeholder="https://diamond.flomiz.com"
                          style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '4px', marginTop: '3px', background: '#fff' }}
                        />
                      </label>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '10.5px', color: '#777' }}>Quick presets:</span>
                        <button
                          type="button"
                          onClick={() => setFlomizBaseUrlInput('https://diamond.flomiz.com')}
                          style={{ fontSize: '10px', padding: '2px 7px', border: '1px solid #ccc', borderRadius: '3px', background: flomizBaseUrlInput === 'https://diamond.flomiz.com' ? '#f0ede6' : '#fff', cursor: 'pointer' }}
                        >
                          diamond.flomiz.com (Stock API)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFlomizBaseUrlInput('https://billing.flomiz.com')}
                          style={{ fontSize: '10px', padding: '2px 7px', border: '1px solid #ccc', borderRadius: '3px', background: flomizBaseUrlInput === 'https://billing.flomiz.com' ? '#f0ede6' : '#fff', cursor: 'pointer' }}
                        >
                          billing.flomiz.com
                        </button>
                      </div>

                      <label style={{ display: 'block', fontSize: '11.5px', color: '#555', marginTop: '8px', marginBottom: '4px' }}>
                        Flomiz API Key (x-api-key):
                        <input
                          type="password"
                          value={flomizApiKeyInput}
                          onChange={e => setFlomizApiKeyInput(e.target.value)}
                          placeholder="sk_live_..."
                          style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '4px', marginTop: '3px', background: '#fff' }}
                        />
                      </label>

                      <div style={{ fontSize: '11px', color: '#6e695d', margin: '8px 0', background: '#f8f6f2', padding: '7px 10px', borderRadius: '4px', borderLeft: '3px solid #c9bda5', lineHeight: '1.4' }}>
                        ℹ️ <strong>Flomiz API Requirements:</strong> Per Flomiz guidelines, each API key is restricted to an <strong>Origin Allowlist</strong>. Flomiz must whitelist your website domain (<em>heymandiamond.com</em>) or server outbound IP before external requests succeed.
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button
                          type="button"
                          onClick={handleSaveFlomizConfig}
                          style={{ flex: 1, padding: '7px 10px', fontSize: '11.5px', fontWeight: 600, background: '#1c1b17', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          Save Config
                        </button>
                        <button
                          type="button"
                          onClick={handleTestFlomizConnection}
                          disabled={testingFlomiz}
                          style={{ flex: 1, padding: '7px 10px', fontSize: '11.5px', fontWeight: 600, background: '#eadecb', color: '#2b271d', border: '1px solid #c9bda5', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          {testingFlomiz ? 'Testing…' : '🔌 Test Connection'}
                        </button>
                      </div>

                      {flomizTestResult && (
                        <div style={{
                          marginTop: '10px',
                          padding: '10px 12px',
                          fontSize: '11.5px',
                          lineHeight: '1.5',
                          borderRadius: '6px',
                          background: flomizTestResult.success ? '#e9f7ee' : '#fcf0ed',
                          color: flomizTestResult.success ? '#15652e' : '#a12b1d',
                          border: `1px solid ${flomizTestResult.success ? '#b4e2c3' : '#f5c5bd'}`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{flomizTestResult.success ? '✓' : '✕'}</span>
                            <div style={{ flex: 1 }}>
                              <strong style={{ display: 'block', marginBottom: '2px' }}>
                                {flomizTestResult.success ? '✓ Connection Successful' : `HTTP Error ${flomizTestResult.code || ''}`}
                              </strong>
                              <div>{flomizTestResult.message || flomizTestResult.error || 'Connection attempt failed.'}</div>
                              {flomizTestResult.endpoint && (
                                <div style={{ fontSize: '10.5px', color: '#666', marginTop: '4px', wordBreak: 'break-all' }}>
                                  Target: <code>{flomizTestResult.endpoint}</code>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
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
                    <p>Upload your own diamond inventory sheet. Use &quot;All Categories&quot; to auto-assign categories per row from your spreadsheet, or select a specific category below.</p>
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
                        <option value="all">All Categories (From Spreadsheet Category Column)</option>
                        <option value="Round Melee Diamonds">Round Melee Diamonds (Melees / Sieves)</option>
                        <option value="Loose Fancy Diamonds">Loose Fancy Diamonds (Fancy Shapes)</option>
                        <option value="Solitaire Non-Certified Diamonds">Solitaire Non-Certified Diamonds (Pink, Yellow, Blue, Green &amp; White)</option>
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
                        onClick={() => fetchAdminDiamonds()}
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

                  {inventoryActionMsg && (
                    <p className={`auth-status auth-status--${inventoryActionMsg.kind}`} style={{ margin: '14px 0' }}>
                      {inventoryActionMsg.text}
                    </p>
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
                      <option value="Solitaire Non-Certified Diamonds">Solitaire Non-Certified Diamonds</option>
                      <option value="Matched Pairs">Matched Pairs</option>
                    </select>

                    <select
                      className="diamonds-filter-select"
                      value={diamondFilterStatus}
                      onChange={(e) => {
                        const newStatus = e.target.value
                        setDiamondFilterStatus(newStatus)
                        fetchAdminDiamonds(newStatus)
                      }}
                      aria-label="Filter diamonds by status"
                    >
                      <option value="all">All Statuses</option>
                      <option value="published">Published (Live on Website)</option>
                      <option value="pending_review">Pending Review (Staged)</option>
                      <option value="hidden">Hidden</option>
                      <option value="deleted">Deleted Stones</option>
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
                          <th>Customer Price (List / Disc $ / %)</th>
                          <th>Dealer Price (List / Disc $ / %)</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminDiamonds
                          .filter((d) => {
                            if (diamondFilterCategory !== 'all' && d.category !== diamondFilterCategory) return false
                            if (diamondFilterStatus === 'deleted') {
                              if (!d.deletedAt) return false
                            } else {
                              if (d.deletedAt) return false
                              if (diamondFilterStatus !== 'all' && d.status !== diamondFilterStatus) return false
                            }
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
                            const dId = String(d.id || '').trim()
                            const hasInvalidId = !dId
                            const draft = dId ? diamondDrafts[dId] : undefined
                            const rowCategory = draft?.category !== undefined ? draft.category : d.category
                            const rowCustomerPrice = draft?.customerPrice !== undefined ? draft.customerPrice : (d.customerPrice ?? 0)
                            const rowCustomerPriceInput = draft?.customerPriceInput !== undefined ? draft.customerPriceInput : String(d.customerPrice ?? 0)
                            const rowCustomerDiscPrice = draft?.customerDiscountPrice !== undefined ? draft.customerDiscountPrice : (d.customerDiscountPrice ?? null)
                            const rowCustomerDiscPriceInput = draft?.customerDiscountPriceInput !== undefined ? draft.customerDiscountPriceInput : (d.customerDiscountPrice != null ? String(d.customerDiscountPrice) : '')
                            const rowCustomerDiscPercent = draft?.customerDiscountPercent !== undefined ? draft.customerDiscountPercent : (d.customerDiscountPercent ?? null)
                            const rowCustomerDiscPercentInput = draft?.customerDiscountPercentInput !== undefined ? draft.customerDiscountPercentInput : (d.customerDiscountPercent != null ? String(d.customerDiscountPercent) : '')
                            const rowCustomerDiscError = draft?.customerDiscountError !== undefined ? draft.customerDiscountError : validateRowDiscount(rowCustomerPrice, rowCustomerDiscPrice, rowCustomerDiscPercent)

                            const rowDealerPrice = draft?.dealerPrice !== undefined ? draft.dealerPrice : (d.dealerPrice ?? 0)
                            const rowDealerPriceInput = draft?.dealerPriceInput !== undefined ? draft.dealerPriceInput : String(d.dealerPrice ?? 0)
                            const rowDealerDiscPrice = draft?.dealerDiscountPrice !== undefined ? draft.dealerDiscountPrice : (d.dealerDiscountPrice ?? null)
                            const rowDealerDiscPriceInput = draft?.dealerDiscountPriceInput !== undefined ? draft.dealerDiscountPriceInput : (d.dealerDiscountPrice != null ? String(d.dealerDiscountPrice) : '')
                            const rowDealerDiscPercent = draft?.dealerDiscountPercent !== undefined ? draft.dealerDiscountPercent : (d.dealerDiscountPercent ?? null)
                            const rowDealerDiscPercentInput = draft?.dealerDiscountPercentInput !== undefined ? draft.dealerDiscountPercentInput : (d.dealerDiscountPercent != null ? String(d.dealerDiscountPercent) : '')
                            const rowDealerDiscError = draft?.dealerDiscountError !== undefined ? draft.dealerDiscountError : validateRowDiscount(rowDealerPrice, rowDealerDiscPrice, rowDealerDiscPercent)

                            const isDirty = Boolean(draft?.isDirty)
                            const isSaved = Boolean(dId && savedDiamondId === dId)

                            const updateRowDraft = (updates: Partial<DiamondRowDraft>) => {
                              if (!dId) return
                              setDiamondDrafts((prev) => ({
                                ...prev,
                                [dId]: {
                                  category: rowCategory,
                                  customerPrice: rowCustomerPrice,
                                  customerPriceInput: rowCustomerPriceInput,
                                  customerDiscountPrice: rowCustomerDiscPrice,
                                  customerDiscountPriceInput: rowCustomerDiscPriceInput,
                                  customerDiscountPercent: rowCustomerDiscPercent,
                                  customerDiscountPercentInput: rowCustomerDiscPercentInput,
                                  customerDiscountError: rowCustomerDiscError,
                                  dealerPrice: rowDealerPrice,
                                  dealerPriceInput: rowDealerPriceInput,
                                  dealerDiscountPrice: rowDealerDiscPrice,
                                  dealerDiscountPriceInput: rowDealerDiscPriceInput,
                                  dealerDiscountPercent: rowDealerDiscPercent,
                                  dealerDiscountPercentInput: rowDealerDiscPercentInput,
                                  dealerDiscountError: rowDealerDiscError,
                                  ...(prev[dId] || {}),
                                  ...updates,
                                  isDirty: true,
                                },
                              }))
                            }

                            const handleAudienceFieldChange = (
                              audience: 'customer' | 'dealer',
                              field: 'list' | 'discPrice' | 'discPercent',
                              rawValue: string
                            ) => {
                              const next = computeAudiencePricingDraft(
                                field,
                                rawValue,
                                audience === 'customer' ? rowCustomerPrice : rowDealerPrice,
                                audience === 'customer' ? rowCustomerDiscPriceInput : rowDealerDiscPriceInput,
                                audience === 'customer' ? rowCustomerDiscPercentInput : rowDealerDiscPercentInput
                              )
                              if (audience === 'customer') {
                                updateRowDraft({
                                  customerPrice: next.listPrice,
                                  ...(next.listPriceInput !== undefined ? { customerPriceInput: next.listPriceInput } : {}),
                                  customerDiscountPrice: next.discountPrice,
                                  customerDiscountPriceInput: next.discountPriceInput,
                                  customerDiscountPercent: next.discountPercent,
                                  customerDiscountPercentInput: next.discountPercentInput,
                                  customerDiscountError: next.error,
                                })
                              } else {
                                updateRowDraft({
                                  dealerPrice: next.listPrice,
                                  ...(next.listPriceInput !== undefined ? { dealerPriceInput: next.listPriceInput } : {}),
                                  dealerDiscountPrice: next.discountPrice,
                                  dealerDiscountPriceInput: next.discountPriceInput,
                                  dealerDiscountPercent: next.discountPercent,
                                  dealerDiscountPercentInput: next.discountPercentInput,
                                  dealerDiscountError: next.error,
                                })
                              }
                            }

                            const saveRowChanges = (nextStatus: AdminDiamond['status']) => {
                              if (rowCustomerDiscError || rowDealerDiscError) {
                                alert(rowCustomerDiscError || rowDealerDiscError)
                                return
                              }
                              handleUpdateDiamond(dId, {
                                category: rowCategory,
                                customerPrice: rowCustomerPrice,
                                customerDiscountPrice: rowCustomerDiscPrice,
                                customerDiscountPercent: rowCustomerDiscPercent,
                                dealerPrice: rowDealerPrice,
                                dealerDiscountPrice: rowDealerDiscPrice,
                                dealerDiscountPercent: rowDealerDiscPercent,
                                status: nextStatus,
                              })
                            }

                            const revertRowDraft = () => {
                              if (!dId) return
                              setDiamondDrafts((prev) => {
                                const next = { ...prev }
                                delete next[dId]
                                return next
                              })
                            }

                            const isDeleted = Boolean(d.deletedAt)
                            const isFieldDisabled = isDeleted || hasInvalidId

                            return (
                              <tr
                                key={dId || d.sku}
                                className={`${isDirty ? 'diamond-row--dirty' : ''} ${isDeleted ? 'diamond-row--deleted' : ''}`.trim()}
                              >
                                <td className="diamond-sku-cell">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <img
                                      src={getDiamondMedia(d).imageUrl}
                                      alt=""
                                      style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '6px', border: '1px solid #e2ddd3', background: '#fdfbf7', flexShrink: 0 }}
                                      onError={(e) => {
                                        e.currentTarget.onerror = null
                                        e.currentTarget.src = '/diamond-placeholder.svg'
                                      }}
                                    />
                                    <div>
                                      <strong>{d.sku}</strong>
                                      <div><small>{d.lab ? `${d.lab} ${d.certificateNumber || ''}` : 'Non-Certified'}</small></div>
                                      <div style={{ display: 'flex', gap: '5px', marginTop: '3px', alignItems: 'center' }}>
                                        <span
                                          className={`diamond-source-tag diamond-source-tag--${
                                            d.source === 'flomiz_api' ? 'api' : 'excel'
                                          }`}
                                        >
                                          {d.source === 'flomiz_api' ? 'API' : 'Excel'}
                                        </span>
                                        {d.videoUrl && (
                                          <span style={{ fontSize: '9px', fontWeight: 700, background: '#1c1b17', color: '#f7df99', padding: '1px 5px', borderRadius: '3px' }}>
                                            ▶ 360°
                                          </span>
                                        )}
                                        {hasInvalidId && (
                                          <span style={{ fontSize: '9px', fontWeight: 700, background: '#fee2e2', color: '#b91c1c', padding: '1px 5px', borderRadius: '3px' }} title="Missing unique ID - editing disabled">
                                            ⚠️ ID Missing
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
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
                                    value={rowCategory}
                                    disabled={isFieldDisabled}
                                    onChange={(e) => updateRowDraft({ category: e.target.value })}
                                  >
                                    <option value="Certified Diamonds">Certified Diamonds</option>
                                    <option value="Round Melee Diamonds">Round Melee Diamonds</option>
                                    <option value="Loose Fancy Diamonds">Loose Fancy Diamonds</option>
                                    <option value="Solitaire Non-Certified Diamonds">Solitaire Non-Certified Diamonds</option>
                                    <option value="Matched Pairs">Matched Pairs</option>
                                  </select>
                                </td>

                                <td>
                                  <div className="diamond-pricing-cell">
                                    {/* All 3 inputs in a single horizontal row */}
                                    <div className="diamond-pricing-row">
                                      <div className="diamond-price-field-wrap diamond-price-field-wrap--list" title="Customer List Price ($)">
                                        <span className="diamond-field-affix">$</span>
                                        <input
                                          type="number"
                                          className="diamond-price-field-input"
                                          placeholder="List $"
                                          aria-label="Customer list price"
                                          disabled={isFieldDisabled}
                                          value={rowCustomerPriceInput}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Escape') revertRowDraft()
                                          }}
                                          onChange={(e) => handleAudienceFieldChange('customer', 'list', e.target.value)}
                                        />
                                      </div>

                                      <div
                                        className={`diamond-price-field-wrap diamond-price-field-wrap--disc ${
                                          rowCustomerDiscError ? 'diamond-price-field-wrap--error' : ''
                                        }`}
                                        title="Customer Discounted Price ($)"
                                      >
                                        <span className="diamond-field-affix">$</span>
                                        <input
                                          type="number"
                                          className="diamond-price-field-input"
                                          placeholder="Disc $"
                                          aria-label="Customer discount price"
                                          disabled={isFieldDisabled}
                                          value={rowCustomerDiscPriceInput}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Escape') revertRowDraft()
                                          }}
                                          onChange={(e) => handleAudienceFieldChange('customer', 'discPrice', e.target.value)}
                                        />
                                      </div>

                                      <div
                                        className={`diamond-price-field-wrap diamond-price-field-wrap--pct ${
                                          rowCustomerDiscError ? 'diamond-price-field-wrap--error' : ''
                                        }`}
                                        title="Customer Discount Percent (%)"
                                      >
                                        <span className="diamond-field-affix">%</span>
                                        <input
                                          type="number"
                                          className="diamond-price-field-input"
                                          placeholder="%"
                                          aria-label="Customer discount percent"
                                          disabled={isFieldDisabled}
                                          value={rowCustomerDiscPercentInput}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Escape') revertRowDraft()
                                          }}
                                          onChange={(e) => handleAudienceFieldChange('customer', 'discPercent', e.target.value)}
                                        />
                                      </div>
                                    </div>

                                    {/* Preview row */}
                                    <div className="diamond-disc-preview-row">
                                      {rowCustomerDiscError ? (
                                        <span className="diamond-disc-preview diamond-disc-preview--error">
                                          {rowCustomerDiscError}
                                        </span>
                                      ) : rowCustomerDiscPrice && rowCustomerDiscPercent && rowCustomerPrice > rowCustomerDiscPrice ? (
                                        <span className="diamond-disc-preview">
                                          Customer sees: ${rowCustomerPrice.toLocaleString()} → ${rowCustomerDiscPrice.toLocaleString()} ({Math.round(rowCustomerDiscPercent)}% OFF)
                                        </span>
                                      ) : (
                                        <span className="diamond-disc-preview diamond-disc-preview--none">
                                          No discount applied
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                <td>
                                  <div className="diamond-pricing-cell">
                                    {/* All 3 inputs in a single horizontal row */}
                                    <div className="diamond-pricing-row">
                                      <div className="diamond-price-field-wrap diamond-price-field-wrap--list" title="Wholesale List Price ($)">
                                        <span className="diamond-field-affix">$</span>
                                        <input
                                          type="number"
                                          className="diamond-price-field-input"
                                          placeholder="List $"
                                          aria-label="Dealer list price"
                                          disabled={isFieldDisabled}
                                          value={rowDealerPriceInput}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Escape') revertRowDraft()
                                          }}
                                          onChange={(e) => handleAudienceFieldChange('dealer', 'list', e.target.value)}
                                        />
                                      </div>

                                      <div
                                        className={`diamond-price-field-wrap diamond-price-field-wrap--disc ${
                                          rowDealerDiscError ? 'diamond-price-field-wrap--error' : ''
                                        }`}
                                        title="Dealer Discount Price ($)">
                                        <span className="diamond-field-affix">$</span>
                                        <input
                                          type="number"
                                          className="diamond-price-field-input"
                                          placeholder="Disc $"
                                          aria-label="Dealer discount price"
                                          disabled={isFieldDisabled}
                                          value={rowDealerDiscPriceInput}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Escape') revertRowDraft()
                                          }}
                                          onChange={(e) => handleAudienceFieldChange('dealer', 'discPrice', e.target.value)}
                                        />
                                      </div>

                                      <div
                                        className={`diamond-price-field-wrap diamond-price-field-wrap--pct ${
                                          rowDealerDiscError ? 'diamond-price-field-wrap--error' : ''
                                        }`}
                                        title="Dealer Discount Percent (%)">
                                        <span className="diamond-field-affix">%</span>
                                        <input
                                          type="number"
                                          className="diamond-price-field-input"
                                          placeholder="%"
                                          aria-label="Dealer discount percent"
                                          disabled={isFieldDisabled}
                                          value={rowDealerDiscPercentInput}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Escape') revertRowDraft()
                                          }}
                                          onChange={(e) => handleAudienceFieldChange('dealer', 'discPercent', e.target.value)}
                                        />
                                      </div>
                                    </div>

                                    {/* Preview row */}
                                    <div className="diamond-disc-preview-row">
                                      {rowDealerDiscError ? (
                                        <span className="diamond-disc-preview diamond-disc-preview--error">
                                          {rowDealerDiscError}
                                        </span>
                                      ) : rowDealerDiscPrice && rowDealerDiscPercent && rowDealerPrice > rowDealerDiscPrice ? (
                                        <span className="diamond-disc-preview">
                                          Dealer sees: ${rowDealerPrice.toLocaleString()} → ${rowDealerDiscPrice.toLocaleString()} ({Math.round(rowDealerDiscPercent)}% OFF)
                                        </span>
                                      ) : (
                                        <span className="diamond-disc-preview diamond-disc-preview--none">
                                          No discount applied
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                <td>
                                  {d.deletedAt ? (
                                    <span className="diamond-status-pill diamond-status-pill--deleted">
                                      Deleted
                                    </span>
                                  ) : (
                                    <span className={`diamond-status-pill diamond-status-pill--${d.status}`}>
                                      {d.status === 'published'
                                        ? 'Published'
                                        : d.status === 'pending_review'
                                        ? 'Staged'
                                        : 'Hidden'}
                                    </span>
                                  )}
                                </td>

                                <td>
                                  <div className="diamond-row-actions">
                                    {d.deletedAt ? (
                                      <>
                                        <button
                                          type="button"
                                          className="diamond-restore-btn"
                                          disabled={restoringDiamondId === dId}
                                          onClick={() => handleRestoreDiamond(dId, d.sku)}
                                          title={`Restore diamond ${d.sku} to active inventory`}
                                        >
                                          {restoringDiamondId === dId ? 'Restoring…' : '♻ Restore'}
                                        </button>

                                        <button
                                          type="button"
                                          className="diamond-media-btn"
                                          onClick={() => handleOpenMediaModal(d)}
                                          title={`View photos and videos for diamond ${d.sku}`}
                                        >
                                          📷 Media
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          className={`diamond-save-btn ${isSaved ? 'diamond-save-btn--success' : ''} ${isDirty ? 'diamond-save-btn--dirty' : ''}`}
                                          disabled={hasInvalidId}
                                          onClick={() => saveRowChanges(d.status)}
                                          title={hasInvalidId ? 'Cannot save: Missing diamond ID' : isDirty ? 'Save changes to this diamond' : 'Save'}
                                        >
                                          {isSaved ? 'Saved ✓' : isDirty ? 'Save *' : 'Save'}
                                        </button>

                                        {isDirty && (
                                          <button
                                            type="button"
                                            className="diamond-revert-btn"
                                            onClick={revertRowDraft}
                                            title="Discard unsaved edits (or press Esc)"
                                          >
                                            ↺
                                          </button>
                                        )}

                                        <button
                                          type="button"
                                          className="diamond-status-btn"
                                          disabled={hasInvalidId}
                                          onClick={() => {
                                            const nextStatus =
                                              d.status === 'published' ? 'hidden' : 'published'
                                            saveRowChanges(nextStatus)
                                          }}
                                          title={d.status === 'published' ? 'Hide from store' : 'Publish live'}
                                        >
                                          {d.status === 'published' ? 'Hide' : 'Publish'}
                                        </button>

                                        <button
                                          type="button"
                                          className="diamond-media-btn"
                                          onClick={() => handleOpenMediaModal(d)}
                                          title={`Manage photos and videos for diamond ${d.sku}`}
                                        >
                                          📷 Media
                                        </button>

                                        <button
                                          type="button"
                                          className="diamond-delete-btn"
                                          onClick={() => handleDeleteDiamond(dId, d.sku)}
                                          title={`Delete diamond ${d.sku}`}
                                        >
                                          🗑 Delete
                                        </button>
                                      </>
                                    )}
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

              {/* ── Diamond Media Gallery Manager Modal ── */}
              {mediaModalDiamond && (
                <div
                  className="diamond-media-modal-backdrop"
                  onClick={handleCloseMediaModal}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Media Manager"
                >
                  <div className="diamond-media-manager-card" onClick={(e) => e.stopPropagation()}>
                    <div className="diamond-media-manager-header">
                      <div>
                        <h3>📷 Media Gallery Manager</h3>
                        <p>
                          Diamond SKU: <strong>{mediaModalDiamond.sku}</strong> · {mediaModalDiamond.carat}ct {mediaModalDiamond.shape} ({mediaModalDiamond.color} {mediaModalDiamond.clarity})
                        </p>
                      </div>
                      <button
                        type="button"
                        className="diamond-media-modal-close"
                        onClick={handleCloseMediaModal}
                        aria-label="Close"
                      >
                        ✕
                      </button>
                    </div>

                    {mediaManagerMsg && (
                      <div className={`diamond-media-alert diamond-media-alert--${mediaManagerMsg.kind}`}>
                        {mediaManagerMsg.text}
                      </div>
                    )}

                    {/* Upload Section */}
                    <div className="diamond-media-upload-section">
                      <h4>Upload Image or Video</h4>
                      <p className="diamond-media-upload-hint">
                        Allowed formats: <strong>JPEG, PNG, WEBP</strong> (max 5 MB, up to 10 photos) and <strong>MP4, WEBM</strong> (max 50 MB, up to 3 360° videos). SVGs and scripts are strictly rejected.
                      </p>
                      <div className="diamond-media-upload-actions">
                        <label className={`diamond-media-upload-label ${uploadingMedia ? 'diamond-media-upload-label--busy' : ''}`}>
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.mp4,.webm"
                            onChange={handleUploadMediaFile}
                            disabled={uploadingMedia}
                            style={{ display: 'none' }}
                          />
                          {uploadingMedia ? '⏳ Uploading & Verifying…' : '＋ Choose File to Upload'}
                        </label>
                        <span className="diamond-media-counts-badge">
                          Photos: {diamondMediaList.filter(m => m.type === 'image').length}/10 · Videos: {diamondMediaList.filter(m => m.type === 'video').length}/3
                        </span>
                      </div>
                    </div>

                    {/* Media Items Grid */}
                    <div className="diamond-media-list-section">
                      <h4>Gallery Items ({diamondMediaList.length})</h4>
                      {loadingMediaList ? (
                        <p className="diamond-media-loading">Loading media items…</p>
                      ) : diamondMediaList.length === 0 ? (
                        <div className="diamond-media-empty">
                          <p>No extra media items attached yet for this stone.</p>
                          <small>Upload high-resolution photos or 360° rotation videos above to showcase this diamond.</small>
                        </div>
                      ) : (
                        <div className="diamond-media-grid">
                          {diamondMediaList.map((item, index) => (
                            <div
                              key={item.id}
                              className={`diamond-media-card ${item.is_primary ? 'diamond-media-card--primary' : ''}`}
                            >
                              <div className="diamond-media-card-preview">
                                {item.type === 'video' ? (
                                  <video src={item.public_url} controls playsInline preload="metadata" />
                                ) : (
                                  <img src={item.public_url} alt={item.alt_text || ''} loading="lazy" />
                                )}
                                <span className={`diamond-media-type-tag diamond-media-type-tag--${item.type}`}>
                                  {item.type === 'video' ? '▶ Video' : '📷 Photo'}
                                </span>
                                {item.is_primary && (
                                  <span className="diamond-media-primary-badge">★ Primary</span>
                                )}
                              </div>

                              <div className="diamond-media-card-body">
                                <div className="diamond-media-alt-wrap">
                                  <label>Alt Text / Caption:</label>
                                  <div className="diamond-media-alt-input-row">
                                    <input
                                      type="text"
                                      placeholder="e.g. Table reflection, 360 rotation"
                                      value={mediaAltDraft[item.id] ?? (item.alt_text || '')}
                                      onChange={(e) =>
                                        setMediaAltDraft(prev => ({ ...prev, [item.id]: e.target.value }))
                                      }
                                    />
                                    <button
                                      type="button"
                                      className="diamond-media-alt-save-btn"
                                      onClick={() => handleSaveMediaAlt(item.id)}
                                      title="Save Alt Text"
                                    >
                                      ✓
                                    </button>
                                  </div>
                                </div>

                                <div className="diamond-media-card-actions">
                                  <div className="diamond-media-reorder-group">
                                    <button
                                      type="button"
                                      disabled={index === 0}
                                      onClick={() => handleReorderMedia(item.id, 'up')}
                                      title="Move Up"
                                      className="diamond-media-arrow-btn"
                                    >
                                      ▲
                                    </button>
                                    <button
                                      type="button"
                                      disabled={index === diamondMediaList.length - 1}
                                      onClick={() => handleReorderMedia(item.id, 'down')}
                                      title="Move Down"
                                      className="diamond-media-arrow-btn"
                                    >
                                      ▼
                                    </button>
                                  </div>

                                  {!item.is_primary && (
                                    <button
                                      type="button"
                                      className="diamond-media-set-primary-btn"
                                      onClick={() => handleSetPrimaryMedia(item.id)}
                                    >
                                      Set Primary
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    className="diamond-media-delete-btn"
                                    onClick={() => handleDeleteMediaItem(item.id)}
                                    title="Delete this media"
                                  >
                                    🗑
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
            </div>
          )}

          {/* ── TAB 7: OFFERS & SCHEMES BANNER (STAFF / ADMIN ONLY) ── */}
          {effectiveTab === 'offers' && hasPromotionsPerm && (
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
          {effectiveTab === 'dealers' && hasKycPerm && (
            <div className="tab-content tab-content--dealers">
              <div className="dealers-manager-box">
                <div className="dealers-manager-header">
                  <div>
                    <h3>🏢 Wholesale Dealer Applications &amp; KYC Approvals</h3>
                    <p>
                      Review dealer accounts and activate their status to unlock wholesale trade pricing on the live website.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                      className="diamonds-filter-select"
                      value={dealerAppFilter}
                      onChange={(e) => setDealerAppFilter(e.target.value as 'all' | 'pending_review' | 'approved' | 'rejected')}
                      aria-label="Filter dealer applications by status"
                      style={{ padding: '8px 12px', fontSize: '13px' }}
                    >
                      <option value="all">All Applications ({dealerApps.length})</option>
                      <option value="pending_review">Pending Review ({dealerApps.filter(a => a.status === 'pending_review').length})</option>
                      <option value="approved">Approved ({dealerApps.filter(a => a.status === 'approved').length})</option>
                      <option value="rejected">Rejected ({dealerApps.filter(a => a.status === 'rejected').length})</option>
                    </select>

                    <button
                      type="button"
                      className="sync-api-btn"
                      onClick={fetchDealerApplications}
                      disabled={loadingDealerApps}
                    >
                      {loadingDealerApps ? 'Refreshing…' : '🔄 Refresh Applications'}
                    </button>
                  </div>
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
                          <th>Business Name &amp; Address</th>
                          <th>Primary Contact</th>
                          <th>Email Address</th>
                          <th>Phone</th>
                          <th>Submitted</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dealerApps
                          .filter((app) => (dealerAppFilter === 'all' ? true : app.status === dealerAppFilter))
                          .map((app) => {
                            const addr = typeof app.business_address === 'string'
                              ? app.business_address
                              : (app.business_address?.address || '')
                            const isUpdating = updatingDealerAppId === app.id

                            return (
                              <tr key={app.id}>
                                <td>
                                  <strong>{app.registered_business_name || 'N/A'}</strong>
                                  {addr && (
                                    <div style={{ fontSize: '11px', color: '#77746b', marginTop: '2px' }}>
                                      📍 {addr}
                                    </div>
                                  )}
                                </td>
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
                                        disabled={isUpdating}
                                        onClick={() => handleUpdateDealerStatus(app.id, 'approved')}
                                        title="Approve dealer and activate wholesale pricing"
                                      >
                                        {isUpdating ? 'Updating…' : '✓ Approve'}
                                      </button>
                                    )}
                                    {app.status !== 'rejected' && (
                                      <button
                                        type="button"
                                        className="reject-dealer-btn"
                                        disabled={isUpdating}
                                        onClick={() => handleUpdateDealerStatus(app.id, 'rejected')}
                                        title="Reject dealer application"
                                      >
                                        {isUpdating ? 'Updating…' : '✕ Reject'}
                                      </button>
                                    )}
                                    {app.status !== 'pending_review' && (
                                      <button
                                        type="button"
                                        disabled={isUpdating}
                                        onClick={() => handleUpdateDealerStatus(app.id, 'pending_review')}
                                        title="Re-open application back to pending review"
                                        style={{
                                          background: '#f4f3ef',
                                          border: '1px solid #d4cbb8',
                                          color: '#6b6455',
                                          borderRadius: '5px',
                                          padding: '0 8px',
                                          height: '32px',
                                          fontSize: '11.5px',
                                          fontWeight: 600,
                                          cursor: isUpdating ? 'not-allowed' : 'pointer',
                                          opacity: isUpdating ? 0.6 : 1,
                                        }}
                                      >
                                        ↺ Reset
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 9: CUSTOMER REVIEWS & REPLIES (ADMIN) ── */}
          {effectiveTab === 'reviews' && hasReviewsPerm && (
            <div className="tab-content tab-content--reviews">
              <div className="reviews-manager-box">
                <div className="reviews-manager-header">
                  <div>
                    <h3>⭐ Customer Reviews &amp; Feedback Moderation</h3>
                    <p>
                      View customer testimonials, publish official replies as Hey Man Diamond LLC to the live website, and delete or hide reviews.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="sync-api-btn"
                    onClick={fetchAdminReviews}
                    disabled={loadingReviews}
                  >
                    {loadingReviews ? 'Refreshing…' : '🔄 Refresh Reviews'}
                  </button>
                </div>

                {reviewMsg && (
                  <p className={`auth-status auth-status--${reviewMsg.kind}`} style={{ margin: '14px 0' }}>
                    {reviewMsg.text}
                  </p>
                )}

                {/* Quick KPI Stats Row */}
                <div className="reviews-stats-row">
                  <div className="reviews-stat-card">
                    <span>Total Reviews</span>
                    <strong>{adminReviews.length}</strong>
                  </div>
                  <div className="reviews-stat-card">
                    <span>Average Rating</span>
                    <strong>
                      {adminReviews.length > 0
                        ? (adminReviews.reduce((sum, r) => sum + (r.rating || 5), 0) / adminReviews.length).toFixed(1)
                        : '5.0'} ★
                    </strong>
                  </div>
                  <div className="reviews-stat-card">
                    <span>Replied</span>
                    <strong style={{ color: '#137333' }}>
                      {adminReviews.filter(r => Boolean(r.reply)).length}
                    </strong>
                  </div>
                  <div className="reviews-stat-card">
                    <span>Awaiting Reply</span>
                    <strong style={{ color: adminReviews.filter(r => !r.reply).length > 0 ? '#b06000' : '#777' }}>
                      {adminReviews.filter(r => !r.reply).length}
                    </strong>
                  </div>
                </div>

                {/* Search & Filters Bar */}
                <div className="reviews-filter-bar">
                  <input
                    type="text"
                    className="reviews-search-input"
                    placeholder="Search by customer name, email, or remarks…"
                    value={reviewSearch}
                    onChange={e => setReviewSearch(e.target.value)}
                  />
                  <select
                    className="reviews-select-filter"
                    value={reviewStatusFilter}
                    onChange={e => setReviewStatusFilter(e.target.value as 'all' | 'published' | 'hidden')}
                  >
                    <option value="all">All Statuses</option>
                    <option value="published">Published Only</option>
                    <option value="hidden">Hidden Only</option>
                  </select>
                  <select
                    className="reviews-select-filter"
                    value={reviewRatingFilter}
                    onChange={e => setReviewRatingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  >
                    <option value="all">All Star Ratings</option>
                    <option value="5">5 Stars ★★★★★</option>
                    <option value="4">4 Stars ★★★★</option>
                    <option value="3">3 Stars ★★★</option>
                    <option value="2">2 Stars ★★</option>
                    <option value="1">1 Star ★</option>
                  </select>
                  {(reviewSearch || reviewStatusFilter !== 'all' || reviewRatingFilter !== 'all') && (
                    <button
                      type="button"
                      className="reject-dealer-btn"
                      onClick={() => {
                        setReviewSearch('')
                        setReviewStatusFilter('all')
                        setReviewRatingFilter('all')
                      }}
                      style={{ padding: '6px 12px' }}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>

                {/* Reviews List */}
                {loadingReviews ? (
                  <p style={{ padding: '30px', textAlign: 'center', color: '#77746b' }}>Loading customer reviews…</p>
                ) : adminReviews.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#77746b' }}>
                    <p>No customer reviews found.</p>
                  </div>
                ) : (
                  <div className="admin-reviews-list">
                    {adminReviews
                      .filter(r => {
                        if (reviewStatusFilter !== 'all' && (r.status || 'published') !== reviewStatusFilter) return false
                        if (reviewRatingFilter !== 'all' && r.rating !== reviewRatingFilter) return false
                        if (reviewSearch.trim()) {
                          const q = reviewSearch.toLowerCase().trim()
                          const inName = (r.customer_name || '').toLowerCase().includes(q)
                          const inEmail = (r.customer_email || '').toLowerCase().includes(q)
                          const inRemarks = (r.remarks || '').toLowerCase().includes(q)
                          const inReply = (r.reply || '').toLowerCase().includes(q)
                          if (!inName && !inEmail && !inRemarks && !inReply) return false
                        }
                        return true
                      })
                      .map(review => {
                        const hasReply = Boolean(review.reply)
                        const currentInput = reviewReplyInputs[review.id] ?? (review.reply || '')

                        return (
                          <article key={review.id} className="admin-review-card">
                            <div className="admin-review-card-top">
                              <div className="admin-review-author-info">
                                <span className="admin-review-stars" aria-label={`${review.rating} stars`}>
                                  {'★'.repeat(review.rating || 5)}
                                </span>
                                <span className="admin-review-author-name">{review.customer_name}</span>
                                {review.customer_email && (
                                  <a href={`mailto:${review.customer_email}`} className="admin-review-email">
                                    ({review.customer_email})
                                  </a>
                                )}
                                <span className="admin-review-date">
                                  {review.submitted_at ? new Date(review.submitted_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Recent'}
                                </span>
                              </div>

                              <div>
                                <span className={`admin-review-badge admin-review-badge--${review.status === 'hidden' ? 'hidden' : 'published'}`}>
                                  {review.status === 'hidden' ? '✕ Hidden' : '✓ Published'}
                                </span>
                              </div>
                            </div>

                            <p className="admin-review-quote">
                              “{review.remarks}”
                            </p>

                            {/* Existing Reply Display */}
                            {hasReply && editingReplyReviewId !== review.id && (
                              <div className="admin-review-reply-display">
                                <div className="admin-review-reply-header">
                                  <span className="admin-review-reply-title">
                                    🏢 Hey Man Diamond LLC (Official Reply):
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingReplyReviewId(review.id)
                                      setReviewReplyInputs(prev => ({ ...prev, [review.id]: review.reply || '' }))
                                    }}
                                    style={{ background: 'none', border: 'none', color: '#a58a50', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                  >
                                    ✏️ Edit Reply
                                  </button>
                                </div>
                                <p className="admin-review-reply-body">{review.reply}</p>
                              </div>
                            )}

                            {/* Reply Editor (if no reply or editing) */}
                            {(!hasReply || editingReplyReviewId === review.id) && (
                              <div className="admin-review-reply-editor">
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#555248', marginBottom: '6px' }}>
                                  {hasReply ? 'Edit Official Reply as Hey Man Diamond LLC:' : '💬 Reply to this Review as Hey Man Diamond LLC:'}
                                </label>
                                <textarea
                                  className="admin-review-reply-textarea"
                                  value={currentInput}
                                  onChange={e => setReviewReplyInputs(prev => ({ ...prev, [review.id]: e.target.value }))}
                                  placeholder="Thank you for choosing Hey Man Diamond LLC! We appreciate your trust and look forward to working with you again..."
                                />
                                <div className="admin-review-reply-actions">
                                  <button
                                    type="button"
                                    className="admin-btn-reply"
                                    disabled={submittingReplyId === review.id}
                                    onClick={() => handlePostReviewReply(review.id)}
                                  >
                                    {submittingReplyId === review.id ? 'Publishing Reply…' : '✓ Publish Reply to Website'}
                                  </button>
                                  {hasReply && (
                                    <button
                                      type="button"
                                      className="admin-btn-toggle-status"
                                      onClick={() => setEditingReplyReviewId(null)}
                                    >
                                      Cancel
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Footer Actions: Moderation & Delete */}
                            <div className="admin-review-footer-bar">
                              <div className="admin-review-footer-left">
                                {!hasReply && editingReplyReviewId !== review.id && (
                                  <button
                                    type="button"
                                    className="admin-btn-reply"
                                    onClick={() => setEditingReplyReviewId(review.id)}
                                  >
                                    💬 Write Reply
                                  </button>
                                )}
                                {Boolean(isSuperAdmin || (user?.permissions?.can_delete_reviews ?? true)) && (
                                  <button
                                    type="button"
                                    className="admin-btn-toggle-status"
                                    onClick={() => handleToggleReviewStatus(review.id, review.status || 'published')}
                                  >
                                    {review.status === 'hidden' ? '👁️ Unhide (Publish)' : '👁️ Hide from Public'}
                                  </button>
                                )}
                              </div>

                              {Boolean(isSuperAdmin || (user?.permissions?.can_delete_reviews ?? true)) && (
                                <div>
                                  <button
                                    type="button"
                                    className="admin-btn-delete-review"
                                    disabled={deletingReviewId === review.id}
                                    onClick={() => handleDeleteReview(review.id, review.customer_name)}
                                  >
                                    {deletingReviewId === review.id ? 'Deleting…' : '🗑️ Delete Review'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </article>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 10: USERS & ACCESS CONTROL (SUPER ADMIN) ── */}
          {effectiveTab === 'team' && isSuperAdmin && (
            <div className="tab-content tab-content--team">
              <div className="staff-header-bar">
                <div>
                  <h2>👥 Users &amp; Access Control</h2>
                  <p>
                    Manage operational staff accounts, roles, and granular module permissions.
                    Invitations are sent via Supabase Auth email.
                  </p>
                </div>
                <div className="staff-header-actions">
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => {
                      setShowCreateStaffForm(!showCreateStaffForm)
                      setStaffMsg(null)
                    }}
                  >
                    {showCreateStaffForm ? '✕ Close Form' : '+ Invite User'}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={fetchStaff}
                    disabled={loadingStaff}
                  >
                    {loadingStaff ? 'Refreshing…' : '🔄 Refresh Directory'}
                  </button>
                </div>
              </div>

              {staffMsg && (
                <div className={`admin-alert admin-alert--${staffMsg.kind === 'error' ? 'error' : 'success'}`} role="alert">
                  <span>{staffMsg.text}</span>
                  <button
                    type="button"
                    onClick={() => setStaffMsg(null)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 'bold', marginLeft: 'auto', color: 'inherit' }}
                    aria-label="Dismiss notice"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Invite User Form Collapsible */}
              {showCreateStaffForm && (
                <div className="staff-create-card">
                  <div className="staff-create-card-header">
                    <h3>Invite Team Member</h3>
                    <p>
                      An invitation email will be sent via Supabase. The user can securely set their own password via the email link.
                    </p>
                  </div>

                  <form onSubmit={handleCreateStaff} className="staff-create-form">
                    <div className="staff-form-grid">
                      <div className="staff-form-group">
                        <label className="staff-form-label">Full Name *</label>
                        <input
                          type="text"
                          required
                          value={newStaffName}
                          onChange={e => setNewStaffName(e.target.value)}
                          placeholder="e.g. Rahul Sharma"
                          className="staff-input-text"
                        />
                      </div>

                      <div className="staff-form-group">
                        <label className="staff-form-label">Work Email Address (Sign-In) *</label>
                        <input
                          type="email"
                          required
                          value={newStaffEmail}
                          onChange={e => setNewStaffEmail(e.target.value)}
                          placeholder="user@heymandiamond.com"
                          className="staff-input-text"
                        />
                      </div>

                      <div className="staff-form-group">
                        <label className="staff-form-label">Role *</label>
                        <select
                          className="staff-input-text"
                          value={newStaffRole}
                          onChange={e => handleSelectRole(e.target.value as 'admin' | 'sales_manager' | 'operations_manager')}
                        >
                          <option value="sales_manager">Sales Manager</option>
                          <option value="operations_manager">Operations Manager</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </div>

                      <div className="staff-form-group">
                        <label className="staff-form-label">Custom Designation / Role Title</label>
                        <input
                          type="text"
                          value={newStaffRoleTitle}
                          onChange={e => setNewStaffRoleTitle(e.target.value)}
                          placeholder="e.g. Senior Wholesale Sales Representative"
                          className="staff-input-text"
                        />
                      </div>
                    </div>

                    {/* Permissions Checkbox Grid */}
                    <div className="staff-perms-section">
                      <h4 className="staff-perms-title">Assigned Module Permissions</h4>
                      <p className="staff-perms-subtitle">
                        Pre-filled based on selected role, customize as needed:
                      </p>

                      <div className="staff-perms-grid">
                        <label className={`staff-perm-checkbox-card ${newStaffPerms.can_manage_inventory ? 'staff-perm-checkbox-card--active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={Boolean(newStaffPerms.can_manage_inventory)}
                            onChange={e => {
                              setNewStaffPerms(prev => ({ ...prev, can_manage_inventory: e.target.checked }))
                            }}
                          />
                          <span className={`staff-perm-tickbox ${newStaffPerms.can_manage_inventory ? 'staff-perm-tickbox--checked' : ''}`} aria-hidden="true">
                            {newStaffPerms.can_manage_inventory && (
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                          <div className="staff-perm-card-content">
                            <strong><span className="staff-perm-card-icon">💎</span>Diamond Inventory &amp; Pricing</strong>
                            <p>Sync Flomiz staged API diamonds, configure customer &amp; dealer markups, upload Excel sheets.</p>
                          </div>
                        </label>

                        <label className={`staff-perm-checkbox-card ${newStaffPerms.can_manage_orders ? 'staff-perm-checkbox-card--active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={Boolean(newStaffPerms.can_manage_orders)}
                            onChange={e => {
                              setNewStaffPerms(prev => ({ ...prev, can_manage_orders: e.target.checked }))
                            }}
                          />
                          <span className={`staff-perm-tickbox ${newStaffPerms.can_manage_orders ? 'staff-perm-tickbox--checked' : ''}`} aria-hidden="true">
                            {newStaffPerms.can_manage_orders && (
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                          <div className="staff-perm-card-content">
                            <strong><span className="staff-perm-card-icon">📦</span>Orders &amp; Quote Transactions</strong>
                            <p>View dealer inquiries, quote requests, counter-offers, and update fulfillment states.</p>
                          </div>
                        </label>

                        <label className={`staff-perm-checkbox-card ${newStaffPerms.can_review_kyc ? 'staff-perm-checkbox-card--active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={Boolean(newStaffPerms.can_review_kyc)}
                            onChange={e => {
                              setNewStaffPerms(prev => ({ ...prev, can_review_kyc: e.target.checked }))
                            }}
                          />
                          <span className={`staff-perm-tickbox ${newStaffPerms.can_review_kyc ? 'staff-perm-tickbox--checked' : ''}`} aria-hidden="true">
                            {newStaffPerms.can_review_kyc && (
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                          <div className="staff-perm-card-content">
                            <strong><span className="staff-perm-card-icon">🏢</span>Dealer Account Approvals</strong>
                            <p>Review wholesale registration forms, verify resale tax certificates, and approve B2B discounts.</p>
                          </div>
                        </label>

                        <label className={`staff-perm-checkbox-card ${newStaffPerms.can_manage_reviews && newStaffPerms.can_delete_reviews ? 'staff-perm-checkbox-card--active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={Boolean(newStaffPerms.can_manage_reviews && newStaffPerms.can_delete_reviews)}
                            onChange={() => {
                              const active = Boolean(newStaffPerms.can_manage_reviews && newStaffPerms.can_delete_reviews)
                              if (active) {
                                setNewStaffPerms(prev => ({ ...prev, can_manage_reviews: false, can_delete_reviews: false }))
                              } else {
                                setNewStaffPerms(prev => ({ ...prev, can_manage_reviews: true, can_delete_reviews: true }))
                              }
                            }}
                          />
                          <span className={`staff-perm-tickbox ${newStaffPerms.can_manage_reviews && newStaffPerms.can_delete_reviews ? 'staff-perm-tickbox--checked' : ''}`} aria-hidden="true">
                            {Boolean(newStaffPerms.can_manage_reviews && newStaffPerms.can_delete_reviews) && (
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                          <div className="staff-perm-card-content">
                            <strong><span className="staff-perm-card-icon">🛡️</span>Reviews: Reply &amp; Delete (Full)</strong>
                            <p>User can read client testimonials, post official replies as Hey Man Diamond LLC, and delete or hide reviews.</p>
                          </div>
                        </label>

                        <label className={`staff-perm-checkbox-card ${newStaffPerms.can_manage_reviews && !newStaffPerms.can_delete_reviews ? 'staff-perm-checkbox-card--active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={Boolean(newStaffPerms.can_manage_reviews && !newStaffPerms.can_delete_reviews)}
                            onChange={() => {
                              const active = Boolean(newStaffPerms.can_manage_reviews && !newStaffPerms.can_delete_reviews)
                              if (active) {
                                setNewStaffPerms(prev => ({ ...prev, can_manage_reviews: false, can_delete_reviews: false }))
                              } else {
                                setNewStaffPerms(prev => ({ ...prev, can_manage_reviews: true, can_delete_reviews: false }))
                              }
                            }}
                          />
                          <span className={`staff-perm-tickbox ${newStaffPerms.can_manage_reviews && !newStaffPerms.can_delete_reviews ? 'staff-perm-tickbox--checked' : ''}`} aria-hidden="true">
                            {Boolean(newStaffPerms.can_manage_reviews && !newStaffPerms.can_delete_reviews) && (
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                          <div className="staff-perm-card-content">
                            <strong><span className="staff-perm-card-icon">💬</span>Reviews: Reply Only</strong>
                            <p>User can only reply to customer reviews as Hey Man Diamond LLC, but cannot delete or hide reviews.</p>
                          </div>
                        </label>

                        <label className={`staff-perm-checkbox-card ${newStaffPerms.can_manage_promotions ? 'staff-perm-checkbox-card--active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={Boolean(newStaffPerms.can_manage_promotions)}
                            onChange={e => {
                              setNewStaffPerms(prev => ({ ...prev, can_manage_promotions: e.target.checked }))
                            }}
                          />
                          <span className={`staff-perm-tickbox ${newStaffPerms.can_manage_promotions ? 'staff-perm-tickbox--checked' : ''}`} aria-hidden="true">
                            {newStaffPerms.can_manage_promotions && (
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                          <div className="staff-perm-card-content">
                            <strong><span className="staff-perm-card-icon">✨</span>Front Page Offers &amp; Schemes</strong>
                            <p>Manage liquid glass promotional banners, video/image slider carousels, and promotional sales.</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="staff-form-actions">
                      <button
                        type="submit"
                        className="button-primary"
                        disabled={creatingStaffBusy}
                      >
                        {creatingStaffBusy ? 'Sending Invitation…' : '✉️ Send Invitation via Email'}
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => setShowCreateStaffForm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Staff Directory List */}
              <div className="staff-directory-wrap">
                <div className="staff-directory-header">
                  <div>
                    <h3>Authorized Staff Accounts</h3>
                    <p>Overview of all active and inactive operational accounts ({staffList.length} total):</p>
                  </div>
                  <div className="staff-search-box">
                    <input
                      type="text"
                      value={staffSearch}
                      onChange={e => setStaffSearch(e.target.value)}
                      placeholder="Search by name, email, or role…"
                      className="staff-input-text staff-input-text--search"
                    />
                  </div>
                </div>

                {loadingStaff && (
                  <p style={{ padding: '24px', textAlign: 'center', color: '#888' }}>
                    Loading staff directory…
                  </p>
                )}

                <div className="staff-cards-list">
                  {staffList
                    .filter(staff => {
                      if (!staffSearch.trim()) return true
                      const q = staffSearch.toLowerCase()
                      return (
                        (staff.full_name && staff.full_name.toLowerCase().includes(q)) ||
                        (staff.email && staff.email.toLowerCase().includes(q)) ||
                        (staff.role_title && staff.role_title.toLowerCase().includes(q)) ||
                        (staff.role && staff.role.toLowerCase().includes(q))
                      )
                    })
                    .map(staff => {
                      const isEditing = editingStaffId === staff.id
                      const isSuper = staff.role === 'super_admin'
                      const isSelf = Boolean(
                        (user.id && staff.id === user.id) ||
                        (staff.email && user.email && staff.email.toLowerCase() === user.email.toLowerCase())
                      )
                      const isActive = staff.is_active !== false

                      const displayRole = staff.role === 'super_admin' ? 'Super Administrator'
                        : staff.role === 'admin' ? 'Administrator'
                        : staff.role === 'sales_manager' ? 'Sales Manager'
                        : staff.role === 'operations_manager' ? 'Operations Manager'
                        : (staff.role_title || 'Staff Member')

                      return (
                        <div key={staff.id} className={`staff-member-card ${!isActive ? 'staff-member-card--inactive' : ''}`}>
                          <div className="staff-member-main">
                            <div className="staff-avatar">
                              {staff.full_name ? staff.full_name.charAt(0).toUpperCase() : '👤'}
                            </div>

                            <div className="staff-member-info">
                              <div className="staff-name-row">
                                <h4 className="staff-member-name">{staff.full_name || 'Staff Member'}</h4>
                                {isSelf && (
                                  <span className="staff-badge staff-badge--self">You</span>
                                )}
                                <span className={`staff-badge ${isSuper ? 'staff-badge--super' : 'staff-badge--role'}`}>
                                  {isSuper ? '🛡️ Super Administrator' : displayRole}
                                </span>
                                <span className={`staff-badge ${isActive ? 'staff-badge--active' : 'staff-badge--inactive'}`}>
                                  {isActive ? '✓ Active' : '✕ Inactive'}
                                </span>
                              </div>
                              <div className="staff-meta-row">
                                <span className="staff-member-email">✉️ {staff.email}</span>
                                {staff.role_title && staff.role_title !== displayRole && (
                                  <span className="staff-member-title">💼 {staff.role_title}</span>
                                )}
                                {staff.created_at && (
                                  <span className="staff-member-date">📅 Added {new Date(staff.created_at).toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Inline Edit Panel */}
                          {isEditing ? (
                            <div className="staff-inline-edit-panel">
                              <div className="staff-form-grid">
                                <div className="staff-form-group">
                                  <label className="staff-form-label">Role</label>
                                  <select
                                    className="staff-input-text"
                                    value={editRole}
                                    onChange={e => {
                                      const newRole = e.target.value as 'admin' | 'sales_manager' | 'operations_manager'
                                      setEditRole(newRole)
                                      if (newRole === 'admin') {
                                        setEditPerms({ can_manage_inventory: true, can_manage_orders: true, can_review_kyc: true, can_manage_reviews: true, can_delete_reviews: true, can_manage_promotions: true, can_manage_users: false })
                                      } else if (newRole === 'sales_manager') {
                                        setEditPerms({ can_manage_inventory: false, can_manage_orders: true, can_review_kyc: true, can_manage_reviews: true, can_delete_reviews: false, can_manage_promotions: false, can_manage_users: false })
                                      } else if (newRole === 'operations_manager') {
                                        setEditPerms({ can_manage_inventory: true, can_manage_orders: true, can_review_kyc: false, can_manage_reviews: false, can_delete_reviews: false, can_manage_promotions: false, can_manage_users: false })
                                      }
                                    }}
                                  >
                                    <option value="sales_manager">Sales Manager</option>
                                    <option value="operations_manager">Operations Manager</option>
                                    <option value="admin">Administrator</option>
                                  </select>
                                </div>

                                <div className="staff-form-group">
                                  <label className="staff-form-label">Custom Designation / Role Title</label>
                                  <input
                                    type="text"
                                    value={editRoleTitle}
                                    onChange={e => setEditRoleTitle(e.target.value)}
                                    className="staff-input-text"
                                  />
                                </div>

                                <div className="staff-form-group">
                                  <label className="staff-form-label">Account Status</label>
                                  <select
                                    className="staff-input-text"
                                    value={editIsActive ? 'active' : 'inactive'}
                                    onChange={e => setEditIsActive(e.target.value === 'active')}
                                  >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                  </select>
                                </div>
                              </div>

                              <div className="staff-inline-perms-select">
                                <label className="staff-form-label">Update Module Permissions:</label>
                                <div className="staff-inline-perms-grid">
                                  <label className={`staff-inline-checkbox ${editPerms.can_manage_inventory ? 'staff-inline-checkbox--active' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(editPerms.can_manage_inventory)}
                                      onChange={e => setEditPerms(p => ({ ...p, can_manage_inventory: e.target.checked }))}
                                    />
                                    <span className={`staff-perm-tickbox ${editPerms.can_manage_inventory ? 'staff-perm-tickbox--checked' : ''}`} aria-hidden="true">
                                      {editPerms.can_manage_inventory && (
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                      )}
                                    </span>
                                    <span>💎 Diamond Inventory &amp; Pricing</span>
                                  </label>
                                  <label className={`staff-inline-checkbox ${editPerms.can_manage_orders ? 'staff-inline-checkbox--active' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(editPerms.can_manage_orders)}
                                      onChange={e => setEditPerms(p => ({ ...p, can_manage_orders: e.target.checked }))}
                                    />
                                    <span className={`staff-perm-tickbox ${editPerms.can_manage_orders ? 'staff-perm-tickbox--checked' : ''}`} aria-hidden="true">
                                      {editPerms.can_manage_orders && (
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                      )}
                                    </span>
                                    <span>📦 Orders &amp; Quotes</span>
                                  </label>
                                  <label className={`staff-inline-checkbox ${editPerms.can_review_kyc ? 'staff-inline-checkbox--active' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(editPerms.can_review_kyc)}
                                      onChange={e => setEditPerms(p => ({ ...p, can_review_kyc: e.target.checked }))}
                                    />
                                    <span className={`staff-perm-tickbox ${editPerms.can_review_kyc ? 'staff-perm-tickbox--checked' : ''}`} aria-hidden="true">
                                      {editPerms.can_review_kyc && (
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                      )}
                                    </span>
                                    <span>🏢 Dealer KYC Approvals</span>
                                  </label>
                                  <label className={`staff-inline-checkbox ${editPerms.can_manage_reviews && editPerms.can_delete_reviews ? 'staff-inline-checkbox--active' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(editPerms.can_manage_reviews && editPerms.can_delete_reviews)}
                                      onChange={() => {
                                        const active = Boolean(editPerms.can_manage_reviews && editPerms.can_delete_reviews)
                                        if (active) {
                                          setEditPerms(p => ({ ...p, can_manage_reviews: false, can_delete_reviews: false }))
                                        } else {
                                          setEditPerms(p => ({ ...p, can_manage_reviews: true, can_delete_reviews: true }))
                                        }
                                      }}
                                    />
                                    <span className={`staff-perm-tickbox ${editPerms.can_manage_reviews && editPerms.can_delete_reviews ? 'staff-perm-tickbox--checked' : ''}`} aria-hidden="true">
                                      {Boolean(editPerms.can_manage_reviews && editPerms.can_delete_reviews) && (
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                      )}
                                    </span>
                                    <span>🛡️ Reviews: Reply &amp; Delete (Full)</span>
                                  </label>
                                  <label className={`staff-inline-checkbox ${editPerms.can_manage_reviews && !editPerms.can_delete_reviews ? 'staff-inline-checkbox--active' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(editPerms.can_manage_reviews && !editPerms.can_delete_reviews)}
                                      onChange={() => {
                                        const active = Boolean(editPerms.can_manage_reviews && !editPerms.can_delete_reviews)
                                        if (active) {
                                          setEditPerms(p => ({ ...p, can_manage_reviews: false, can_delete_reviews: false }))
                                        } else {
                                          setEditPerms(p => ({ ...p, can_manage_reviews: true, can_delete_reviews: false }))
                                        }
                                      }}
                                    />
                                    <span className={`staff-perm-tickbox ${editPerms.can_manage_reviews && !editPerms.can_delete_reviews ? 'staff-perm-tickbox--checked' : ''}`} aria-hidden="true">
                                      {Boolean(editPerms.can_manage_reviews && !editPerms.can_delete_reviews) && (
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                      )}
                                    </span>
                                    <span>💬 Reviews: Reply Only</span>
                                  </label>
                                  <label className={`staff-inline-checkbox ${editPerms.can_manage_promotions ? 'staff-inline-checkbox--active' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(editPerms.can_manage_promotions)}
                                      onChange={e => setEditPerms(p => ({ ...p, can_manage_promotions: e.target.checked }))}
                                    />
                                    <span className={`staff-perm-tickbox ${editPerms.can_manage_promotions ? 'staff-perm-tickbox--checked' : ''}`} aria-hidden="true">
                                      {editPerms.can_manage_promotions && (
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                      )}
                                    </span>
                                    <span>✨ Front Page Offers</span>
                                  </label>
                                </div>
                              </div>

                              <div className="staff-inline-edit-actions">
                                <button
                                  type="button"
                                  className="button-primary"
                                  disabled={savingEditBusy}
                                  onClick={() => handleSaveEditStaff(staff.id)}
                                >
                                  {savingEditBusy ? 'Saving Changes…' : '✓ Save Changes'}
                                </button>
                                <button
                                  type="button"
                                  className="button-secondary"
                                  onClick={() => setEditingStaffId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Granted Permissions Pills */
                            <div className="staff-granted-perms-row">
                              <span className="staff-granted-label">Granted Permissions:</span>
                              <div className="staff-perms-pills">
                                {isSuper ? (
                                  <span className="staff-perm-pill staff-perm-pill--admin">🛡️ Full System Super Admin Access</span>
                                ) : (
                                  <>
                                    {staff.permissions?.can_manage_inventory && (
                                      <span className="staff-perm-pill">💎 Diamond Inventory</span>
                                    )}
                                    {staff.permissions?.can_manage_orders && (
                                      <span className="staff-perm-pill">📦 Orders &amp; Quotes</span>
                                    )}
                                    {staff.permissions?.can_review_kyc && (
                                      <span className="staff-perm-pill">🏢 Dealer KYC</span>
                                    )}
                                    {staff.permissions?.can_manage_reviews && (
                                      staff.permissions?.can_delete_reviews ? (
                                        <span className="staff-perm-pill">🛡️ Reviews (Reply &amp; Delete)</span>
                                      ) : (
                                        <span className="staff-perm-pill">💬 Reviews (Reply Only)</span>
                                      )
                                    )}
                                    {staff.permissions?.can_manage_promotions && (
                                      <span className="staff-perm-pill">✨ Offers &amp; Schemes</span>
                                    )}
                                    {!staff.permissions?.can_manage_inventory &&
                                     !staff.permissions?.can_manage_orders &&
                                     !staff.permissions?.can_review_kyc &&
                                     !staff.permissions?.can_manage_reviews &&
                                     !staff.permissions?.can_manage_promotions && (
                                      <span className="staff-perm-pill staff-perm-pill--empty">None assigned</span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="staff-card-actions">
                            {!isEditing && (
                              <button
                                type="button"
                                className="button-secondary"
                                disabled={isSelf || isSuper}
                                title={isSelf ? 'You cannot edit your own permissions or role' : isSuper ? 'Super admin permissions are managed via database' : undefined}
                                onClick={() => handleStartEditStaff(staff)}
                              >
                                ✏️ Edit Access &amp; Role
                              </button>
                            )}

                            {!isSuper && (
                              <button
                                type="button"
                                className={isActive ? 'admin-btn-delete-review' : 'button-secondary'}
                                disabled={isSelf}
                                title={isSelf ? 'You cannot deactivate your own account' : undefined}
                                onClick={() => handleToggleStaffActive(staff)}
                              >
                                {isActive ? '🚫 Deactivate Account' : '✓ Activate Account'}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
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
                localStorage.removeItem('hmd_cart')
                localStorage.removeItem('hmd_active_tab')
                sessionStorage.removeItem('hmd_guest_cart_active')
                updateUserSession(null)
                setCart([])
                window.dispatchEvent(new Event('storage'))
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

  // ── Forgot Password View ──────────────────────────────────────────────────
  if (isForgotPassword) {
    return (
      <main className="auth-page">
        <header className="auth-header">
          <a href="#home">
            <img src="/heyman-diamond-logo.png" alt="Hey Man Diamond LLC" />
          </a>
          <a href="#home">← Back to website</a>
        </header>

        <section className="auth-card">
          <span className="auth-eyebrow">HEY MAN DIAMOND LLC · SECURE ACCOUNT ASSISTANCE</span>
          <h1>Reset Your Password</h1>
          <p>
            Enter the email address registered with your Hey Man Diamond account.
            We will send you a secure link to reset your password.
          </p>

          {forgotSubmitted ? (
            <div className="auth-recovery-success">
              <div className="auth-status auth-status--success" role="status">
                {status.text || 'A password reset link has been dispatched.'}
              </div>
              <p style={{ marginTop: '16px', color: '#555', fontSize: '14px', lineHeight: '1.5' }}>
                Please check your inbox (and spam folder) for the reset link and follow the instructions to choose a new password.
              </p>
              <div style={{ marginTop: '24px' }}>
                <a
                  href="#signin"
                  className="button-primary"
                  style={{ display: 'inline-block', width: '100%', textAlign: 'center', boxSizing: 'border-box' }}
                >
                  Return to Sign In
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handleForgotPasswordSubmit} noValidate>
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

              <button type="submit" disabled={busy}>
                {busy ? 'Sending Reset Link…' : 'Send Password Reset Link'}
              </button>

              {status.text && (
                <p className={statusClass} role="status" aria-live="polite">
                  {status.text}
                </p>
              )}

              <p className="auth-switch" style={{ marginTop: '20px' }}>
                Remember your password? <a href="#signin">Back to Sign In</a>
              </p>
            </form>
          )}

          <p className="auth-footnote">
            For security, password reset links expire after a short period. If you do not receive an email, check your spam folder or verify your registered email address.
          </p>
        </section>
      </main>
    )
  }

  // ── Reset Password View ───────────────────────────────────────────────────
  if (isResetPassword) {
    return (
      <main className="auth-page">
        <header className="auth-header">
          <a href="#home">
            <img src="/heyman-diamond-logo.png" alt="Hey Man Diamond LLC" />
          </a>
          <a href="#home">← Back to website</a>
        </header>

        <section className="auth-card">
          <span className="auth-eyebrow">HEY MAN DIAMOND LLC · SET NEW PASSWORD</span>
          <h1>Create New Password</h1>
          <p>
            Please enter your new secure password below (at least 8 characters with uppercase, lowercase, and numbers).
          </p>

          {resetSubmitted ? (
            <div className="auth-recovery-success">
              <div className="auth-status auth-status--success" role="status">
                {status.text || 'Your password has been successfully updated.'}
              </div>
              <div style={{ marginTop: '24px' }}>
                <a
                  href="#signin"
                  className="button-primary"
                  style={{ display: 'inline-block', width: '100%', textAlign: 'center', boxSizing: 'border-box' }}
                >
                  Sign In With New Password
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handleResetPasswordSubmit} noValidate>
              <label>
                New Password <span style={{ fontWeight: 400, opacity: 0.7 }}>(min. 8 characters)</span>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    maxLength={128}
                    placeholder="••••••••••"
                    style={{ paddingRight: '48px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
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
                    {showNewPassword ? '🙈' : '👁'}
                  </button>
                </div>
              </label>

              <label>
                Confirm New Password
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    maxLength={128}
                    placeholder="••••••••••"
                    style={{ paddingRight: '48px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(v => !v)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
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
                    {showConfirmPassword ? '🙈' : '👁'}
                  </button>
                </div>
              </label>

              <button type="submit" disabled={busy}>
                {busy ? 'Updating Password…' : 'Update Password'}
              </button>

              {status.text && (
                <p className={statusClass} role="status" aria-live="polite">
                  {status.text}
                </p>
              )}

              <p className="auth-switch" style={{ marginTop: '20px' }}>
                <a href="#signin">Back to Sign In</a>
              </p>
            </form>
          )}

          <p className="auth-footnote">
            Passwords must contain uppercase, lowercase, and numeric characters to ensure strict account protection.
          </p>
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
            ? 'HEY MAN DIAMOND LLC · STAFF & ADMINISTRATOR ACCESS'
            : 'HEY MAN DIAMOND LLC · SECURE ACCOUNT'}
        </span>
        <h1>
          {isAdminLogin
            ? 'Staff & Administrator Sign In'
            : signup
            ? (dealer ? 'Dealer account request' : 'Create your account')
            : 'Welcome back'}
        </h1>
        <p>
          {isAdminLogin
            ? 'Sign in with your authorized company credentials to access diamond inventory and administrative controls.'
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
            Password {signup && <span style={{ fontWeight: 400, opacity: 0.7 }}>(min. 8 characters)</span>}
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={signup ? 'new-password' : 'current-password'}
                minLength={8}
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

          {!signup && !isAdminLogin && (
            <div className="auth-forgot-row">
              <a href="#forgot-password" className="auth-forgot-link">
                Forgot password?
              </a>
            </div>
          )}

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
