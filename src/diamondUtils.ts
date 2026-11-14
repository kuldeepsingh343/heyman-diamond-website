/**
 * Pure diamond utility functions and media resolver.
 * Ensures authentic diamond presentation without misleading stock photo fallbacks.
 */

export interface DiamondMediaResult {
  imageUrl: string
  videoUrl: string | null
  isFallback: boolean
  hasActualImage: boolean
  hasActualVideo: boolean
  isVideoViewer: boolean
}

export const DIAMOND_PLACEHOLDER_SVG = '/diamond-placeholder.svg'

/**
 * Checks whether a URL points to a direct video media file (.mp4, .webm, etc.)
 */
export function isDirectVideoFile(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  const clean = url.trim().toLowerCase().split('?')[0].split('#')[0]
  return (
    clean.endsWith('.mp4') ||
    clean.endsWith('.webm') ||
    clean.endsWith('.ogg') ||
    clean.endsWith('.mov') ||
    clean.endsWith('.m4v')
  )
}

/**
 * Checks whether a URL is an interactive 360 viewer web page (iframe embed).
 */
export function isInteractiveVideoViewer(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  if (isDirectVideoFile(url)) return false
  const lower = url.trim().toLowerCase()
  return (
    lower.includes('.html') ||
    lower.includes('vision360') ||
    lower.includes('gem360') ||
    lower.includes('v360.in') ||
    lower.includes('cutwise') ||
    lower.includes('diamonds360') ||
    lower.includes('360view') ||
    lower.includes('blissvideos') ||
    lower.includes('jaykar.co.in') ||
    lower.includes('mydiamondinfo') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://')
  )
}

/**
 * Resolves media URLs for a diamond stone.
 * CRITICAL RULE: Never return stock photographs of unrelated diamonds as fallbacks.
 * Diamonds without physical photos return the neutral specification placeholder SVG.
 */
export function getDiamondMedia(diamond: {
  shape?: string
  category?: string
  imageUrl?: string | null
  videoUrl?: string | null
}): DiamondMediaResult {
  const rawImg = (diamond.imageUrl || '').trim()
  let rawVid = (diamond.videoUrl || '').trim()

  // Guard against HTML 360 viewer links misplaced in imageUrl column
  const cleanImg = rawImg.split('?')[0].split('#')[0].toLowerCase()
  const isImageFile =
    cleanImg.endsWith('.jpg') ||
    cleanImg.endsWith('.jpeg') ||
    cleanImg.endsWith('.png') ||
    cleanImg.endsWith('.webp') ||
    rawImg.includes('V360Images.aspx')
  const isImgViewer =
    !isImageFile &&
    (rawImg.toLowerCase().includes('.html') || rawImg.toLowerCase().includes('.htm'))

  if (isImgViewer && !rawVid) {
    rawVid = rawImg
  }

  const effectiveVid = rawVid !== '' ? rawVid : null
  const hasActualVideo = effectiveVid !== null
  const isVideoViewer = hasActualVideo ? isInteractiveVideoViewer(effectiveVid) : false

  // If a valid image URL was provided (and isn't an HTML viewer)
  if (rawImg !== '' && !isImgViewer) {
    return {
      imageUrl: rawImg,
      videoUrl: effectiveVid,
      isFallback: false,
      hasActualImage: true,
      hasActualVideo,
      isVideoViewer,
    }
  }

  // Authentic fallback: Clean, neutral vector placeholder (never an unrelated diamond photo)
  return {
    imageUrl: DIAMOND_PLACEHOLDER_SVG,
    videoUrl: effectiveVid,
    isFallback: true,
    hasActualImage: false,
    hasActualVideo,
    isVideoViewer,
  }
}
