import type { Customer } from '../types/customer.ts'
import { formatNumber } from '../utils/formatters.ts'

export interface CustomerBalanceReportRow {
  id: string
  name: string
  iqdBalance: string
  usdBalance: string
}

export const formatReportBalance = (balance: number): string => {
  if (balance === 0) return '0'
  return `${balance > 0 ? 'عليه' : 'له'} ${formatNumber(Math.abs(balance))}`
}

export const buildCustomerBalanceReportRows = (customers: Customer[]): CustomerBalanceReportRow[] =>
  customers
    .filter((customer) => !customer.isArchived)
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      iqdBalance: formatReportBalance(customer.iqdBalance),
      usdBalance: formatReportBalance(customer.usdBalance),
    }))
