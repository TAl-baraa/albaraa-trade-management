import type { Currency } from './product'

export interface Sale {
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
