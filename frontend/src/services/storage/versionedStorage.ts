interface StorageEnvelope<T> {
  version: number
  data: T
}

const isStorageEnvelope = (value: unknown): value is StorageEnvelope<unknown> =>
  typeof value === 'object' && value !== null && 'version' in value && 'data' in value

export interface VersionedStorage<T> {
  load: () => { status: 'missing' } | { status: 'invalid' } | { status: 'valid'; data: T }
  save: (data: T) => void
}

export const createVersionedStorage = <T>(key: string, version: number, validate: (value: unknown) => value is T): VersionedStorage<T> => ({
  load: () => {
    try {
      const rawValue = window.localStorage.getItem(key)
      if (rawValue === null) return { status: 'missing' }
      const parsed: unknown = JSON.parse(rawValue)
      if (!isStorageEnvelope(parsed) || parsed.version !== version || !validate(parsed.data)) return { status: 'invalid' }
      return { status: 'valid', data: parsed.data }
    } catch {
      return { status: 'invalid' }
    }
  },
  save: (data: T) => {
    try {
      const envelope: StorageEnvelope<T> = { version, data }
      window.localStorage.setItem(key, JSON.stringify(envelope))
    } catch {
      // Storage can be unavailable or full; the in-memory UI remains usable.
    }
  },
})
