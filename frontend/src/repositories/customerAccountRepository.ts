import { storageKeys, storageSchemaVersions } from '../services/storage/storageKeys'
import { createVersionedStorage } from '../services/storage/versionedStorage'
import type { CustomerAccountTransaction } from '../types/customerAccountTransaction'
import type { Currency } from '../types/product'
import { isValidDateString } from '../utils/date'

const isCurrency = (value: unknown): value is Currency => value === 'IQD' || value === 'USD'
const isPositiveNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const isTransaction = (value: unknown): value is CustomerAccountTransaction => {
  if (typeof value !== 'object' || value === null) return false
  const transaction = value as Record<string, unknown>
  return typeof transaction.id === 'string' && typeof transaction.customerId === 'string' && transaction.type === 'sale' &&
    typeof transaction.saleId === 'string' && typeof transaction.productNameSnapshot === 'string' && isPositiveNumber(transaction.weightTons) &&
    isPositiveNumber(transaction.unitSalePrice) && isCurrency(transaction.currency) && isPositiveNumber(transaction.totalAmount) &&
    typeof transaction.driverName === 'string' && typeof transaction.transactionDate === 'string' && isValidDateString(transaction.transactionDate) &&
    typeof transaction.createdAt === 'string' && typeof transaction.updatedAt === 'string'
}

const storage = createVersionedStorage<CustomerAccountTransaction[]>(storageKeys.customerAccountTransactions, storageSchemaVersions.customerAccountTransactions, (value): value is CustomerAccountTransaction[] => Array.isArray(value) && value.every(isTransaction))

export interface CustomerAccountRepository { getAll: () => CustomerAccountTransaction[]; saveAll: (transactions: CustomerAccountTransaction[]) => void }
export const customerAccountRepository: CustomerAccountRepository = {
  getAll: () => { const result = storage.load(); if (result.status === 'valid') return result.data; storage.save([]); return [] },
  saveAll: (transactions) => storage.save(transactions),
}
