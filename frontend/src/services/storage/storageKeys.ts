const STORAGE_NAMESPACE = 'albaraa-trade-management'

export const storageKeys = {
  customers: `${STORAGE_NAMESPACE}:customers`,
  products: `${STORAGE_NAMESPACE}:products`,
  sales: `${STORAGE_NAMESPACE}:sales`,
  customerAccountTransactions: `${STORAGE_NAMESPACE}:customer-account-transactions`,
} as const

export const storageSchemaVersions = {
  customers: 1,
  products: 2,
  sales: 1,
  customerAccountTransactions: 1,
} as const
