/**
 * Pure diamond utility functions and media resolver.
 */

export interface DiamondMediaResult {
  imageUrl: string
  videoUrl: string | null
  isFallback: boolean
}

export function getDiamondMedia(diamond: {
  shape?: string
  category?: string
  imageUrl?: string | null
  videoUrl?: string | null
}): DiamondMediaResult {
  if (diamond.imageUrl && diamond.imageUrl.trim() !== '') {
    return {
      imageUrl: diamond.imageUrl,
      videoUrl: diamond.videoUrl || null,
      isFallback: false,
    }
  }

  const s = (diamond.shape || '').toLowerCase()
  const c = (diamond.category || '').toLowerCase()

  if (c.includes('melee') || s.includes('melee')) {
    return {
      imageUrl: '/round-melee-diamonds.jpg',
      videoUrl: diamond.videoUrl || null,
      isFallback: true,
    }
  }
  if (c.includes('pair')) {
    return {
      imageUrl: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=85',
      videoUrl: diamond.videoUrl || null,
      isFallback: true,
    }
  }
  if (c.includes('fancy') || s.includes('fancy')) {
    return {
      imageUrl: '/loose-fancy-diamonds.png',
      videoUrl: diamond.videoUrl || null,
      isFallback: true,
    }
  }
  if (s.includes('oval')) {
    return {
      imageUrl: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=85',
      videoUrl: diamond.videoUrl || null,
      isFallback: true,
    }
  }
  if (s.includes('emerald') || s.includes('radiant') || s.includes('cushion') || s.includes('princess')) {
    return {
      imageUrl: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=85',
      videoUrl: diamond.videoUrl || null,
      isFallback: true,
    }
  }
  if (s.includes('pear') || s.includes('marquise') || s.includes('heart')) {
    return {
      imageUrl: 'https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=800&q=85',
      videoUrl: diamond.videoUrl || null,
      isFallback: true,
    }
  }

  return {
    imageUrl: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=800&q=85',
    videoUrl: diamond.videoUrl || null,
    isFallback: true,
  }
}
