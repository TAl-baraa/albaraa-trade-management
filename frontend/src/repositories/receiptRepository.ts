import { storageKeys, storageSchemaVersions } from '../services/storage/storageKeys'
import { createVersionedStorage } from '../services/storage/versionedStorage'
import { CURRENT_ACTOR, type OperationHistoryEntry } from '../types/audit'
import type { Currency } from '../types/product'
import type { Receipt } from '../types/receipt'
import { isValidDateString } from '../utils/date'

const isPositiveNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const isCurrency = (value: unknown): value is Currency => value === 'IQD' || value === 'USD'
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string'
const isHistory = (value: unknown): value is OperationHistoryEntry[] => Array.isArray(value) && value.every((entry) => typeof entry === 'object' && entry !== null && typeof (entry as Record<string, unknown>).id === 'string' && (entry as Record<string, unknown>).actor === CURRENT_ACTOR && Array.isArray((entry as Record<string, unknown>).changes))
const isReceipt = (value: unknown): value is Receipt => {
  if (typeof value !== 'object' || value === null) return false
  const receipt = value as Record<string, unknown>
  return typeof receipt.id === 'string' && typeof receipt.customerId === 'string' && typeof receipt.customerNameSnapshot === 'string' && isPositiveNumber(receipt.amount) && isCurrency(receipt.currency) && typeof receipt.businessDate === 'string' && isValidDateString(receipt.businessDate) && typeof receipt.notes === 'string' && typeof receipt.createdAt === 'string' && typeof receipt.updatedAt === 'string' && typeof receipt.isDeleted === 'boolean' && isNullableString(receipt.deletedAt) && (receipt.deletedBy === null || receipt.deletedBy === CURRENT_ACTOR) && isNullableString(receipt.deletionReason) && isHistory(receipt.history)
}
const storage = createVersionedStorage<Receipt[]>(storageKeys.receipts, storageSchemaVersions.receipts, (value): value is Receipt[] => Array.isArray(value) && value.every(isReceipt))

export interface ReceiptRepository { getAll: () => Receipt[]; getActive: () => Receipt[]; getDeleted: () => Receipt[]; saveAll: (receipts: Receipt[]) => void }
export const receiptRepository: ReceiptRepository = {
  getAll: () => { const result = storage.load(); if (result.status === 'valid') return result.data; storage.save([]); return [] },
  getActive: () => receiptRepository.getAll().filter((receipt) => !receipt.isDeleted),
  getDeleted: () => receiptRepository.getAll().filter((receipt) => receipt.isDeleted),
  saveAll: (receipts) => storage.save(receipts),
}
