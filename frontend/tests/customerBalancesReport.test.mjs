import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCustomerBalanceReportRows, formatReportBalance } from '../src/services/customerBalancesReport.ts'

const customer = (overrides) => ({
  id: 'customer-1',
  name: 'زبون اختبار',
  phone: '',
  notes: '',
  iqdBalance: 0,
  usdBalance: 0,
  lastPurchaseDate: null,
  lastPaymentDate: null,
  hasTransactionHistory: false,
  isArchived: false,
  createdAt: '2026-10-09T00:00:00Z',
  archivedAt: null,
  ...overrides,
})

test('formats positive, negative, zero, and separated currency balances', () => {
  assert.equal(formatReportBalance(1_250_000), 'عليه 1,250,000')
  assert.equal(formatReportBalance(-875.5), 'له 875.5')
  assert.equal(formatReportBalance(0), '0')

  assert.deepEqual(buildCustomerBalanceReportRows([
    customer({ iqdBalance: 2_000, usdBalance: -300 }),
  ])[0], {
    id: 'customer-1',
    name: 'زبون اختبار',
    iqdBalance: 'عليه 2,000',
    usdBalance: 'له 300',
  })
})

test('includes every active customer and excludes archived customers', () => {
  const customers = [
    customer({ id: 'active-zero' }),
    customer({ id: 'active-debt', iqdBalance: 10 }),
    customer({ id: 'archived', isArchived: true, archivedAt: '2026-10-09T00:00:00Z' }),
  ]
  assert.deepEqual(buildCustomerBalanceReportRows(customers).map((row) => row.id), ['active-zero', 'active-debt'])
  assert.deepEqual(buildCustomerBalanceReportRows([]), [])
})

test('filters debtors using positive IQD or USD balances without offsetting currencies', () => {
  const customers = [
    customer({ id: 'settled' }),
    customer({ id: 'iqd-debt', iqdBalance: 100 }),
    customer({ id: 'usd-debt', usdBalance: 25 }),
    customer({ id: 'mixed', iqdBalance: 50, usdBalance: -200 }),
    customer({ id: 'credit-only', iqdBalance: -10, usdBalance: -20 }),
    customer({ id: 'archived-debtor', iqdBalance: 500, isArchived: true, archivedAt: '2026-10-09T00:00:00Z' }),
  ]

  const rows = buildCustomerBalanceReportRows(customers, 'debtors')
  assert.deepEqual(rows.map((row) => row.id), ['iqd-debt', 'usd-debt', 'mixed'])
  assert.deepEqual(rows.find((row) => row.id === 'mixed'), {
    id: 'mixed',
    name: 'زبون اختبار',
    iqdBalance: 'عليه 50',
    usdBalance: 'له 200',
  })
})

test('returns an accurate empty result when no active customers owe the office', () => {
  const customers = [
    customer({ id: 'settled' }),
    customer({ id: 'credit', iqdBalance: -50 }),
    customer({ id: 'archived-debtor', usdBalance: 10, isArchived: true, archivedAt: '2026-10-09T00:00:00Z' }),
  ]
  assert.equal(buildCustomerBalanceReportRows(customers, 'debtors').length, 0)
})

test('keeps long active-customer lists complete for paginated rendering', () => {
  const customers = Array.from({ length: 120 }, (_, index) => customer({ id: `customer-${index}`, name: `زبون ${index + 1}` }))
  assert.equal(buildCustomerBalanceReportRows(customers).length, 120)
})
