import type { Currency } from './product'
import type { OperationHistoryEntry, SoftDeletionMetadata } from './audit'

export interface Sale extends SoftDeletionMetadata {
  id: string
  customerId: string
  customerNameSnapshot: string
  productId: string
  productNameSnapshot: string
  weightTons: number
  driverName: string
  unitSalePrice: number
  saleCurrency: Currency
  totalAmount: number
  saleDate: string
  createdAt: string
  updatedAt: string
  isReviewed: boolean
  history: OperationHistoryEntry[]
}

export interface SaleFormValues {
  customerId: string
  productId: string
  weightTons: string
  driverName: string
  unitSalePrice: string
  saleCurrency: Currency
  saleDate: string
}
