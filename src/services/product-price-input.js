export function formatPriceInput(value) {
  const digits = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  if (!digits) return ''
  const padded = digits.padStart(3, '0')
  return `${padded.slice(0, -2)},${padded.slice(-2)}`
}
