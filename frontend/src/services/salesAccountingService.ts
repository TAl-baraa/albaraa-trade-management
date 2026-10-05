import { runLegacyOperation } from './legacyAccountingBridge'
import { customerRepository } from '../repositories/customerRepository'
import { productRepository } from '../repositories/productRepository'
import { saleRepository } from '../repositories/saleRepository'
import type { Customer } from '../types/customer'
import type { Sale, SaleFormValues } from '../types/sale'
import { CURRENT_ACTOR } from '../types/audit'
import { collectChanges, createHistoryEntry } from '../utils/audit'
import { isValidDateString } from '../utils/date'
import { calculateSaleTotal } from '../utils/money'

export type SalesOperationResult = { ok: true; sale?: Sale; sales: Sale[]; customers: Customer[] } | { ok: false; message: string }

const addMoney = (current: number, delta: number): number => (Math.round(current * 100) + Math.round(delta * 100)) / 100

const applyDebt = (customers: Customer[], customerId: string, currency: Sale['saleCurrency'], amount: number): Customer[] =>
  customers.map((customer) => customer.id !== customerId ? customer : {
    ...customer,
    iqdBalance: currency === 'IQD' ? addMoney(customer.iqdBalance, amount) : customer.iqdBalance,
    usdBalance: currency === 'USD' ? addMoney(customer.usdBalance, amount) : customer.usdBalance,
    hasTransactionHistory: true,
  })

const persistAccountingState = async (sales: Sale[], customers: Customer[], previousCustomers: Customer[]): Promise<void> => {
  const previousSales = saleRepository.getAll()
  saleRepository.saveAll(sales)
  try { await customerRepository.updateAccountingBalances(previousCustomers, customers) }
  catch (error) { saleRepository.saveAll(previousSales); throw error }
}

const buildSale = async (values: SaleFormValues, existing?: Sale): Promise<Sale | null> => {
  const customers = (await customerRepository.getAll())
  const products = (await productRepository.getAll())
  const customer = customers.find((item) => item.id === values.customerId && !item.isArchived)
  const product = products.find((item) => item.id === values.productId && !item.isArchived)
  const totalAmount = calculateSaleTotal(values.weightTons, values.unitSalePrice)
  if (!customer || !product || totalAmount === null || !values.driverName.trim() ||
    (values.saleCurrency !== 'IQD' && values.saleCurrency !== 'USD') || !isValidDateString(values.saleDate)) return null
  const now = new Date().toISOString()
  return {
    id: existing?.id ?? `sale-${crypto.randomUUID()}`,
    customerId: customer.id,
    customerNameSnapshot: customer.name,
    productId: product.id,
    productNameSnapshot: product.name,
    weightTons: Number(values.weightTons),
    driverName: values.driverName.trim(),
    unitSalePrice: Number(values.unitSalePrice),
    saleCurrency: values.saleCurrency,
    totalAmount,
    saleDate: values.saleDate,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    isReviewed: existing?.isReviewed ?? false,
    isDeleted: existing?.isDeleted ?? false,
    deletedAt: existing?.deletedAt ?? null,
    deletedBy: existing?.deletedBy ?? null,
    deletionReason: existing?.deletionReason ?? null,
    history: existing?.history ?? [],
  }
}

const operations = {
  async create(values: SaleFormValues): Promise<SalesOperationResult> {
    const previousCustomers = await customerRepository.getAll()
    const sale = await buildSale(values)
    if (!sale) return { ok: false, message: 'تعذر حفظ البيع لأن بيانات الزبون أو المنتج لم تعد متاحة.' }
    const created = { ...sale, history: [createHistoryEntry('created', [
      { field: 'اسم المشتري', previousValue: null, newValue: sale.customerNameSnapshot }, { field: 'المنتج', previousValue: null, newValue: sale.productNameSnapshot },
      { field: 'الوزن', previousValue: null, newValue: sale.weightTons }, { field: 'اسم السائق', previousValue: null, newValue: sale.driverName },
      { field: 'سعر بيع الطن', previousValue: null, newValue: sale.unitSalePrice }, { field: 'العملة', previousValue: null, newValue: sale.saleCurrency },
      { field: 'الإجمالي', previousValue: null, newValue: sale.totalAmount }, { field: 'التاريخ', previousValue: null, newValue: sale.saleDate },
    ])] }
    const sales = [created, ...saleRepository.getAll()]
    const customers = applyDebt(previousCustomers, sale.customerId, sale.saleCurrency, sale.totalAmount)
    await persistAccountingState(sales, customers, previousCustomers)
    return { ok: true, sale: created, sales, customers }
  },

  async update(saleId: string, values: SaleFormValues): Promise<SalesOperationResult> {
    const previousCustomers = await customerRepository.getAll()
    const currentSales = saleRepository.getAll()
    const original = currentSales.find((sale) => sale.id === saleId && !sale.isDeleted)
    if (!original) return { ok: false, message: 'تعذر العثور على سجل البيع المطلوب تعديله.' }
    const updated = await buildSale(values, original)
    if (!updated) return { ok: false, message: 'تعذر حفظ البيع لأن بيانات الزبون أو المنتج لم تعد متاحة.' }
    let customers = applyDebt(previousCustomers, original.customerId, original.saleCurrency, -original.totalAmount)
    customers = applyDebt(customers, updated.customerId, updated.saleCurrency, updated.totalAmount)
    const changes = collectChanges(original, updated, [
      { key: 'customerNameSnapshot', label: 'اسم المشتري' }, { key: 'productNameSnapshot', label: 'المنتج' },
      { key: 'weightTons', label: 'الوزن' }, { key: 'driverName', label: 'اسم السائق' },
      { key: 'unitSalePrice', label: 'سعر بيع الطن' }, { key: 'saleCurrency', label: 'العملة' },
      { key: 'totalAmount', label: 'الإجمالي' }, { key: 'saleDate', label: 'التاريخ' },
    ])
    const audited = { ...updated, history: [...original.history, createHistoryEntry('updated', changes)] }
    const sales = currentSales.map((sale) => sale.id === saleId ? audited : sale)
    await persistAccountingState(sales, customers, previousCustomers)
    return { ok: true, sale: audited, sales, customers }
  },

  async delete(saleId: string, reason = ''): Promise<SalesOperationResult> {
    const previousCustomers = await customerRepository.getAll()
    const currentSales = saleRepository.getAll()
    const original = currentSales.find((sale) => sale.id === saleId && !sale.isDeleted)
    if (!original) return { ok: false, message: 'تعذر العثور على سجل البيع المطلوب حذفه.' }
    if (!reason.trim()) return { ok: false, message: 'سبب الحذف مطلوب.' }
    const now = new Date().toISOString()
    const deleted: Sale = { ...original, isDeleted: true, deletedAt: now, deletedBy: CURRENT_ACTOR, deletionReason: reason.trim() || null, updatedAt: now, history: [...original.history, createHistoryEntry('deleted', reason.trim() ? [{ field: 'سبب الحذف', previousValue: null, newValue: reason.trim() }] : [])] }
    const sales = currentSales.map((sale) => sale.id === saleId ? deleted : sale)
    const customers = applyDebt(previousCustomers, original.customerId, original.saleCurrency, -original.totalAmount)
    await persistAccountingState(sales, customers, previousCustomers)
    return { ok: true, sales, customers }
  },

  async toggleReviewed(saleId: string): Promise<SalesOperationResult> {
    const previousCustomers = await customerRepository.getAll()
    const sales = saleRepository.getAll()
    const sale = sales.find((item) => item.id === saleId && !item.isDeleted)
    if (!sale) return { ok: false, message: 'تعذر العثور على سجل البيع.' }
    const updated = { ...sale, isReviewed: !sale.isReviewed, updatedAt: new Date().toISOString() }
    const nextSales = sales.map((item) => item.id === saleId ? updated : item)
    saleRepository.saveAll(nextSales)
    return { ok: true, sale: updated, sales: nextSales, customers: previousCustomers }
  },
}

export const salesAccountingService = {
  create: (values: SaleFormValues) => runLegacyOperation(() => operations.create(values)),
  update: (id: string, values: SaleFormValues) => runLegacyOperation(() => operations.update(id, values)),
  delete: (id: string, reason = '') => runLegacyOperation(() => operations.delete(id, reason)),
  toggleReviewed: (id: string) => runLegacyOperation(() => operations.toggleReviewed(id)),
}
