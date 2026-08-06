import type { Currency } from '../types/product'
import type { Receipt } from '../types/receipt'
import type { Sale } from '../types/sale'

export type StatementTransaction =
  | { kind: 'sale'; id: string; date: string; createdAt: string; amount: number; record: Sale }
  | { kind: 'receipt'; id: string; date: string; createdAt: string; amount: number; record: Receipt }

export interface StatementSection {
  id: string
  openingDebt: number
  sales: Extract<StatementTransaction, { kind: 'sale' }>[]
  salesTotal: number
  openingCredit: number
  carriedCustomerCredit: { kind: 'carried-customer-credit'; amount: number; calculated: true } | null
  receipts: Extract<StatementTransaction, { kind: 'receipt' }>[]
  balance: number
}

export interface CustomerStatement {
  currency: Currency
  startDate: string | null
  endDate: string | null
  openingBalance: number
  openingBalanceDate: string | null
  dateRangeOpening: { kind: 'opening-debt' | 'opening-credit'; amount: number; date: string; calculated: true } | null
  sections: StatementSection[]
  transactions: StatementTransaction[]
  finalBalance: number
}

export interface StatementBalancePresentationRow {
  kind: 'remaining-debt' | 'customer-credit'
  label: 'الباقي عليه' | 'الباقي رصيد له'
  amount: number
  displayZero: boolean
  tone: 'black' | 'red'
}

export const buildStatementBalancePresentation = (balance: number): StatementBalancePresentationRow[] => {
  if (balance > 0) return [{ kind: 'remaining-debt', label: 'الباقي عليه', amount: balance, displayZero: false, tone: 'black' }]
  if (balance === 0) return [{ kind: 'remaining-debt', label: 'الباقي عليه', amount: 0, displayZero: true, tone: 'black' }]
  return [
    { kind: 'remaining-debt', label: 'الباقي عليه', amount: 0, displayZero: true, tone: 'black' },
    { kind: 'customer-credit', label: 'الباقي رصيد له', amount: Math.abs(balance), displayZero: false, tone: 'red' },
  ]
}

const cents = (value: number): number => Math.round(value * 100)
const money = (valueInCents: number): number => valueInCents / 100

const compareTransactions = (left: StatementTransaction, right: StatementTransaction): number => {
  const date = left.date.localeCompare(right.date)
  if (date !== 0) return date
  if (left.kind !== right.kind) return left.kind === 'sale' ? -1 : 1
  const time = left.createdAt.localeCompare(right.createdAt)
  return time !== 0 ? time : left.id.localeCompare(right.id)
}

export const buildCustomerStatement = (input: {
  customerId: string
  currency: Currency
  sales: Sale[]
  receipts: Receipt[]
  initialBalance?: number
  startDate?: string | null
  endDate?: string | null
}): CustomerStatement => {
  const { customerId, currency, startDate = null, endDate = null } = input
  const transactions: StatementTransaction[] = [
    ...input.sales.filter((sale) => !sale.isDeleted && sale.customerId === customerId && sale.saleCurrency === currency).map((record) => ({ kind: 'sale' as const, id: record.id, date: record.saleDate, createdAt: record.createdAt || '', amount: record.totalAmount, record })),
    ...input.receipts.filter((receipt) => !receipt.isDeleted && receipt.customerId === customerId && receipt.currency === currency).map((record) => ({ kind: 'receipt' as const, id: record.id, date: record.businessDate, createdAt: record.createdAt || '', amount: record.amount, record })),
  ].sort(compareTransactions)
  const before = startDate ? transactions.filter((transaction) => transaction.date < startDate) : []
  const openingCents = before.reduce((balance, transaction) => balance + (transaction.kind === 'sale' ? cents(transaction.amount) : -cents(transaction.amount)), cents(input.initialBalance ?? 0))
  const period = transactions.filter((transaction) => (!startDate || transaction.date >= startDate) && (!endDate || transaction.date <= endDate))
  const sections: StatementSection[] = []
  let runningCents = openingCents
  let pendingSales: Extract<StatementTransaction, { kind: 'sale' }>[] = []
  let pendingReceipts: Extract<StatementTransaction, { kind: 'receipt' }>[] = []
  const flush = () => {
    if (pendingSales.length === 0 && pendingReceipts.length === 0) return
    const openingDebt = Math.max(runningCents, 0)
    const openingCredit = Math.max(-runningCents, 0)
    const salesCents = pendingSales.reduce((sum, sale) => sum + cents(sale.amount), 0)
    const receiptsCents = pendingReceipts.reduce((sum, receipt) => sum + cents(receipt.amount), 0)
    runningCents += salesCents - receiptsCents
    sections.push({ id: `section-${sections.length + 1}`, openingDebt: money(openingDebt), sales: pendingSales, salesTotal: money(openingDebt + salesCents), openingCredit: money(openingCredit), carriedCustomerCredit: openingCredit > 0 ? { kind: 'carried-customer-credit', amount: money(openingCredit), calculated: true } : null, receipts: pendingReceipts, balance: money(runningCents) })
    pendingSales = []
    pendingReceipts = []
  }
  for (const transaction of period) {
    if (transaction.kind === 'sale') {
      if (pendingReceipts.length > 0) flush()
      pendingSales.push(transaction)
    } else pendingReceipts.push(transaction)
  }
  flush()
  if (sections.length === 0 && openingCents !== 0) {
    const openingCredit = Math.max(-openingCents, 0)
    sections.push({ id: 'section-1', openingDebt: money(Math.max(openingCents, 0)), sales: [], salesTotal: money(Math.max(openingCents, 0)), openingCredit: money(openingCredit), carriedCustomerCredit: openingCredit > 0 ? { kind: 'carried-customer-credit', amount: money(openingCredit), calculated: true } : null, receipts: [], balance: money(openingCents) })
  }
  const openingBalanceDate = before.at(-1)?.date ?? null
  const openingBalance = money(openingCents)
  const dateRangeOpening = startDate && openingBalanceDate && openingBalance !== 0
    ? { kind: openingBalance > 0 ? 'opening-debt' as const : 'opening-credit' as const, amount: Math.abs(openingBalance), date: openingBalanceDate, calculated: true as const }
    : null
  return { currency, startDate, endDate, openingBalance, openingBalanceDate, dateRangeOpening, sections, transactions: period, finalBalance: money(runningCents) }
}

export const deriveInitialBalance = (currentBalance: number, customerId: string, currency: Currency, sales: Sale[], receipts: Receipt[]): number => {
  const transactionNet = buildCustomerStatement({ customerId, currency, sales, receipts }).finalBalance
  return money(cents(currentBalance) - cents(transactionNet))
}
