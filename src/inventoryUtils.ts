export function sanitizeAdminDiamonds<T extends { id?: string; sku?: string }>(rawItems: T[]): T[] {
  const seenIds = new Set<string>()
  return (rawItems || []).map((item, idx): T => {
    let id = item.id ? String(item.id).trim() : ''
    if (!id) {
      id = item.sku ? `dia-${String(item.sku).toLowerCase().replace(/[^a-z0-9_-]/g, '-')}` : `dia-${Date.now()}-${idx}`
    }
    if (seenIds.has(id)) {
      id = `${id}-${idx}`
    }
    seenIds.add(id)
    return {
      ...item,
      id,
    } as T
  })
}
