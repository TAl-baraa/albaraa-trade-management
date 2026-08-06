import type { OperationHistoryEntry, SoftDeletionMetadata } from './audit'
import type { Currency } from './product'

export interface Receipt extends SoftDeletionMetadata {
  id: string
  customerId: string
  customerNameSnapshot: string
  amount: number
  currency: Currency
  businessDate: string
  notes: string
  createdAt: string
  updatedAt: string
  history: OperationHistoryEntry[]
}

export interface ReceiptFormValues {
  customerId: string
  amount: string
  currency: Currency
  businessDate: string
  notes: string
}
