import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCustomerStatementDate, formatCustomerStatementPeriod } from '../src/utils/customerStatementDates.ts'

test('formats database dates with leading zeros', () => {
  assert.equal(formatCustomerStatementDate('2026-10-09'), '09/10/2026')
  assert.equal(formatCustomerStatementDate('2026-01-05'), '05/01/2026')
})

test('uses the stored calendar date from ISO datetimes without timezone shifts', () => {
  assert.equal(formatCustomerStatementDate('2026-12-31T23:30:00-10:00'), '31/12/2026')
  assert.equal(formatCustomerStatementDate('2027-01-01T00:30:00+10:00'), '01/01/2027')
})

test('formats statement periods across month and year boundaries', () => {
  assert.equal(
    `الفترة: ${formatCustomerStatementPeriod('2026-12-31', '2027-01-05')}`,
    'الفترة: من 31/12/2026 الى 05/01/2027',
  )
})

test('preserves existing open-ended and all-period labels', () => {
  assert.equal(formatCustomerStatementPeriod(null, null), 'كل الفترة')
  assert.equal(formatCustomerStatementPeriod('2026-10-01', null), 'من 01/10/2026 الى آخر عملية')
  assert.equal(formatCustomerStatementPeriod(null, '2026-10-09'), 'من بداية الحساب الى 09/10/2026')
})
