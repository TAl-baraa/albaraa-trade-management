import { runLegacyOperation } from './legacyAccountingBridge'
import { customerRepository } from '../repositories/customerRepository'
import { receiptRepository } from '../repositories/receiptRepository'
import { CURRENT_ACTOR } from '../types/audit'
import type { Customer } from '../types/customer'
import type { Receipt, ReceiptFormValues } from '../types/receipt'
import { collectChanges, createHistoryEntry } from '../utils/audit'
import { isValidDateString } from '../utils/date'
import { calculateSaleTotal, isPositiveDecimal } from '../utils/money'

export type ReceiptOperationResult = { ok: true; receipt?: Receipt; receipts: Receipt[]; customers: Customer[] } | { ok: false; message: string }
const addMoney = (current: number, delta: number): number => (Math.round(current * 100) + Math.round(delta * 100)) / 100
const applyReceipt = (customers: Customer[], customerId: string, currency: Receipt['currency'], amount: number): Customer[] => customers.map((customer) => customer.id !== customerId ? customer : { ...customer, iqdBalance: currency === 'IQD' ? addMoney(customer.iqdBalance, -amount) : customer.iqdBalance, usdBalance: currency === 'USD' ? addMoney(customer.usdBalance, -amount) : customer.usdBalance, hasTransactionHistory: true })
const buildReceipt = async (values: ReceiptFormValues, existing?: Receipt): Promise<Receipt | null> => {
  const customer = (await customerRepository.getAll()).find((item) => item.id === values.customerId && !item.isArchived)
  if (!customer || !isPositiveDecimal(values.amount) || !isValidDateString(values.businessDate) || (values.currency !== 'IQD' && values.currency !== 'USD')) return null
  const amount = calculateSaleTotal(values.amount, '1')
  if (amount === null) return null
  const now = new Date().toISOString()
  return { id: existing?.id ?? `receipt-${crypto.randomUUID()}`, customerId: customer.id, customerNameSnapshot: customer.name, amount, currency: values.currency, businessDate: values.businessDate, notes: values.notes.trim(), createdAt: existing?.createdAt ?? now, updatedAt: now, isDeleted: existing?.isDeleted ?? false, deletedAt: existing?.deletedAt ?? null, deletedBy: existing?.deletedBy ?? null, deletionReason: existing?.deletionReason ?? null, history: existing?.history ?? [] }
}
const persist = async (receipts: Receipt[], customers: Customer[], previousCustomers: Customer[]): Promise<void> => {
  const previousReceipts = receiptRepository.getAll()
  receiptRepository.saveAll(receipts)
  try { await customerRepository.updateAccountingBalances(previousCustomers, customers) }
  catch (error) { receiptRepository.saveAll(previousReceipts); throw error }
}

const operations = {
  async create(values: ReceiptFormValues): Promise<ReceiptOperationResult> {
    const previousCustomers = await customerRepository.getAll()
    const receipt = await buildReceipt(values)
    if (!receipt) return { ok: false, message: 'تعذر حفظ الواصل. تحقق من البيانات المختارة.' }
    const created = { ...receipt, history: [createHistoryEntry('created', [
      { field: 'اسم الزبون', previousValue: null, newValue: receipt.customerNameSnapshot }, { field: 'المبلغ', previousValue: null, newValue: receipt.amount },
      { field: 'العملة', previousValue: null, newValue: receipt.currency }, { field: 'التاريخ', previousValue: null, newValue: receipt.businessDate },
      { field: 'ملاحظات', previousValue: null, newValue: receipt.notes },
    ])] }
    const receipts = [created, ...receiptRepository.getAll()]
    const customers = applyReceipt(previousCustomers, created.customerId, created.currency, created.amount)
    await persist(receipts, customers, previousCustomers)
    return { ok: true, receipt: created, receipts, customers }
  },
  async update(receiptId: string, values: ReceiptFormValues): Promise<ReceiptOperationResult> {
    const previousCustomers = await customerRepository.getAll()
    const current = receiptRepository.getAll(); const original = current.find((item) => item.id === receiptId && !item.isDeleted)
    if (!original) return { ok: false, message: 'تعذر العثور على الواصل المطلوب.' }
    const updated = await buildReceipt(values, original)
    if (!updated) return { ok: false, message: 'تعذر حفظ الواصل. تحقق من البيانات المختارة.' }
    let customers = applyReceipt(previousCustomers, original.customerId, original.currency, -original.amount)
    customers = applyReceipt(customers, updated.customerId, updated.currency, updated.amount)
    const changes = collectChanges(original, updated, [{ key: 'customerNameSnapshot', label: 'اسم الزبون' }, { key: 'amount', label: 'المبلغ' }, { key: 'currency', label: 'العملة' }, { key: 'businessDate', label: 'التاريخ' }, { key: 'notes', label: 'ملاحظات' }])
    const audited = { ...updated, history: [...original.history, createHistoryEntry('updated', changes)] }
    const receipts = current.map((item) => item.id === receiptId ? audited : item)
    await persist(receipts, customers, previousCustomers)
    return { ok: true, receipt: audited, receipts, customers }
  },
  async delete(receiptId: string, reason = ''): Promise<ReceiptOperationResult> {
    const previousCustomers = await customerRepository.getAll()
    const current = receiptRepository.getAll(); const original = current.find((item) => item.id === receiptId && !item.isDeleted)
    if (!original) return { ok: false, message: 'تعذر العثور على الواصل المطلوب.' }
    if (!reason.trim()) return { ok: false, message: 'سبب الحذف مطلوب.' }
    const now = new Date().toISOString(); const normalizedReason = reason.trim()
    const deleted: Receipt = { ...original, isDeleted: true, deletedAt: now, deletedBy: CURRENT_ACTOR, deletionReason: normalizedReason || null, updatedAt: now, history: [...original.history, createHistoryEntry('deleted', normalizedReason ? [{ field: 'سبب الحذف', previousValue: null, newValue: normalizedReason }] : [])] }
    const receipts = current.map((item) => item.id === receiptId ? deleted : item)
    const customers = applyReceipt(previousCustomers, original.customerId, original.currency, -original.amount)
    await persist(receipts, customers, previousCustomers)
    return { ok: true, receipts, customers }
  },
}

export const receiptAccountingService = {
  create: (values: ReceiptFormValues) => runLegacyOperation(() => operations.create(values)),
  update: (id: string, values: ReceiptFormValues) => runLegacyOperation(() => operations.update(id, values)),
  delete: (id: string, reason = '') => runLegacyOperation(() => operations.delete(id, reason)),

}
