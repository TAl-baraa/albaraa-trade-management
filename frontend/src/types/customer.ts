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
}
