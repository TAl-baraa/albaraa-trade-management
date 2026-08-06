import { storageKeys, storageSchemaVersions } from '../services/storage/storageKeys'
import { createVersionedStorage } from '../services/storage/versionedStorage'
import type { CustomerAccountTransaction } from '../types/customerAccountTransaction'
import type { Currency } from '../types/product'
import { isValidDateString } from '../utils/date'

const isCurrency = (value: unknown): value is Currency => value === 'IQD' || value === 'USD'
const isPositiveNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const isTransaction = (value: unknown): value is CustomerAccountTransaction => {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  const common = typeof item.id === 'string' && typeof item.customerId === 'string' && isCurrency(item.currency) && typeof item.transactionDate === 'string' && isValidDateString(item.transactionDate) && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string' && typeof item.isActive === 'boolean'
  if (item.type === 'sale') return common && typeof item.saleId === 'string' && typeof item.productNameSnapshot === 'string' && isPositiveNumber(item.weightTons) && isPositiveNumber(item.unitSalePrice) && isPositiveNumber(item.totalAmount) && typeof item.driverName === 'string'
  return item.type === 'receipt' && common && typeof item.receiptId === 'string' && typeof item.customerNameSnapshot === 'string' && isPositiveNumber(item.amount) && typeof item.notes === 'string'
}

const migrateTransactions = (version: number, data: unknown): CustomerAccountTransaction[] | null => {
  if (version !== 1 || !Array.isArray(data)) return null
  const migrated = data.map((value) => typeof value === 'object' && value !== null ? { ...value, isActive: true } : value)
  return migrated.every(isTransaction) ? migrated : null
}
const storage = createVersionedStorage<CustomerAccountTransaction[]>(storageKeys.customerAccountTransactions, storageSchemaVersions.customerAccountTransactions, (value): value is CustomerAccountTransaction[] => Array.isArray(value) && value.every(isTransaction), migrateTransactions)

export interface CustomerAccountRepository { getAll: () => CustomerAccountTransaction[]; saveAll: (transactions: CustomerAccountTransaction[]) => void }
export const customerAccountRepository: CustomerAccountRepository = {
  getAll: () => { const result = storage.load(); if (result.status === 'valid') return result.data; storage.save([]); return [] },
  saveAll: (transactions) => storage.save(transactions),
}
