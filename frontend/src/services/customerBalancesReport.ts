import type { Customer } from '../types/customer.ts'
import { formatNumber } from '../utils/formatters.ts'

export interface CustomerBalanceReportRow {
  id: string
  name: string
  iqdBalance: string
  usdBalance: string
}

export interface CustomerDebtSummary {
  owedToOfficeIqd: number
  owedToOfficeUsd: number
  owedByOfficeIqd: number
  owedByOfficeUsd: number
}

export type CustomerBalanceReportFilter = 'all' | 'debtors'

export const formatReportBalance = (balance: number): string => {
  if (balance === 0) return '0'
  return `${balance > 0 ? 'عليه' : 'له'} ${formatNumber(Math.abs(balance))}`
}

export const getCustomerBalanceReportCustomers = (customers: Customer[], filter: CustomerBalanceReportFilter = 'all'): Customer[] =>
  customers.filter((customer) => !customer.isArchived && (filter === 'all' || customer.iqdBalance > 0 || customer.usdBalance > 0))

export const calculateCustomerDebtSummary = (customers: Customer[]): CustomerDebtSummary =>
  customers.reduce<CustomerDebtSummary>((summary, customer) => ({
    owedToOfficeIqd: summary.owedToOfficeIqd + Math.max(customer.iqdBalance, 0),
    owedToOfficeUsd: summary.owedToOfficeUsd + Math.max(customer.usdBalance, 0),
    owedByOfficeIqd: summary.owedByOfficeIqd + Math.max(-customer.iqdBalance, 0),
    owedByOfficeUsd: summary.owedByOfficeUsd + Math.max(-customer.usdBalance, 0),
  }), {
    owedToOfficeIqd: 0,
    owedToOfficeUsd: 0,
    owedByOfficeIqd: 0,
    owedByOfficeUsd: 0,
  })

export const buildCustomerBalanceReportRows = (customers: Customer[], filter: CustomerBalanceReportFilter = 'all'): CustomerBalanceReportRow[] =>
  getCustomerBalanceReportCustomers(customers, filter)
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      iqdBalance: formatReportBalance(customer.iqdBalance),
      usdBalance: formatReportBalance(customer.usdBalance),
    }))
