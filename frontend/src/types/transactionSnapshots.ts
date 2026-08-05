import type { Currency, Product } from './product'

export type PurchaseTransactionLineSnapshot = Readonly<{
  productId: string
  productNameSnapshot: string
  purchaseCurrencySnapshot: Currency
  purchasePriceSnapshot: number
  exchangeRateSnapshot: number | null
  calculatedValues: Readonly<Record<string, number>>
}>

export type SalesTransactionLineSnapshot = Readonly<{
  productId: string
  productNameSnapshot: string
  salePriceSnapshot: number
  saleCurrencySnapshot: Currency
}>

export const createPurchaseProductSnapshot = (
  product: Product,
  calculatedValues: Readonly<Record<string, number>>,
): PurchaseTransactionLineSnapshot => ({
  productId: product.id,
  productNameSnapshot: product.name,
  purchaseCurrencySnapshot: product.purchaseCurrency,
  purchasePriceSnapshot: product.purchasePrice,
  exchangeRateSnapshot: product.exchangeRate,
  calculatedValues: { ...calculatedValues },
})

export const createSalesProductSnapshot = (
  product: Pick<Product, 'id' | 'name'>,
  salePrice: number,
  saleCurrency: Currency,
): SalesTransactionLineSnapshot => ({
  productId: product.id,
  productNameSnapshot: product.name,
  salePriceSnapshot: salePrice,
  saleCurrencySnapshot: saleCurrency,
})
