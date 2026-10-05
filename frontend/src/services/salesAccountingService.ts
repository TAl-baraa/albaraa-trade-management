import { saleRepository, type SaleMutationResult } from '../repositories/saleRepository'
import { repositoryError } from '../repositories/tauriBridge'
import type { SaleFormValues } from '../types/sale'

export type SalesOperationResult = ({ ok: true } & SaleMutationResult) | { ok: false; message: string }

const execute = async (operation: () => Promise<SaleMutationResult>): Promise<SalesOperationResult> => {
  try { return { ok: true, ...await operation() } }
  catch (error) { return { ok: false, message: repositoryError(error) } }
}

export const salesAccountingService = {
  create: (values: SaleFormValues) => execute(() => saleRepository.create(values)),
  update: (id: string, values: SaleFormValues) => execute(() => saleRepository.update(id, values)),
  delete: (id: string, reason = '') => execute(() => saleRepository.delete(id, reason)),
  toggleReviewed: (id: string) => execute(() => saleRepository.toggleReviewed(id)),
}
