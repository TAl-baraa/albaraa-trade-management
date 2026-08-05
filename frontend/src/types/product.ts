export type Currency = 'IQD' | 'USD'

export interface Product {
  id: string
  name: string
  purchaseCurrency: Currency
  purchasePrice: number
  exchangeRate: number | null
  notes: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface ProductFormValues {
  name: string
  purchaseCurrency: Currency
  purchasePrice: string
  exchangeRate: string
  notes: string
}
