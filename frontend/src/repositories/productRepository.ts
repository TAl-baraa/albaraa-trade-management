import { initialProducts } from '../data/mockProducts'
import { storageKeys, storageSchemaVersions } from '../services/storage/storageKeys'
import { createVersionedStorage } from '../services/storage/versionedStorage'
import type { Currency, Product } from '../types/product'

const isCurrency = (value: unknown): value is Currency => value === 'IQD' || value === 'USD'
const isNonNegativeNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const isProduct = (value: unknown): value is Product => {
  if (typeof value !== 'object' || value === null) return false
  const product = value as Record<string, unknown>
  const hasValidExchangeRate = product.purchaseCurrency === 'IQD'
    ? product.exchangeRate === null
    : typeof product.exchangeRate === 'number' && Number.isFinite(product.exchangeRate) && product.exchangeRate > 0
  return typeof product.id === 'string' && product.id.length > 0 && typeof product.name === 'string' && product.name.trim().length > 0 &&
    isCurrency(product.purchaseCurrency) && isNonNegativeNumber(product.purchasePrice) && hasValidExchangeRate &&
    typeof product.notes === 'string' && typeof product.isArchived === 'boolean' &&
    typeof product.createdAt === 'string' && typeof product.updatedAt === 'string'
}

const hasUniqueNames = (products: Product[]): boolean => {
  const names = products.map((product) => normalizeProductName(product.name))
  return new Set(names).size === names.length
}

const storage = createVersionedStorage<Product[]>(
  storageKeys.products,
  storageSchemaVersions.products,
  (value): value is Product[] => Array.isArray(value) && value.every(isProduct) && hasUniqueNames(value),
)

export const normalizeProductName = (name: string): string => name.trim().normalize('NFKC').toLocaleLowerCase('ar')

export interface ProductRepository {
  getAll: () => Product[]
  saveAll: (products: Product[]) => void
}

export const productRepository: ProductRepository = {
  getAll: () => {
    const result = storage.load()
    if (result.status === 'valid') return result.data
    const seededProducts = initialProducts.map((product) => ({ ...product }))
    storage.save(seededProducts)
    return seededProducts
  },
  saveAll: (products) => storage.save(products),
}
