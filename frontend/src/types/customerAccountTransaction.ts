import type { Currency } from './product'

export interface CustomerAccountSaleTransaction {
  id: string
  customerId: string
  type: 'sale'
  saleId: string
  productNameSnapshot: string
  weightTons: number
  unitSalePrice: number
  currency: Currency
  totalAmount: number
  driverName: string
  transactionDate: string
  createdAt: string
  updatedAt: string
  isActive: boolean
}

export interface CustomerAccountReceiptTransaction {
  id: string
  customerId: string
  type: 'receipt'
  receiptId: string
  customerNameSnapshot: string
  amount: number
  currency: Currency
  transactionDate: string
  notes: string
  createdAt: string
  updatedAt: string
  isActive: boolean
}

export type CustomerAccountTransaction = CustomerAccountSaleTransaction | CustomerAccountReceiptTransaction
