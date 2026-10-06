import { transferRepository, type TransferMutationResult } from '../repositories/transferRepository'
import { repositoryError } from '../repositories/tauriBridge'
import type { TransferFormValues } from '../types/transfer'

export type TransferOperationResult = ({ ok: true } & TransferMutationResult) | { ok: false; message: string }

const execute = async (operation: () => Promise<TransferMutationResult>): Promise<TransferOperationResult> => {
  try { return { ok: true, ...await operation() } }
  catch (error) { return { ok: false, message: repositoryError(error) } }
}

export const transferAccountingService = {
  create: (values: TransferFormValues) => execute(() => transferRepository.create(values)),
  update: (id: string, values: TransferFormValues) => execute(() => transferRepository.update(id, values)),
  delete: (id: string, reason = '') => execute(() => transferRepository.delete(id, reason)),
}
