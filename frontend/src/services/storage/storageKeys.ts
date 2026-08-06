const STORAGE_NAMESPACE = 'albaraa-trade-management'

export const storageKeys = {
  customers: `${STORAGE_NAMESPACE}:customers`,
  products: `${STORAGE_NAMESPACE}:products`,
  sales: `${STORAGE_NAMESPACE}:sales`,
  receipts: `${STORAGE_NAMESPACE}:receipts`,
  customerAccountTransactions: `${STORAGE_NAMESPACE}:customer-account-transactions`,
} as const

export const storageSchemaVersions = {
  customers: 1,
  products: 2,
  sales: 2,
  receipts: 1,
  customerAccountTransactions: 2,
} as const
