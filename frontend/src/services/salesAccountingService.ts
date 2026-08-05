import { customerAccountRepository } from '../repositories/customerAccountRepository'
import { customerRepository } from '../repositories/customerRepository'
import { productRepository } from '../repositories/productRepository'
import { saleRepository } from '../repositories/saleRepository'
import type { Customer } from '../types/customer'
import type { CustomerAccountTransaction } from '../types/customerAccountTransaction'
import type { Sale, SaleFormValues } from '../types/sale'
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

const transactionFromSale = (sale: Sale, existing?: CustomerAccountTransaction): CustomerAccountTransaction => ({
  id: existing?.id ?? `account-transaction-${crypto.randomUUID()}`,
  customerId: sale.customerId,
  type: 'sale',
  saleId: sale.id,
  productNameSnapshot: sale.productNameSnapshot,
  weightTons: sale.weightTons,
  unitSalePrice: sale.unitSalePrice,
  currency: sale.saleCurrency,
  totalAmount: sale.totalAmount,
  driverName: sale.driverName,
  transactionDate: sale.saleDate,
  createdAt: existing?.createdAt ?? sale.createdAt,
  updatedAt: sale.updatedAt,
})

const persistAccountingState = (sales: Sale[], customers: Customer[], transactions: CustomerAccountTransaction[]): void => {
  saleRepository.saveAll(sales)
  customerRepository.saveAll(customers)
  customerAccountRepository.saveAll(transactions)
}

const buildSale = (values: SaleFormValues, existing?: Sale): Sale | null => {
  const customers = customerRepository.getAll()
  const products = productRepository.getAll()
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
  }
}

export const salesAccountingService = {
  create(values: SaleFormValues): SalesOperationResult {
    const sale = buildSale(values)
    if (!sale) return { ok: false, message: 'تعذر حفظ البيع لأن بيانات الزبون أو المنتج لم تعد متاحة.' }
    const sales = [sale, ...saleRepository.getAll()]
    const customers = applyDebt(customerRepository.getAll(), sale.customerId, sale.saleCurrency, sale.totalAmount)
    const transactions = [transactionFromSale(sale), ...customerAccountRepository.getAll()]
    persistAccountingState(sales, customers, transactions)
    return { ok: true, sale, sales, customers }
  },

  update(saleId: string, values: SaleFormValues): SalesOperationResult {
    const currentSales = saleRepository.getAll()
    const original = currentSales.find((sale) => sale.id === saleId)
    if (!original) return { ok: false, message: 'تعذر العثور على سجل البيع المطلوب تعديله.' }
    const updated = buildSale(values, original)
    if (!updated) return { ok: false, message: 'تعذر حفظ البيع لأن بيانات الزبون أو المنتج لم تعد متاحة.' }
    const originalTransaction = customerAccountRepository.getAll().find((transaction) => transaction.saleId === original.id)
    if (!originalTransaction) return { ok: false, message: 'تعذر تعديل البيع لعدم وجود قيد الحساب المرتبط به.' }
    let customers = applyDebt(customerRepository.getAll(), original.customerId, original.saleCurrency, -original.totalAmount)
    customers = applyDebt(customers, updated.customerId, updated.saleCurrency, updated.totalAmount)
    const sales = currentSales.map((sale) => sale.id === saleId ? updated : sale)
    const transactions = customerAccountRepository.getAll().map((transaction) => transaction.saleId === saleId ? transactionFromSale(updated, transaction) : transaction)
    persistAccountingState(sales, customers, transactions)
    return { ok: true, sale: updated, sales, customers }
  },

  delete(saleId: string): SalesOperationResult {
    const currentSales = saleRepository.getAll()
    const original = currentSales.find((sale) => sale.id === saleId)
    if (!original) return { ok: false, message: 'تعذر العثور على سجل البيع المطلوب حذفه.' }
    const transactions = customerAccountRepository.getAll()
    if (!transactions.some((transaction) => transaction.saleId === saleId)) return { ok: false, message: 'تعذر حذف البيع لعدم وجود قيد الحساب المرتبط به.' }
    const sales = currentSales.filter((sale) => sale.id !== saleId)
    const customers = applyDebt(customerRepository.getAll(), original.customerId, original.saleCurrency, -original.totalAmount)
    const remainingTransactions = transactions.filter((transaction) => transaction.saleId !== saleId)
    persistAccountingState(sales, customers, remainingTransactions)
    return { ok: true, sales, customers }
  },
}
