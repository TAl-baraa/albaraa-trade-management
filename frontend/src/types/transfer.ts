import type { OperationHistoryEntry, SoftDeletionMetadata } from './audit'
import type { Currency } from './product'

export interface Transfer extends SoftDeletionMetadata {
  id: string
  customerId: string
  customerNameSnapshot: string
  amount: number
  currency: Currency
  businessDate: string
  description: string
  notes: string
  createdAt: string
  updatedAt: string
  history: OperationHistoryEntry[]
}

export interface TransferFormValues {
  customerId: string
  amount: string
  currency: Currency
  businessDate: string
  description: string
  notes: string
}
