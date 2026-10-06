import type { Customer } from '../types/customer'
import type { Transfer, TransferFormValues } from '../types/transfer'
import { databaseCommand } from './tauriBridge'

export interface TransferMutationResult {
  transfer?: Transfer
  transfers: Transfer[]
  customers: Customer[]
}

export const transferRepository = {
  getAll: (): Promise<Transfer[]> => databaseCommand('list_transfers'),
  getByBusinessDate: (businessDate: string): Promise<Transfer[]> => databaseCommand('list_transfers_by_business_date', { businessDate }),
  getById: (id: string): Promise<Transfer | null> => databaseCommand('get_transfer', { id }),
  create: (input: TransferFormValues): Promise<TransferMutationResult> => databaseCommand('create_transfer', { input }),
  update: (id: string, input: TransferFormValues): Promise<TransferMutationResult> => databaseCommand('update_transfer', { id, input }),
  delete: (id: string, reason: string): Promise<TransferMutationResult> => databaseCommand('soft_delete_transfer', { id, reason }),
}
