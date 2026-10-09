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

test('keeps long active-customer lists complete for paginated rendering', () => {
  const customers = Array.from({ length: 120 }, (_, index) => customer({ id: `customer-${index}`, name: `زبون ${index + 1}` }))
  assert.equal(buildCustomerBalanceReportRows(customers).length, 120)
})
