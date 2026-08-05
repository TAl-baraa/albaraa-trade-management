const STORAGE_NAMESPACE = 'albaraa-trade-management'

export const storageKeys = {
  customers: `${STORAGE_NAMESPACE}:customers`,
  products: `${STORAGE_NAMESPACE}:products`,
} as const

export const storageSchemaVersions = {
  customers: 1,
  products: 2,
} as const
