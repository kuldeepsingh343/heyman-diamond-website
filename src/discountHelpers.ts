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
  if (!trimmed || trimmed === '0') {
    return { discountPrice: null, discountPercent: null, error: null }
  }
  const discPrice = parseFloat(trimmed)
  if (isNaN(discPrice) || !Number.isFinite(discPrice)) {
    return { discountPrice: null, discountPercent: null, error: 'Enter a valid number' }
  }
  if (discPrice <= 0) {
    return { discountPrice: null, discountPercent: null, error: 'Must be > $0' }
  }
  if (listPrice > 0 && discPrice >= listPrice) {
    return { discountPrice: discPrice, discountPercent: null, error: `Must be < list ($${listPrice.toLocaleString()})` }
  }
  const pct = listPrice > 0 ? Math.round(((listPrice - discPrice) / listPrice) * 100 * 100) / 100 : 0
  return { discountPrice: discPrice, discountPercent: pct, error: null }
}

export function calculateDiscountFromPercent(
  listPrice: number,
  discountPercentStr: string
): DiscountCalculationResult {
  const trimmed = String(discountPercentStr ?? '').trim()
  if (!trimmed || trimmed === '0') {
    return { discountPrice: null, discountPercent: null, error: null }
  }
  const pct = parseFloat(trimmed)
  if (isNaN(pct) || !Number.isFinite(pct)) {
    return { discountPrice: null, discountPercent: null, error: 'Enter a valid percent' }
  }
  if (pct <= 0 || pct >= 100) {
    return { discountPrice: null, discountPercent: null, error: 'Must be between 0.01% and 99.99%' }
  }
  const discPrice = listPrice > 0 ? Math.round((listPrice * (100 - pct) / 100) * 100) / 100 : 0
  return { discountPrice: discPrice, discountPercent: pct, error: null }
}

