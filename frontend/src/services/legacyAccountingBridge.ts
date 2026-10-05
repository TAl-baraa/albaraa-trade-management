import { repositoryError } from '../repositories/tauriBridge'

let pending: Promise<unknown> = Promise.resolve()
// Serialize legacy read/modify/write operations while the two stores coexist.
export function runLegacyOperation<T>(operation: () => Promise<T>): Promise<T | { ok: false; message: string }> {
  const result = pending.then(operation).catch((error: unknown) => ({ ok: false as const, message: repositoryError(error) }))
  pending = result
  return result
}
