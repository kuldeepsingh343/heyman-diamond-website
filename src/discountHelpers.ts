/**
 * Client-Side Discount Helpers for Hey Man Diamond Admin & Storefront
 */

export interface DiscountCalculationResult {
  discountPrice: number | null
  discountPercent: number | null
  error: string | null
}

export function calculateDiscountFromPrice(
  listPrice: number,
  discountPriceStr: string
): DiscountCalculationResult {
  const trimmed = String(discountPriceStr ?? '').trim()
  if (!trimmed) {
    return { discountPrice: null, discountPercent: null, error: null }
  }
  const discPrice = parseFloat(trimmed)
  if (isNaN(discPrice) || !Number.isFinite(discPrice)) {
    return { discountPrice: null, discountPercent: null, error: 'Enter a valid number' }
  }
  if (discPrice <= 0) {
    return { discountPrice: discPrice, discountPercent: null, error: 'Must be > $0' }
  }
  if (!Number.isFinite(listPrice) || listPrice <= 0) {
    return { discountPrice: discPrice, discountPercent: null, error: 'List price must be > $0' }
  }
  if (discPrice >= listPrice) {
    return { discountPrice: discPrice, discountPercent: null, error: `Discount must be < $${listPrice.toLocaleString()}` }
  }
  const pct = Math.round(((listPrice - discPrice) / listPrice) * 100 * 100) / 100
  return { discountPrice: discPrice, discountPercent: pct, error: null }
}

export function calculateDiscountFromPercent(
  listPrice: number,
  discountPercentStr: string
): DiscountCalculationResult {
  const trimmed = String(discountPercentStr ?? '').trim()
  if (!trimmed) {
    return { discountPrice: null, discountPercent: null, error: null }
  }
  const pct = parseFloat(trimmed)
  if (isNaN(pct) || !Number.isFinite(pct)) {
    return { discountPrice: null, discountPercent: null, error: 'Enter a valid percent' }
  }
  if (pct <= 0 || pct >= 100) {
    return { discountPrice: null, discountPercent: pct, error: 'Percent must be between 0.01% and 99.99%' }
  }
  if (!Number.isFinite(listPrice) || listPrice <= 0) {
    return { discountPrice: null, discountPercent: pct, error: 'List price must be > $0' }
  }
  const discPrice = Math.round((listPrice * (100 - pct) / 100) * 100) / 100
  return { discountPrice: discPrice, discountPercent: pct, error: null }
}

export interface AudiencePricingDraftUpdate {
  listPrice: number
  listPriceInput?: string
  discountPrice: number | null
  discountPriceInput: string
  discountPercent: number | null
  discountPercentInput: string
  error: string | null
}

/**
 * Pure per-row, per-audience pricing update. Preserves raw input strings so fields
 * are never cleared while the user is typing invalid/partial values.
 */
export function computeAudiencePricingDraft(
  field: 'list' | 'discPrice' | 'discPercent',
  rawValue: string,
  currentListPrice: number,
  currentDiscPriceInput: string,
  currentDiscPercentInput: string
): AudiencePricingDraftUpdate {
  if (field === 'list') {
    const parsed = parseFloat(String(rawValue ?? '').trim())
    const nextListPrice = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    if (currentDiscPercentInput.trim() !== '') {
      const res = calculateDiscountFromPercent(nextListPrice, currentDiscPercentInput)
      return {
        listPrice: nextListPrice,
        listPriceInput: rawValue,
        discountPrice: res.discountPrice,
        discountPriceInput: res.discountPrice != null ? String(res.discountPrice) : '',
        discountPercent: res.discountPercent,
        discountPercentInput: currentDiscPercentInput,
        error: res.error,
      }
    }
    if (currentDiscPriceInput.trim() !== '') {
      const res = calculateDiscountFromPrice(nextListPrice, currentDiscPriceInput)
      return {
        listPrice: nextListPrice,
        listPriceInput: rawValue,
        discountPrice: res.discountPrice,
        discountPriceInput: currentDiscPriceInput,
        discountPercent: res.discountPercent,
        discountPercentInput: res.discountPercent != null ? String(res.discountPercent) : '',
        error: res.error,
      }
    }
    return {
      listPrice: nextListPrice,
      listPriceInput: rawValue,
      discountPrice: null,
      discountPriceInput: '',
      discountPercent: null,
      discountPercentInput: '',
      error: null,
    }
  }

  if (field === 'discPrice') {
    const res = calculateDiscountFromPrice(currentListPrice, rawValue)
    return {
      listPrice: currentListPrice,
      discountPrice: res.discountPrice,
      discountPriceInput: rawValue,
      discountPercent: res.discountPercent,
      discountPercentInput: res.discountPercent != null ? String(res.discountPercent) : '',
      error: res.error,
    }
  }

  const res = calculateDiscountFromPercent(currentListPrice, rawValue)
  return {
    listPrice: currentListPrice,
    discountPrice: res.discountPrice,
    discountPriceInput: res.discountPrice != null ? String(res.discountPrice) : '',
    discountPercent: res.discountPercent,
    discountPercentInput: rawValue,
    error: res.error,
  }
}

export function validateRowDiscount(
  listPrice: number,
  discountPrice: number | null | undefined,
  discountPercent: number | null | undefined
): string | null {
  if (discountPrice == null && discountPercent == null) return null
  if (!Number.isFinite(listPrice) || listPrice <= 0) return 'List price must be > $0'
  if (discountPrice != null && (!Number.isFinite(discountPrice) || discountPrice <= 0)) return 'Must be > $0'
  if (discountPrice != null && discountPrice >= listPrice) return `Discount must be < $${listPrice.toLocaleString()}`
  if (discountPercent != null && (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent >= 100)) {
    return 'Percent must be between 0.01% and 99.99%'
  }
  return null
}

