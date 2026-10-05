import type { Currency, Product } from './product'

export type SalesTransactionLineSnapshot = Readonly<{
  productId: string
  productNameSnapshot: string
  salePriceSnapshot: number
  saleCurrencySnapshot: Currency
}>

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
