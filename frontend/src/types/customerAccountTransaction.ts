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
}

export type CustomerAccountTransaction = CustomerAccountSaleTransaction
