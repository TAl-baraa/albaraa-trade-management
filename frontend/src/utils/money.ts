const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/

const parseDecimal = (value: string): { coefficient: bigint; scale: number } | null => {
  const normalized = value.trim()
  if (!DECIMAL_PATTERN.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length }
}

export const isPositiveDecimal = (value: string): boolean => {
  const parsed = parseDecimal(value)
  return parsed !== null && parsed.coefficient > 0n
}

export const calculateSaleTotal = (weightTons: string, unitSalePrice: string): number | null => {
  const weight = parseDecimal(weightTons)
  const price = parseDecimal(unitSalePrice)
  if (!weight || !price || weight.coefficient <= 0n || price.coefficient <= 0n) return null
  const product = weight.coefficient * price.coefficient
  const scale = weight.scale + price.scale
  const divisor = 10n ** BigInt(scale)
  const roundedCents = (product * 100n + divisor / 2n) / divisor
  const total = Number(roundedCents) / 100
  return Number.isSafeInteger(Number(roundedCents)) && Number.isFinite(total) && total > 0 ? total : null
}
