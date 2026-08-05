import { storageKeys, storageSchemaVersions } from '../services/storage/storageKeys'
import { createVersionedStorage } from '../services/storage/versionedStorage'
import type { Currency } from '../types/product'
import type { Sale } from '../types/sale'
import { isValidDateString } from '../utils/date'

const isCurrency = (value: unknown): value is Currency => value === 'IQD' || value === 'USD'
const isPositiveNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const isSale = (value: unknown): value is Sale => {
  if (typeof value !== 'object' || value === null) return false
  const sale = value as Record<string, unknown>
  return typeof sale.id === 'string' && typeof sale.customerId === 'string' && typeof sale.customerNameSnapshot === 'string' &&
    typeof sale.productId === 'string' && typeof sale.productNameSnapshot === 'string' && isPositiveNumber(sale.weightTons) &&
    typeof sale.driverName === 'string' && sale.driverName.trim().length > 0 && isPositiveNumber(sale.unitSalePrice) &&
    isCurrency(sale.saleCurrency) && isPositiveNumber(sale.totalAmount) && typeof sale.saleDate === 'string' &&
    isValidDateString(sale.saleDate) && typeof sale.createdAt === 'string' && typeof sale.updatedAt === 'string'
}

const storage = createVersionedStorage<Sale[]>(storageKeys.sales, storageSchemaVersions.sales, (value): value is Sale[] => Array.isArray(value) && value.every(isSale))

export interface SaleRepository { getAll: () => Sale[]; saveAll: (sales: Sale[]) => void }
export const saleRepository: SaleRepository = {
  getAll: () => { const result = storage.load(); if (result.status === 'valid') return result.data; storage.save([]); return [] },
  saveAll: (sales) => storage.save(sales),
}
