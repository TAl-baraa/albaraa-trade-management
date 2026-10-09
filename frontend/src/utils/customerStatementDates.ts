const databaseDatePattern = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/

const isValidDateParts = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const formatCustomerStatementDate = (value: string | Date | null): string => {
  if (!value) return '—'

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '—'
    const day = String(value.getDate()).padStart(2, '0')
    const month = String(value.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}/${value.getFullYear()}`
  }

  const match = value.trim().match(databaseDatePattern)
  if (!match) return '—'

  const [, year, month, day] = match
  if (!isValidDateParts(Number(year), Number(month), Number(day))) return '—'
  return `${day}/${month}/${year}`
}

export const formatCustomerStatementPeriod = (startDate: string | null, endDate: string | null): string => {
  if (!startDate && !endDate) return 'كل الفترة'
  const from = startDate ? formatCustomerStatementDate(startDate) : 'بداية الحساب'
  const to = endDate ? formatCustomerStatementDate(endDate) : 'آخر عملية'
  return `من ${from} الى ${to}`
}
