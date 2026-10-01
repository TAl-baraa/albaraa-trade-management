import { storageKeys, storageSchemaVersions } from '../services/storage/storageKeys'
import { createVersionedStorage } from '../services/storage/versionedStorage'
import { CURRENT_ACTOR, type OperationHistoryEntry } from '../types/audit'
import type { Currency } from '../types/product'
import type { Sale } from '../types/sale'
import { isValidDateString } from '../utils/date'

const isCurrency = (value: unknown): value is Currency => value === 'IQD' || value === 'USD'
const isPositiveNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string'
const isHistory = (value: unknown): value is OperationHistoryEntry[] => Array.isArray(value) && value.every((entry) => typeof entry === 'object' && entry !== null && typeof (entry as Record<string, unknown>).id === 'string' && ['created', 'updated', 'deleted'].includes(String((entry as Record<string, unknown>).type)) && (entry as Record<string, unknown>).actor === CURRENT_ACTOR && typeof (entry as Record<string, unknown>).changedAt === 'string' && Array.isArray((entry as Record<string, unknown>).changes))
const isSale = (value: unknown): value is Sale => {
  if (typeof value !== 'object' || value === null) return false
  const sale = value as Record<string, unknown>
  return typeof sale.id === 'string' && typeof sale.customerId === 'string' && typeof sale.customerNameSnapshot === 'string' &&
    typeof sale.productId === 'string' && typeof sale.productNameSnapshot === 'string' && isPositiveNumber(sale.weightTons) &&
    typeof sale.driverName === 'string' && sale.driverName.trim().length > 0 && isPositiveNumber(sale.unitSalePrice) &&
    isCurrency(sale.saleCurrency) && isPositiveNumber(sale.totalAmount) && typeof sale.saleDate === 'string' && isValidDateString(sale.saleDate) &&
    typeof sale.createdAt === 'string' && typeof sale.updatedAt === 'string' && typeof sale.isReviewed === 'boolean' &&
    typeof sale.isDeleted === 'boolean' && isNullableString(sale.deletedAt) && (sale.deletedBy === null || sale.deletedBy === CURRENT_ACTOR) &&
    isNullableString(sale.deletionReason) && isHistory(sale.history)
}

const migrateSales = (version: number, data: unknown): Sale[] | null => {
  if (version !== 1 || !Array.isArray(data)) return null
  const migrated = data.map((value) => typeof value === 'object' && value !== null ? { ...value, isReviewed: false, isDeleted: false, deletedAt: null, deletedBy: null, deletionReason: null, history: [] } : value)
  return migrated.every(isSale) ? migrated : null
}

const storage = createVersionedStorage<Sale[]>(storageKeys.sales, storageSchemaVersions.sales, (value): value is Sale[] => Array.isArray(value) && value.every(isSale), migrateSales)

export interface SaleRepository { getAll: () => Sale[]; getSnapshot: () => Sale[]; getActive: () => Sale[]; getDeleted: () => Sale[]; saveAll: (sales: Sale[]) => void }
export const saleRepository: SaleRepository = {
  getSnapshot: () => {
    const result = storage.load({ persistMigration: false })
    if (result.status === 'invalid') throw new Error('Invalid sales storage')
    return result.status === 'valid' ? result.data : []
  },
  getAll: () => { const result = storage.load(); if (result.status === 'valid') return result.data; storage.save([]); return [] },
  getActive: () => saleRepository.getAll().filter((sale) => !sale.isDeleted),
  getDeleted: () => saleRepository.getAll().filter((sale) => sale.isDeleted),
  saveAll: (sales) => storage.save(sales),
}
