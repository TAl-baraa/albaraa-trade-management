import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStatementExportQueue, runStatementExportQueue, selectAllActiveCustomers, toggleCustomerSelection, validateStatementDateRange } from '../src/services/customerStatementBatchExport.ts'

const customer = (id, overrides = {}) => ({ id, name: `زبون ${id}`, phone: '', notes: '', iqdBalance: 0, usdBalance: 0, lastPurchaseDate: null, lastPaymentDate: null, hasTransactionHistory: false, isArchived: false, createdAt: '2026-01-01T00:00:00Z', archivedAt: null, ...overrides })
const deletion = { isDeleted: false, deletedAt: null, deletedBy: null, deletionReason: null }
const sale = (id, customerId, currency, amount, date, overrides = {}) => ({ ...deletion, id, customerId, customerNameSnapshot: customerId, productId: 'p', productNameSnapshot: 'مادة', weightTons: 1, driverName: 'سائق', unitSalePrice: amount, saleCurrency: currency, totalAmount: amount, saleDate: date, createdAt: `${date}T00:00:00Z`, updatedAt: `${date}T00:00:00Z`, isReviewed: false, history: [], ...overrides })
const receipt = (id, customerId, currency, amount, date, overrides = {}) => ({ ...deletion, id, customerId, customerNameSnapshot: customerId, amount, currency, businessDate: date, notes: '', createdAt: `${date}T01:00:00Z`, updatedAt: `${date}T01:00:00Z`, history: [], ...overrides })

test('starts with no selection and supports individual and active-only select all behavior', () => {
  let selected = new Set()
  assert.equal(selected.size, 0)
  selected = toggleCustomerSelection(selected, 'one', true)
  assert.deepEqual([...selected], ['one'])
  selected = toggleCustomerSelection(selected, 'one', false)
  assert.equal(selected.size, 0)
  selected = selectAllActiveCustomers([customer('one'), customer('archived', { isArchived: true })], true)
  assert.deepEqual([...selected], ['one'])
  assert.equal(selectAllActiveCustomers([], false).size, 0)
})

test('validates bounded ranges while allowing complete and open-ended ranges', () => {
  assert.equal(validateStatementDateRange('', ''), null)
  assert.equal(validateStatementDateRange('2026-01-01', ''), null)
  assert.equal(validateStatementDateRange('', '2026-01-31'), null)
  assert.equal(validateStatementDateRange('2026-02-01', '2026-01-31'), 'يجب ألا يكون تاريخ البداية بعد تاريخ النهاية.')
})

test('builds independent IQD and USD eligibility and excludes archived customers', () => {
  const customers = [customer('one', { iqdBalance: 100, usdBalance: 25 }), customer('archived', { iqdBalance: 500, isArchived: true })]
  const result = buildStatementExportQueue({ customers, selectedCustomerIds: new Set(['one', 'archived']), sales: [sale('iqd', 'one', 'IQD', 100, '2026-01-10'), sale('usd', 'one', 'USD', 25, '2026-01-11')], receipts: [], transfers: [], startDate: null, endDate: null })
  assert.deepEqual(result.queue.map((item) => item.key), ['one-IQD', 'one-USD'])
  assert.equal(result.skipped, 0)
})

test('includes opening debt or credit, period-ending balances, and transactions settled to zero', () => {
  const customers = [customer('opening', { iqdBalance: 100 }), customer('settled'), customer('credit', { iqdBalance: -30 })]
  const result = buildStatementExportQueue({
    customers,
    selectedCustomerIds: new Set(['opening', 'settled', 'credit']),
    sales: [sale('old', 'opening', 'IQD', 100, '2026-01-01'), sale('debit', 'settled', 'USD', 50, '2026-02-02')],
    receipts: [receipt('payment', 'settled', 'USD', 50, '2026-02-03'), receipt('old-credit', 'credit', 'IQD', 30, '2026-01-02')],
    transfers: [],
    startDate: '2026-02-01',
    endDate: '2026-02-28',
  })
  assert.deepEqual(result.queue.map((item) => item.key), ['opening-IQD', 'settled-USD', 'credit-IQD'])
  assert.equal(result.queue.find((item) => item.key === 'opening-IQD').statement.openingBalance, 100)
  assert.equal(result.queue.find((item) => item.key === 'settled-USD').statement.finalBalance, 0)
  assert.equal(result.queue.find((item) => item.key === 'credit-IQD').statement.openingBalance, -30)
  assert.equal(result.skipped, 3)
})

test('skips empty currencies and ignores soft-deleted and out-of-range transactions', () => {
  const result = buildStatementExportQueue({
    customers: [customer('one', { usdBalance: 20 })],
    selectedCustomerIds: new Set(['one']),
    sales: [sale('deleted', 'one', 'IQD', 10, '2026-02-10', { isDeleted: true }), sale('future', 'one', 'USD', 20, '2026-04-01')],
    receipts: [],
    transfers: [],
    startDate: '2026-02-01',
    endDate: '2026-02-28',
  })
  assert.equal(result.queue.length, 0)
  assert.equal(result.skipped, 2)
})

test('exports sequentially, continues after failure, and finalizes the batch', async () => {
  const baseCustomer = customer('one')
  const items = ['IQD', 'USD', 'IQD'].map((currency, index) => ({ key: `item-${index}`, customer: { ...baseCustomer, name: `زبون ${index}` }, currency, statement: {} }))
  const events = []
  const result = await runStatementExportQueue(items, 1, {
    createBatch: async () => { events.push('create'); return { batchId: 'batch', folderPath: 'folder' } },
    onBatchCreated: () => { events.push('batch-created') },
    prepare: async (item) => { events.push(`prepare:${item.key}`) },
    exportPdf: async (_batchId, item) => { events.push(`export:${item.key}`); if (item.key === 'item-1') throw new Error('فشل مقصود') },
    finishBatch: async () => { events.push('finish'); return { batchId: 'batch', folderPath: 'folder' } },
  })
  assert.deepEqual(events, ['create', 'batch-created', 'prepare:item-0', 'export:item-0', 'prepare:item-1', 'export:item-1', 'prepare:item-2', 'export:item-2', 'finish'])
  assert.equal(result.successful, 2)
  assert.equal(result.skipped, 1)
  assert.equal(result.failures.length, 1)
  assert.equal(result.failures[0].reason, 'فشل مقصود')
  assert.equal(result.finalizationError, null)
})
