export const MAX_PRODUCT_PHOTO_BYTES = 5 * 1024 * 1024

export function normalizePrice(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const integer = match[1].replace(/^0+(?=\d)/, '')
  const decimals = (match[2] || '').padEnd(2, '0')
  if (integer.length > 8 || (integer === '0' && decimals === '00')) return null
  return `${integer}.${decimals}`
}
