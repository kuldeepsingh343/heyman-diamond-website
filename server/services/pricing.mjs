/**
 * Pricing & Discount Calculation Engine
 * Hey Man Diamond LLC - Dual-Audience Inventory Pricing
 *
 * Rules:
 * - listPrice must be a valid positive number (> 0)
 * - discountPrice must be > 0 and < listPrice
 * - discountPercent must be between 0.01 and 99.99
 * - If both discountPrice and discountPercent are provided, discountPrice wins
 * - If either discount field is 0, empty string, or null, both discount fields reset to null
 * - Rounded strictly to 2 decimal places using standard financial rounding
 */

export function roundMoney(val) {
  const num = Number(val)
  if (isNaN(num) || !Number.isFinite(num)) {
    throw new TypeError('Invalid numeric currency value.')
  }
  return Math.round((num + Number.EPSILON) * 100) / 100
}

export function roundPercent(val) {
  const num = Number(val)
  if (isNaN(num) || !Number.isFinite(num)) {
    throw new TypeError('Invalid numeric percentage value.')
  }
  return Math.round((num + Number.EPSILON) * 100) / 100
}

/**
 * Validates and computes discount pricing for a given list price.
 *
 * @param {number|string} rawListPrice The list price (customer_price or dealer_price)
 * @param {number|string|null|undefined} rawDiscountPrice The discounted price input
 * @param {number|string|null|undefined} rawDiscountPercent The discount percentage input
 * @returns {{ discountPrice: number|null, discountPercent: number|null, effectivePrice: number }}
 */
export function computeDiscount(rawListPrice, rawDiscountPrice, rawDiscountPercent) {
  const listPriceNum = Number(rawListPrice)
  if (isNaN(listPriceNum) || !Number.isFinite(listPriceNum) || listPriceNum <= 0) {
    throw new RangeError('List price must be a valid positive number greater than 0.')
  }
  const listPrice = roundMoney(listPriceNum)

  const hasPrice = rawDiscountPrice !== null && rawDiscountPrice !== undefined && String(rawDiscountPrice).trim() !== ''
  const hasPercent = rawDiscountPercent !== null && rawDiscountPercent !== undefined && String(rawDiscountPercent).trim() !== ''

  // If neither field was provided, or both are cleared / 0
  if (!hasPrice && !hasPercent) {
    return {
      discountPrice: null,
      discountPercent: null,
      effectivePrice: listPrice,
    }
  }

  const numPrice = hasPrice ? Number(rawDiscountPrice) : null
  const numPercent = hasPercent ? Number(rawDiscountPercent) : null

  // Treat explicit 0 as cleared discount
  if ((hasPrice && numPrice === 0) || (hasPercent && numPercent === 0)) {
    return {
      discountPrice: null,
      discountPercent: null,
      effectivePrice: listPrice,
    }
  }

  // If both provided, Discount Price wins and percent is recomputed
  if (hasPrice) {
    if (isNaN(numPrice) || !Number.isFinite(numPrice)) {
      throw new TypeError('Discount price must be a valid number.')
    }
    if (numPrice <= 0) {
      throw new RangeError('Discount price must be greater than 0.')
    }
    if (numPrice >= listPrice) {
      throw new RangeError(`Discount price ($${roundMoney(numPrice)}) must be strictly less than list price ($${listPrice}).`)
    }

    const discountPrice = roundMoney(numPrice)
    const discountPercent = roundPercent(((listPrice - discountPrice) / listPrice) * 100)
    return {
      discountPrice,
      discountPercent,
      effectivePrice: discountPrice,
    }
  }

  // Only percent provided
  if (isNaN(numPercent) || !Number.isFinite(numPercent)) {
    throw new TypeError('Discount percent must be a valid number.')
  }
  if (numPercent <= 0 || numPercent >= 100) {
    throw new RangeError('Discount percent must be strictly greater than 0% and less than 100%.')
  }

  const discountPercent = roundPercent(numPercent)
  const discountPrice = roundMoney((listPrice * (100 - discountPercent)) / 100)

  if (discountPrice <= 0 || discountPrice >= listPrice) {
    throw new RangeError('Calculated discount price is outside valid price boundaries.')
  }

  return {
    discountPrice,
    discountPercent,
    effectivePrice: discountPrice,
  }
}

/**
 * Applies customer and dealer discounts to an inventory item payload.
 *
 * @param {object} currentItem The existing diamond object
 * @param {object} input The incoming update payload
 * @returns {object} Formatted database update object
 */
export function processDiamondPricingUpdates(currentItem, input) {
  const updates = {}

  // Resolve Customer List Price
  let customerListPrice = currentItem.customer_price !== undefined ? currentItem.customer_price : currentItem.price
  if (input.customerPrice !== undefined) {
    customerListPrice = input.customerPrice
  } else if (input.price !== undefined) {
    customerListPrice = input.price
  }

  // Resolve Dealer List Price
  let dealerListPrice = currentItem.dealer_price !== undefined ? currentItem.dealer_price : currentItem.wholesalePrice
  if (input.dealerPrice !== undefined) {
    dealerListPrice = input.dealerPrice
  } else if (input.wholesalePrice !== undefined) {
    dealerListPrice = input.wholesalePrice
  }

  // Process Customer Discount if either list price or discount fields were sent
  const customerDiscountTouched =
    input.customerPrice !== undefined ||
    input.price !== undefined ||
    input.customerDiscountPrice !== undefined ||
    input.customerDiscountPercent !== undefined

  if (customerDiscountTouched) {
    const rawDiscPrice = input.customerDiscountPrice !== undefined ? input.customerDiscountPrice : currentItem.customer_discount_price
    const rawDiscPct = input.customerDiscountPercent !== undefined ? input.customerDiscountPercent : currentItem.customer_discount_percent

    const computed = computeDiscount(customerListPrice, rawDiscPrice, rawDiscPct)
    updates.customer_price = roundMoney(customerListPrice)
    updates.customer_discount_price = computed.discountPrice
    updates.customer_discount_percent = computed.discountPercent
  }

  // Process Dealer Discount if either list price or discount fields were sent
  const dealerDiscountTouched =
    input.dealerPrice !== undefined ||
    input.wholesalePrice !== undefined ||
    input.dealerDiscountPrice !== undefined ||
    input.dealerDiscountPercent !== undefined

  if (dealerDiscountTouched) {
    const rawDiscPrice = input.dealerDiscountPrice !== undefined ? input.dealerDiscountPrice : currentItem.dealer_discount_price
    const rawDiscPct = input.dealerDiscountPercent !== undefined ? input.dealerDiscountPercent : currentItem.dealer_discount_percent

    const computed = computeDiscount(dealerListPrice, rawDiscPrice, rawDiscPct)
    updates.dealer_price = roundMoney(dealerListPrice)
    updates.dealer_discount_price = computed.discountPrice
    updates.dealer_discount_percent = computed.discountPercent
  }

  return updates
}

