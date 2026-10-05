import { receiptRepository, type ReceiptMutationResult } from '../repositories/receiptRepository'
import { repositoryError } from '../repositories/tauriBridge'
import type { ReceiptFormValues } from '../types/receipt'

export type ReceiptOperationResult = ({ ok: true } & ReceiptMutationResult) | { ok: false; message: string }

const execute = async (operation: () => Promise<ReceiptMutationResult>): Promise<ReceiptOperationResult> => {
  try { return { ok: true, ...await operation() } }
  catch (error) { return { ok: false, message: repositoryError(error) } }
}

export const receiptAccountingService = {
  create: (values: ReceiptFormValues) => execute(() => receiptRepository.create(values)),
  update: (id: string, values: ReceiptFormValues) => execute(() => receiptRepository.update(id, values)),
  delete: (id: string, reason = '') => execute(() => receiptRepository.delete(id, reason)),
}
