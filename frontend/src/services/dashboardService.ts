import type { Customer } from '../types/customer'
import type { Currency } from '../types/product'
import type { Receipt } from '../types/receipt'
import type { Sale } from '../types/sale'

export interface CurrencyTotals { IQD: number; USD: number }
export interface DailyTotals { count: number; totals: CurrencyTotals }
export interface DashboardSummary {
  today: string
  sales: DailyTotals
  receipts: DailyTotals
  activeCustomers: number
  archivedCustomers: number
  debt: CurrencyTotals
  credit: CurrencyTotals
  recentSales: Sale[]
  recentReceipts: Receipt[]
  highDebtCustomers: Record<Currency, Customer[]>
}

const sumMoney = (amounts: readonly number[]): number =>
  amounts.reduce((total, amount) => total + Math.round(amount * 100), 0) / 100

const compareRecent = (leftDate: string, rightDate: string, left: { createdAt: string; id: string }, right: { createdAt: string; id: string }): number =>
  rightDate.localeCompare(leftDate) || right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id)

export function buildDashboardSummary(customers: readonly Customer[], sales: readonly Sale[], receipts: readonly Receipt[], today: string): DashboardSummary {
  const activeSales = sales.filter((sale) => !sale.isDeleted)
  const activeReceipts = receipts.filter((receipt) => !receipt.isDeleted)
  const dailySales = activeSales.filter((sale) => sale.saleDate === today)
  const dailyReceipts = activeReceipts.filter((receipt) => receipt.businessDate === today)
  const activeCustomers = customers.filter((customer) => !customer.isArchived)
  const debtFor = (currency: Currency): number => sumMoney(customers.map((customer) => Math.max(currency === 'IQD' ? customer.iqdBalance : customer.usdBalance, 0)))
  const creditFor = (currency: Currency): number => sumMoney(customers.map((customer) => Math.max(-(currency === 'IQD' ? customer.iqdBalance : customer.usdBalance), 0)))
  const highestDebt = (currency: Currency): Customer[] => {
    const balance = (customer: Customer): number => currency === 'IQD' ? customer.iqdBalance : customer.usdBalance
    return activeCustomers.filter((customer) => balance(customer) > 0)
      .sort((left, right) => balance(right) - balance(left) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id)).slice(0, 5)
  }
  return {
    today,
    sales: { count: dailySales.length, totals: {
      IQD: sumMoney(dailySales.filter((sale) => sale.saleCurrency === 'IQD').map((sale) => sale.totalAmount)),
      USD: sumMoney(dailySales.filter((sale) => sale.saleCurrency === 'USD').map((sale) => sale.totalAmount)),
    } },
    receipts: { count: dailyReceipts.length, totals: {
      IQD: sumMoney(dailyReceipts.filter((receipt) => receipt.currency === 'IQD').map((receipt) => receipt.amount)),
      USD: sumMoney(dailyReceipts.filter((receipt) => receipt.currency === 'USD').map((receipt) => receipt.amount)),
    } },
    activeCustomers: activeCustomers.length,
    archivedCustomers: customers.length - activeCustomers.length,
    debt: { IQD: debtFor('IQD'), USD: debtFor('USD') },
    credit: { IQD: creditFor('IQD'), USD: creditFor('USD') },
    recentSales: activeSales.sort((left, right) => compareRecent(left.saleDate, right.saleDate, left, right)).slice(0, 5),
    recentReceipts: activeReceipts.sort((left, right) => compareRecent(left.businessDate, right.businessDate, left, right)).slice(0, 5),
    highDebtCustomers: { IQD: highestDebt('IQD'), USD: highestDebt('USD') },
  }
}
