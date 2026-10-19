import type { Customer } from '../types/customer'
import type { Currency } from '../types/product'
import type { Receipt } from '../types/receipt'
import type { Sale } from '../types/sale'
import type { Transfer } from '../types/transfer'
import { buildCustomerStatement, deriveInitialBalance, type CustomerStatement } from './customerStatementService.ts'

export interface StatementExportQueueItem {
  key: string
  customer: Customer
  currency: Currency
  statement: CustomerStatement
}

export interface StatementExportFailure {
  key: string
  customerName: string
  currency: Currency
  reason: string
}

export interface StatementExportResult {
  folderPath: string
  successful: number
  skipped: number
  failures: StatementExportFailure[]
  finalizationError: string | null
}

interface BatchDescriptor { batchId: string; folderPath: string }

interface StatementExportOperations {
  createBatch: () => Promise<BatchDescriptor>
  prepare: (item: StatementExportQueueItem) => Promise<void>
  exportPdf: (batchId: string, item: StatementExportQueueItem) => Promise<void>
  finishBatch: (batchId: string) => Promise<BatchDescriptor>
  onBatchCreated?: (batch: BatchDescriptor) => void
  onProgress?: (completed: number, item: StatementExportQueueItem, successful: number, failed: number) => void
}

export const validateStatementDateRange = (startDate: string, endDate: string): string | null =>
  startDate && endDate && startDate > endDate ? 'يجب ألا يكون تاريخ البداية بعد تاريخ النهاية.' : null

export const toggleCustomerSelection = (selectedIds: ReadonlySet<string>, customerId: string, selected: boolean): Set<string> => {
  const next = new Set(selectedIds)
  if (selected) next.add(customerId)
  else next.delete(customerId)
  return next
}

export const selectAllActiveCustomers = (customers: Customer[], selected: boolean): Set<string> =>
  selected ? new Set(customers.filter((customer) => !customer.isArchived).map((customer) => customer.id)) : new Set()

export const buildStatementExportQueue = (input: {
  customers: Customer[]
  selectedCustomerIds: ReadonlySet<string>
  sales: Sale[]
  receipts: Receipt[]
  transfers: Transfer[]
  startDate: string | null
  endDate: string | null
}): { queue: StatementExportQueueItem[]; skipped: number } => {
  const selectedCustomers = input.customers.filter((customer) => !customer.isArchived && input.selectedCustomerIds.has(customer.id))
  const queue: StatementExportQueueItem[] = []
  for (const customer of selectedCustomers) {
    for (const currency of ['IQD', 'USD'] as const) {
      const currentBalance = currency === 'IQD' ? customer.iqdBalance : customer.usdBalance
      const initialBalance = deriveInitialBalance(currentBalance, customer.id, currency, input.sales, input.receipts, input.transfers)
      const statement = buildCustomerStatement({ customerId: customer.id, currency, sales: input.sales, receipts: input.receipts, transfers: input.transfers, initialBalance, startDate: input.startDate, endDate: input.endDate })
      if (statement.transactions.length > 0 || statement.openingBalance !== 0 || statement.finalBalance !== 0) {
        queue.push({ key: `${customer.id}-${currency}`, customer, currency, statement })
      }
    }
  }
  return { queue, skipped: selectedCustomers.length * 2 - queue.length }
}

const errorMessage = (reason: unknown): string => reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'حدث خطأ غير متوقع.'

export const runStatementExportQueue = async (queue: StatementExportQueueItem[], skipped: number, operations: StatementExportOperations): Promise<StatementExportResult> => {
  const batch = await operations.createBatch()
  operations.onBatchCreated?.(batch)
  let folderPath = batch.folderPath
  let successful = 0
  const failures: StatementExportFailure[] = []
  let finalizationError: string | null = null
  try {
    for (const [index, item] of queue.entries()) {
      operations.onProgress?.(index, item, successful, failures.length)
      try {
        await operations.prepare(item)
        await operations.exportPdf(batch.batchId, item)
        successful++
      } catch (reason) {
        failures.push({ key: item.key, customerName: item.customer.name, currency: item.currency, reason: errorMessage(reason) })
      }
      operations.onProgress?.(index + 1, item, successful, failures.length)
    }
  } finally {
    try {
      const finished = await operations.finishBatch(batch.batchId)
      folderPath = finished.folderPath
    } catch (reason) {
      finalizationError = errorMessage(reason)
    }
  }
  return { folderPath, successful, skipped, failures, finalizationError }
}
