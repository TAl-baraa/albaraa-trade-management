export const formatNumber = (value: number): string =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)

export const formatDate = (value: string | null): string => {
  if (!value) return '—'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

export const formatBalance = (balance: number, currency: 'IQD' | 'USD'): string => {
  if (balance === 0) return 'مسدد'
  const relation = balance > 0 ? 'عليه' : 'له'
  const unit = currency === 'IQD' ? 'د.ع' : 'دولار'
  return `${relation} ${formatNumber(Math.abs(balance))} ${unit}`
}
