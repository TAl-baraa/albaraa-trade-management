export type BalanceDirection = 'settled' | 'owesUs' | 'weOwe'

export interface Customer {
  id: string
  name: string
  phone: string
  notes: string
  iqdBalance: number
  usdBalance: number
  lastPurchaseDate: string | null
  lastPaymentDate: string | null
  hasTransactionHistory: boolean
  isArchived: boolean
  createdAt: string
  archivedAt: string | null
}

export interface CustomerFormValues {
  name: string
  phone: string
  notes: string
  iqdDirection: BalanceDirection
  iqdAmount: string
  usdDirection: BalanceDirection
  usdAmount: string
}

// Positive means the customer owes us; negative means we owe the customer; zero is settled.
export const getBalanceDirection = (balance: number): BalanceDirection => {
  if (balance > 0) return 'owesUs'
  if (balance < 0) return 'weOwe'
  return 'settled'
}
