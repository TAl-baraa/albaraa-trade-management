import type { Customer } from '../types/customer'
import type { Receipt, ReceiptFormValues } from '../types/receipt'
import { databaseCommand } from './tauriBridge'

export interface ReceiptMutationResult {
  receipt?: Receipt
  receipts: Receipt[]
  customers: Customer[]
}

export const receiptRepository = {
  getAll: (): Promise<Receipt[]> => databaseCommand('list_receipts'),
  getByBusinessDate: (businessDate: string): Promise<Receipt[]> => databaseCommand('list_receipts_by_business_date', { businessDate }),
  getById: (id: string): Promise<Receipt | null> => databaseCommand('get_receipt', { id }),
  create: (input: ReceiptFormValues): Promise<ReceiptMutationResult> => databaseCommand('create_receipt', { input }),
  update: (id: string, input: ReceiptFormValues): Promise<ReceiptMutationResult> => databaseCommand('update_receipt', { id, input }),
  delete: (id: string, reason: string): Promise<ReceiptMutationResult> => databaseCommand('soft_delete_receipt', { id, reason }),
}
