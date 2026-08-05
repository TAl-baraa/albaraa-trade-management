import { initialCustomers } from '../data/mockCustomers'
import { createVersionedStorage } from '../services/storage/versionedStorage'
import { storageKeys, storageSchemaVersions } from '../services/storage/storageKeys'
import type { Customer } from '../types/customer'

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string'
const isCustomer = (value: unknown): value is Customer => {
  if (typeof value !== 'object' || value === null) return false
  const customer = value as Record<string, unknown>
  return typeof customer.id === 'string' && typeof customer.name === 'string' && typeof customer.phone === 'string' &&
    typeof customer.notes === 'string' && typeof customer.iqdBalance === 'number' && Number.isFinite(customer.iqdBalance) &&
    typeof customer.usdBalance === 'number' && Number.isFinite(customer.usdBalance) && isNullableString(customer.lastPurchaseDate) &&
    isNullableString(customer.lastPaymentDate) && typeof customer.hasTransactionHistory === 'boolean' &&
    typeof customer.isArchived === 'boolean' && typeof customer.createdAt === 'string' && isNullableString(customer.archivedAt)
}

const storage = createVersionedStorage<Customer[]>(storageKeys.customers, storageSchemaVersions.customers, (value): value is Customer[] => Array.isArray(value) && value.every(isCustomer))

export interface CustomerRepository {
  getAll: () => Customer[]
  saveAll: (customers: Customer[]) => void
}

export const customerRepository: CustomerRepository = {
  getAll: () => {
    const result = storage.load()
    if (result.status === 'valid') return result.data
    if (result.status === 'invalid') {
      storage.save([])
      return []
    }
    const seededCustomers = initialCustomers.map((customer) => ({ ...customer }))
    storage.save(seededCustomers)
    return seededCustomers
  },
  saveAll: (customers) => storage.save(customers),
}
